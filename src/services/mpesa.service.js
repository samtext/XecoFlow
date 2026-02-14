import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid

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

    async initiateSTKPush(phoneNumber, amount, userId = null) {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);
            const iKey = uuidv4(); // Generate required idempotency_key

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
                // IMPORTANT: If userId is null, we provide a placeholder to satisfy NOT NULL constraint
                // In production, this must be a real auth.users UUID.
                const finalUserId = userId || '00000000-0000-0000-0000-000000000000'; 

                const { error: insertError } = await db.airtime_transactions().insert([{
                    user_id: finalUserId,           // Fixed: Violates not-null
                    amount: amount,
                    phone_number: phoneNumber,      // Fixed: Column name mismatch
                    network: 'SAFARICOM',           // Required ENUM
                    status: 'PENDING_PAYMENT',      // Fixed: Matches ENUM
                    idempotency_key: iKey,          // Required UNIQUE UUID
                    checkout_id: response.data.CheckoutRequestID
                }]);

                if (insertError) {
                    console.error("❌ DB Insert Error:", insertError.message);
                } else {
                    console.log(`✅ Record Saved: ${response.data.CheckoutRequestID}`);
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
            
            // Map to your ENUM: PAYMENT_SUCCESS or PAYMENT_FAILED
            const status = String(cb.ResultCode) === "0" ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            if (checkoutId) {
                // Wait for insert to complete
                await new Promise(res => setTimeout(res, 2500));

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