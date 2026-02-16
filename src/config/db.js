import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Single source of truth for table access.
 * This structure prevents "is not a function" errors by explicitly 
 * defining the methods used in MpesaService.js.
 */
export const db = {
    // Primary airtime transaction mapping (UUID Enabled)
    airtime_transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),

    // ✅ FIXED: Added mpesa_callback_logs to match MpesaService requirements
    // Uses supabaseAdmin to ensure callbacks are logged even if RLS is strict
    mpesa_callback_logs: () => supabaseAdmin.from('mpesa_callback_logs'),

    // Legacy mapping support (if still used in other files)
    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),

    // Standard mappings
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY),
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS),
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS),
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER),
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH)
};

// Log operational status to help debug Render deployments
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational (UUID Support Active).");