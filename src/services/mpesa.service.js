import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { TX_STATES, MPESA_STATUS_CODES } from '../config/systemRules.js';

class MpesaService {
    /**
     * AUTHENTICATION: Get Access Token
     * Dynamically pulls from production/sandbox based on your config.
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
     * Supports both STK Push and Manual C2B (Lipa Na Mpesa)
     */
    async handleCallback(rawData, ipAddress = '0.0.0.0') {
        try {
            let finalStatus = TX_STATES.PAYMENT_FAILED;
            let mpesaReceipt = null;
            let checkoutId = null;
            let resultDesc = "Processed";
            let resultCode = 0;
            let merchantId = null;

            // --- 1. DETECT PAYLOAD TYPE ---
            
            // TYPE A: STK PUSH (Has .Body object)
            if (rawData?.Body?.stkCallback) {
                const cb = rawData.Body.stkCallback;
                checkoutId = cb.CheckoutRequestID;
                merchantId = cb.MerchantRequestID;
                resultCode = cb.ResultCode;
                resultDesc = cb.ResultDesc;

                if (String(resultCode) === MPESA_STATUS_CODES.MPESA_SUCCESS_CODE) {
                    finalStatus = TX_STATES.PAYMENT_SUCCESS;
                    const receiptItem = cb.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber');
                    mpesaReceipt = receiptItem ? receiptItem.Value : null;
                }
            } 
            // TYPE B: MANUAL C2B (Flat object with TransID)
            else if (rawData?.TransID) {
                mpesaReceipt = rawData.TransID;
                resultDesc = "C2B Confirmation Received";
                finalStatus = TX_STATES.PAYMENT_SUCCESS;
                // Manual matching: usually uses BillRefNumber or MSISDN
                checkoutId = rawData.BillRefNumber; 
            }

            console.log(`📡 PROCESSING: ID ${checkoutId} | Receipt: ${mpesaReceipt} | Status: ${finalStatus}`);

            /**
             * DB HANDSHAKE 1: Record Evidence
             */
            const { error: logError } = await db.mpesa_logs().insert([{ 
                checkout_request_id: checkoutId || 'UNKNOWN',
                merchant_request_id: merchantId,
                status: finalStatus,
                raw_payload: rawData.Body?.stkCallback || rawData,
                ip_address: ipAddress,
                metadata: { 
                    mpesa_receipt: mpesaReceipt,
                    processed_at: new Date().toISOString(),
                    result_desc: resultDesc,
                    result_code: resultCode
                }
            }]);

            if (logError) console.error("📑 DB LOG INSERT ERROR:", logError.message);

            /**
             * DB HANDSHAKE 2: Sync main transaction status
             */
            if (checkoutId) {
                const { error: transError } = await db.airtime_transactions()
                    .update({ 
                        status: finalStatus,
                        mpesa_receipt: mpesaReceipt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId);

                if (transError) console.error("📑 TRANS UPDATE ERROR:", transError.message);
            }

            return true;
        } catch (err) {
            console.error("❌ CALLBACK_LOGIC_CRASH:", err.message);
            return false;
        }
    }
}

export default new MpesaService();