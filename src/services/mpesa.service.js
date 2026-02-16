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
            // userId now accepts the Visitor ID from your frontend
            if (!userId) {
                throw new Error("Identity (Visitor ID) is required to link transaction");
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

            console.log("🚀 [STK_PUSH]: Sending Payload to Safaricom...");

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                console.log(`📡 [DB_SAVE_INIT]: Attempting to record Pending Transaction for Visitor: ${userId}`);
                
                // Uses the supabaseAdmin mapping in db.js to bypass RLS for Guest users
                const { data, error: insertError } = await db.airtime_transactions()
                    .insert([{
                        user_id: userId,
                        amount: cleanAmount,
                        phone_number: cleanPhone,
                        network: 'SAFARICOM',
                        status: 'PENDING_PAYMENT',
                        idempotency_key: iKey,
                        checkout_id: response.data.CheckoutRequestID
                    }])
                    .select();

                if (insertError) {
                    console.error("❌ [DATABASE_REJECTION]: Failed to save pending airtime record:", JSON.stringify(insertError, null, 2));
                    // We return success true because the STK was still sent to the user's phone
                    return { success: true, checkoutRequestId: response.data.CheckoutRequestID, db_warning: "Record not saved" };
                }
                
                if (data && data.length > 0) {
                    console.log(`✅ [DB_SUCCESS]: Guest Transaction record created: ${data[0].id}`);
                }
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
            const status = String(cb.ResultCode) === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

            console.log(`📩 [MPESA_CALLBACK]: Processing CheckoutID: ${checkoutId} | Status: ${status}`);

            const metadataPayload = { 
                processed_at: new Date().toISOString(),
                ip_address: ipAddress,
                result_desc: cb.ResultDesc || "No description provided"
            };

            // Log callback evidence to mpesa_callback_logs
            const { error: logError } = await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID || null,
                raw_payload: rawData,
                ip_address: ipAddress,
                status: status, 
                metadata: metadataPayload
            }]);

            if (logError) console.error("⚠️ [LOG_ERROR]: Could not save raw callback log:", logError.message);

            let receipt = null;
            if (status === 'PAYMENT_SUCCESS' && cb.CallbackMetadata?.Item) {
                const items = cb.CallbackMetadata.Item;
                const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');
                receipt = receiptItem ? receiptItem.Value : null;
                metadataPayload.mpesa_receipt = receipt;
            }

            if (checkoutId) {
                // Short delay to ensure the initial 'PENDING' record has finished writing in high-latency scenarios
                await new Promise(res => setTimeout(res, 1000));

                console.log(`⏳ [PROCESSING]: Updating airtime_transactions table for ${checkoutId}...`);

                const { data, error } = await db.airtime_transactions()
                    .update({ 
                        status: status,
                        mpesa_receipt: receipt,
                        metadata: metadataPayload, 
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId)
                    .select();

                if (error) {
                    console.error("❌ [CALLBACK_UPDATE_ERROR]: Update failed for airtime table:", error.message);
                    throw error;
                }

                if (data && data.length > 0) {
                    console.log(`✅ [DB_UPDATE]: Transaction record finalized. ID: ${data[0].id} is now ${status}`);
                } else {
                    console.warn(`⚠️ [DB_MISMATCH]: No pending transaction found for CheckoutID: ${checkoutId}. Record was not updated.`);
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