import axios from 'axios';
// 🚨 ESM compatibility
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

class MpesaService {
    // 🛠️ HELPER: Standardizes M-Pesa Metadata Array into a flat JSON Object
    parseMetadata(items) {
        if (!items || !Array.isArray(items)) return {};
        const chunk = {};
        items.forEach(item => {
            if (item.Name && item.Value !== undefined) {
                chunk[item.Name] = item.Value;
            }
        });
        return chunk;
    }

    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            // Ensure no whitespace in the Basic Auth string
            const response = await axios.get(`${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`, { 
                headers: { 
                    Authorization: `Basic ${auth.trim()}`,
                    "Content-Type": "application/json" 
                } 
            });
            
            if (!response.data.access_token) {
                throw new Error("Access token missing in Safaricom response");
            }

            return response.data.access_token.trim();
        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ Auth Error Details:", JSON.stringify(errorData, null, 2));
            throw new Error("M-Pesa authentication failed. Verify Consumer Key/Secret on Safaricom Portal.");
        }
    }

    /**
     * 🚀 LANE 2: C2B REGISTRATION (ONE-TIME SETUP)
     * UPDATED: Changed URL path from /mpesa/ to /payments/ to comply with Safaricom security rules.
     */
    async registerC2Bv2() {
        try {
            const accessToken = await this.getAccessToken();
            const shortCode = mpesaConfig.shortCode;
            
            const payload = {
                ShortCode: shortCode,
                ResponseType: "Completed", 
                // 🚨 KEY CHANGE: Use 'payments' instead of 'mpesa'
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-validation"
            };

            console.log(`📡 [C2B_REG]: Attempting registration for ShortCode: ${shortCode}...`);
            
            try {
                const urlV2 = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
                const response = await axios.post(urlV2, payload, {
                    headers: { 
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    }
                });
                console.log("✅ [C2B_REG]: V2 Success!");
                return response.data;
            } catch (v2Error) {
                const v2Data = v2Error.response?.data;
                if (v2Data?.errorCode === '401.003.01') {
                    console.error("🚨 [PROD_ERROR]: Your Daraja App is missing the 'C2B' product.");
                    throw v2Error;
                }

                console.warn("⚠️ [C2B_REG]: V2 failed, attempting V1 fallback...");
                const urlV1 = `${mpesaConfig.baseUrl}/mpesa/c2b/v1/registerurl`;
                const responseV1 = await axios.post(urlV1, payload, {
                    headers: { 
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    }
                });
                console.log("✅ [C2B_REG]: V1 Fallback Success!");
                return responseV1.data;
            }
        } catch (error) {
            const errBody = error.response?.data || error.message;
            console.error("❌ C2B Reg Error:", JSON.stringify(errBody, null, 2));
            
            if (errBody.errorCode === '401.003.01') {
                throw new Error("CRITICAL: C2B Product not found in your App. Please add 'Customer To Business (C2B)' to your app in the Daraja Portal.");
            }
            throw new Error(`C2B Registration Failed: ${errBody.errorMessage || error.message}`);
        }
    }

    async initiateSTKPush(phoneNumber, amount, userId) {
        try {
            if (!userId) throw new Error("Identity (Visitor ID) is required.");

            const accessToken = await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);
            const iKey = uuidv4(); 

            const cleanPhone = String(phoneNumber).trim();
            const cleanAmount = Math.round(Number(amount));

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: cleanAmount, 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till, 
                PhoneNumber: cleanPhone,
                CallBackURL: mpesaConfig.callbackUrl,
                AccountReference: "XecoFlow", 
                TransactionDesc: "Airtime Purchase"
            };

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                const checkoutId = response.data.CheckoutRequestID;
                
                const { error: insertError } = await db.airtime_transactions()
                    .insert([{
                        user_id: userId,
                        amount: cleanAmount,
                        phone_number: cleanPhone,
                        network: 'SAFARICOM',
                        status: 'PENDING_PAYMENT',
                        idempotency_key: iKey,
                        checkout_id: checkoutId 
                    }]);

                if (insertError) console.error("❌ [DB_SAVE_INIT_ERROR]:", insertError.message);
                return { success: true, checkoutRequestId: checkoutId };
            }

            return { success: false, error: response.data.ResponseDescription };
        } catch (error) {
            console.error("❌ STK Error:", error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    async handleCallback(rawData, ipAddress = null) {
        try {
            console.log("📥 [RAW_CALLBACK]:", JSON.stringify(rawData, null, 2));

            if (!rawData?.Body?.stkCallback) return false;

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            const resultCode = String(cb.ResultCode);
            const status = resultCode === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

            let cleanMetadata = {};
            if (resultCode === "0") {
                const metaItems = cb.CallbackMetadata?.Item || [];
                cleanMetadata = this.parseMetadata(metaItems);
            } else {
                cleanMetadata = {
                    error_code: resultCode,
                    error_message: cb.ResultDesc || "Transaction failed/cancelled",
                    logged_at: new Date().toISOString()
                };
            }
            
            console.log("🛠️ [PARSED_METADATA]:", JSON.stringify(cleanMetadata));

            const receipt = cleanMetadata.MpesaReceiptNumber || null;

            await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID || null,
                raw_payload: rawData,
                metadata: cleanMetadata,
                ip_address: ipAddress,
                status: status
            }]);

            if (checkoutId) {
                await new Promise(res => setTimeout(res, 2000));

                const { error } = await db.airtime_transactions()
                    .update({ 
                        status: status,
                        mpesa_receipt: receipt,
                        metadata: cleanMetadata, 
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId);

                if (error) console.error("❌ [DB_FINAL_UPDATE_ERROR]:", error.message);
            }
            return true;
        } catch (e) {
            console.error("❌ [CALLBACK_CRASH]:", e.message);
            return false;
        }
    }

    async handleC2BConfirmation(c2bData) {
        try {
            const payload = c2bData.raw_data || c2bData; 
            const TransID = payload.TransID || c2bData.transaction_id;
            const TransAmount = payload.TransAmount || c2bData.amount;
            const MSISDN = payload.MSISDN || c2bData.phone;
            const BillRefNumber = payload.BillRefNumber || c2bData.bill_ref;
            
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: TransID,
                raw_payload: c2bData,
                status: 'C2B_SUCCESS',
                metadata: { 
                    type: 'MANUAL_TILL_PAYMENT', 
                    account: BillRefNumber,
                    phone: MSISDN,
                    amount: TransAmount,
                    source_ip: c2bData.source_ip || 'unknown'
                }
            }]);

            const { error: insertError } = await db.airtime_transactions().insert([{
                user_id: 'C2B_WALK_IN',
                amount: Math.round(Number(TransAmount)),
                phone_number: MSISDN,
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: TransID,
                checkout_id: TransID,
                metadata: { 
                    source: 'C2B_CONFIRMATION', 
                    original_ref: BillRefNumber,
                    full_name: c2bData.full_name || 'N/A'
                }
            }]);

            if (insertError) console.error("❌ [C2B_DB_ERROR]:", insertError.message);
            return true;
        } catch (error) {
            console.error("❌ [C2B_HANDLING_CRASH]:", error.message);
            return false;
        }
    }
}

const mpesaService = new MpesaService();

export const registerC2Bv2 = async () => {
    return await mpesaService.registerC2Bv2();
};

export default mpesaService;