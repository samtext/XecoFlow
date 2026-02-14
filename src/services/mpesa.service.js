import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';

class MpesaService {
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const url = `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`;
            
            console.log("🔑 Getting access token...");
            
            const response = await axios.get(url, { 
                headers: { Authorization: `Basic ${auth}` } 
            });
            
            console.log("✅ Access token obtained");
            return response.data.access_token;
        } catch (error) {
            console.error("❌ Auth Error:", error.response?.data || error.message);
            throw new Error("Authentication failed");
        }
    }

    async initiateSTKPush(phoneNumber, amount) {
        try {
            console.log(`🚀 Initiating Buy Goods STK Push for ${phoneNumber} - KES ${amount}`);
            
            const accessToken = await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            
            /**
             * 🛡️ SECURE CONFIGURATION:
             * BusinessShortCode = The Parent/HQ code (mapped in .env as 7450249)
             * PartyB = The actual Till (mapped in .env as 4938110)
             * Password = Hashed using the HQ code for production handshake
             */
            const password = generateSTKPassword(timestamp);

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
                AccountReference: `XECO${Date.now()}`.substring(0, 12),
                TransactionDesc: "Payment for goods"
            };

            console.log(`📦 Payload: Routing through HQ ${payload.BusinessShortCode} to Till ${payload.PartyB}`);

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                // Using .select() to avoid the "coerce to single object" error if multiple rows exist
                await db.airtime_transactions().insert([{
                    checkout_id: response.data.CheckoutRequestID,
                    phone: phoneNumber,
                    amount: amount,
                    status: 'PENDING',
                    reference: payload.AccountReference,
                    transaction_type: 'BUY_GOODS'
                }]).select();
                
                console.log(`✅ STK Push sent! Checkout ID: ${response.data.CheckoutRequestID}`);
            }

            return {
                success: response.data.ResponseCode === "0",
                checkoutRequestId: response.data.CheckoutRequestID,
                data: response.data
            };
        } catch (error) {
            console.error("❌ STK Push Error:", error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data?.errorMessage || error.message 
            };
        }
    }

    async handleCallback(rawData) {
        try {
            if (!rawData?.Body?.stkCallback) {
                console.warn("⚠️ Invalid callback format received");
                return false;
            }

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            const status = String(cb.ResultCode) === "0" ? 'COMPLETED' : 'FAILED';
            
            console.log(`📥 Callback received for ${checkoutId}: Status ${status}`);

            if (checkoutId) {
                // 🕒 Race Condition Fix: Wait 2 seconds to ensure the 'PENDING' record 
                // from initiateSTKPush is fully saved in Supabase before we try to update it.
                await new Promise(resolve => setTimeout(resolve, 2000));

                const { data, error } = await db.airtime_transactions()
                    .update({ 
                        status, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('checkout_id', checkoutId)
                    .select(); // .select() ensures we get the row back to verify it updated

                if (error) throw error;

                if (!data || data.length === 0) {
                    console.error(`❌ DB Update Failed: No record found for ID ${checkoutId}`);
                } else {
                    console.log(`💾 DB Updated: ${checkoutId} is now ${status}`);
                }
            }
            return true;
        } catch (e) {
            console.error("❌ Callback Processing Error:", e.message);
            return false;
        }
    }
}

export default new MpesaService();