import axios from 'axios';
// 🚨 CRITICAL FIX: Added '.js' extensions for ESM compatibility
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
            const response = await axios.get(`${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`, { 
                headers: { 
                    Authorization: `Basic ${auth.trim()}`,
                    "Content-Type": "application/json" 
                } 
            });
            
            if (!response.data.access_token) {
                throw new Error("Access token missing in Safaricom response");
            }

            return response.data.access_token;
        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ Auth Error Details:", JSON.stringify(errorData, null, 2));
            throw new Error("M-Pesa authentication failed. Verify Consumer Key/Secret on Safaricom Portal.");
        }
    }

    /**
     * 🚀 LANE 2: C2B REGISTRATION (ONE-TIME SETUP)
     */
    async registerC2Bv2() {
        try {
            const accessToken = await this.getAccessToken();
            const urlV2 = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
            
            const payload = {
                ShortCode: mpesaConfig.shortCode,
                ResponseType: "Completed", 
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/mpesa/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/mpesa/c2b-validation"
            };

            console.log("📡 [C2B_REG]: Attempting registration via V2 endpoint...");
            
            try {
                const response = await axios.post(urlV2, payload, {
                    headers: { 
                        Authorization: `Bearer ${accessToken.trim()}`,
                        "Content-Type": "application/json"
                    }
                });
                console.log("✅ [C2B_REG]: V2 Success!");
                return response.data;
            } catch (v2Error) {
                console.warn("⚠️ [C2B_REG]: V2 failed, attempting V1 fallback...");
                const urlV1 = `${mpesaConfig.baseUrl}/mpesa/c2b/v1/registerurl`;
                const responseV1 = await axios.post(urlV1, payload, {
                    headers: { 
                        Authorization: `Bearer ${accessToken.trim()}`,
                        "Content-Type": "application/json"
                    }
                });
                console.log("✅ [C2B_REG]: V1 Fallback Success!");
                return responseV1.data;
            }
        } catch (error) {
            const errBody = error.response?.data || error.message;
            console.error("❌ C2B Reg Error:", JSON.stringify(errBody, null, 2));
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
                { headers: { Authorization: `Bearer ${accessToken.trim()}` } }
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
            // 🔍 DEBUG: Log the exact shape Safaricom is sending
            console.log("📥 [RAW_CALLBACK]:", JSON.stringify(rawData, null, 2));

            if (!rawData?.Body?.stkCallback) return false;

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            const status = String(cb.ResultCode) === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

            // 🛠️ TRANSFORM: Extract M-Pesa's weird array and turn it into a flat JSON object
            const metaItems = cb.CallbackMetadata?.Item || [];
            const cleanMetadata = this.parseMetadata(metaItems);
            
            // Check if parsing actually worked
            console.log("🛠️ [PARSED_METADATA]:", JSON.stringify(cleanMetadata));

            const receipt = cleanMetadata.MpesaReceiptNumber || null;

            // 1. Log receipt details for audit (now including metadata)
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID || null,
                raw_payload: rawData,
                metadata: cleanMetadata, // <--- This stores the clean object
                ip_address: ipAddress,
                status: status
            }]);

            // 2. Finalize transaction with a small delay for DB consistency
            if (checkoutId) {
                await new Promise(res => setTimeout(res, 2000));

                const { error } = await db.airtime_transactions()
                    .update({ 
                        status: status,
                        mpesa_receipt: receipt,
                        metadata: cleanMetadata, // <--- Updating metadata column here too
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
            const { TransID, TransAmount, MSISDN, BillRefNumber } = c2bData;
            
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: TransID,
                raw_payload: c2bData,
                status: 'C2B_SUCCESS',
                metadata: { 
                    type: 'MANUAL_TILL_PAYMENT', 
                    account: BillRefNumber,
                    phone: MSISDN,
                    amount: TransAmount
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
                metadata: { source: 'C2B_CONFIRMATION', original_ref: BillRefNumber }
            }]);

            if (insertError) console.error("❌ [C2B_DB_ERROR]:", insertError.message);
            return true;
        } catch (error) {
            console.error("❌ [C2B_HANDLING_CRASH]:", error.message);
            return false;
        }
    }
}

// 🛡️ Instance for use throughout the app
const mpesaService = new MpesaService();

// ✅ FIX: Exported as a named function to resolve the SyntaxError in mpesa.routes.js
export const registerC2Bv2 = async () => {
    return await mpesaService.registerC2Bv2();
};

// Default export for the class instance
export default mpesaService;