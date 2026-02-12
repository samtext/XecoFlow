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
            
            const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = rawData.Body.stkCallback;
            console.log(`📡 PROCESSING CALLBACK: ID ${CheckoutRequestID} | Result: ${ResultCode} (${ResultDesc})`);

            // FIXED: Using lowercase 'failed' and 'success' to match strict DB ENUM constraints
            let finalStatus = 'failed';
            if (ResultCode === 0) finalStatus = 'success';

            let mpesaReceipt = null;
            // Extract Receipt Number only on success
            if (ResultCode === 0 && CallbackMetadata?.Item) {
                const receiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
                mpesaReceipt = receiptItem ? receiptItem.Value : null;
            }

            /**
             * DB HANDSHAKE 1: Update Logs
             * Aligned with your specific table schema: mpesa_callback_logs
             */
            const { error: logError } = await db.mpesa_logs()
                .update({ 
                    merchant_request_id: MerchantRequestID,
                    status: finalStatus,
                    raw_payload: rawData.Body.stkCallback,
                    metadata: { 
                        mpesa_receipt: mpesaReceipt,
                        processed_at: new Date().toISOString(),
                        result_desc: ResultDesc
                    }
                })
                .eq('checkout_request_id', CheckoutRequestID);

            if (logError) {
                console.error("📑 DB LOG UPDATE ERROR:", logError.message);
                return false;
            }

            /**
             * DB HANDSHAKE 2: Sync main transaction status
             * Updates 'airtime_transactions' using lowercase values for ENUM compatibility.
             */
            const { error: transError } = await db.airtime_transactions()
                .update({ 
                    status: finalStatus,
                    mpesa_receipt: mpesaReceipt,
                    updated_at: new Date().toISOString()
                })
                .eq('checkout_id', CheckoutRequestID);

            if (transError) {
                console.error("📑 AIRTIME_TRANS UPDATE ERROR:", transError.message);
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