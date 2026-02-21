import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';
import { db } from '../config/db.js';
import { getAccessToken } from './mpesa.auth.js';

class C2BService {
    async registerC2Bv2() {
        try {
            const accessToken = await getAccessToken();
            
            const payload = {
                ShortCode: mpesaConfig.shortCode,
                ResponseType: "Completed", 
                // Using neutral paths to satisfy Safaricom firewall
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/gateway/hooks/v2-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/gateway/hooks/v2-validation"
            };

            const urlV2 = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
            const response = await axios.post(urlV2, payload, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            return response.data;
        } catch (error) {
            const errBody = error.response?.data || error.message;
            throw new Error(`C2B Registration Failed: ${errBody.errorMessage || error.message}`);
        }
    }

    async handleC2BConfirmation(c2bData) {
        try {
            const { TransID, TransAmount, MSISDN, BillRefNumber, FirstName } = c2bData;
            console.log(`💰 [V2_C2B_HIT]: ID ${TransID} | Amount ${TransAmount}`);

            // 1. Log Raw Callback
            await db.mpesa_callback_logs().insert([{
                checkout_request_id: TransID,
                raw_payload: c2bData,
                status: 'C2B_SUCCESS',
                metadata: { type: 'V2_TILL_PAYMENT', name: FirstName || 'Customer' }
            }]);

            // 2. Create Success Transaction
            const { error: insertError } = await db.airtime_transactions().insert([{
                user_id: 'C2B_WALK_IN',
                amount: parseFloat(TransAmount),
                phone_number: MSISDN,
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: TransID,
                checkout_id: TransID
            }]);

            if (insertError) throw insertError;
            return true;
        } catch (error) {
            console.error("❌ [V2_C2B_ERROR]:", error.message);
            return false;
        }
    }
}

export default new C2BService();