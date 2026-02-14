import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';

class MpesaService {
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const url = `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`;
            
            const response = await axios.get(url, { 
                headers: { Authorization: `Basic ${auth}` } 
            });
            
            return response.data.access_token;
        } catch (error) {
            console.error("❌ Auth Error:", error.response?.data || error.message);
            throw new Error("Authentication failed");
        }
    }

    async initiateSTKPush(phoneNumber, amount) {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);
            const accountRef = `XECO${Date.now()}`.substring(0, 12);

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
                AccountReference: accountRef,
                TransactionDesc: "Payment for goods"
            };

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (response.data.ResponseCode === "0") {
                // Ensure the database INSERT is awaited so the record exists for the callback
                const { error: insertError } = await db.airtime_transactions().insert([{
                    checkout_id: response.data.CheckoutRequestID,
                    phone: phoneNumber,
                    amount: amount,
                    status: 'PENDING',
                    reference: accountRef,
                    transaction_type: 'BUY_GOODS'
                }]);

                if (insertError) {
                    console.error("❌ DB Insert Error:", insertError.message);
                } else {
                    console.log(`✅ STK Pushed & Saved: ${response.data.CheckoutRequestID}`);
                }
            }

            return { success: true, checkoutRequestId: response.data.CheckoutRequestID };
        } catch (error) {
            console.error("❌ STK Initiation Error:", error.message);
            return { success: false, error: error.message };
        }
    }

    async handleCallback(rawData) {
        try {
            console.log("📥 MPESA CALLBACK RECEIVED!");
            if (!rawData?.Body?.stkCallback) return false;

            const cb = rawData.Body.stkCallback;
            const checkoutId = cb.CheckoutRequestID;
            const status = String(cb.ResultCode) === "0" ? 'COMPLETED' : 'FAILED';
            
            console.log(`🔄 Callback ID: ${checkoutId} | Status: ${status}`);

            if (checkoutId) {
                // TRY 1: Immediate Update
                const { data, error } = await db.airtime_transactions()
                    .update({ 
                        status: status, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('checkout_id', checkoutId)
                    .select();

                // TRY 2: If row wasn't found (Race Condition), wait 3s and retry
                if (!error && (!data || data.length === 0)) {
                    console.log("🕒 Record not found yet, retrying in 3 seconds...");
                    await new Promise(res => setTimeout(res, 3000));
                    
                    const { data: retryData, error: retryError } = await db.airtime_transactions()
                        .update({ 
                            status: status, 
                            updated_at: new Date().toISOString() 
                        })
                        .eq('checkout_id', checkoutId)
                        .select();
                    
                    if (retryError) throw retryError;
                    
                    if (retryData && retryData.length > 0) {
                        console.log(`💾 DB Updated on Retry: ${checkoutId} is now ${status}`);
                    } else {
                        console.error(`❌ DB Update Failed: No record found for ID ${checkoutId} even after retry.`);
                    }
                } else if (error) {
                    throw error;
                } else {
                    console.log(`💾 DB Updated: ${checkoutId} is now ${status}`);
                }
            }
            return true;
        } catch (e) {
            console.error("❌ DB Callback Update Error:", e.message);
            return false;
        }
    }
}

export default new MpesaService();