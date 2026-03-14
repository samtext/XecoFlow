import { db } from '../config/db.js';
import axios from 'axios'; 
import stkService from './stk.service.js'; 
import mpesaConfig from '../config/mpesa.js'; 
import crypto from 'crypto';
import { normalizePhone } from '../utils/phoneUtils.js';
import { db as BusinessAccount } from '../models/businessAccount.model.js';

class C2bService {
    /**
     * 🚀 REGISTER URLS (v2): Mapping to the Store Number
     */
    async registerUrls(businessShortcode = null) {
        const url = `${mpesaConfig.baseUrl}/mpesa/c2b/v2/registerurl`;
        
        try {
            const token = await stkService.getOAuthToken();
            
            const shortcode = businessShortcode || process.env.MPESA_STORE_SHORTCODE || "9203342";
            
            const body = {
                ShortCode: shortcode, 
                ResponseType: "Completed",
                ConfirmationURL: `${process.env.BASE_URL}/api/v1/gateway/payments/c2b-confirmation`,
                ValidationURL: `${process.env.BASE_URL}/api/v1/gateway/payments/c2b-validation`
            };

            console.log(`📡 [C2B_REGISTRATION]: Mapping Store Number: ${shortcode}`);

            const response = await axios.post(url, body, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                }
            });

            console.log("✅ [C2B_REGISTRATION_SUCCESS]:", response.data);
            
            if (businessShortcode) {
                await db.logTransactionEvent(
                    null,
                    businessShortcode,
                    'C2B_URLS_REGISTERED',
                    { response: response.data }
                ).catch(() => {});
            }
            
