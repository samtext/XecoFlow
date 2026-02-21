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
             * Must be HTTPS and publicly accessible. 
             * Safaricom Sandbox can sometimes be finicky with Render's subdomains.
             */
            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", // Use CustomerPayBillOnline for Paybills
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.shortCode, // For STK Push, PartyB is usually the Shortcode
                PhoneNumber: cleanPhone,
                CallBackURL: finalCallbackUrl,
                // ✅ FIX: Safaricom AccountReference is LIMITED to 12 characters.
                AccountReference: String(userId).slice(-12), 
                TransactionDesc: `Pkg:${packageId}`.slice(0, 13) // Limit Desc to 13 chars
            };

            console.log(`🚀 [STK_PUSH]: Sending request to ${cleanPhone} | Ref: ${payload.AccountReference}`);

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
     * Processes the raw POST body sent from Safaricom.
     */
    async handleStkResult(callbackData) {
        // Safaricom wraps the data in a Body.stkCallback object
        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;

        if (ResultCode === 0 && CallbackMetadata) {
            const items = CallbackMetadata.Item;
            const amount = items.find(i => i.Name === 'Amount')?.Value;
            const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = items.find(i => i.Name === 'PhoneNumber')?.Value;

            console.log(`✅ [PAYMENT_SUCCESS]: Receipt: ${receipt} | Amt: ${amount} | Phone: ${phone}`);
            
            // This is where you trigger your DB update logic
            return { success: true, receipt, amount, checkoutID: CheckoutRequestID };
        } else {
            console.warn(`❌ [PAYMENT_FAILED]: ${ResultDesc} (Code: ${ResultCode})`);
            return { success: false, error: ResultDesc };
        }
    }
}

const stkService = new StkService();
export default stkService;