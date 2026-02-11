// infraTest.js
// Full infrastructure test: DB connectivity + Normal/Admin doors

import { db } from './src/config/db.js';
import { supabase, supabaseAdmin } from './src/config/supabase.js';

// =====================
// 1️⃣ Test database connectivity (via db.js abstraction)
async function testConnection() {
    console.log("🔍 Checking XECO-FLOW Database Heartbeat...");
    try {
        const { data, error } = await db.transactions().select('*').limit(1);

        if (error) {
            console.error("❌ Connection Error:", error.message);
            console.log("Tip: Check if your SUPABASE_URL is correct in .env");
        } else {
            console.log("✅ SUCCESS! Database is reachable.");
            console.log("Sample data:", data);
        }
    } catch (err) {
        console.error("💥 System Crash:", err.message);
    }
}

// =====================
// 2️⃣ Test NORMAL door (RLS enforced)
async function testNormalDoor() {
    console.log("\n🚪 Testing NORMAL door (RLS enforced)...");

    try {
        const { data, error } = await supabase
            .from("test_access") // A table with RLS enabled
            .select("*");

        if (error) {
            console.log("✅ NORMAL door blocked as expected.");
            console.log("Message:", error.message);
        } else {
            console.error("❌ SECURITY FAILURE! Normal door bypassed RLS.");
            console.log("Data:", data);
        }
    } catch (err) {
        console.error("💥 NORMAL door crash:", err.message);
    }
}

// =====================
// 3️⃣ Test ADMIN door (RLS bypass)
async function testAdminDoor() {
    console.log("\n🚪 Testing ADMIN door (RLS bypass)...");

    try {
        const { data, error } = await supabaseAdmin
            .from("test_access") // Same table
            .select("*");

        if (error) {
            console.error("❌ ADMIN door FAILED (unexpected).");
            console.log("Message:", error.message);
        } else {
            console.log("✅ ADMIN door works. RLS bypass confirmed.");
            console.log("Data sample:", data);
        }
    } catch (err) {
        console.error("💥 ADMIN door crash:", err.message);
    }
}

// =====================
// Run all tests in order
async function runAllTests() {
    await testConnection();
    await testNormalDoor();
    await testAdminDoor();
}

runAllTests();
