import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from '../config/mpesa.js';
import mpesaAuth from './mpesa.auth.js'; 
import { db } from '../config/db.js';

const transactions = new Map();

class StkService {
    async initiateSTKPush(phoneNumber, amount, userId, packageId = "default") {
        try {
            const accessToken = await mpesaAuth.getAccessToken();
            if (!accessToken) throw new Error("Access Token missing.");

            const timestamp = getMpesaTimestamp();
            const password = generateSTKPassword(timestamp);

            let cleanPhone = phoneNumber.trim().replace('+', '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = `254${cleanPhone.slice(1)}`;
            }

            const finalCallbackUrl = "https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback";

            const payload = {
                BusinessShortCode: mpesaConfig.shortCode, 
                Password: password,
                Timestamp: timestamp,
                TransactionType: "CustomerBuyGoodsOnline", 
                Amount: Math.round(Number(amount)), 
                PartyA: cleanPhone,
                PartyB: mpesaConfig.till || mpesaConfig.shortCode, 
                PhoneNumber: cleanPhone,
                CallBackURL: finalCallbackUrl,
                AccountReference: "XecoFlow", 
                TransactionDesc: `Pay ${packageId}`.slice(0, 13)
            };

            const response = await axios.post(
                `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
                payload,
                { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
            );

            const checkoutId = response.data.CheckoutRequestID;
            
            // ✅ Matches your SQL Schema
            const transactionData = {
                checkout_id: checkoutId,
                phone_number: cleanPhone,
                amount: amount,
                user_id: userId,
                network: 'SAFARICOM', // Required by your ENUM
                status: 'PENDING_PAYMENT', // Matches your ENUM
                idempotency_key: crypto.randomUUID(), // Required by your schema
                metadata: { package_id: packageId }
            };

            try {
                const { error } = await db.airtime_transactions().insert([transactionData]);
                if (error) console.error("❌ [DB_SAVE_ERROR]:", error.message);
            } catch (dbError) {
                console.error("❌ [DB_SAVE_EXCEPTION]:", dbError.message);
            }

            transactions.set(checkoutId, transactionData);
            return { success: true, data: { ...response.data, checkoutRequestId: checkoutId } };

        } catch (error) {
            console.error("❌ [STK_ERROR]:", error.message);
            return { success: false, error: error.message };
        }
    }

    async handleStkResult(callbackData) {
        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
        
        // Map ResultCode to your transaction_status ENUM
        const finalStatus = ResultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

        try {
            let updateData = {
                status: finalStatus,
                metadata: { 
                    result_desc: ResultDesc, 
                    result_code: ResultCode 
                }
            };

            if (ResultCode === 0) {
                const metadata = CallbackMetadata?.Item || [];
                updateData.mpesa_receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            }

            // ✅ Update using the correct column name 'checkout_id'
            const { error } = await db.airtime_transactions()
                .update(updateData)
                .eq('checkout_id', CheckoutRequestID);
            
            if (error) console.error("❌ [DB_UPDATE_ERROR]:", error.message);

            // Update memory for instant polling response
            const cached = transactions.get(CheckoutRequestID) || {};
            transactions.set(CheckoutRequestID, { ...cached, ...updateData });

            return true;
        } catch (error) {
            console.error("❌ [CALLBACK_HANDLER_ERROR]:", error.message);
            throw error;
        }
    }

    async getTransactionStatus(checkoutRequestId) {
        const { data } = await db.airtime_transactions()
            .select('*')
            .eq('checkout_id', checkoutRequestId)
            .maybeSingle();

        const res = data || transactions.get(checkoutRequestId);
        if (!res) return { success: false, status: 'NOT_FOUND' };

        return {
            success: true,
            status: res.status, // Will return 'PAYMENT_SUCCESS' or 'PAYMENT_FAILED'
            transaction: res
        };
    }
}

const stkService = new StkService();
export default stkService;