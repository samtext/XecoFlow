import { supabase, supabaseAdmin } from './supabase.js'; // ✅ Import supabase clients
import { DB_MAPPING } from './systemRules.js'; 
import crypto from 'crypto';

// ❌ DO NOT import db from itself!

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * INFRASTRUCTURE LAYER ONLY - No business logic
 */
export const db = {
    /**
     * Generic table access with error handling
     */
    from: (tableName) => {
        try {
            if (!tableName) {
                console.error("❌ DB_ERROR: Table name is undefined in db.from call");
                return null;
            }
            return supabaseAdmin.from(tableName);
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to access table:", tableName, error.message);
            return null;
        }
    },

    /**
     * ✅ Multi-Till Transaction Helper
     */
    airtime_transactions: (businessShortcode = null) => {
        const query = supabaseAdmin.from('airtime_transactions').select('*');
        
        if (businessShortcode) {
            return query.eq('business_shortcode', businessShortcode);
        }
        
        console.warn("⚠️ WARNING: Fetching airtime_transactions without business_shortcode - returns ALL tills");
        return query;
    },

    /**
     * ✅ Get transactions for specific till with pagination
     */
    getTillTransactions: (businessShortcode, options = {}) => {
        const { limit = 100, offset = 0, status = null, fromDate = null, toDate = null, requestType = null } = options;
        
        let query = supabaseAdmin
            .from('airtime_transactions')
            .select('*', { count: 'exact' })
            .eq('business_shortcode', businessShortcode)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (status) {
            query = query.eq('status', status);
        }
        
        if (requestType) {
            query = query.eq('request_type', requestType);
        }
        
        if (fromDate) {
            query = query.gte('created_at', fromDate);
        }
        
        if (toDate) {
            query = query.lte('created_at', toDate);
        }
        
        return query;
    },

    /**
     * ✅ Dashboard Statistics with Multi-Till Support
     */
    dashboard_stats: async (businessShortcode = null, timeRange = 'day') => {
        try {
            let query = supabaseAdmin
                .from('airtime_transactions')
                .select('amount, status, created_at, business_shortcode, request_type');
            
            if (businessShortcode) {
                query = query.eq('business_shortcode', businessShortcode);
            }
            
            const now = new Date();
            if (timeRange === 'day') {
                const today = new Date(now.setHours(0, 0, 0, 0));
                query = query.gte('created_at', today.toISOString());
            } else if (timeRange === 'week') {
                const weekAgo = new Date(now.setDate(now.getDate() - 7));
                query = query.gte('created_at', weekAgo.toISOString());
            } else if (timeRange === 'month') {
                const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                query = query.gte('created_at', monthAgo.toISOString());
            } else if (timeRange === 'year') {
                const yearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
                query = query.gte('created_at', yearAgo.toISOString());
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            if (!businessShortcode && data) {
                const grouped = {};
                data.forEach(row => {
                    const code = row.business_shortcode || 'unknown';
                    if (!grouped[code]) {
                        grouped[code] = {
                            total_amount: 0,
                            transaction_count: 0,
                            successful_count: 0,
                            successful_amount: 0,
                            failed_count: 0,
                            failed_amount: 0,
                            pending_count: 0,
                            pending_amount: 0,
                            by_request_type: {}
                        };
                    }
                    const amount = parseFloat(row.amount) || 0;
                    const requestType = row.request_type || 'unknown';
                    
                    grouped[code].total_amount += amount;
                    grouped[code].transaction_count++;
                    
                    if (!grouped[code].by_request_type[requestType]) {
                        grouped[code].by_request_type[requestType] = {
                            count: 0,
                            amount: 0
                        };
                    }
                    grouped[code].by_request_type[requestType].count++;
                    grouped[code].by_request_type[requestType].amount += amount;
                    
                    if (row.status === 'COMPLETED' || row.status === 'PAYMENT_SUCCESS') {
                        grouped[code].successful_count++;
                        grouped[code].successful_amount += amount;
                    } else if (row.status === 'FAILED') {
                        grouped[code].failed_count++;
                        grouped[code].failed_amount += amount;
                    } else {
                        grouped[code].pending_count++;
                        grouped[code].pending_amount += amount;
                    }
                });
                return { success: true, data: grouped };
            }
            
            return { success: true, data };
            
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to fetch dashboard stats:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Callback logs with business context
     */
    mpesa_callback_logs: (businessShortcode = null) => {
        const query = supabaseAdmin.from('mpesa_callback_logs').select('*');
        return businessShortcode ? query.eq('business_shortcode', businessShortcode) : query;
    },

    mpesa_logs: (businessShortcode = null) => {
        const query = supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS).select('*');
        return businessShortcode ? query.eq('business_shortcode', businessShortcode) : query;
    },

    /**
     * ✅ Client-side mappings (RLS protected)
     */
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS).select('*'),
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS).select('*'),

    /**
     * ✅ Administrative mappings
     */
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY).select('*'),
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS).select('*'),
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER).select('*'),
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH).select('*'),

    /**
     * ✅ Connection check
     */
    checkConnection: async () => {
        try {
            const { error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('count')
                .limit(1);
            return { connected: !error, error: error?.message };
        } catch (error) {
            return { connected: false, error: error.message };
        }
    },

    /**
     * ✅ Get transaction by ID with business context
     */
    getTransactionById: async (transactionId, businessShortcode = null) => {
        try {
            let query = supabaseAdmin
                .from('airtime_transactions')
                .select('*')
                .eq('transaction_id', transactionId);
            
            if (businessShortcode) {
                query = query.eq('business_shortcode', businessShortcode);
            }
            
            const { data, error } = await query.maybeSingle();
            
            if (error) throw error;
            
            if (data) {
                await this.logTransactionEvent(
                    transactionId,
                    businessShortcode || data.business_shortcode,
                    'TRANSACTION_ACCESSED',
                    { accessed_at: new Date().toISOString() }
                ).catch(() => {});
            }
            
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get transaction:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Get summary by till
     */
    getTillSummary: async (businessShortcode) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('status, amount, created_at, request_type')
                .eq('business_shortcode', businessShortcode);
            
            if (error) throw error;
            
            const summary = {
                total_transactions: data.length,
                total_amount: 0,
                successful_count: 0,
                successful_amount: 0,
                failed_count: 0,
                failed_amount: 0,
                pending_count: 0,
                pending_amount: 0,
                today_count: 0,
                today_amount: 0,
                yesterday_count: 0,
                yesterday_amount: 0,
                by_request_type: {}
            };
            
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            
            data.forEach(t => {
                const amount = parseFloat(t.amount) || 0;
                const requestType = t.request_type || 'unknown';
                
                summary.total_amount += amount;
                
                if (!summary.by_request_type[requestType]) {
                    summary.by_request_type[requestType] = {
                        count: 0,
                        amount: 0
                    };
                }
                summary.by_request_type[requestType].count++;
                summary.by_request_type[requestType].amount += amount;
                
                if (t.status === 'COMPLETED' || t.status === 'PAYMENT_SUCCESS') {
                    summary.successful_count++;
                    summary.successful_amount += amount;
                } else if (t.status === 'FAILED') {
                    summary.failed_count++;
                    summary.failed_amount += amount;
                } else {
                    summary.pending_count++;
                    summary.pending_amount += amount;
                }
                
                const txDate = new Date(t.created_at).toISOString().split('T')[0];
                if (txDate === today) {
                    summary.today_count++;
                    summary.today_amount += amount;
                } else if (txDate === yesterday) {
                    summary.yesterday_count++;
                    summary.yesterday_amount += amount;
                }
            });
            
            return { success: true, data: summary };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get till summary:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Retry logic with exponential backoff
     */
    async withRetry(queryFn, options = { retries: 3, delay: 1000, factor: 2 }) {
        let lastError;
        for (let i = 0; i < options.retries; i++) {
            try {
                const startTime = Date.now();
                const result = await queryFn();
                const duration = Date.now() - startTime;
                
                if (duration > 1000) {
                    console.warn(`⚠️ Slow query detected: ${duration}ms`);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Query retry ${i + 1}/${options.retries} after error:`, error.message);
                
                if (i < options.retries - 1) {
                    const waitTime = options.delay * Math.pow(options.factor, i);
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(r => setTimeout(r, waitTime));
                }
            }
        }
        throw lastError;
    },

    /**
     * ✅ Get transaction events for audit trail
     */
    getTransactionEvents: async (transactionId, businessShortcode) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('transaction_events')
                .select('*')
                .eq('transaction_id', transactionId)
                .eq('business_shortcode', businessShortcode)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get transaction events:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Log transaction event (for audit trail)
     */
    logTransactionEvent: async (transactionId, businessShortcode, eventType, eventData = {}) => {
        try {
            const enrichedData = {
                ...eventData,
                logged_at: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            };
            
            const { error } = await supabaseAdmin
                .from('transaction_events')
                .insert([{
                    transaction_id: transactionId,
                    business_shortcode: businessShortcode,
                    event_type: eventType,
                    event_data: enrichedData
                }]);
            
            if (error) {
                console.error("❌ Failed to log transaction event:", error.message);
                return { success: false, error: error.message };
            }
            
            return { success: true };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to log transaction event:", error.message);
            return { success: false, error: error.message };
        }
    },

    // =========================================================
    // 🔐 INFRASTRUCTURE HELPER FUNCTIONS
    // =========================================================

    /**
     * ✅ Log webhook attempt
     */
    logWebhookAttempt: async (transactionId, businessShortcode, attempt, success, response) => {
        try {
            const { error } = await supabaseAdmin
                .from('webhook_attempts')
                .insert([{
                    transaction_id: transactionId,
                    business_shortcode: businessShortcode,
                    attempt_number: attempt,
                    success: success,
                    response_status: response?.status,
                    response_body: typeof response?.data === 'object' ? response.data : { message: response?.data },
                    attempted_at: new Date().toISOString()
                }]);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to log webhook attempt:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Log critical failure
     */
    logCriticalFailure: async (transactionId, businessShortcode, failureType, data) => {
        try {
            const { error } = await supabaseAdmin
                .from('critical_failures')
                .insert([{
                    transaction_id: transactionId,
                    business_shortcode: businessShortcode,
                    failure_type: failureType,
                    data: data,
                    resolved: false,
                    created_at: new Date().toISOString()
                }]);
            
            if (error) throw error;
            
            console.error(`🚨 CRITICAL FAILURE [${failureType}]: Transaction ${transactionId}`);
            
            return { success: true };
        } catch (error) {
            console.error("❌ CRITICAL: Failed to log critical failure:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Get pending webhooks
     */
    getPendingWebhooks: async (maxAgeMinutes = 60) => {
        try {
            const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
            
            const { data: transactions, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('transaction_id, business_shortcode')
                .eq('request_type', 'EXTERNAL')
                .eq('status', 'PAYMENT_SUCCESS')
                .eq('webhook_forwarded', false)
                .gte('created_at', cutoffTime);
            
            if (error) throw error;
            if (!transactions.length) return { success: true, data: [] };

            const transactionIds = transactions.map(t => t.transaction_id);

            const { data: attempts } = await supabaseAdmin
                .from('webhook_attempts')
                .select('transaction_id, success, attempt_number')
                .in('transaction_id', transactionIds)
                .order('attempt_number', { ascending: false });

            const attemptMap = {};
            attempts?.forEach(a => {
                if (!attemptMap[a.transaction_id] || 
                    a.attempt_number > attemptMap[a.transaction_id].attempt_number) {
                    attemptMap[a.transaction_id] = a;
                }
            });

            const pending = transactions.filter(tx => {
                const lastAttempt = attemptMap[tx.transaction_id];
                return !lastAttempt || !lastAttempt.success;
            });

            return { success: true, data: pending };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get pending webhooks:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Mark webhook as forwarded
     */
    markWebhookForwarded: async (transactionId, businessShortcode) => {
        try {
            const { error } = await supabaseAdmin
                .from('airtime_transactions')
                .update({
                    webhook_forwarded: true,
                    webhook_forwarded_at: new Date().toISOString()
                })
                .eq('transaction_id', transactionId)
                .eq('business_shortcode', businessShortcode);
            
            if (error) throw error;
            
            await this.logTransactionEvent(
                transactionId,
                businessShortcode,
                'CLIENT_WEBHOOK_FORWARDED',
                { forwarded_at: new Date().toISOString() }
            );
            
            return { success: true };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to mark webhook forwarded:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Create external transaction
     */
    createExternalTransaction: async (businessShortcode, transactionData) => {
        try {
            const transaction = {
                ...transactionData,
                business_shortcode: businessShortcode,
                request_type: 'EXTERNAL',
                status: 'INITIATED',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data, error } = await supabaseAdmin
                .from('airtime_transactions')
                .insert([transaction])
                .select()
                .single();
            
            if (error) throw error;
            
            await this.logTransactionEvent(
                data.transaction_id,
                businessShortcode,
                'STK_INITIATED_BY_CLIENT',
                { client_request: transactionData }
            );
            
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to create external transaction:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Record M-PESA callback
     */
    recordMpesaCallback: async (transactionId, businessShortcode, callbackData) => {
        try {
            await this.logTransactionEvent(
                transactionId,
                businessShortcode,
                'MPESA_CALLBACK_RECEIVED',
                { callback: callbackData }
            );
            
            const newStatus = callbackData.ResultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';

            const { data, error } = await supabaseAdmin
                .from('airtime_transactions')
                .update({
                    status: newStatus,
                    mpesa_receipt: callbackData.TransID,
                    updated_at: new Date().toISOString()
                })
                .eq('transaction_id', transactionId)
                .eq('business_shortcode', businessShortcode)
                .select()
                .single();
            
            if (error) throw error;
            
            return { 
                success: true, 
                data,
                shouldForwardWebhook: callbackData.ResultCode === 0
            };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to record M-PESA callback:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Health check
     */
    getDetailedHealth: async () => {
        try {
            const results = {
                timestamp: new Date().toISOString(),
                services: {},
                transactions: {},
                webhooks: {},
                critical_failures: {}
            };
            
            const dbHealth = await this.checkConnection();
            results.services.database = dbHealth;
            
            const { data: counts } = await supabaseAdmin
                .from('airtime_transactions')
                .select('status, count')
                .in('status', ['PENDING_PAYMENT', 'PROCESSING', 'HEALING', 'FAILED']);
            
            if (counts) results.transactions.stuck = counts;
            
            const pendingWebhooks = await this.getPendingWebhooks(1440);
            results.webhooks.pending = pendingWebhooks.data?.length || 0;
            
            return { success: true, data: results };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get detailed health:", error.message);
            return { success: false, error: error.message };
        }
    },

    // =========================================================
    // 🔐 Security & Encryption Utilities
    // =========================================================

    /**
     * ✅ Constant-time string comparison
     */
    safeCompare: (a, b) => {
        try {
            if (!a || !b) return false;
            return crypto.timingSafeEqual(
                Buffer.from(a, 'utf8'),
                Buffer.from(b, 'utf8')
            );
        } catch (error) {
            console.error("❌ Safe compare error:", error.message);
            return false;
        }
    },

    /**
     * ✅ Hash a string
     */
    hashString: (input) => {
        return crypto
            .createHash('sha256')
            .update(input)
            .digest('hex');
    },

    /**
     * ✅ Generate secure token
     */
    generateSecureToken: () => {
        return crypto.randomBytes(32).toString('hex');
    },

    /**
     * ✅ Encrypt sensitive data
     */
    encryptSensitiveData: async (data) => {
        try {
            const encryptionKey = process.env.ENCRYPTION_KEY;
            if (!encryptionKey || encryptionKey.length !== 64) {
                throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
            }

            const key = Buffer.from(encryptionKey, 'hex');
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            const jsonString = JSON.stringify(data);
            const encrypted = Buffer.concat([
                cipher.update(jsonString, 'utf8'),
                cipher.final()
            ]);
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted: encrypted.toString('base64'),
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64'),
                algorithm: 'aes-256-gcm'
            };
        } catch (error) {
            console.error("❌ ENCRYPTION_ERROR: Failed to encrypt data:", error.message);
            throw new Error('Encryption failed');
        }
    },

    /**
     * ✅ Decrypt sensitive data
     */
    decryptSensitiveData: async (encryptedData) => {
        try {
            const encryptionKey = process.env.ENCRYPTION_KEY;
            if (!encryptionKey || encryptionKey.length !== 64) {
                throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
            }

            const key = Buffer.from(encryptionKey, 'hex');
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const authTag = Buffer.from(encryptedData.authTag, 'base64');
            const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
            
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error("❌ DECRYPTION_ERROR: Failed to decrypt data:", error.message);
            throw new Error('Decryption failed');
        }
    }
};

// Log operational status
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational");
console.log("🏦 Multi-Till Support: Enabled");
console.log("📊 Audit Trail: Enabled");
console.log("🔄 Retry Logic: Exponential backoff configured");
console.log("📡 Webhook Logging: Enabled");
console.log("🚨 Critical Failure Tracking: Active");
console.log("🔐 Security: AES-256 encryption, constant-time comparison");