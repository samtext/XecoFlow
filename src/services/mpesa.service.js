import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
// Import System Constants to follow the 'Laws of Physics'
import { TX_STATES, MPESA_STATUS_CODES } from '../config/systemRules.js';

class MpesaService {
    /**
     * AUTHENTICATION: Get Access Token
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
     */
    async sendStkPush(phoneNumber, amount, accountReference, token) {
        try {
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
                PartyB: process.env.MPESA_BUSINESS_TILL || mpesaConfig.shortCode, 
                PhoneNumber: phoneNumber,
                CallBackURL: mpesaConfig.callbackUrl,
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
     * Logic: Records Evidence First (Insert), then Updates Transaction State.
     */
    async handleCallback(rawData) {
        try {
            if (!rawData?.Body?.stkCallback) {
                console.warn("⚠️ MALFORMED CALLBACK: No stkCallback body found.");
                return false;
            }
            
            const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = rawData.Body.stkCallback;
            console.log(`📡 PROCESSING CALLBACK: ID ${CheckoutRequestID} | Result: ${ResultCode} (${ResultDesc})`);

            // Use TX_STATES and MPESA_STATUS_CODES constants for strict ENUM compliance
            let finalStatus = TX_STATES.PAYMENT_FAILED;
            if (String(ResultCode) === MPESA_STATUS_CODES.MPESA_SUCCESS_CODE) {
                finalStatus = TX_STATES.PAYMENT_SUCCESS;
            }

            let mpesaReceipt = null;
            if (ResultCode === 0 && CallbackMetadata?.Item) {
                const receiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
                mpesaReceipt = receiptItem ? receiptItem.Value : null;
            }

            /**
             * DB HANDSHAKE 1: Record Evidence (PAYMENT EVIDENCE LAYER)
             * Changed to .insert() because every callback is a unique event proof.
             */
            const { error: logError } = await db.mpesa_logs()
                .insert([{ 
                    checkout_request_id: CheckoutRequestID,
                    merchant_request_id: MerchantRequestID,
                    status: finalStatus,
                    raw_payload: rawData.Body.stkCallback,
                    metadata: { 
                        mpesa_receipt: mpesaReceipt,
                        processed_at: new Date().toISOString(),
                        result_desc: ResultDesc,
                        result_code: ResultCode
                    }
                }]);

            if (logError) {
                console.error("📑 DB LOG INSERT ERROR:", logError.message);
            }

            /**
             * DB HANDSHAKE 2: Sync main transaction status (RETAIL LAYER)
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