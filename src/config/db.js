import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Single source of truth for table access.
 */
export const db = {
    // Standard mapping from System Rules
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY),
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS),
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS),
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER),
    
    /**
     * UPDATED: Syncing airtime_transactions with DB_MAPPING
     * This ensures both 'transactions' and 'airtime_transactions' point to the same table 
     * defined in your system rules, preventing mapping errors.
     */
    airtime_transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    
    // This is the one MpesaService uses for "Payment Evidence"
    // Using supabaseAdmin here is correct to bypass RLS for background logs.
    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),
    
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH)
};

console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational.");