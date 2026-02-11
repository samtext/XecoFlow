import { supabase, supabaseAdmin } from './supabase.js';
import { DB_MAPPING } from './systemRules.js'; 

/**
 * BIG-SYSTEM-V1.2 | DATABASE MANAGER (ADVANCED)
 * FILE: db.js
 * * DESIGN STRATEGY:
 * We split tables between 'Standard' (RLS Protected) and 'Admin' (System Level).
 * We import DB_MAPPING from systemRules.js to ensure a single source of truth for table names.
 */

export const db = {
    /** * RETAIL: User-facing transactions.
     * Uses standard client to respect Row Level Security (RLS).
     */
    transactions: () => supabase.from(DB_MAPPING.TABLES.TRANSACTIONS),

    /** * SAFETY: Idempotency check. 
     * Uses Admin to prevent users from clearing their own unique request keys.
     */
    idempotency: () => supabaseAdmin.from(DB_MAPPING.TABLES.IDEMPOTENCY),

    /** * DELIVERY: Provider disbursement attempts.
     * Uses standard client for tracking delivery status.
     */
    disbursements: () => supabase.from(DB_MAPPING.TABLES.DISBURSEMENTS),

    /** * TECHNICAL: Raw API handshakes with providers.
     * Uses Admin for secure logging of external infrastructure conversations.
     */
    provider_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.PROVIDER_LOGS),

    /** * FINANCIAL: Float Ledger.
     * CRITICAL: Uses Admin to prevent unauthorized balance manipulation.
     */
    ledger: () => supabaseAdmin.from(DB_MAPPING.TABLES.FLOAT_LEDGER),

    /** * EVIDENCE: M-Pesa Callbacks.
     * Uses Admin because Safaricom callbacks occur outside a user's browser session.
     */
    mpesa_logs: () => supabaseAdmin.from(DB_MAPPING.TABLES.MPESA_LOGS),

    /** * MONITOR: System Health.
     * Uses Admin for system-wide performance and heartbeat tracking.
     */
    health: () => supabaseAdmin.from(DB_MAPPING.TABLES.SYSTEM_HEALTH)
};

console.log("🚀 XECO-ENGINE: Database Abstraction Layer Operational.");