import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid'; // Ensure you have uuid installed: npm install uuid

class MpesaService {
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const response = await axios.get(`${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`, { 
                headers: { Authorization: `Basic ${auth}` } 
            });
            return response.data.access_token;
        } catch (error) {
            console.error("❌ Auth Error:", error.response?.data || error.message);
            throw new Error("Authentication failed");
        }
    }

    async initiateSTKPush(phoneNumber, amount, userId) {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);
            
            // Your DB requires an idempotency_key (UUID)
            const iKey = uuidv4();

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(amount),
                PartyA: phoneNumber,
                PartyB: mpesaConfig.till, 
                PhoneNumber: phoneNumber,
                CallBackURL: mpesaConfig.callbackUrl,
                AccountReference: iKey.substring(0, 12),
                TransactionDesc: "Airtime Purchase"
            };

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                // FIXED: Mapping to your specific SQL Schema columns
                const { error: insertError } = await db.airtime_transactions().insert([{
                    user_id: userId, // Required by your SQL schema
                    amount: amount,
                    phone_number: phoneNumber, // Matches your SQL 'phone_number'
                    network: 'SAFARICOM', // Required by your ENUM network_provider
                    status: 'PENDING_PAYMENT', // Matches your ENUM transaction_status
                    idempotency_key: iKey, // Required UNIQUE UUID
                    checkout_id: response.data.CheckoutRequestID
                }]);

                if (insertError) {
                    console.error("❌ DB Insert Error:", insertError.message);
                } else {
                    console.log(`✅ Record Saved PENDING: ${response.data.CheckoutRequestID}`);
                }
            }

            return { success: true, checkoutRequestId: response.data.CheckoutRequestID };
        } catch (error) {
            console.error("❌ STK Error:", error.message);
            return { success: false, error: error.message };
        }
    }

    async handleCallback(rawData) {
        try {
            if (!rawData?.Body?.stkCallback) return false;

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            
            // Mapping M-Pesa result to your SQL ENUM 'transaction_status'
            const status = String(cb.ResultCode) === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            console.log(`📥 Callback for ${checkoutId}: ${status}`);

            if (checkoutId) {
                // Wait slightly for the insert to propagate
                await new Promise(res => setTimeout(res, 2000));

                const { data, error } = await db.airtime_transactions()
                    .update({ status: status })
                    .eq('checkout_id', checkoutId)
                    .select();

                if (error) throw error;
                if (data && data.length > 0) {
                    console.log(`💾 DB Updated to ${status}`);
                } else {
                    console.error("❌ DB Update failed: Record not found.");
                }
            }
            return true;
        } catch (e) {
            console.error("❌ Callback Error:", e.message);
            return false;
        }
    }
}

export default new MpesaService();