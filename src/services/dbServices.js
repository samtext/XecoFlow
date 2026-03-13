/**
 * BIG-SYSTEM-V1.2 | DATABASE SERVICE
 * FILE: dbServices.js
 * UPDATED: Production-ready with fixes for:
 * - Guest payments (null userId)
 * - Metadata merging (no data loss)
 * - Proper callback logging with extracted fields
 * - Exponential backoff retry logic
 * - Phone number normalization
 */
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizePhone } from '../utils/phoneUtils.js';

// Custom error class for better error tracking
class DatabaseError extends Error {
    constructor(message, operation, originalError = null) {
        super(message);
        this.name = 'DatabaseError';
        this.operation = operation;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
}

class DbService {
    /**
     * Validate phone number with normalization
     */
    _validatePhone(phone) {
        if (!phone) throw new DatabaseError(
            "Phone number is required", 
            "VALIDATION"
        );
        
        // Use your existing normalizePhone utility
        const normalized = normalizePhone(phone);
        
        if (!normalized) {
            // If it's a hashed value (64 chars), accept it
            if (phone.length === 64) {
                return phone;
            }
            throw new DatabaseError(
                "Invalid phone number format", 
                "VALIDATION"
            );
        }
        
        return normalized;
    }

    /**
     * Validate amount with business rules
     */
    _validateAmount(amount) {
        const minAmount = parseFloat(process.env.MIN_TRANSACTION_AMOUNT) || 10;
        const maxAmount = parseFloat(process.env.MAX_TRANSACTION_AMOUNT) || 70000;
        const parsedAmount = parseFloat(amount);
        
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new DatabaseError(
                "Invalid amount", 
                "VALIDATION"
            );
        }
        if (parsedAmount < minAmount) {
            throw new DatabaseError(
                `Amount below minimum KES ${minAmount}`, 
                "VALIDATION"
            );
        }
        if (parsedAmount > maxAmount) {
            throw new DatabaseError(
                `Amount above maximum KES ${maxAmount}`, 
                "VALIDATION"
            );
        }
        return parsedAmount;
    }

