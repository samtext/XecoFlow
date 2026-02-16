import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Single source of truth for table access.
 * This structure prevents "is not a function" errors by explicitly 
 * defining the methods used in MpesaService.js.
 */
export const db = {
    // Primary airtime transaction mapping
    airtime_transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),

    // M-Pesa Evidence mapping (Uses Admin for RLS bypass)
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
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational.");