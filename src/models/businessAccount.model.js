// src/models/businessAccount.model.js
import { db } from '../config/db.js';
import crypto from 'crypto';

/**
 * Business Account Model
 * Represents a tenant (business) using the Xeco Gateway
 */
export class BusinessAccount {
    constructor(data = {}) {
        this.id = data.id || null;
        this.business_shortcode = data.business_shortcode || null;
        this.business_name = data.business_name || null;
        this.business_type = data.business_type || 'TILL';
        this.webhook_url = data.webhook_url || null;
        this.webhook_secret = data.webhook_secret || null;
        this.callback_headers = data.callback_headers || {};
        this.rate_limit = data.rate_limit || 100;
        this.is_active = data.is_active !== undefined ? data.is_active : true;
        this.api_key_hash = data.api_key_hash || null;
        this.metadata = data.metadata || {};
        this.created_at = data.created_at || new Date().toISOString();
        this.updated_at = data.updated_at || new Date().toISOString();
    }

    // =========================================================
    // 🔍 FINDER METHODS
    // =========================================================

    /**
     * Find business by shortcode
     * Used when we receive a payment to know where to forward the webhook
     */
    static async findByShortcode(businessShortcode) {
        try {
            console.log(`🔍 [BusinessAccount] Finding business by shortcode: ${businessShortcode}`);
            
            const { data, error } = await db.from('business_accounts')
                .select('*')
                .eq('business_shortcode', businessShortcode)
                .single();

            if (error) throw error;

            if (data) {
                console.log(`✅ [BusinessAccount] Found business: ${data.business_name}`);
                return { 
                    success: true, 
                    data: new BusinessAccount(data) 
                };
            }
            
            console.log(`📭 [BusinessAccount] No business found with shortcode: ${businessShortcode}`);
            return { 
                success: true, 
                data: null 
            };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to find business by shortcode:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all active businesses
     * Used for admin dashboard and monitoring
     */
    static async getAllActive() {
        try {
            console.log(`🔍 [BusinessAccount] Fetching all active businesses`);
            
            const { data, error } = await db.from('business_accounts')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log(`✅ [BusinessAccount] Found ${data.length} active businesses`);
            
            return { 
                success: true, 
                data: data.map(b => new BusinessAccount(b))
            };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to get active businesses:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Find business by API key
     * Used for authenticating API requests from businesses
     */
    static async findByApiKey(apiKey) {
        try {
            console.log(`🔍 [BusinessAccount] Authenticating business by API key`);
            
            const apiKeyHash = this.hashApiKey(apiKey);
            
            const { data, error } = await db.from('business_accounts')
                .select('*')
                .eq('api_key_hash', apiKeyHash)
                .eq('is_active', true)
                .single();

            if (error) throw error;

            if (data) {
                console.log(`✅ [BusinessAccount] Authenticated business: ${data.business_name}`);
                return { 
                    success: true, 
                    data: new BusinessAccount(data) 
                };
            }
            
            console.log(`❌ [BusinessAccount] Invalid API key`);
            return { 
                success: true, 
                data: null 
            };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to find business by API key:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================
    // ✨ CREATION METHOD
    // =========================================================

    /**
     * Create a new business account
     * Used when onboarding a new merchant
     */
    static async create(businessData) {
        try {
            console.log(`✨ [BusinessAccount] Creating new business: ${businessData.business_name}`);
            
            const apiKey = this.generateApiKey();
            const apiKeyHash = this.hashApiKey(apiKey);
            
            const business = new BusinessAccount({
                ...businessData,
                api_key_hash: apiKeyHash
            });

            const { data, error } = await db.from('business_accounts')
                .insert([business.toDatabase()])
                .select()
                .single();

            if (error) throw error;

            console.log(`✅ [BusinessAccount] Business created successfully with shortcode: ${data.business_shortcode}`);
            
            // Log the creation event
            await this.logEvent(
                data.business_shortcode,
                'BUSINESS_CREATED',
                { business_name: data.business_name }
            ).catch(() => {});

            return {
                success: true,
                data: {
                    ...data,
                    api_key: apiKey // Only returned at creation time!
                }
            };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to create business account:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================
    // 🔐 SECURITY METHODS
    // =========================================================

    /**
     * Generate HMAC signature for webhook payload
     * Used to sign webhooks so businesses can verify they came from us
     */
    static generateWebhookSignature(payload, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(payload));
        return hmac.digest('hex');
    }

    /**
     * Verify webhook signature
     * Used to verify incoming webhooks (if businesses send us webhooks)
     */
    static verifyWebhookSignature(payload, signature, secret) {
        try {
            const expected = this.generateWebhookSignature(payload, secret);
            
            if (signature.length !== expected.length) {
                return false;
            }
            
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'utf8'),
                Buffer.from(expected, 'utf8')
            );
        } catch (error) {
            console.error('❌ [BusinessAccount] Signature verification failed:', error.message);
            return false;
        }
    }

    /**
     * Hash an API key for secure storage
     * Never store raw API keys in database
     */
    static hashApiKey(apiKey) {
        return crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');
    }

    /**
     * Generate a secure random API key
     * Creates cryptographically secure keys
     */
    static generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    // =========================================================
    // 📝 LOGGING METHOD
    // =========================================================

    /**
     * Log business event for audit trail
     */
    static async logEvent(businessShortcode, eventType, eventData = {}) {
        try {
            await db.logTransactionEvent(
                null,
                businessShortcode,
                eventType,
                eventData
            );
        } catch (error) {
            console.warn(`⚠️ [BusinessAccount] Failed to log business event: ${error.message}`);
        }
    }

    // =========================================================
    // 🔄 UPDATE METHODS
    // =========================================================

    /**
     * Update webhook configuration
     */
    static async updateWebhook(businessShortcode, webhookUrl, headers = {}, secret = null) {
        try {
            console.log(`🔄 [BusinessAccount] Updating webhook for ${businessShortcode}`);
            
            const updates = {
                webhook_url: webhookUrl,
                callback_headers: headers,
                updated_at: new Date().toISOString()
            };

            if (secret) {
                updates.webhook_secret = secret;
            }

            const { error } = await db.from('business_accounts')
                .update(updates)
                .eq('business_shortcode', businessShortcode);

            if (error) throw error;

            await this.logEvent(
                businessShortcode,
                'WEBHOOK_UPDATED',
                { webhook_url: webhookUrl }
            );

            console.log(`✅ [BusinessAccount] Webhook updated successfully`);
            
            return { success: true };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to update webhook:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update rate limit for business
     */
    static async updateRateLimit(businessShortcode, rateLimit) {
        try {
            console.log(`🔄 [BusinessAccount] Updating rate limit for ${businessShortcode} to ${rateLimit}`);
            
            const { error } = await db.from('business_accounts')
                .update({
                    rate_limit: rateLimit,
                    updated_at: new Date().toISOString()
                })
                .eq('business_shortcode', businessShortcode);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to update rate limit:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Toggle business active status
     */
    static async toggleStatus(businessShortcode, isActive) {
        try {
            console.log(`🔄 [BusinessAccount] Setting ${businessShortcode} active status to: ${isActive}`);
            
            const { error } = await db.from('business_accounts')
                .update({
                    is_active: isActive,
                    updated_at: new Date().toISOString()
                })
                .eq('business_shortcode', businessShortcode);

            if (error) throw error;

            await this.logEvent(
                businessShortcode,
                isActive ? 'BUSINESS_ACTIVATED' : 'BUSINESS_DEACTIVATED'
            );

            return { success: true };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to toggle business status:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Regenerate API key
     */
    static async regenerateApiKey(businessShortcode) {
        try {
            console.log(`🔄 [BusinessAccount] Regenerating API key for ${businessShortcode}`);
            
            const newApiKey = this.generateApiKey();
            const newHash = this.hashApiKey(newApiKey);

            const { error } = await db.from('business_accounts')
                .update({
                    api_key_hash: newHash,
                    updated_at: new Date().toISOString()
                })
                .eq('business_shortcode', businessShortcode);

            if (error) throw error;

            await this.logEvent(
                businessShortcode,
                'API_KEY_REGENERATED'
            );

            console.log(`✅ [BusinessAccount] API key regenerated successfully`);
            
            return { success: true, api_key: newApiKey };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to regenerate API key:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete business (soft delete by deactivating)
     */
    static async delete(businessShortcode) {
        return this.toggleStatus(businessShortcode, false);
    }

    // =========================================================
    // 📊 STATISTICS METHOD
    // =========================================================

    /**
     * Get business statistics
     */
    static async getStatistics(businessShortcode, days = 30) {
        try {
            console.log(`📊 [BusinessAccount] Getting statistics for ${businessShortcode} (last ${days} days)`);
            
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await db.from('airtime_transactions')
                .select('status, amount, created_at, request_type')
                .eq('business_shortcode', businessShortcode)
                .gte('created_at', startDate.toISOString());

            if (error) throw error;

            const stats = {
                total_transactions: data.length,
                total_amount: 0,
                successful_count: 0,
                successful_amount: 0,
                failed_count: 0,
                failed_amount: 0,
                by_request_type: {},
                by_day: {}
            };

            data.forEach(tx => {
                const amount = parseFloat(tx.amount) || 0;
                const date = new Date(tx.created_at).toISOString().split('T')[0];
                const requestType = tx.request_type || 'unknown';

                stats.total_amount += amount;

                if (tx.status === 'COMPLETED' || tx.status === 'PAYMENT_SUCCESS') {
                    stats.successful_count++;
                    stats.successful_amount += amount;
                } else {
                    stats.failed_count++;
                    stats.failed_amount += amount;
                }

                if (!stats.by_request_type[requestType]) {
                    stats.by_request_type[requestType] = {
                        count: 0,
                        amount: 0
                    };
                }
                stats.by_request_type[requestType].count++;
                stats.by_request_type[requestType].amount += amount;

                if (!stats.by_day[date]) {
                    stats.by_day[date] = {
                        count: 0,
                        amount: 0
                    };
                }
                stats.by_day[date].count++;
                stats.by_day[date].amount += amount;
            });

            console.log(`✅ [BusinessAccount] Statistics calculated successfully`);
            
            return { success: true, data: stats };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to get business statistics:', error.message);
            return { success: false, error: error.message };
        }
    }

    // =========================================================
    // 🚦 RATE LIMIT CHECK
    // =========================================================

    /**
     * Check rate limit for business
     */
    static async checkRateLimit(businessShortcode) {
        try {
            const { data: business } = await this.findByShortcode(businessShortcode);
            if (!business) {
                return { allowed: false, reason: 'Business not found' };
            }

            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

            const { count, error } = await db.from('airtime_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('business_shortcode', businessShortcode)
                .gte('created_at', oneMinuteAgo);

            if (error) throw error;

            const allowed = count < business.rate_limit;

            if (!allowed) {
                await this.logEvent(
                    businessShortcode,
                    'RATE_LIMIT_EXCEEDED',
                    { current: count, limit: business.rate_limit }
                );
            }

            return { 
                allowed, 
                current: count, 
                limit: business.rate_limit 
            };
        } catch (error) {
            console.error('❌ [BusinessAccount] Failed to check rate limit:', error.message);
            return { allowed: false, error: error.message };
        }
    }

    // =========================================================
    // 🔄 INSTANCE METHODS
    // =========================================================

    /**
     * Convert to database format
     */
    toDatabase() {
        return {
            business_shortcode: this.business_shortcode,
            business_name: this.business_name,
            business_type: this.business_type,
            webhook_url: this.webhook_url,
            webhook_secret: this.webhook_secret,
            callback_headers: this.callback_headers,
            rate_limit: this.rate_limit,
            is_active: this.is_active,
            api_key_hash: this.api_key_hash,
            metadata: this.metadata,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Get public-facing data (no secrets)
     */
    toPublicJSON() {
        return {
            business_shortcode: this.business_shortcode,
            business_name: this.business_name,
            business_type: this.business_type,
            webhook_url: this.webhook_url,
            rate_limit: this.rate_limit,
            is_active: this.is_active,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Get webhook configuration (for forwarding)
     */
    getWebhookConfig() {
        return {
            webhook_url: this.webhook_url,
            webhook_secret: this.webhook_secret,
            callback_headers: this.callback_headers
        };
    }
}

export default BusinessAccount;