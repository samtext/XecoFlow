import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import { db } from '../config/db.js';
import { TX_STATES, MPESA_STATUS_CODES } from '../config/systemRules.js';

class MpesaService {
    /**
     * AUTHENTICATION: Get Access Token
     * Improved logging to catch credential mismatches
     */
    async getAccessToken() {
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const url = `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`;
            
            console.log(`🔑 ATTEMPTING AUTH AT: ${url}`);
            
            const response = await axios.get(url, { 
                headers: { Authorization: `Basic ${auth}` } 
            });
            
            return response.data.access_token;
        } catch (error) {
            // This logs the specific reason Safaricom is rejecting your keys
            console.error("❌ MPESA_AUTH_ERROR_DETAIL:", error.response?.data || error.message);
            throw new Error(`M-Pesa Auth Failed: ${error.response?.data?.errorMessage || error.message}`);
        }
    }

    /**
     * 🚀 BRIDGE METHOD
     */
    async initiateSTKPush(phoneNumber, amount) {
        const accountReference = `XECO${Math.floor(1000 + Math.random() * 9000)}`;
        return await this.sendStkPush(phoneNumber, amount, accountReference);
    }

    /**
     * INITIATE STK PUSH (Core Logic)
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
                TransactionType: "CustomerBuyGoodsOnline", // Ensure this matches your Shortcode type
                Amount: Math.round(amount),
                PartyA: phoneNumber,
                PartyB: mpesaConfig.shortCode, 
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

            // DB HANDSHAKE
            await db.airtime_transactions().insert([{
                checkout_id: response.data.CheckoutRequestID,
                phone: phoneNumber,
                amount: amount,
                status: TX_STATES.PENDING,
                reference: accountReference
            }]);

            return {
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                data: response.data
            };
        } catch (error) {
            console.error("❌ STK_PUSH_ERROR:", error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data || error.message 
            };
        }
    }

    /**
     * HANDLE CALLBACK FROM SAFARICOM
     */
    async handleCallback(rawData, ipAddress = '0.0.0.0') {
        try {
            let finalStatus = TX_STATES.PAYMENT_FAILED;
            let mpesaReceipt = null;
            let checkoutId = null;
            let resultDesc = "Processed";
            let resultCode = 0;
            let merchantId = null;

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
            else if (rawData?.TransID) {
                mpesaReceipt = rawData.TransID;
                resultDesc = "C2B Confirmation Received";
                finalStatus = TX_STATES.PAYMENT_SUCCESS;
                checkoutId = rawData.BillRefNumber; 
            }

            console.log(`📡 CALLBACK PROCESSED: ID ${checkoutId} | Status: ${finalStatus}`);

            // LOG TO DB
            await db.mpesa_logs().insert([{ 
                checkout_request_id: checkoutId || 'UNKNOWN',
                merchant_request_id: merchantId,
                status: finalStatus,
                raw_payload: rawData.Body?.stkCallback || rawData,
                ip_address: ipAddress,
                metadata: { 
                    mpesa_receipt: mpesaReceipt,
                    result_desc: resultDesc,
                    result_code: resultCode
                }
            }]);

            // UPDATE TRANSACTION
            if (checkoutId) {
                await db.airtime_transactions()
                    .update({ 
                        status: finalStatus,
                        mpesa_receipt: mpesaReceipt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('checkout_id', checkoutId);
            }

            return true;
        } catch (err) {
            console.error("❌ CALLBACK_LOGIC_CRASH:", err.message);
            return false;
        }
    }
}

export default new MpesaService();