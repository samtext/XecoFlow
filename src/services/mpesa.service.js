import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';

class MpesaService {
    async sendStkPush(phoneNumber, amount, accountReference, token) {
        try {
            const accessToken = token || await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);

            // LOGGING THE URL FOR DEBUGGING
            console.log(`📡 SENDING CALLBACK URL: ${mpesaConfig.callbackUrl}`);

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline",
                Amount: Math.round(amount),
                PartyA: phoneNumber,
                PartyB: process.env.MPESA_BUSINESS_TILL, 
                PhoneNumber: phoneNumber,
                CallBackURL: mpesaConfig.callbackUrl, // Syncing with Config
                AccountReference: accountReference.substring(0, 12), 
                TransactionDesc: `Airtime Purchase`
            };

            const response = await axios.post(
                `${mpesaConfig.baseUrl}/mpesa/stkpush/v1/processrequest`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            return {
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                data: response.data
            };
        } catch (error) {
            console.error("❌ STK_PUSH_ERROR:", error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async handleCallback(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        console.log(`📡 PROCESSING CALLBACK: ID ${CheckoutRequestID} | Result: ${ResultCode}`);

        let finalStatus = ResultCode === 0 ? 'PAYMENT_SUCCESS' : (ResultCode === 1032 ? 'CANCELLED' : 'PAYMENT_FAILED');
        
        const { error } = await db.from('airtime_transactions')
            .update({ 
                status: finalStatus,
                metadata: { callback_raw: callbackData, processed_at: new Date().toISOString() }
            })
            .eq('checkout_id', CheckoutRequestID);

        if (error) console.error("📑 DB UPDATE ERROR:", error.message);
        return true;
    }
}

export default new MpesaService();