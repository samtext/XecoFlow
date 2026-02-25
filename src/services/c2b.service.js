import { db } from '../config/db.js';
import axios from 'axios'; 
import stkService from './stk.service.js'; 
import mpesaConfig from '../config/mpesa.js'; 

class C2bService {
    /**
     * 🚀 REGISTER URLS (v2): Mapping to the Store Number
     * For Till Number 4938110, we register using Store Number 9203342.
     */
    async registerUrls() {
        const url = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
        
        try {
            const token = await stkService.getOAuthToken();
            
            const body = {
                // 🚩 CRITICAL: For Buy Goods Tills, use the STORE NUMBER here
                ShortCode: "9203342", 
                ResponseType: "Completed",
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/gateway/payments/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/gateway/payments/c2b-validation"
            };

            console.log(`📡 [C2B_REGISTRATION]: Mapping Store Number: ${body.ShortCode} for Till: 4938110`);

            const response = await axios.post(url, body, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                }
            });

            console.log("✅ [C2B_REGISTRATION_SUCCESS]:", response.data);
            return response.data;
        } catch (error) {
            const errorDetail = error.response?.data || error.message;
            console.error("❌ [C2B_REGISTRATION_ERROR]:", JSON.stringify(errorDetail, null, 2));
            throw new Error(error.response?.data?.errorMessage || "Failed to register C2B URLs");
        }
    }

    /**
     * 💰 CONFIRMATION: Saves the transaction to Supabase
     */
    async handleConfirmation(c2bData) {
        // Log the incoming data clearly for debugging
        console.log(`\n💰 [C2B_RECEIPT]: ${c2bData.TransID} | Amount: ${c2bData.TransAmount} | From: ${c2bData.MSISDN}`);

        try {
            // 1. Log the raw callback for audit purposes
            await db.mpesa_callback_logs().insert([{
                callback_data: c2bData,
                metadata: { 
                    type: 'C2B_CONFIRMATION', 
                    msisdn: c2bData.MSISDN,
                    till_paid: c2bData.BusinessShortCode // This should show your Till or Store number
                },
                received_at: new Date().toISOString()
            }]);

            // 2. Insert into Airtime Transactions table
            const transactionData = {
                checkout_id: c2bData.TransID,
                phone_number: c2bData.MSISDN,
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                // 🚩 FIX: Your DB expects a UUID format. Using the raw TransID 
                // ensures it doesn't fail with the "C2B_" prefix syntax error.
                idempotency_key: c2bData.TransID, 
                metadata: {
                    first_name: c2bData.FirstName,
                    middle_name: c2bData.MiddleName,
                    last_name: c2bData.LastName,
                    bill_ref: c2bData.BillRefNumber // In Tills, this is often the MSISDN or 'Leave Blank'
                },
                updated_at: new Date().toISOString()
            };

            const { error } = await db.airtime_transactions().insert([transactionData]);
            
            if (error) {
                if (error.code === '23505' || error.message.includes('unique constraint')) {
                    console.warn(`⚠️ [C2B_DUPLICATE]: Transaction ${c2bData.TransID} already recorded.`);
                } else {
                    console.error("❌ [C2B_DB_ERROR]:", error.message);
                }
            } else {
                console.log(`✅ [C2B_SUCCESS]: Recorded ${c2bData.TransID} in database.`);
            }

            return { ResultCode: 0, ResultDesc: "Success" };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            // We tell Safaricom "Accepted" even on error to stop them from retrying the same hit
            return { ResultCode: 0, ResultDesc: "Accepted" };
        }
    }

    /**
     * 🔍 VALIDATION: Auto-accepts the payment
     */
    async handleValidation(data) {
        console.log("🔍 [C2B_VALIDATION]: Handshake for TransID:", data.TransID);
        return { ResultCode: 0, ResultDesc: "Accepted" };
    }
}

export default new C2bService();