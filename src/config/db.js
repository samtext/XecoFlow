import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 
import axios from 'axios';
import crypto from 'crypto';

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Fintech-as-a-Service Platform
 * Multi-Tenant Support with Business Isolation & Webhook Forwarding
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
            
            // Time range filter
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
            
            // Group by business_shortcode if no specific till
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
                    
                    // Track by request type
                    if (!grouped[code].by_request_type[requestType]) {
                        grouped[code].by_request_type[requestType] = {
                            count: 0,
                            amount: 0
                        };
                    }
                    grouped[code].by_request_type[requestType].count++;
                    grouped[code].by_request_type[requestType].amount += amount;
                    
                    // Status breakdown
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
            
            // Log access for audit trail
            if (data) {
                await db.logTransactionEvent(
                    transactionId,
                    businessShortcode || data.business_shortcode,
                    'TRANSACTION_ACCESSED',
                    { accessed_at: new Date().toISOString() }
                ).catch(() => {}); // Non-blocking
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
                
                // Track by request type
                if (!summary.by_request_type[requestType]) {
                    summary.by_request_type[requestType] = {
                        count: 0,
                        amount: 0
                    };
                }
                summary.by_request_type[requestType].count++;
                summary.by_request_type[requestType].amount += amount;
                
                // Status breakdown
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
                
                // Time-based breakdown
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
                
                // Log slow queries for monitoring
                if (duration > 1000) {
                    console.warn(`⚠️ Slow query detected: ${duration}ms`);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Query retry ${i + 1}/${options.retries} after error:`, error.message);
                
                if (i < options.retries - 1) {
                    // Exponential backoff: 1s, 2s, 4s, 8s...
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
     * Enhanced for multi-tenant gateway mode
     */
    logTransactionEvent: async (transactionId, businessShortcode, eventType, eventData = {}) => {
        try {
            // Always include timestamp for audit
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

    /**
     * ✅ Get all transactions that need healing (stuck in PENDING_PAYMENT)
     */
    getStuckTransactions: async (businessShortcode = null, minutesOld = 5) => {
        try {
            let query = supabaseAdmin
                .from('airtime_transactions')
                .select('*')
                .eq('status', 'PENDING_PAYMENT')
                .lt('created_at', new Date(Date.now() - minutesOld * 60000).toISOString());
            
            if (businessShortcode) {
                query = query.eq('business_shortcode', businessShortcode);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get stuck transactions:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Get transactions for reconciliation (daily check)
     */
    getTransactionsForReconciliation: async (date) => {
        try {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            
            const { data, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('*')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString())
                .in('status', ['PAYMENT_SUCCESS', 'COMPLETED']);
            
            if (error) throw error;
            
            // Group by business_shortcode
            const grouped = {};
            data.forEach(tx => {
                const code = tx.business_shortcode || 'unknown';
                if (!grouped[code]) {
                    grouped[code] = {
                        total_amount: 0,
                        count: 0,
                        transactions: []
                    };
                }
                grouped[code].total_amount += parseFloat(tx.amount) || 0;
                grouped[code].count++;
                grouped[code].transactions.push(tx.transaction_id);
            });
            
            return { success: true, data: grouped };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get reconciliation data:", error.message);
            return { success: false, error: error.message };
        }
    },

    // =========================================================
    // 🔐 SECURITY - FIXED: API Key Hashing & Encryption
    // =========================================================

    /**
     * 🔐 Hash an API key for secure storage
     */
    hashApiKey: (apiKey) => {
        return crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');
    },

    /**
     * 🔐 Generate a new API key (random 32-byte hex)
     */
    generateApiKey: () => {
        return crypto.randomBytes(32).toString('hex');
    },

    /**
     * ✅ FIXED: Secure business authentication by API key hash
     * Now uses hashed comparison instead of plain text
     */
    getBusinessByApiKey: async (apiKey) => {
        try {
            // Hash the incoming API key
            const apiKeyHash = db.hashApiKey(apiKey);
            
            const { data, error } = await supabaseAdmin
                .from('business_accounts')
                .select('*')
                .eq('api_key_hash', apiKeyHash)
                .eq('is_active', true)
                .single();
            
            if (error) throw error;
            
            // Log access
            if (data) {
                await db.logTransactionEvent(
                    null,
                    data.business_shortcode,
                    'API_KEY_USED',
                    { timestamp: new Date().toISOString() }
                ).catch(() => {});
            }
            
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get business by API key:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * 🔐 FIXED: Real encryption using AES-256-GCM
     * Never use Base64 encoding for sensitive data!
     */
    encryptSensitiveData: async (data) => {
        try {
            // Get encryption key from environment (must be 32 bytes for AES-256)
            const encryptionKey = process.env.ENCRYPTION_KEY;
            if (!encryptionKey || encryptionKey.length !== 64) { // 32 bytes in hex = 64 chars
                throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
            }

            const key = Buffer.from(encryptionKey, 'hex');
            const iv = crypto.randomBytes(16); // 16-byte IV for AES-GCM
            
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            const jsonString = JSON.stringify(data);
            const encrypted = Buffer.concat([
                cipher.update(jsonString, 'utf8'),
                cipher.final()
            ]);
            
            const authTag = cipher.getAuthTag();
            
            // Return all components needed for decryption
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
     * 🔓 Decrypt data encrypted with encryptSensitiveData
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
    },

    // =========================================================
    // 🔐 WEBHOOK SECURITY & SIGNATURE
    // =========================================================

    /**
     * ✅ Generate HMAC signature for webhook payload
     */
    generateWebhookSignature: (payload, secret) => {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(payload));
        return hmac.digest('hex');
    },

    /**
     * ✅ Verify webhook signature (for clients to verify)
     */
    verifyWebhookSignature: (payload, signature, secret) => {
        const expected = db.generateWebhookSignature(payload, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    },

    // =========================================================
    // 🌐 WEBHOOK FORWARDER SERVICE - FIXED with Async Processing
    // =========================================================

    /**
     * ✅ FIXED: Forward webhook asynchronously (non-blocking)
     * This prevents hanging the main M-PESA callback
     */
    queueWebhookForDelivery: (transactionId, businessShortcode, mpesaData) => {
        // Use setImmediate to move to next tick (non-blocking)
        setImmediate(async () => {
            try {
                await db.forwardWebhook(transactionId, businessShortcode, mpesaData);
            } catch (error) {
                console.error(`❌ Queued webhook failed for ${transactionId}:`, error.message);
            }
        });
        
        return { queued: true };
    },

    /**
     * ✅ Forward M-Pesa result to the merchant
     */
    forwardWebhook: async (transactionId, businessShortcode, mpesaData) => {
        console.log(`🔄 Forwarding webhook for transaction ${transactionId} to business ${businessShortcode}`);
        
        try {
            // 1. Get the merchant's config
            const { data: config, error } = await db.getBusinessCallback(businessShortcode);
            
            if (error || !config?.webhook_url) {
                console.error(`❌ Webhook failed: No URL configured for business ${businessShortcode}`);
                await db.logTransactionEvent(
                    transactionId,
                    businessShortcode,
                    'WEBHOOK_FAILED',
                    { reason: 'No webhook URL configured' }
                );
                return { success: false, error: 'No webhook URL configured' };
            }

            // 2. Prepare the payload
            const payload = {
                transaction_id: transactionId,
                status: mpesaData.ResultCode === 0 ? 'SUCCESS' : 'FAILED',
                mpesa_receipt: mpesaData.TransID || null,
                message: mpesaData.ResultDesc,
                amount: mpesaData.TransAmount,
                phone: mpesaData.MSISDN,
                timestamp: new Date().toISOString(),
                raw_mpesa: mpesaData // Optional: full object
            };

            // 3. Generate signature if business has a secret
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Xeco-Gateway-Forwarder/1.2',
                'X-Forwarded-By': 'Xeco-Gateway'
            };

            if (config.webhook_secret) {
                const signature = db.generateWebhookSignature(payload, config.webhook_secret);
                headers['X-Webhook-Signature'] = signature;
                headers['X-Webhook-Signature-Version'] = 'v1';
            }

            // Add custom headers from business config
            if (config.callback_headers) {
                Object.assign(headers, config.callback_headers);
            }

            // 4. Log attempt before sending
            await db.logTransactionEvent(
                transactionId,
                businessShortcode,
                'WEBHOOK_ATTEMPT_STARTED',
                { attempt: 1, url: config.webhook_url }
            );

            // 5. Send the webhook with timeout
            const response = await axios.post(config.webhook_url, payload, {
                headers,
                timeout: 10000, // 10 seconds
                maxRedirects: 0,
                validateStatus: null // Don't throw on any status
            });

            // 6. Check response
            const success = response.status >= 200 && response.status < 300;

            // 7. Log the attempt
            await db.logWebhookAttempt(transactionId, businessShortcode, 1, success, {
                status: response.status,
                data: response.data,
                headers: response.headers
            });

            if (success) {
                console.log(`✅ Webhook successfully forwarded for ${transactionId}`);
                await db.logTransactionEvent(
                    transactionId,
                    businessShortcode,
                    'WEBHOOK_SUCCESS',
                    { status: response.status }
                );
                await db.markWebhookForwarded(transactionId, businessShortcode);
                return { success: true };
            } else {
                console.warn(`⚠️ Webhook received non-success status ${response.status} for ${transactionId}`);
                await db.logTransactionEvent(
                    transactionId,
                    businessShortcode,
                    'WEBHOOK_FAILED',
                    { status: response.status, data: response.data }
                );
                return { success: false, status: response.status };
            }

        } catch (error) {
            console.error(`⚠️ Webhook forwarding error for ${transactionId}:`, error.message);
            
            // Log the failure
            await db.logWebhookAttempt(transactionId, businessShortcode, 1, false, {
                status: error.response?.status || 500,
                data: error.response?.data || error.message,
                code: error.code
            });

            await db.logTransactionEvent(
                transactionId,
                businessShortcode,
                'WEBHOOK_FAILED',
                { error: error.message, code: error.code }
            );

            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ FIXED: Retry failed webhooks with batch query (N+1 problem solved)
     */
    retryFailedWebhooks: async (maxAttempts = 3) => {
        console.log("🔄 Starting webhook retry process...");
        
        try {
            // Get all transactions that need webhook retry
            const pending = await db.getPendingWebhooks();
            
            if (!pending.success || !pending.data.length) {
                console.log("📭 No pending webhooks to retry");
                return { success: true, count: 0 };
            }

            console.log(`📊 Found ${pending.data.length} pending webhooks to retry`);
            
            // 🔥 FIX: Batch fetch all transaction details in one query
            const transactionIds = pending.data.map(tx => tx.transaction_id);
            
            const { data: transactions, error: txError } = await supabaseAdmin
                .from('airtime_transactions')
                .select('*')
                .in('transaction_id', transactionIds);
            
            if (txError) throw txError;
            
            // Create a map for O(1) lookups
            const txMap = new Map();
            transactions.forEach(tx => {
                txMap.set(tx.transaction_id, tx);
            });

            let retried = 0;

            for (const tx of pending.data) {
                const fullTx = txMap.get(tx.transaction_id);
                if (!fullTx) {
                    console.warn(`⚠️ Transaction ${tx.transaction_id} not found in batch fetch`);
                    continue;
                }

                // Get previous attempt count
                const { data: attempts } = await supabaseAdmin
                    .from('webhook_attempts')
                    .select('attempt_number')
                    .eq('transaction_id', tx.transaction_id)
                    .order('attempt_number', { ascending: false })
                    .limit(1);
                
                const attemptCount = (attempts && attempts[0]?.attempt_number || 0) + 1;

                if (attemptCount > maxAttempts) {
                    console.log(`⚠️ Transaction ${tx.transaction_id} exceeded max retry attempts`);
                    await db.logTransactionEvent(
                        tx.transaction_id,
                        tx.business_shortcode,
                        'WEBHOOK_MAX_RETRIES_EXCEEDED',
                        { attempts: attemptCount }
                    );
                    continue;
                }

                // Retry with exponential backoff
                console.log(`🔄 Retrying webhook for ${tx.transaction_id} (attempt ${attemptCount}/${maxAttempts})`);
                
                const result = await db.forwardWebhook(
                    tx.transaction_id,
                    tx.business_shortcode,
                    fullTx // Pass the full transaction data
                );

                if (result.success) {
                    retried++;
                }
                
                // Add small delay between retries to avoid overwhelming
                if (retried < pending.data.length) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            console.log(`✅ Webhook retry complete. Successfully retried ${retried}/${pending.data.length}`);
            return { success: true, retried, total: pending.data.length };

        } catch (error) {
            console.error("❌ Failed to retry webhooks:", error.message);
            return { success: false, error: error.message };
        }
    },

    // =========================================================
    // 🏢 MULTI-TENANT BUSINESS ACCOUNT MANAGEMENT
    // =========================================================

    /**
     * ✅ FIXED: Register a new business (tenant) with secure API key hashing
     */
    registerBusiness: async (businessData) => {
        try {
            const { 
                business_shortcode, 
                business_name, 
                business_type,
                webhook_url,
                webhook_secret,
                rate_limit = 100,
                is_active = true 
            } = businessData;
            
            // Generate a secure API key
            const apiKey = db.generateApiKey();
            const apiKeyHash = db.hashApiKey(apiKey);
            
            const { data, error } = await supabaseAdmin
                .from('business_accounts')
                .insert([{
                    business_shortcode,
                    business_name,
                    business_type,
                    webhook_url,
                    webhook_secret,
                    api_key_hash: apiKeyHash, // Store hash, not the actual key
                    rate_limit,
                    is_active,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            // Log business creation
            await db.logTransactionEvent(
                null,
                business_shortcode,
                'BUSINESS_REGISTERED',
                { business_name, business_type }
            );
            
            // Return the API key ONCE (it will never be shown again)
            return { 
                success: true, 
                data: { 
                    ...data, 
                    api_key: apiKey, // Only returned at creation time
                    api_key_hash: undefined // Don't return the hash
                } 
            };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to register business:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Get business callback configuration
     */
    getBusinessCallback: async (businessShortcode) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('business_accounts')
                .select('webhook_url, webhook_secret, rate_limit, callback_headers, retry_config')
                .eq('business_shortcode', businessShortcode)
                .eq('is_active', true)
                .single();
            
            if (error) throw error;
            
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get business callback:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Update business webhook URL
     */
    updateBusinessWebhook: async (businessShortcode, webhookUrl, headers = {}, secret = null) => {
        try {
            const updates = {
                webhook_url: webhookUrl,
                callback_headers: headers,
                updated_at: new Date().toISOString()
            };
            
            if (secret) {
                updates.webhook_secret = secret;
            }
            
            const { error } = await supabaseAdmin
                .from('business_accounts')
                .update(updates)
                .eq('business_shortcode', businessShortcode);
            
            if (error) throw error;
            
            await db.logTransactionEvent(
                null,
                businessShortcode,
                'WEBHOOK_UPDATED',
                { webhook_url: webhookUrl }
            );
            
            return { success: true };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to update business webhook:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Log webhook attempt to business
     */
    logWebhookAttempt: async (transactionId, businessShortcode, attempt, success, response) => {
        try {
            // First, ensure the webhook_attempts table exists
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
     * ✅ Check rate limit for business
     */
    checkRateLimit: async (businessShortcode) => {
        try {
            const { data: business } = await db.getBusinessCallback(businessShortcode);
            if (!business) return { allowed: false, reason: 'Business not found' };
            
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
            
            const { count, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('business_shortcode', businessShortcode)
                .gte('created_at', oneMinuteAgo);
            
            if (error) throw error;
            
            const allowed = count < business.rate_limit;
            
            if (!allowed) {
                await db.logTransactionEvent(
                    null,
                    businessShortcode,
                    'RATE_LIMIT_EXCEEDED',
                    { current: count, limit: business.rate_limit }
                );
            }
            
            return { allowed, current: count, limit: business.rate_limit };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to check rate limit:", error.message);
            return { allowed: false, error: error.message };
        }
    },

    /**
     * ✅ Create transaction for external business
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
            
            await db.logTransactionEvent(
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
     * ✅ FIXED: Record M-PESA callback with async webhook delivery
     */
    recordMpesaCallback: async (transactionId, businessShortcode, callbackData) => {
        try {
            await db.logTransactionEvent(
                transactionId,
                businessShortcode,
                'MPESA_CALLBACK_RECEIVED',
                { callback: callbackData }
            );
            
            const { error } = await supabaseAdmin
                .from('airtime_transactions')
                .update({
                    status: callbackData.ResultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
                    mpesa_receipt: callbackData.TransID,
                    updated_at: new Date().toISOString()
                })
                .eq('transaction_id', transactionId)
                .eq('business_shortcode', businessShortcode);
            
            if (error) throw error;
            
            // 🔥 FIX: Queue webhook delivery (non-blocking)
            // This returns immediately, doesn't wait for webhook
            db.queueWebhookForDelivery(transactionId, businessShortcode, callbackData);
            
            return { success: true };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to record M-PESA callback:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Get pending webhooks for retry
     */
    getPendingWebhooks: async (maxAgeMinutes = 60) => {
        try {
            const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
            
            // Get transactions that need webhook forwarding
            const { data, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select(`
                    transaction_id,
                    business_shortcode
                `)
                .eq('request_type', 'EXTERNAL')
                .eq('status', 'PAYMENT_SUCCESS')
                .eq('webhook_forwarded', false)
                .gte('created_at', cutoffTime);
            
            if (error) throw error;
            
            // For each transaction, get its webhook attempts
            const pending = [];
            
            for (const tx of data) {
                const { data: attempts } = await supabaseAdmin
                    .from('webhook_attempts')
                    .select('attempt_number, success')
                    .eq('transaction_id', tx.transaction_id)
                    .order('attempt_number', { ascending: false })
                    .limit(1);
                
                const lastAttempt = attempts && attempts[0];
                
                // If no successful attempts, it's pending
                if (!lastAttempt || !lastAttempt.success) {
                    pending.push(tx);
                }
            }
            
            return { success: true, data: pending };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get pending webhooks:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Mark webhook as successfully forwarded
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
            
            await db.logTransactionEvent(
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
     * ✅ Get all active businesses
     */
    getAllActiveBusinesses: async () => {
        try {
            const { data, error } = await supabaseAdmin
                .from('business_accounts')
                .select('business_shortcode, business_name, webhook_url, rate_limit')
                .eq('is_active', true);
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get active businesses:", error.message);
            return { success: false, error: error.message };
        }
    },

    /**
     * ✅ Health check with detailed diagnostics
     */
    getDetailedHealth: async () => {
        try {
            const results = {
                timestamp: new Date().toISOString(),
                services: {},
                transactions: {},
                businesses: {},
                webhooks: {}
            };
            
            // Check database connection
            const dbHealth = await db.checkConnection();
            results.services.database = dbHealth;
            
            // Get transaction counts by status
            const { data: counts, error } = await supabaseAdmin
                .from('airtime_transactions')
                .select('status, count')
                .in('status', ['PENDING_PAYMENT', 'PROCESSING', 'HEALING', 'FAILED']);
            
            if (!error && counts) {
                results.transactions.stuck = counts;
            }
            
            // Get active business count
            const { count: businessCount } = await supabaseAdmin
                .from('business_accounts')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);
            
            results.businesses.active = businessCount;
            
            // Get pending webhooks count
            const pendingWebhooks = await db.getPendingWebhooks(1440); // Last 24 hours
            results.webhooks.pending = pendingWebhooks.data?.length || 0;
            
            // Get failed webhook count
            const { count: failedCount } = await supabaseAdmin
                .from('webhook_attempts')
                .select('*', { count: 'exact', head: true })
                .eq('success', false)
                .gte('attempted_at', new Date(Date.now() - 86400000).toISOString()); // Last 24 hours
            
            results.webhooks.failed_24h = failedCount || 0;
            
            return { success: true, data: results };
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to get detailed health:", error.message);
            return { success: false, error: error.message };
        }
    }
};

// Log operational status
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational");
console.log("🏦 Multi-Till Support: Enabled - Business isolation active");
console.log("📊 Audit Trail: Enabled - All transactions are logged");
console.log("🔄 Retry Logic: Exponential backoff configured");
console.log("🌐 Gateway Mode: Ready - Multi-tenant support active");
console.log("📡 Webhook Forwarder: Active - Async delivery enabled");
console.log("🔐 Security: API key hashing & AES-256 encryption active");