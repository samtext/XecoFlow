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

            // Format phone to 254...
            let cleanPhone = phoneNumber.trim().replace('+', '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `254${cleanPhone.slice(1)}`;
            }

            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            /**
             * 📝 TILL (BUY GOODS) RULES:
             * 1. TransactionType: MUST be "CustomerBuyGoodsOnline"
             * 2. BusinessShortCode: This is your LNM Online Shortcode (usually 174379 in sandbox)
             * 3. PartyB: This is your TILL NUMBER (Store Number)
             */
            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till || mpesaConfig.shortCode, // ✅ Crucial for Buy Goods
                PhoneNumber: cleanPhone,
                CallBackURL: finalCallbackUrl,
                AccountReference: "XecoFlow", // Max 12 chars
                TransactionDesc: `Pay ${packageId}`.slice(0, 13)
            };

            console.log(`📡 [STK_ATTEMPT]: Sending to ${cleanPhone} for Till: ${payload.PartyB}`);

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

            console.log(`✅ [MPESA_SUCCESS]:`, response.data);
            return { success: true, data: response.data };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STK_ERROR]:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }

    // ... handleStkResult stays the same
}

const stkService = new StkService();
export default stkService;