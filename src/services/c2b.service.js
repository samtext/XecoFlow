import { db } from '../config/db.js';

class C2bService {
    /**
     * CONFIRMATION: This is where the money is recorded.
     * Safaricom sends a POST request here after a successful Paybill/Till payment.
     */
    async handleConfirmation(c2bData) {
        console.log(`\n💰 [C2B_RECEIPT]: ${c2bData.TransID} | Amount: ${c2bData.TransAmount}`);

        try {
            // 1. Audit Log: Use the new UUID-based logging
            await db.mpesa_callback_logs().insert([{
                callback_data: c2bData,
                metadata: { 
                    type: 'C2B_CONFIRMATION', 
                    msisdn: c2bData.MSISDN,
                    bill_ref: c2bData.BillRefNumber 
                },
                received_at: new Date().toISOString()
            }]);

            // 2. Transaction Record: Map C2B fields to your airtime_transactions schema
            const transactionData = {
                checkout_id: c2bData.TransID, // Use TransID as the unique reference
                phone_number: c2bData.MSISDN,
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                idempotency_key: `C2B_${c2bData.TransID}`, // Prevent duplicate processing
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

            // Safaricom expects this exact JSON response
            return { ResultCode: 0, ResultDesc: "Success" };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            return { ResultCode: 0, ResultDesc: "Accepted" }; // Tell Safaricom we got it anyway
        }
    }

    /**
     * VALIDATION: (Optional but recommended)
     * Safaricom asks "Is this payment allowed?" before completing it.
     */
    async handleValidation(data) {
        console.log("🔍 [C2B_VALIDATION]: Checking payment...", data.TransID);
        // You can add logic here to reject payments (e.g., if amount < 10)
        return { ResultCode: 0, ResultDesc: "Accepted" };
    }
}

export default new C2bService();