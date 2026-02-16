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
     * airtime_transactions: Primary table for airtime business logic.
     * Uses standard supabase client for user-level row security.
     */
    airtime_transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),
    
    /**
     * mpesa_logs: The "Black Box" for M-Pesa Callbacks.
     * Uses supabaseAdmin to ensure callbacks are logged even without an active user session.
     */
    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),
    
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH)
};

// Log operational status to Render/Terminal
console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational.");