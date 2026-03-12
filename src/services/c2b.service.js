import { db } from '../config/db.js';
import axios from 'axios'; 
import stkService from './stk.service.js'; 
import mpesaConfig from '../config/mpesa.js'; 
import crypto from 'crypto';
import { normalizePhone } from '../utils/phoneUtils.js'; // You need to create this

class C2bService {
    /**
     * 🚀 REGISTER URLS (v2): Mapping to the Store Number
     */
    async registerUrls() {
        // Your existing code - this is good!
        const url = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
        
        try {
            const token = await stkService.getOAuthToken();
            
            const body = {
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
     * 🔍 VALIDATION - THIS IS CRITICAL! FIX THIS FIRST!
     */
    async handleValidation(data) {
        console.log(`🔍 [C2B_VALIDATION]: TransID: ${data.TransID} | Amount: ${data.TransAmount}`);
        
        // Get minimum amount from env or default to 10
        const minAmount = parseFloat(process.env.MIN_TRANSACTION_AMOUNT) || 10;
        const amount = parseFloat(data.TransAmount);
        
        // Check if amount is valid number
        if (isNaN(amount) || amount <= 0) {
            console.log(`🚫 [C2B_VALIDATION_REJECTED]: Invalid amount`);
            return { 
                ResultCode: "C2B00016", 
                ResultDesc: "Invalid transaction amount" 
            };
        }
        
        // REJECT amounts below minimum - money NEVER leaves customer!
        if (amount < minAmount) {
            console.log(`🚫 [C2B_VALIDATION_REJECTED]: Amount ${amount} below minimum ${minAmount}`);
            return { 
                ResultCode: "C2B00016", 
                ResultDesc: `Minimum transaction amount is KES ${minAmount}` 
            };
        }
        
        // Check maximum amount (Safaricom limit)
        const maxAmount = 70000;
        if (amount > maxAmount) {
            console.log(`🚫 [C2B_VALIDATION_REJECTED]: Amount ${amount} exceeds maximum ${maxAmount}`);
            return { 
                ResultCode: "C2B00016", 
                ResultDesc: `Maximum transaction amount is KES ${maxAmount}` 
            };
        }
        
        console.log(`✅ [C2B_VALIDATION_ACCEPTED]: Amount ${amount}`);
        return { ResultCode: 0, ResultDesc: "Accepted" };
    }

    /**
     * 💰 CONFIRMATION - Only called for VALID transactions (after validation passes)
     */
    async handleConfirmation(c2bData) {
        console.log(`\n💰 [C2B_RECEIPT]: ${c2bData.TransID} | Amount: ${c2bData.TransAmount} | From: ${c2bData.MSISDN}`);

        try {
            // 1. Log callback for audit
            await db.mpesa_callback_logs().insert([{
                trans_id: c2bData.TransID,
                checkout_request_id: c2bData.TransID,
                merchant_request_id: c2bData.BusinessShortCode,
                result_code: 0,
                result_desc: 'C2B Confirmation Success',
                status: 'COMPLETED',
                callback_data: c2bData,
                metadata: { 
                    type: 'C2B_CONFIRMATION', 
                    msisdn: c2bData.MSISDN,
                    till_paid: c2bData.BusinessShortCode,
                    bill_ref: c2bData.BillRefNumber
                },
                received_at: new Date().toISOString()
            }]);

            // 2. Generate deterministic UUID for idempotency
            const deterministicUuid = crypto.createHash('sha256')
                .update(`C2B_${c2bData.TransID}`)
                .digest('hex')
                .substring(0, 32)
                .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

            // 3. Try to normalize phone (though it's hashed, so will likely be null)
            const normalizedPhone = normalizePhone(c2bData.MSISDN);
            
            // 4. Prepare transaction data
            const transactionData = {
                user_id: null, // Can't determine user from hashed phone
                checkout_id: c2bData.TransID,
                phone_number: normalizedPhone || c2bData.MSISDN.substring(0, 20),
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                idempotency_key: deterministicUuid,
                airtime_status: 'PENDING', // Track airtime delivery
                metadata: {
                    first_name: c2bData.FirstName,
                    middle_name: c2bData.MiddleName,
                    last_name: c2bData.LastName,
                    bill_ref: c2bData.BillRefNumber,
                    raw_msisdn: c2bData.MSISDN // Store raw for reference
                },
                updated_at: new Date().toISOString()
            };

            // 5. Insert with retry logic
            let retries = 3;
            let lastError = null;
            
            while (retries > 0) {
                try {
                    const { error } = await db.airtime_transactions().insert([transactionData]);
                    
                    if (!error) {
                        console.log(`✅ [C2B_SUCCESS]: Recorded ${c2bData.TransID} in database.`);
                        break;
                    }
                    
                    lastError = error;
                    
                    if (error.code === '23505' || error.message.includes('unique constraint')) {
                        console.warn(`⚠️ [C2B_DUPLICATE]: Transaction ${c2bData.TransID} already recorded.`);
                        break; // Duplicate is fine - just return success
                    }
                    
                    retries--;
                    if (retries > 0) {
                        console.log(`🔄 Retry ${3 - retries}/3 for transaction ${c2bData.TransID}`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (insertError) {
                    lastError = insertError;
                    retries--;
                    if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (retries === 0 && lastError) {
                console.error("❌ [C2B_DB_ERROR]:", lastError.message);
                // Log to error tracking but don't throw - M-PESA already got 200
            }

            return { ResultCode: 0, ResultDesc: "Success" };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            return { ResultCode: 0, ResultDesc: "Accepted" };
        }
    }
}

export default new C2bService();