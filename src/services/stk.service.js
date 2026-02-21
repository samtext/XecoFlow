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
            
            // ✅ Prepare transaction data for database
            const transactionData = {
                checkout_request_id: checkoutId,
                phone_number: cleanPhone,
                amount: amount,
                user_id: userId,
                package_id: packageId,
                status: 'PENDING',
                result_code: null,
                result_desc: null,
                mpesa_receipt: null,
                transaction_date: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // ✅ Save to database
            try {
                const { data, error } = await db.airtime_transactions()
                    .insert([transactionData])
                    .select();
                
                if (error) {
                    console.error("❌ [DB_SAVE_ERROR]:", error);
                } else {
                    console.log(`✅ [DB_SAVE]: Transaction saved to database with ID: ${data[0]?.id || checkoutId}`);
                }
            } catch (dbError) {
                console.error("❌ [DB_SAVE_EXCEPTION]:", dbError.message);
            }

            // ✅ Store in memory as backup
            transactions.set(checkoutId, {
                ...transactionData,
                status: 'PENDING'
            });

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

    /**
     * 🔄 HANDLE CALLBACK - Updates transaction status in database
     */
    async handleStkResult(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        
        console.log(`\n📝 [CALLBACK_RECEIVED]: ${CheckoutRequestID}`);
        console.log(`📊 Result: ${ResultCode} (${ResultDesc})`);

        try {
            const transaction = transactions.get(CheckoutRequestID) || {};
            
            let updateData = {
                result_code: ResultCode,
                result_desc: ResultDesc,
                updated_at: new Date().toISOString()
            };
            
            if (ResultCode === 0) {
                const metadata = CallbackMetadata?.Item || [];
                const mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
                const amount = metadata.find(i => i.Name === 'Amount')?.Value;
                const phone = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
                const transactionDate = metadata.find(i => i.Name === 'TransactionDate')?.Value;
                
                console.log(`💰 Payment Successful! Receipt: ${mpesaReceipt}`);
                
                updateData = {
                    ...updateData,
                    status: 'SUCCESS',
                    mpesa_receipt: mpesaReceipt,
                    amount: amount || transaction.amount,
                    phone_number: phone || transaction.phone_number,
                    transaction_date: String(transactionDate)
                };
                
            } else {
                console.warn(`❌ Payment Failed/Cancelled: ${ResultDesc}`);
                updateData.status = 'FAILED';
            }

            // ✅ Update Database
            try {
                const { error } = await db.airtime_transactions()
                    .update(updateData)
                    .eq('checkout_request_id', CheckoutRequestID);
                
                if (error) console.error("❌ [DB_UPDATE_ERROR]:", error);
                else console.log(`✅ [DB_UPDATE]: Transaction ${CheckoutRequestID} updated in database`);
            } catch (dbError) {
                console.error("❌ [DB_UPDATE_EXCEPTION]:", dbError.message);
            }

            // ✅ Audit Trail
            await this.logMpesaCallback({
                checkout_request_id: CheckoutRequestID,
                result_code: ResultCode,
                result_desc: ResultDesc,
                callback_data: callbackData
            });

            // ✅ Update memory
            transactions.set(CheckoutRequestID, {
                ...transaction,
                ...updateData
            });

            return true;

        } catch (error) {
            console.error("❌ [CALLBACK_HANDLER_ERROR]:", error.message);
            throw error;
        }
    }

    async getTransactionStatus(checkoutRequestId) {
        try {
            let transaction = null;
            
            // Database Check
            const { data, error } = await db.airtime_transactions()
                .select('*')
                .eq('checkout_request_id', checkoutRequestId)
                .maybeSingle();
            
            transaction = data || transactions.get(checkoutRequestId);
            
            if (!transaction) return { success: false, status: 'NOT_FOUND', message: 'Not found' };

            return {
                success: true,
                status: transaction.status || 'PENDING',
                transaction: { checkoutRequestId, ...transaction }
            };

        } catch (error) {
            console.error("❌ [STATUS_CHECK_ERROR]:", error.message);
            return { success: false, status: 'ERROR', message: error.message };
        }
    }

    async logMpesaCallback(payload) {
        try {
            await db.mpesa_callback_logs().insert([{
                callback_data: payload,
                received_at: new Date().toISOString()
            }]);
            console.log("✅ [CALLBACK_LOG]: Audit trail updated");
        } catch (error) {
            console.error("❌ [CALLBACK_LOG_EXCEPTION]:", error.message);
        }
    }
}

const stkService = new StkService();
export default stkService;