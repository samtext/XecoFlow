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
                console.log(`📡 [DB_SAVE_INIT]: Attempting to save record for ${response.data.CheckoutRequestID}`);
                
                // ✅ Using db.airtime_transactions() with .select() to confirm save
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
                    .select(); // 👈 This forces the DB to return the saved row

                if (insertError) {
                    // This will print the exact RLS or Schema error in your Render logs
                    console.error("❌ [DATABASE_REJECTION]:", JSON.stringify(insertError, null, 2));
                    return { success: false, error: insertError.message };
                }
                
                if (data && data.length > 0) {
                    console.log(`✅ [DB_SUCCESS]: Transaction saved with UUID: ${data[0].id}`);
                } else {
                    console.warn("⚠️ [DB_EMPTY]: Insert command finished but no data returned. Check RLS policies.");
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

            const metadataPayload = { 
                processed_at: new Date().toISOString(),
                ip_address: ipAddress,
                result_desc: cb.ResultDesc || "No description provided"
            };

            // ✅ Log callback evidence
            const { error: logError } = await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID || null,
                raw_payload: rawData,
                ip_address: ipAddress,
                status: status, 
                metadata: metadataPayload
            }]);

            if (logError) console.error("⚠️ Callback Log Error:", logError.message);

            let receipt = null;
            if (status === 'PAYMENT_SUCCESS' && cb.CallbackMetadata?.Item) {
                const items = cb.CallbackMetadata.Item;
                const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');
                receipt = receiptItem ? receiptItem.Value : null;
                metadataPayload.mpesa_receipt = receipt;
            }

            if (checkoutId) {
                // Wait for the initiation insert to propogate
                await new Promise(res => setTimeout(res, 2000));

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
                    console.error("❌ [CALLBACK_UPDATE_ERROR]:", error.message);
                    throw error;
                }

                if (data && data.length > 0) {
                    console.log(`💾 [DB_FINALIZED]: Transaction ${data[0].id} updated to ${status}`);
                } else {
                    // If this logs, it means the initiation record was never saved in Step 1
                    console.error(`❌ [UPDATE_FAILED]: No record found for CheckoutID: ${checkoutId}. Initiation likely failed.`);
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