            return response.data;
        } catch (error) {
            const errorDetail = error.response?.data || error.message;
            console.error("❌ [C2B_REGISTRATION_ERROR]:", JSON.stringify(errorDetail, null, 2));
            throw new Error(error.response?.data?.errorMessage || "Failed to register C2B URLs");
        }
    }

    /**
     * 🔍 VALIDATION - Simplified (Controller already validates)
     */
    async handleValidation(data) {
        // Controller already validated the amount
        console.log(`✅ [C2B_SERVICE] Validation passed for ${data.TransID}`);
        
        // Optional: Log validation event
        await db.logTransactionEvent(
            data.TransID,
            data.BusinessShortCode,
            'VALIDATION_PASSED',
            { amount: data.TransAmount }
        ).catch(() => {});
        
        return { ResultCode: 0, ResultDesc: "Accepted" };
    }

    /**
     * ✅ CHECK TRANSACTION - For idempotency
     */
    async checkTransaction({ id, type, businessShortcode = null }) {
        console.log(`🔍 [C2B_SERVICE] Checking transaction: ${id} (${type})`);
        
        try {
            let query = db.from('airtime_transactions').select('id, status, created_at, business_shortcode');
            
            if (type === 'C2B') {
                query = query.eq('transaction_id', id);
            } else if (type === 'STK') {
                query = query.eq('checkout_id', id);
            } else {
                query = query.or(`transaction_id.eq.${id},checkout_id.eq.${id}`);
            }
            
            if (businessShortcode) {
                query = query.eq('business_shortcode', businessShortcode);
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
     * 🌐 Forward webhook to business
     */
    async forwardWebhook(transactionId, businessShortcode, transactionData, callbackData) {
        try {
            const { data: business } = await BusinessAccount.findByShortcode(businessShortcode);
            
            if (!business || !business.webhook_url) {
                console.log(`📭 No webhook URL for business ${businessShortcode}`);
                return;
            }

            const payload = {
                event: 'payment.success',
                transaction_id: transactionId,
                status: 'PAYMENT_SUCCESS',
                amount: transactionData.amount,
                phone: transactionData.phone_number,
                mpesa_receipt: transactionData.transaction_id,
                business_shortcode: businessShortcode,
                timestamp: new Date().toISOString(),
                metadata: {
                    customer_name: callbackData.FirstName || 'Unknown',
                    bill_ref: callbackData.BillRefNumber
                }
            };

            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Xeco-Gateway/1.0'
            };

            if (business.webhook_secret) {
                const signature = BusinessAccount.generateWebhookSignature(
                    payload, 
                    business.webhook_secret
                );
                headers['X-Webhook-Signature'] = signature;
            }

            // Fire and forget webhook
            axios.post(business.webhook_url, payload, { 
                headers, 
                timeout: 5000 
            }).catch(err => {
                console.error(`❌ Webhook delivery failed: ${err.message}`);
            });

        } catch (error) {
            console.error(`❌ Webhook forwarding error: ${error.message}`);
            await db.logCriticalFailure(
                transactionId,
                businessShortcode,
                'WEBHOOK_FORWARDING_FAILED',
                { error: error.message }
            ).catch(() => {});
        }
    }

    /**
     * 💰 CONFIRMATION - FIXED: Using db.from() for inserts
     */
    async handleConfirmation(c2bData) {
        console.log(`\n💰 [C2B_RECEIPT]: ${c2bData.TransID} | Amount: ${c2bData.TransAmount} | From: ${c2bData.MSISDN}`);

        try {
            const businessShortcode = c2bData.BusinessShortCode;
            
            // ✅ FIXED: Use db.from() for inserts, not the read helpers
            await db.from('mpesa_callback_logs').insert([{
                trans_id: c2bData.TransID,
                checkout_request_id: c2bData.TransID,
                merchant_request_id: businessShortcode,
                result_code: 0,
                result_desc: 'C2B Confirmation Success',
                status: 'COMPLETED',
                callback_data: c2bData,
                metadata: { 
                    type: 'C2B_CONFIRMATION', 
                    msisdn: c2bData.MSISDN,
                    till_paid: businessShortcode,
                    bill_ref: c2bData.BillRefNumber
                },
                received_at: new Date().toISOString()
            }]);

            const deterministicUuid = crypto.createHash('sha256')
                .update(`C2B_${c2bData.TransID}`)
                .digest('hex')
                .substring(0, 32)
                .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

            const normalizedPhone = normalizePhone(c2bData.MSISDN);
            
            const transactionData = {
                transaction_id: c2bData.TransID,
                user_id: null,
                checkout_id: c2bData.TransID,
                phone_number: normalizedPhone || c2bData.MSISDN.substring(0, 100),
                amount: parseFloat(c2bData.TransAmount),
                network: 'SAFARICOM',
                status: 'PAYMENT_SUCCESS',
                mpesa_receipt: c2bData.TransID,
                idempotency_key: deterministicUuid,
                airtime_status: 'PENDING',
                business_shortcode: businessShortcode,
                request_type: businessShortcode ? 'EXTERNAL' : 'INTERNAL',
                metadata: {
                    first_name: c2bData.FirstName,
                    middle_name: c2bData.MiddleName,
                    last_name: c2bData.LastName,
                    bill_ref: c2bData.BillRefNumber,
                    raw_msisdn: c2bData.MSISDN,
                    transaction_type: c2bData.TransactionType
                },
                updated_at: new Date().toISOString()
            };

            // ✅ FIXED: Use db.from() with retry logic
            let retries = 3;
            let lastError = null;
            let savedData = null;
            
            while (retries > 0) {
                try {
                    const { data, error } = await db.from('airtime_transactions')
                        .insert([transactionData])
                        .select()
                        .single();
                    
                    if (!error) {
                        console.log(`✅ [C2B_SUCCESS]: Recorded ${c2bData.TransID} in database.`);
                        savedData = data;
                        break;
                    }
                    
                    lastError = error;
                    
                    if (error.code === '23505' || error.message.includes('unique constraint')) {
                        console.warn(`⚠️ [C2B_DUPLICATE]: Transaction ${c2bData.TransID} already recorded.`);
                        
                        const { data: existing } = await db.from('airtime_transactions')
                            .select('*')
                            .eq('transaction_id', c2bData.TransID)
                            .maybeSingle();
                        
                        savedData = existing;
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
                await db.logCriticalFailure(
                    c2bData.TransID,
                    businessShortcode,
                    'C2B_CONFIRMATION_FAILED',
                    { error: lastError.message, data: c2bData }
                ).catch(() => {});
            }

            // Forward webhook if external business
            if (businessShortcode && savedData) {
                this.forwardWebhook(
                    c2bData.TransID,
                    businessShortcode,
                    savedData,
                    c2bData
                ).catch(err => console.error(`Webhook error: ${err.message}`));
            }

            // Log success event
            await db.logTransactionEvent(
                c2bData.TransID,
                businessShortcode,
                'PAYMENT_RECORDED',
                { amount: c2bData.TransAmount }
            ).catch(() => {});

            return { 
                success: true, 
                data: savedData,
                ResultCode: 0, 
                ResultDesc: "Success" 
            };

        } catch (error) {
            console.error("❌ [C2B_HANDLER_EXCEPTION]:", error.message);
            
            // Log critical failure
            await db.logCriticalFailure(
                c2bData?.TransID,
                c2bData?.BusinessShortCode,
                'C2B_HANDLER_EXCEPTION',
                { error: error.message, data: c2bData }
            ).catch(() => {});
            
            return { 
                success: false, 
                error: error.message,
                ResultCode: 0, 
                ResultDesc: "Accepted" 
            };
        }
    }

    /**
     * 🔍 GET TRANSACTION BY ID
     */
    async getTransaction(transactionId, businessShortcode = null) {
        try {
            const result = await db.getTransactionById(transactionId, businessShortcode);
            return result.success ? result.data : null;
        } catch (error) {
            console.error('❌ [C2B_SERVICE] Exception fetching transaction:', error.message);
            return null;
        }
    }

    /**
     * 🔍 GET TRANSACTIONS BY BUSINESS
     */
    async getBusinessTransactions(businessShortcode, options = {}) {
        try {
            const result = await db.getTillTransactions(businessShortcode, options);
            return result;
        } catch (error) {
            console.error('❌ [C2B_SERVICE] Error fetching business transactions:', error.message);
            return { data: [], error: error.message };
        }
    }

    /**
     * 📊 GET BUSINESS STATISTICS
     */
    async getBusinessStatistics(businessShortcode, days = 30) {
        try {
            const { data, error } = await db.from('airtime_transactions')
                .select('status, amount, created_at')
                .eq('business_shortcode', businessShortcode)
                .gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
            
            if (error) throw error;
            
            const stats = {
                total: 0,
                count: data.length,
                successful: { count: 0, amount: 0 },
                failed: { count: 0, amount: 0 },
                pending: { count: 0, amount: 0 }
            };
            
            data.forEach(tx => {
                const amount = parseFloat(tx.amount) || 0;
                stats.total += amount;
                
                if (tx.status === 'PAYMENT_SUCCESS' || tx.status === 'COMPLETED') {
                    stats.successful.count++;
                    stats.successful.amount += amount;
                } else if (tx.status === 'FAILED') {
                    stats.failed.count++;
                    stats.failed.amount += amount;
                } else {
                    stats.pending.count++;
                    stats.pending.amount += amount;
                }
            });
            
            return stats;
        } catch (error) {
            console.error('❌ [C2B_SERVICE] Error getting business statistics:', error.message);
            return null;
        }
    }
}

export default new C2bService();