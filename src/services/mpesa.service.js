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
     * 🚀 LANE 2: C2B v2 REGISTRATION
     * Registers your URLs to Safaricom's Daraja 2.0 Gateway.
     */
    async registerC2Bv2() {
        try {
            const accessToken = await this.getAccessToken();
            const shortCode = mpesaConfig.shortCode;
            
            // C2B v2 expects these specific keys
            const payload = {
                ShortCode: shortCode,
                ResponseType: "Completed", 
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/mpesa/payments/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/mpesa/payments/c2b-validation"
            };

            console.log(`📡 [C2B_V2_REG]: Attempting registration for ShortCode: ${shortCode}...`);
            
            const urlV2 = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
            const response = await axios.post(urlV2, payload, {
                headers: { 
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            });

            console.log("✅ [C2B_V2_REG]: Success!", response.data);
            return response.data;

        } catch (error) {
            const errBody = error.response?.data || error.message;
            console.error("❌ C2B v2 Reg Error:", JSON.stringify(errBody, null, 2));
            
            if (errBody.errorCode === '401.003.01') {
                throw new Error("CRITICAL: C2B Product not found in your App. Please add 'Customer To Business (C2B)' in the Daraja Portal.");
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

    /**
     * 📥 HANDLES C2B v2 CONFIRMATION
     */
    async handleC2BConfirmation(c2bData) {
        try {
            // C2B v2 sends a flat JSON body
            const {
                TransID,
                TransAmount,
                MSISDN,
                BillRefNumber,
                FirstName,
                BusinessShortCode
            } = c2bData;

            console.log(`💰 [V2_C2B_HIT]: ID ${TransID} | Amount ${TransAmount} | From ${MSISDN}`);

            // 1. Log the raw callback
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: TransID,
                raw_payload: c2bData,
                status: 'C2B_SUCCESS',
                metadata: { 
                    type: 'V2_TILL_PAYMENT', 
                    account: BillRefNumber,
                    name: FirstName || 'Customer'
                }
            }]);

            // 2. Create the transaction record
            const { error: insertError } = await db.airtime_transactions().insert([{
                user_id: 'C2B_WALK_IN',
                amount: parseFloat(TransAmount),
                phone_number: MSISDN,
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: TransID,
                checkout_id: TransID, // Use TransID as checkout_id for C2B
                metadata: { 
                    source: 'C2B_V2_CONFIRMATION', 
                    bill_ref: BillRefNumber,
                    shortcode: BusinessShortCode
                }
            }]);

            if (insertError) throw insertError;
            return true;

        } catch (error) {
            console.error("❌ [V2_C2B_CRASH]:", error.message);
            return false;
        }
    }
}

const mpesaService = new MpesaService();

// Export as individual functions and default class
export const registerC2Bv2 = async () => {
    return await mpesaService.registerC2Bv2();
};

export default mpesaService;