    /**
     * 1. CREATE INITIAL TRANSACTION
     * FIXED: Now handles guest payments (null userId)
     * FIXED: True exponential backoff retry logic
     */
    async createTransactionRecord(phone, amount, userId = null, retries = 3) {
        try {
            // Validate inputs - userId is now optional
            const validatedPhone = this._validatePhone(phone);
            const validatedAmount = this._validateAmount(amount);

            console.log(`📝 DB_SERVICE: Initializing record for ${validatedPhone}...`);
            console.log(`   User ID: ${userId || 'GUEST'}`);

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const insertData = {
                        amount: validatedAmount,
                        phone_number: validatedPhone,
                        network: 'SAFARICOM',
                        status: 'INITIATED',
                        idempotency_key: uuidv4(),
                        metadata: { 
                            source: 'system',
                            is_guest: !userId,
                            original_phone: phone,
                            created_at: new Date().toISOString()
                        }
                    };
                    
                    // Only add user_id if it exists (allows null)
                    if (userId) {
                        insertData.user_id = userId;
                    }

                    const { data, error } = await db.transactions()
                        .insert([insertData])
                        .select()
                        .single();

                    if (error) {
                        // Check for duplicate idempotency key
                        if (error.code === '23505') {
                            console.log(`🔄 DB_SERVICE: Duplicate transaction detected`);
                            // Fetch existing transaction
                            const { data: existing } = await db.transactions()
                                .select('*')
                                .eq('idempotency_key', insertData.idempotency_key)
                                .single();
                            return existing;
                        }
                        throw error;
                    }

                    console.log(`✅ DB_SERVICE: Record created. ID: ${data.id}`);
                    return data;

                } catch (error) {
                    console.error(`📑 DB_ERROR (attempt ${attempt}/${retries}):`, error.message);
                    
                    if (attempt === retries) {
                        throw new DatabaseError(
                            `Failed to create transaction after ${retries} attempts`,
                            "CREATE_TRANSACTION",
                            error
                        );
                    }
                    
                    // TRUE exponential backoff: 2s, 4s, 8s
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry ${attempt + 1}...`);
                    await new Promise(r => setTimeout(r, waitTime));
                }
            }
        } catch (error) {
            console.error("❌ DB_SERVICE: Fatal error in createTransactionRecord:", error);
            throw error;
        }
    }

    /**
     * 2. LINK CHECKOUT ID TO TRANSACTION
     */
    async linkCheckoutId(internalId, checkoutId) {
        try {
            if (!internalId) throw new DatabaseError(
                "internalId is required", 
                "VALIDATION"
            );
            if (!checkoutId) throw new DatabaseError(
                "checkoutId is required", 
                "VALIDATION"
            );

            console.log(`🔗 DB_SERVICE: Linking CheckoutID ${checkoutId}...`);
            
            const { error } = await db.transactions()
                .update({ 
                    checkout_id: checkoutId, 
                    status: 'PENDING_PAYMENT',
                    updated_at: new Date().toISOString()
                })
                .eq('id', internalId);

            if (error) {
                throw new DatabaseError(
                    error.message,
                    "LINK_CHECKOUT",
                    error
                );
            }

            console.log(`✅ DB_SERVICE: Successfully linked ${checkoutId}`);
            return true;

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in linkCheckoutId:", error);
            throw error;
        }
    }

    /**
     * 3. LOG CALLBACK DATA - FIXED for proper schema
     * Now extracts fields and stores raw payload as JSONB
     */
    async logMpesaCallback(payload, ipAddress) {
        console.log(`📡 DB_SERVICE: Logging callback from ${ipAddress}...`);

        try {
            // Extract the important fields from the payload
            // This works for both STK and C2B callbacks
            const callbackData = {
                ip_address: ipAddress,
                created_at: new Date().toISOString(),
                
                // Store raw payload as JSONB (ensure column type is JSONB)
                raw_payload: payload,
                
                // Extract C2B fields
                trans_id: payload.TransID || null,
                trans_amount: payload.TransAmount ? parseFloat(payload.TransAmount) : null,
                msisdn: payload.MSISDN || null,
                business_shortcode: payload.BusinessShortCode || null,
                bill_ref: payload.BillRefNumber || null,
                
                // Extract STK fields
                checkout_request_id: payload.Body?.stkCallback?.CheckoutRequestID || null,
                result_code: payload.Body?.stkCallback?.ResultCode || null,
                result_desc: payload.Body?.stkCallback?.ResultDesc || null,
                
                // Type of callback
                callback_type: payload.TransID ? 'C2B' : (payload.Body?.stkCallback ? 'STK' : 'UNKNOWN')
            };

            const { data, error } = await db.from('mpesa_callback_logs').insert([callbackData]);

            if (error) {
                console.error("⚠️ DB_LOG_ERROR:", error.message);
                
                // Fallback: Try with just raw payload if column structure is different
                if (error.message.includes('column')) {
                    console.log("🔄 DB_SERVICE: Attempting fallback insert with raw payload only");
                    const { error: fallbackError } = await db.from('mpesa_callback_logs')
                        .insert([{
                            raw_payload: payload,
                            ip_address: ipAddress,
                            created_at: new Date().toISOString()
                        }]);
                    
                    if (fallbackError) {
                        return { success: false, error: fallbackError.message };
                    }
                    return { success: true, data: null };
                }
                
                return { success: false, error: error.message };
            }

            console.log(`✅ DB_SERVICE: Callback logged successfully`);
            return { success: true, data };

        } catch (error) {
            console.error("⚠️ DB_LOG_EXCEPTION:", error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 4. GET TRANSACTION BY ID
     */
    async getTransaction(transactionId) {
        try {
            if (!transactionId) throw new DatabaseError(
                "transactionId is required", 
                "VALIDATION"
            );

            const { data, error } = await db.transactions()
                .select('*')
                .eq('id', transactionId)
                .maybeSingle(); // Use maybeSingle instead of single to avoid error

            if (error) {
                throw new DatabaseError(
                    error.message,
                    "GET_TRANSACTION",
                    error
                );
            }

            return data;

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in getTransaction:", error);
            return null;
        }
    }

    /**
     * 5. GET TRANSACTION BY CHECKOUT ID
     */
    async getTransactionByCheckoutId(checkoutId) {
        try {
            if (!checkoutId) throw new DatabaseError(
                "checkoutId is required", 
                "VALIDATION"
            );

            const { data, error } = await db.transactions()
                .select('*')
                .eq('checkout_id', checkoutId)
                .maybeSingle();

            if (error) {
                throw new DatabaseError(
                    error.message,
                    "GET_TRANSACTION_BY_CHECKOUT",
                    error
                );
            }

            return data;

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in getTransactionByCheckoutId:", error);
            return null;
        }
    }

    /**
     * 6. UPDATE TRANSACTION STATUS - FIXED to merge metadata
     */
    async updateTransactionStatus(transactionId, status, newMetadata = {}) {
        try {
            if (!transactionId) throw new DatabaseError(
                "transactionId is required", 
                "VALIDATION"
            );
            if (!status) throw new DatabaseError(
                "status is required", 
                "VALIDATION"
            );

            // First, get existing metadata
            const { data: existing, error: fetchError } = await db.transactions()
                .select('metadata')
                .eq('id', transactionId)
                .maybeSingle();

            if (fetchError) {
                throw new DatabaseError(
                    fetchError.message,
                    "FETCH_METADATA",
                    fetchError
                );
            }

            if (!existing) {
                throw new DatabaseError(
                    `Transaction ${transactionId} not found`,
                    "FETCH_METADATA"
                );
            }

            // Merge existing metadata with new metadata
            const mergedMetadata = {
                ...(existing.metadata || {}),
                ...newMetadata,
                updated_at: new Date().toISOString()
            };

            const { error } = await db.transactions()
                .update({ 
                    status, 
                    metadata: mergedMetadata,
                    updated_at: new Date().toISOString()
                })
                .eq('id', transactionId);

            if (error) {
                throw new DatabaseError(
                    error.message,
                    "UPDATE_STATUS",
                    error
                );
            }

            console.log(`✅ DB_SERVICE: Transaction ${transactionId} status updated to ${status}`);
            return true;

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in updateTransactionStatus:", error);
            throw error;
        }
    }

    /**
     * 7. CHECK IF TRANSACTION EXISTS (Idempotency check)
     */
    async checkTransactionExists(idempotencyKey) {
        try {
            if (!idempotencyKey) return false;

            const { data, error } = await db.transactions()
                .select('id, status')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();

            if (error) {
                console.error("❌ DB_SERVICE: Error checking transaction:", error.message);
                return false;
            }

            return data;

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in checkTransactionExists:", error);
            return false;
        }
    }

    /**
     * 8. GET DASHBOARD STATISTICS
     */
    async getDashboardStats(timeRange = 'day') {
        try {
            const query = db.dashboard_stats();
            
            // Add time range filter
            if (timeRange === 'day') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                query.gte('created_at', today.toISOString());
            } else if (timeRange === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                query.gte('created_at', weekAgo.toISOString());
            } else if (timeRange === 'month') {
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                query.gte('created_at', monthAgo.toISOString());
            }

            const { data, error } = await query;

            if (error) {
                throw new DatabaseError(
                    error.message,
                    "DASHBOARD_STATS",
                    error
                );
            }

            // Calculate statistics
            const stats = {
                total_transactions: data.length,
                total_amount: 0,
                successful_amount: 0,
                failed_amount: 0,
                pending_amount: 0,
                by_status: {}
            };

            data.forEach(t => {
                stats.total_amount += parseFloat(t.amount) || 0;
                
                if (t.status === 'COMPLETED' || t.status === 'PAYMENT_SUCCESS') {
                    stats.successful_amount += parseFloat(t.amount) || 0;
                } else if (t.status === 'FAILED') {
                    stats.failed_amount += parseFloat(t.amount) || 0;
                } else {
                    stats.pending_amount += parseFloat(t.amount) || 0;
                }

                stats.by_status[t.status] = (stats.by_status[t.status] || 0) + 1;
            });

            return { success: true, data: stats };

        } catch (error) {
            console.error("❌ DB_SERVICE: Error in getDashboardStats:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 9. CHECK DATABASE HEALTH
     */
    async checkHealth() {
        try {
            const start = Date.now();
            
            const { error } = await db.health()
                .select('count')
                .limit(1);

            const latency = Date.now() - start;

            return {
                healthy: !error,
                latency: `${latency}ms`,
                error: error?.message,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export single instance
export default new DbService();