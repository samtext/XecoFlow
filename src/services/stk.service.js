import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 

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

            console.log(`✅ [MPESA_SUCCESS]: CheckoutID: ${response.data.CheckoutRequestID}`);
            return { success: true, data: response.data };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STK_ERROR]:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }

    /**
     * 🔄 HANDLE CALLBACK (The Infinity Fix)
     * This function updates your database status so the frontend stops spinning.
     */
    async handleStkResult(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc } = callbackData;
        
        console.log(`\n📝 [CALLBACK_RECEIVED]: ${CheckoutRequestID}`);
        console.log(`📊 Result: ${ResultCode} (${ResultDesc})`);

        try {
            /**
             * 🛑 IMPORTANT:
             * Your frontend "Infinity" happens because the status stays 'PENDING'.
             * You MUST update the database even if ResultCode is NOT 0.
             */
            
            if (ResultCode === 0) {
                const metadata = callbackData.CallbackMetadata.Item;
                const mpesaReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
                
                console.log(`💰 Payment Successful! Receipt: ${mpesaReceipt}`);
                // TODO: Update your DB: status = 'COMPLETED', receipt = mpesaReceipt
            } else {
                console.warn(`❌ Payment Failed/Cancelled: ${ResultDesc}`);
                // TODO: Update your DB: status = 'FAILED', reason = ResultDesc
                // This 'FAILED' status is what tells your frontend to stop the spinner.
            }

            return true;
        } catch (error) {
            console.error("❌ [DB_UPDATE_ERROR]:", error.message);
            throw error;
        }
    }
}

const stkService = new StkService();
export default stkService;