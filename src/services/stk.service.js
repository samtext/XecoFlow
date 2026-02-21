import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 

// ✅ Store transactions in memory for frontend to check
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

            // ✅ Store initial transaction status
            const checkoutId = response.data.CheckoutRequestID;
            transactions.set(checkoutId, {
                status: 'PENDING',
                phoneNumber: cleanPhone,
                amount,
                userId,
                packageId,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ [MPESA_SUCCESS]: CheckoutID: ${checkoutId}`);
            
            // ✅ Return checkout ID to frontend
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
     * 🔄 HANDLE CALLBACK - Updates transaction status
     */
    async handleStkResult(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        
        console.log(`\n📝 [CALLBACK_RECEIVED]: ${CheckoutRequestID}`);
        console.log(`📊 Result: ${ResultCode} (${ResultDesc})`);

        try {
            // Get existing transaction
            const transaction = transactions.get(CheckoutRequestID) || {};
            
            if (ResultCode === 0) {
                // Payment successful
                const metadata = CallbackMetadata?.Item || [];
                const mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
                const amount = metadata.find(i => i.Name === 'Amount')?.Value;
                const phone = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
                const transactionDate = metadata.find(i => i.Name === 'TransactionDate')?.Value;
                
                console.log(`💰 Payment Successful! Receipt: ${mpesaReceipt}`);
                
                // ✅ Update transaction with SUCCESS status
                transactions.set(CheckoutRequestID, {
                    ...transaction,
                    status: 'SUCCESS',
                    resultCode: ResultCode,
                    resultDesc: ResultDesc,
                    mpesaReceipt,
                    amount,
                    phoneNumber: phone,
                    transactionDate,
                    updatedAt: new Date().toISOString()
                });
                
            } else {
                // Payment failed
                console.warn(`❌ Payment Failed/Cancelled: ${ResultDesc}`);
                
                // ✅ Update transaction with FAILED status
                transactions.set(CheckoutRequestID, {
                    ...transaction,
                    status: 'FAILED',
                    resultCode: ResultCode,
                    resultDesc: ResultDesc,
                    updatedAt: new Date().toISOString()
                });
            }

            console.log(`✅ Transaction ${CheckoutRequestID} status updated to: ${transactions.get(CheckoutRequestID).status}`);
            return true;

        } catch (error) {
            console.error("❌ [DB_UPDATE_ERROR]:", error.message);
            throw error;
        }
    }

    /**
     * 🔍 GET TRANSACTION STATUS - For frontend polling
     */
    async getTransactionStatus(checkoutRequestId) {
        try {
            const transaction = transactions.get(checkoutRequestId);
            
            if (!transaction) {
                return {
                    success: false,
                    status: 'NOT_FOUND',
                    message: 'Transaction not found'
                };
            }

            return {
                success: true,
                status: transaction.status,
                transaction: {
                    ...transaction,
                    checkoutRequestId
                }
            };

        } catch (error) {
            console.error("❌ [STATUS_CHECK_ERROR]:", error.message);
            return {
                success: false,
                status: 'ERROR',
                message: error.message
            };
        }
    }
}

const stkService = new StkService();
export default stkService;