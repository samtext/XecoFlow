import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

class MpesaService {
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const response = await axios.get(`${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`, { 
                headers: { Authorization: `Basic ${auth}` } 
            });
            return response.data.access_token;
        } catch (error) {
            console.error("❌ Auth Error:", error.response?.data || error.message);
            throw new Error("Authentication failed");
        }
    }

    async initiateSTKPush(phoneNumber, amount, userId) {
        try {
            if (!userId) {
                throw new Error("User ID is required to link transaction");
            }

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

            console.log("🚀 SENDING PAYLOAD:", JSON.stringify(payload));

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                // ✅ Using your specific db helper syntax to avoid "db.from is not a function"
                const { error: insertError } = await db.airtime_transactions().insert([{
                    user_id: userId,
                    amount: cleanAmount,
                    phone_number: cleanPhone,
                    network: 'SAFARICOM',
                    status: 'PENDING_PAYMENT',
                    idempotency_key: iKey,
                    checkout_id: response.data.CheckoutRequestID
                }]);

                if (insertError) {
                    console.error("❌ DB Insert Error:", insertError.message);
                    return { success: false, error: insertError.message };
                }
                
                console.log(`✅ Transaction Initiated: ${response.data.CheckoutRequestID}`);
            }

            return { success: true, checkoutRequestId: response.data.CheckoutRequestID };
        } catch (error) {
            const errorDetail = error.response?.data?.errorMessage || error.message;
            console.error("❌ STK Error:", errorDetail);
            return { success: false, error: errorDetail };
        }
    }

    async handleCallback(rawData, ipAddress = null) {
        try {
            if (!rawData?.Body?.stkCallback) return false;

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            
            // ✅ Log to callback table using your specific helper syntax
            const { error: logError } = await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID,
                raw_payload: rawData,
                ip_address: ipAddress,
                metadata: { processed_at: new Date().toISOString() }
            }]);

            if (logError) console.error("⚠️ Callback Log Error:", logError.message);

            const status = String(cb.ResultCode) === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            let receipt = null;
            if (status === 'PAYMENT_SUCCESS' && cb.CallbackMetadata) {
                const items = cb.CallbackMetadata.Item;
                receipt = items.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            }

            if (checkoutId) {
                // Ensure we don't try to update before the record is fully created in Stage 1
                await new Promise(res => setTimeout(res, 2000));

                const { data, error } = await db.airtime_transactions()
                    .update({ 
                        status: status,
                        mpesa_receipt: receipt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId)
                    .select();

                if (error) throw error;
                if (data && data.length > 0) {
                    console.log(`💾 DB Updated to ${status} for Receipt: ${receipt || 'N/A'}`);
                } else {
                    console.error("❌ DB Update failed: Transaction record not found.");
                }
            }
            return true;
        } catch (e) {
            console.error("❌ Callback Logic Error:", e.message);
            return false;
        }
    }
}

export default new MpesaService();