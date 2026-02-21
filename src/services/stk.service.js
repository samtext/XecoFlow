import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 

class StkService {
    async initiateSTKPush(phoneNumber, amount, userId, packageId = "default") {
        try {
            const accessToken = await mpesaAuth.getAccessToken();
            if (!accessToken) throw new Error("Access Token missing.");

            const timestamp = getMpesaTimestamp();
            
            /**
             * 🛠️ SECURITY FIX:
             * In Safaricom STK Push, the Password MUST be generated using the 
             * BusinessShortCode (the one with the Passkey). 
             */
            const password = generateSTKPassword(timestamp);

            // Format phone to 254...
            let cleanPhone = phoneNumber.trim().replace('+', '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `254${cleanPhone.slice(1)}`;
            }

            // ⚠️ DEBUG: Check if your URL contains the word "mpesa". 
            // Safaricom Sandbox often blocks URLs with "mpesa" in the path.
            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                // For Buy Goods (Till), PartyB is the TILL NUMBER, but 
                // BusinessShortCode is the STORE NUMBER used to generate the password.
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

    async handleStkResult(callbackData) {
        // Your logic to update DB here...
        console.log("📝 Processing Callback Background:", callbackData.CheckoutRequestID);
    }
}

const stkService = new StkService();
export default stkService;