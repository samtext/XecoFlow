import 'dotenv/config';
import mpesaService from './src/services/MpesaService.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase to fetch a valid user for the test
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testProduction() {
    const phoneNumber = "254708050827"; 
    const amount = 10; 

    console.log("🏭 TESTING PRODUCTION BUY GOODS STK PUSH");
    console.log("========================================");

    try {
        // 1. Fetch a valid user_id from your existing users to satisfy the FK constraint
        // In a real app, this comes from the logged-in user session.
        console.log("🔍 Fetching a valid user_id from database...");
        const { data: users, error: userError } = await supabase
            .from('airtime_transactions') // Check recent transactions for a valid ID
            .select('user_id')
            .limit(1);

        // If no transactions exist, you may need to fetch from auth.users or provide one manually
        const testUserId = users?.[0]?.user_id || 'REPLACE_WITH_YOUR_ACTUAL_USER_ID_FROM_DASHBOARD';

        if (!testUserId || testUserId.includes('REPLACE')) {
            console.error("\n❌ ERROR: No valid user_id found. Please paste a real UID from Supabase Auth Dashboard.");
            return;
        }

        console.log(`👤 Using User ID: ${testUserId}`);
        console.log(`📱 Phone: ${phoneNumber}`);
        console.log(`💰 Amount: KES ${amount}`);
        console.log("");

        // 2. Pass the testUserId to the service
        const result = await mpesaService.initiateSTKPush(phoneNumber, amount, testUserId);
        
        if (result.success) {
            console.log("\n✅ STK PUSH SENT SUCCESSFULLY!");
            console.log("📋 Checkout ID:", result.checkoutRequestId);
            console.log("📱 Please check your phone for the M-Pesa prompt");
            console.log("\n⏳ Waiting for callback... (Check your Render/Server logs)");
        } else {
            console.log("\n❌ FAILED:", result.error);
        }
    } catch (error) {
        console.error("\n❌ ERROR:", error.message);
    }
}

testProduction();