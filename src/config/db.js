import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Single source of truth for table access.
 */
export const db = {
    /**
     * ✅ FIX: Standardizes access with error handling
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
     * ✅ UPDATED: Guest-Ready Transaction Helper
     */
    airtime_transactions: () => supabaseAdmin.from('airtime_transactions'),

    /**
     * ✅ NEW: Dashboard Statistics Helper with error handling
     */
    dashboard_stats: async (timeRange = 'day') => {
        try {
            const query = supabaseAdmin
                .from('airtime_transactions')
                .select('amount, status, created_at');
            
            // Add time range filter if needed
            if (timeRange === 'day') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                query.gte('created_at', today.toISOString());
            }
            
            return await query;
        } catch (error) {
            console.error("❌ DB_ERROR: Failed to fetch dashboard stats:", error.message);
            return { data: null, error };
        }
    },

    /**
     * ✅ FIXED: Explicit helper for callback logging
     */
    mpesa_callback_logs: () => supabaseAdmin.from('mpesa_callback_logs'),

    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),

    /**
     * ✅ NOTE: Standard mappings for Client-Side (Public)
     */
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS),

    // Administrative mappings
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY),
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS),
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER),
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH),

    /**
     * ✅ NEW: Check database connection
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
     * ✅ NEW: Execute query with retry logic
     */
    async withRetry(queryFn, options = { retries: 3, delay: 1000 }) {
        let lastError;
        for (let i = 0; i < options.retries; i++) {
            try {
                return await queryFn();
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Query retry ${i + 1}/${options.retries} after error:`, error.message);
                if (i < options.retries - 1) {
                    await new Promise(r => setTimeout(r, options.delay * (i + 1)));
                }
            }
        }
        throw lastError;
    }
};

// Log operational status
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational (Guest Support Active).");