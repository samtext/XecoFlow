import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 
import { db } from '../config/db.js';
import crypto from 'crypto'; // Ensure crypto is imported for idempotency_key

// ✅ Store transactions in memory as backup/fast access
const transactions = new Map();

class StkService {
    /**
     * 🔐 NEW: Wrapper for OAuth Token
     * This fixes the "getOAuthToken is not a function" error in c2bService
     */
    async getOAuthToken() {
        try {
            return await mpesaAuth.getAccessToken();
        } catch (error) {
            console.error("❌ [TOKEN_WRAPPER_ERROR]:", error.message);
            throw error;
        }
    }

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
            const merchantId = response.data.MerchantRequestID; 
            
            const transactionData = {
                checkout_id: checkoutId,
                phone_number: cleanPhone,
                amount: amount,
                user_id: userId,
                network: 'SAFARICOM', 
                status: 'PENDING_PAYMENT', 
                idempotency_key: crypto.randomUUID(), 
                metadata: { 
                    package_id: packageId,
                    merchant_id: merchantId 
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            try {
                const { data, error } = await db.airtime_transactions()
                    .insert([transactionData])
                    .select();
                
                if (error) {
                    console.error("❌ [DB_SAVE_ERROR]:", error.message, "| Details:", error.details);
                } else {
                    console.log(`✅ [DB_SAVE]: Transaction saved to airtime_transactions`);
                }
            } catch (dbError) {
                console.error("❌ [DB_SAVE_EXCEPTION]:", dbError.message);
            }

            transactions.set(checkoutId, transactionData);
            console.log(`✅ [MPESA_SUCCESS]: CheckoutID: ${checkoutId}`);
            
            return { 
                success: true, 
                data: { ...response.data, checkoutRequestId: checkoutId }
            };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STK_ERROR]:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }

    async handleStkResult(callbackData) {
        const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        
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
            
            let mpesaReceipt = null;
            if (ResultCode === 0) {
                const metadata = CallbackMetadata?.Item || [];
                mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
                updateData.mpesa_receipt = mpesaReceipt;
            }

            transactions.set(CheckoutRequestID, { ...transaction, ...updateData });

            try {
                await db.airtime_transactions().update(updateData).eq('checkout_id', CheckoutRequestID);
            } catch (dbError) {
                console.error("❌ [DB_UPDATE_EXCEPTION]:", dbError.message);
            }

            await this.logMpesaCallback({
                checkout_id: CheckoutRequestID,
                merchant_id: MerchantRequestID,
                result_code: ResultCode,
                result_desc: ResultDesc,
                trans_id: mpesaReceipt,
                callback_raw: callbackData
            });

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
                checkoutRequestId: checkoutRequestId,
                data: {
                    status: transaction.status,
                    checkoutId: transaction.checkout_id,
                    amount: transaction.amount,
                    receipt: transaction.mpesa_receipt || null
                },
                transaction: { checkoutRequestId, ...transaction }
            };
        } catch (error) {
            console.error("❌ [STATUS_CHECK_ERROR]:", error.message);
            return { success: false, status: 'ERROR', message: error.message };
        }
    }

    async logMpesaCallback(payload) {
        try {
            const { error } = await db.mpesa_callback_logs().insert([{
                checkout_request_id: payload.checkout_id,
                merchant_request_id: payload.merchant_id,
                result_code: payload.result_code,
                result_desc: payload.result_desc,
                trans_id: payload.trans_id,
                status: payload.result_code === 0 ? 'SUCCESS' : 'CANCELLED',
                callback_data: payload.callback_raw,
                metadata: payload,
                received_at: new Date().toISOString()
            }]);
            
            if (error) console.error("❌ [CALLBACK_LOG_DB_ERROR]:", error.message);
            else console.log("✅ [CALLBACK_LOG]: Record saved to mpesa_callback_logs!");
        } catch (error) {
            console.error("❌ [CALLBACK_LOG_EXCEPTION]:", error.message);
        }
    }
}

const stkService = new StkService();
export default stkService;