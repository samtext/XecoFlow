import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // For Standard tier
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // For Admin tier

// Safety Check
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error("❌ ERROR: Missing keys in .env (URL, ANON, or SERVICE_ROLE)");
    process.exit(1); 
}

/**
 * DOOR 1: STANDARD CLIENT (User Context)
 * Used for RLS-protected tables (Public transactions).
 * SAFE: Respects Row Level Security
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * DOOR 2: ADMIN CLIENT (System Context)
 * Used for critical ledger, logs, and bypassing RLS.
 * 
 * ⚠️⚠️⚠️ WARNING - SECURITY CRITICAL ⚠️⚠️⚠️
 * This client bypasses ALL Row Level Security!
 * 
 * RULES FOR SAFE USAGE:
 * 1. NEVER expose this client to user-facing code
 * 2. NEVER use with unfiltered user input
 * 3. ALWAYS add hardcoded filters (e.g., .eq('business_shortcode', '9203342'))
 * 4. ALWAYS validate and sanitize any dynamic parameters
 * 5. Prefer creating specific helper functions with built-in filters
 * 
 * Example SAFE usage:
 * ✅ const { data } = await supabaseAdmin
 *     .from('airtime_transactions')
 *     .select('*')
 *     .eq('business_shortcode', '9203342'); // Hardcoded filter
 * 
 * Example DANGEROUS usage:
 * ❌ const { data } = await supabaseAdmin
 *     .from('airtime_transactions')
 *     .select('*')
 *     .eq('user_id', req.params.userId); // User-controlled input!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

/**
 * SAFE HELPER: Execute admin queries with required business context
 * This ensures every admin query includes a business_shortcode filter
 */
export const createSafeAdminQuery = (table, businessShortcode) => {
    if (!businessShortcode) {
        throw new Error('business_shortcode is required for admin queries');
    }
    
    return supabaseAdmin
        .from(table)
        .select('*')
        .eq('business_shortcode', businessShortcode);
};

/**
 * SAFE HELPER: Get transaction by ID (always includes business context)
 */
export const getTransactionById = async (transactionId, businessShortcode) => {
    if (!businessShortcode) {
        throw new Error('business_shortcode is required');
    }
    
    return await supabaseAdmin
        .from('airtime_transactions')
        .select('*')
        .eq('transaction_id', transactionId)
        .eq('business_shortcode', businessShortcode)
        .maybeSingle();
};

console.log("✅ INFRASTRUCTURE: Standard & Admin Tunnels Initialized.");
console.log("⚠️  SECURITY: Admin client bypasses RLS - Use with hardcoded filters only!");