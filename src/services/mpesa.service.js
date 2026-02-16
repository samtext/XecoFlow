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

    // --- 🚀 LANE 2: C2B REGISTRATION (ONE-TIME SETUP) ---
    async registerC2Bv2() {
        try {
            const accessToken = await this.getAccessToken();
            const url = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;

            const payload = {
                ShortCode: mpesaConfig.shortCode,
                ResponseType: "Completed",
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/mpesa/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/mpesa/c2b-validation"
            };

            console.log("📡 [C2B_REG]: Registering URLs with Safaricom...");
            const response = await axios.post(url, payload, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            return response.data;
        } catch (error) {
            console.error("❌ C2B Reg Error:", error.response?.data || error.message);
            throw error;
        }
    }

    async initiateSTKPush(phoneNumber, amount, userId) {
        try {
            // ✅ userId can now be a Guest ID from the frontend
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

            // ✅ STEP 1: Recording the PENDING record immediately
            if (response.data.ResponseCode === "0") {
                const checkoutId = response.data.CheckoutRequestID;
                console.log(`📡 [DB_SAVE_INIT]: Attempting to save PENDING status for ID: ${checkoutId}`);
                
                const { data, error: insertError } = await db.airtime_transactions()
                    .insert([{
                        user_id: userId, // Accepts Guest UUID or Logged-in UUID
                        amount: cleanAmount,
                        phone_number: cleanPhone,
                        network: 'SAFARICOM',
                        status: 'PENDING_PAYMENT',
                        idempotency_key: iKey,
                        checkout_id: checkoutId 
                    }])
                    .select();

                if (insertError) {
                    console.error("❌ [DATABASE_REJECTION]:", JSON.stringify(insertError, null, 2));
                    return { success: true, checkoutRequestId: checkoutId, db_warning: "Record not saved to airtime_transactions" };
                }
                
                if (data && data.length > 0) {
                    console.log(`✅ [DB_SUCCESS]: Pending record created in airtime_transactions table.`);
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

            console.log(`📩 [MPESA_CALLBACK]: Received CheckoutID: ${checkoutId} | Result: ${status}`);

            const metadataPayload = { 
                processed_at: new Date().toISOString(),
                ip_address: ipAddress,
                result_desc: cb.ResultDesc || "No description provided"
            };

            // ✅ STEP 2: Always log the callback first (Audit Trail)
            const { error: logError } = await db.mpesa_callback_logs().insert([{
                checkout_request_id: checkoutId,
                merchant_request_id: cb.MerchantRequestID || null,
                raw_payload: rawData,
                ip_address: ipAddress,
                status: status, 
                metadata: metadataPayload
            }]);

            if (logError) console.error("⚠️ [LOG_TABLE_ERROR]:", logError.message);

            let receipt = null;
            if (status === 'PAYMENT_SUCCESS' && cb.CallbackMetadata?.Item) {
                const items = cb.CallbackMetadata.Item;
                const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');
                receipt = receiptItem ? receiptItem.Value : null;
                metadataPayload.mpesa_receipt = receipt;
            }

            if (checkoutId) {
                await new Promise(res => setTimeout(res, 2500));

                console.log(`⏳ [DB_UPDATE_START]: Finalizing transaction in airtime_transactions...`);

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
                    console.error("❌ [DB_UPDATE_FAILED]:", error.message);
                    throw error;
                }

                if (data && data.length > 0) {
                    console.log(`✅ [DB_FINALIZED]: Transaction updated to ${status}.`);
                } else {
                    console.warn(`⚠️ [DB_MISMATCH]: No row found in airtime_transactions with checkout_id: ${checkoutId}.`);
                }
            }
            return true;
        } catch (e) {
            console.error("❌ [CALLBACK_CRASH]:", e.message);
            return false;
        }
    }

    // --- 💰 LANE 2: HANDLE MANUAL (C2B) CONFIRMATION ---
    async handleC2BConfirmation(c2bData) {
        try {
            const { TransID, TransAmount, MSISDN, BillRefNumber } = c2bData;
            
            console.log(`💰 [C2B_PROCESS]: Processing Manual Payment ${TransID} from ${MSISDN}`);

            // Log this manual payment to your callback logs for safety
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: TransID, // Using TransID as unique ref for C2B
                raw_payload: c2bData,
                status: 'C2B_SUCCESS',
                metadata: { type: 'MANUAL_TILL_PAYMENT', account: BillRefNumber }
            }]);

            // Create the airtime transaction record for C2B
            const { error: insertError } = await db.airtime_transactions().insert([{
                user_id: 'C2B_WALK_IN', // Placeholder for manual payers
                amount: Math.round(Number(TransAmount)),
                phone_number: MSISDN,
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS', // It's already confirmed by Safaricom
                mpesa_receipt: TransID,
                checkout_id: TransID
            }]);

            if (insertError) console.error("❌ [C2B_DB_ERROR]:", insertError.message);
            
            return true;
        } catch (error) {
            console.error("❌ [C2B_HANDLING_CRASH]:", error.message);
            return false;
        }
    }
}

export default new MpesaService();