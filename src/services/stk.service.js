import axios from 'axios';
// Ensure these paths match your folder structure exactly
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 

class StkService {
    async initiateSTKPush(phoneNumber, amount, userId, packageId = "default") {
        try {
            // 1. Get the cached or new token
            const accessToken = await mpesaAuth.getAccessToken();
            
            if (!accessToken) {
                throw new Error("Could not retrieve Access Token. Check your mpesa.auth.js logic.");
            }

            // 2. Prepare security credentials
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);

            // 3. Format phone number (Ensures 254 format for Safaricom)
            let cleanPhone = phoneNumber.trim().replace('+', '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `254${cleanPhone.slice(1)}`;
            }

            /**
             * 🔗 CRITICAL: CALLBACK URL ALIGNMENT
             * This must match your server.js route: /api/v1/gateway/hooks/stk-callback
             */
            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", // Or "CustomerPayBillOnline" if using Paybill
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till || mpesaConfig.shortCode, 
                PhoneNumber: cleanPhone,
                CallBackURL: finalCallbackUrl, // ✅ Explicitly set to our live endpoint
                AccountReference: userId.slice(0, 12), // Safaricom limit is 12 chars
                TransactionDesc: `Pkg:${packageId}`
            };

            console.log(`🚀 [STK_PUSH]: Sending request to ${cleanPhone} for Amt: ${amount}`);

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

            return { success: true, data: response.data };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STK_ERROR]:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }

    /**
     * 📥 HANDLER: handleStkResult
     * This is called by your controller when Safaricom sends the callback
     */
    async handleStkResult(callbackData) {
        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;

        if (ResultCode === 0) {
            // Extract metadata (Amount, MpesaReceiptNumber, etc.)
            const items = CallbackMetadata.Item;
            const amount = items.find(i => i.Name === 'Amount')?.Value;
            const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = items.find(i => i.Name === 'PhoneNumber')?.Value;

            console.log(`✅ [PAYMENT_SUCCESS]: Receipt: ${receipt} | Amt: ${amount} | Phone: ${phone}`);
            
            // TODO: Update your database here to grant the data/airtime to the user
            // await User.updateStatus(CheckoutRequestID, 'COMPLETED');
            
        } else {
            console.warn(`❌ [PAYMENT_CANCELLED/FAILED]: ${ResultDesc} (Code: ${ResultCode})`);
        }
    }
}

const stkService = new StkService();
export default stkService;