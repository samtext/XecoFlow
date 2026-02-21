import axios from 'axios';
// Ensure these paths match your folder structure exactly
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 

class StkService {
    async initiateSTKPush(phoneNumber, amount, accountRef = "XecoFlow") {
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

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till, 
                PhoneNumber: cleanPhone,
                CallBackURL: mpesaConfig.callbackUrl,
                AccountReference: accountRef, 
                TransactionDesc: "Payment for Goods"
            };

            console.log(`🚀 [STK_PUSH]: Sending request to ${cleanPhone}...`);

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
}

const stkService = new StkService();
export default stkService;