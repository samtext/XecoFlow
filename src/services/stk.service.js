import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 
import { db } from '../config/db.js';

// ✅ Store transactions in memory as backup/fast access
const transactions = new Map();

class StkService {
    async initiateSTKPush(phoneNumber, amount, userId, packageId = "default") {
        try {
            const accessToken = await mpesaAuth.getAccessToken();
            if (!accessToken) throw new Error("Access Token missing.");

            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);

            let cleanPhone = phoneNumber.trim().replace('+', '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `254${cleanPhone.slice(1)}`;
            }

            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till || mpesaConfig.shortCode, 
                PhoneNumber: cleanPhone,
                CallBackURL: finalCallbackUrl,
                AccountReference: "XecoFlow", 
                TransactionDesc: `Pay ${packageId}`.slice(0, 13)
            };

            console.log(`\n--- [STK PUSH OUTGOING] ---`);
            console.log(`🔗 Callback: ${payload.CallBackURL}`);
            console.log(`🏢 ShortCode: ${payload.BusinessShortCode} | PartyB (Till): ${payload.PartyB}`);
            console.log(`---------------------------\n`);

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { 
                    headers: { 
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    } 
                }
            );

            const checkoutId = response.data.CheckoutRequestID;
            
            const transactionData = {
                checkout_id: checkoutId,
                phone_number: cleanPhone,
                amount: amount,
                user_id: userId,
                network: 'SAFARICOM', 
                status: 'PENDING_PAYMENT', 
                idempotency_key: crypto.randomUUID(), 
                metadata: { package_id: packageId },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            try {
                const { data, error } = await db.airtime_transactions()
                    .insert([transactionData])
                    .select();
                
                if (error) {
                    console.error("❌ [DB_SAVE_ERROR]:", error.message);
                } else {
                    console.log(`✅ [DB_SAVE]: Transaction saved with ID: ${data[0]?.id || checkoutId}`);
                }
            } catch (dbError) {
                console.error("❌ [DB_SAVE_EXCEPTION]:", dbError.message);
            }

            transactions.set(checkoutId, transactionData);
            console.log(`✅ [MPESA_SUCCESS]: CheckoutID: ${checkoutId}`);
            
            return { 
                success: true, 
                data: {
                    ...response.data,
                    checkoutRequestId: checkoutId
                }
            };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STK_ERROR]:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }

    async handleStkResult(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        
        console.log(`\n📝 [CALLBACK_RECEIVED]: ${CheckoutRequestID}`);
        console.log(`📊 Result: ${ResultCode} (${ResultDesc})`);

        try {
            const transaction = transactions.get(CheckoutRequestID) || {};
            let finalStatus = ResultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

            let updateData = {
                status: finalStatus,
                metadata: { 
                    ...transaction.metadata,
                    result_code: ResultCode,
                    result_desc: ResultDesc
                },
                updated_at: new Date().toISOString()
            };
            
            if (ResultCode === 0) {
                const metadata = CallbackMetadata?.Item || [];
                const mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
                updateData.mpesa_receipt = mpesaReceipt;
            }

            // ✅ Update memory immediately
            transactions.set(CheckoutRequestID, { ...transaction, ...updateData });

            // ✅ Update airtime_transactions
            try {
                const { error } = await db.airtime_transactions()
                    .update(updateData)
                    .eq('checkout_id', CheckoutRequestID);
                
                if (error) console.error("❌ [DB_UPDATE_ERROR]:", error.message);
                else console.log(`✅ [DB_UPDATE]: Transaction ${CheckoutRequestID} updated`);
            } catch (dbError) {
                console.error("❌ [DB_UPDATE_EXCEPTION]:", dbError.message);
            }

            // ✅ Log to Audit Trail
            this.logMpesaCallback({
                checkout_id: CheckoutRequestID,
                result_code: ResultCode,
                result_desc: ResultDesc,
                raw_callback: callbackData
            }).catch(err => console.error("⚠️ Audit Log failed silently"));

            return true;

        } catch (error) {
            console.error("❌ [CALLBACK_HANDLER_ERROR]:", error.message);
            throw error;
        }
    }

    async getTransactionStatus(checkoutRequestId) {
        try {
            let transaction = transactions.get(checkoutRequestId);
            if (!transaction) {
                const { data } = await db.airtime_transactions()
                    .select('*')
                    .eq('checkout_id', checkoutRequestId)
                    .maybeSingle();
                transaction = data;
            }
            if (!transaction) return { success: false, status: 'NOT_FOUND', message: 'Not found' };
            return {
                success: true,
                status: transaction.status,
                transaction: { checkoutRequestId, ...transaction }
            };
        } catch (error) {
            console.error("❌ [STATUS_CHECK_ERROR]:", error.message);
            return { success: false, status: 'ERROR', message: error.message };
        }
    }

    async logMpesaCallback(payload) {
        try {
            // ✅ Mapping to both columns to cover all bases after schema reload
            const { error } = await db.mpesa_callback_logs().insert([{
                callback_data: payload,
                metadata: payload, 
                received_at: new Date().toISOString()
            }]);
            
            if (error) {
                console.error("❌ [CALLBACK_LOG_DB_ERROR]:", error.message);
            } else {
                console.log("✅ [CALLBACK_LOG]: Record saved successfully");
            }
        } catch (error) {
            console.error("❌ [CALLBACK_LOG_EXCEPTION]:", error.message);
        }
    }
}

const stkService = new StkService();
export default stkService;