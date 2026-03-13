import { db } from '../config/db.js';
import axios from 'axios'; 
import stkService from './stk.service.js'; 
import mpesaConfig from '../config/mpesa.js'; 
import crypto from 'crypto';
import { normalizePhone } from '../utils/phoneUtils.js';

class C2bService {
    /**
     * 🚀 REGISTER URLS (v2): Mapping to the Store Number
     */
    async registerUrls() {
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
     * 🔍 VALIDATION
     */
    async handleValidation(data) {
        console.log(`🔍 [C2B_VALIDATION]: TransID: ${data.TransID} | Amount: ${data.TransAmount}`);
        
        const minAmount = parseFloat(process.env.MIN_TRANSACTION_AMOUNT) || 10;
        const amount = parseFloat(data.TransAmount);
        
        if (isNaN(amount) || amount <= 0) {
            console.log(`🚫 [C2B_VALIDATION_REJECTED]: Invalid amount`);
            return { 
                ResultCode: "C2B00016", 
                ResultDesc: "Invalid transaction amount" 
            };
        }
        
        if (amount < minAmount) {
            console.log(`🚫 [C2B_VALIDATION_REJECTED]: Amount ${amount} below minimum ${minAmount}`);
            return { 
                ResultCode: "C2B00016", 
                ResultDesc: `Minimum transaction amount is KES ${minAmount}` 
            };
        }
        
        const maxAmount = parseFloat(process.env.MAX_TRANSACTION_AMOUNT) || 70000;
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
     * ✅ CHECK TRANSACTION - For idempotency
     * This method checks if a transaction already exists in the database
     */
    async checkTransaction({ id, type }) {
        console.log(`🔍 [C2B_SERVICE] Checking transaction: ${id} (${type})`);
        
        try {
            // Determine which field to search by based on type
            let query = db.airtime_transactions().select('id, status, created_at');
            
            if (type === 'C2B') {
                // For C2B, use transaction_id (TransID from M-PESA)
                query = query.eq('transaction_id', id);
            } else if (type === 'STK') {
                // For STK, use checkout_id (CheckoutRequestID)
                query = query.eq('checkout_id', id);
            } else {
                // Fallback - try both
                query = query.or(`transaction_id.eq.${id},checkout_id.eq.${id}`);
            }
            
            const { data, error } = await query.maybeSingle();
            
            if (error) {
                console.error('❌ [C2B_SERVICE] Error checking transaction:', error.message);
                return null;
            }
            
            if (data) {
                console.log(`✅ [C2B_SERVICE] Found existing transaction: ${data.id} (status: ${data.status})`);
            } else {
                console.log(`📭 [C2B_SERVICE] No existing transaction found for ${id}`);
            }
            
            return data;
        } catch (error) {
            console.error('❌ [C2B_SERVICE] Exception checking transaction:', error.message);
            return null;
        }
    }

    /**
     * 💰 CONFIRMATION
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
                transaction_id: c2bData.TransID, // Add this field!
                user_id: null,
                checkout_id: c2bData.TransID,
                phone_number: normalizedPhone || c2bData.MSISDN.substring(0, 20),
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                idempotency_key: deterministicUuid,
                airtime_status: 'PENDING',
                metadata: {
                    first_name: c2bData.FirstName,
                    middle_name: c2bData.MiddleName,
                    last_name: c2bData.LastName,
                    bill_ref: c2bData.BillRefNumber,
                    raw_msisdn: c2bData.MSISDN
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
                        break;
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
            }

            return { ResultCode: 0, ResultDesc: "Success" };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            return { ResultCode: 0, ResultDesc: "Accepted" };
        }
    }

    /**
     * 🔍 GET TRANSACTION BY ID
     */
    async getTransaction(transactionId) {
        try {
            const { data, error } = await db.airtime_transactions()
                .select('*')
                .eq('transaction_id', transactionId)
                .maybeSingle();
            
            if (error) {
                console.error('❌ [C2B_SERVICE] Error fetching transaction:', error.message);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('❌ [C2B_SERVICE] Exception fetching transaction:', error.message);
            return null;
        }
    }
}

export default new C2bService();