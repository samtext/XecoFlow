import { db } from '../config/db.js';
import axios from 'axios'; // Ensure axios is installed: npm install axios
import stkService from './stk.service.js'; // To reuse getOAuthToken logic

class C2bService {
    /**
     * 🚀 REGISTER URLS (v2): As requested by Safaricom Support
     * This registers your Confirmation and Validation endpoints with Safaricom.
     */
    async registerUrls() {
        const url = "https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl";
        
        try {
            // 1. Get OAuth Token (reusing logic from stkService)
            const token = await stkService.getOAuthToken();
            
            const body = {
                ShortCode: process.env.BUSINESS_SHORT_CODE,
                ResponseType: "Completed",
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/gateway/payments/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/gateway/payments/c2b-validation"
            };

            console.log("📡 [C2B_REGISTRATION]: Requesting v2 for ShortCode:", body.ShortCode);

            const response = await axios.post(url, body, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                }
            });

            console.log("✅ [C2B_REGISTRATION_SUCCESS]:", response.data);
            return response.data;
        } catch (error) {
            console.error("❌ [C2B_REGISTRATION_ERROR]:", error.response?.data || error.message);
            throw new Error(error.response?.data?.errorMessage || "Failed to register C2B URLs");
        }
    }

    /**
     * 💰 CONFIRMATION: This is where the money is recorded.
     */
    async handleConfirmation(c2bData) {
        console.log(`\n💰 [C2B_RECEIPT]: ${c2bData.TransID} | Amount: ${c2bData.TransAmount}`);

        try {
            // 1. Audit Log: Use the UUID-based logging
            await db.mpesa_callback_logs().insert([{
                callback_data: c2bData,
                metadata: { 
                    type: 'C2B_CONFIRMATION', 
                    msisdn: c2bData.MSISDN,
                    bill_ref: c2bData.BillRefNumber 
                },
                received_at: new Date().toISOString()
            }]);

            // 2. Transaction Record
            const transactionData = {
                checkout_id: c2bData.TransID,
                phone_number: c2bData.MSISDN,
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                idempotency_key: `C2B_${c2bData.TransID}`,
                metadata: {
                    first_name: c2bData.FirstName,
                    middle_name: c2bData.MiddleName,
                    last_name: c2bData.LastName,
                    bill_ref: c2bData.BillRefNumber
                },
                updated_at: new Date().toISOString()
            };

            const { error } = await db.airtime_transactions().insert([transactionData]);
            
            if (error) {
                if (error.code === '23505') {
                    console.warn(`⚠️ [C2B_DUPLICATE]: Transaction ${c2bData.TransID} already exists.`);
                } else {
                    console.error("❌ [C2B_DB_ERROR]:", error.message);
                }
            } else {
                console.log(`✅ [C2B_SUCCESS]: Saved transaction ${c2bData.TransID}`);
            }

            return { ResultCode: 0, ResultDesc: "Success" };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            // Return Accepted to Safaricom even on internal error to stop retries
            return { ResultCode: 0, ResultDesc: "Accepted" };
        }
    }

    /**
     * 🔍 VALIDATION
     */
    async handleValidation(data) {
        console.log("🔍 [C2B_VALIDATION]: Checking payment...", data.TransID);
        // Business Logic: Accept all payments by default
        return { ResultCode: 0, ResultDesc: "Accepted" };
    }
}

// 🔐 Export as a singleton instance
export default new C2bService();