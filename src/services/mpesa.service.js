import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';

class MpesaService {
    /**
     * AUTHENTICATION: Get Access Token
     * Required to authorize the STK Push request.
     */
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const response = await axios.get(
                `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`,
                { headers: { Authorization: `Basic ${auth}` } }
            );
            return response.data.access_token;
        } catch (error) {
            console.error("❌ MPESA_AUTH_ERROR:", error.response?.data || error.message);
            throw new Error("Failed to generate M-Pesa access token.");
        }
    }

    /**
     * INITIATE STK PUSH
     * Logic: Prepares payload, generates credentials, and hits Safaricom API.
     */
    async sendStkPush(phoneNumber, amount, accountReference, token) {
        try {
            // Use provided token or fetch a new one
            const accessToken = token || await this.getAccessToken();
            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);

            console.log(`📡 SENDING CALLBACK URL: ${mpesaConfig.callbackUrl}`);

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(amount),
                PartyA: phoneNumber,
                // Ensure PartyB is the specific Till/ShortCode required for production
                PartyB: process.env.MPESA_BUSINESS_TILL || mpesaConfig.shortCode, 
                PhoneNumber: phoneNumber,
                CallBackURL: mpesaConfig.callbackUrl,
                // AccountReference must not have spaces and is capped at 12 chars
                AccountReference: accountReference.replace(/\s/g, '').substring(0, 12), 
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

    /**
     * HANDLE CALLBACK FROM SAFARICOM
     * Logic: Extracts metadata and updates the DB using the XECO-ENGINE manager.
     */
    async handleCallback(rawData) {
        try {
            // Check if payload contains the necessary Body object
            if (!rawData?.Body?.stkCallback) {
                console.warn("⚠️ MALFORMED CALLBACK: No stkCallback body found.");
                return false;
            }
            
            const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = rawData.Body.stkCallback;
            console.log(`📡 PROCESSING CALLBACK: ID ${CheckoutRequestID} | Result: ${ResultCode} (${ResultDesc})`);

            // Define status based on Safaricom ResultCodes
            let finalStatus = 'PAYMENT_FAILED';
            if (ResultCode === 0) finalStatus = 'PAYMENT_SUCCESS';
            if (ResultCode === 1032) finalStatus = 'CANCELLED';

            let mpesaReceipt = null;
            // Extract Receipt Number only on success
            if (ResultCode === 0 && CallbackMetadata?.Item) {
                const receiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
                mpesaReceipt = receiptItem ? receiptItem.Value : null;
            }

            /**
             * DB HANDSHAKE
             * Using db.mpesa_logs() as a function to match your Advanced Manager (db.js).
             */
            const { error } = await db.mpesa_logs()
                .update({ 
                    status: finalStatus,
                    metadata: { 
                        callback_raw: rawData.Body.stkCallback, 
                        mpesa_receipt: mpesaReceipt,
                        processed_at: new Date().toISOString() 
                    }
                })
                .eq('checkout_id', CheckoutRequestID);

            if (error) {
                console.error("📑 DB UPDATE ERROR:", error.message);
                return false;
            }

            console.log(`✅ DB UPDATED: ${CheckoutRequestID} set to ${finalStatus}`);
            return true;
        } catch (err) {
            console.error("❌ CALLBACK_LOGIC_CRASH:", err.message);
            return false;
        }
    }
}

export default new MpesaService();