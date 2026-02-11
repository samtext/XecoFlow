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
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * DOOR 2: ADMIN CLIENT (System Context)
 * Used for critical ledger, logs, and bypassing RLS.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log("✅ INFRASTRUCTURE: Standard & Admin Tunnels Initialized.");