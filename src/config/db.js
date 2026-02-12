import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER
 * Single source of truth for table access.
 */
export const db = {
    // We use standard 'from' logic but wrapped in your mapping
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY),
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS),
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS),
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER),
    
    // ADDED: Mapping for the airtime transactions table
    // This allows db.airtime_transactions() to work in your MpesaService
    airtime_transactions: () => supabase.from('airtime_transactions'),
    
    // This is the one MpesaService uses:
    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),
    
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH)
};

console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational.");