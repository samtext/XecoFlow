import 'dotenv/config';
import mpesaAuth from './src/services/mpesa_auth.js';
import mpesaService from './src/services/mpesa.service.js';
import dbService from './src/services/dbServices.js';

async function runIntegratedTest() {
    // Test Config
    const testPhone = "254712071385"; 
    const testAmount = 900; 
    const activeUserUid = "e4ed507f-753b-4f80-917b-8b03f9c8726c"; 

    try {
        console.log("🚀 STARTING INTEGRATED RECEIVING TEST...");

        // 1. Create DB Record - Passing the UID as required by system rules
        const transaction = await dbService.createTransactionRecord(
            testPhone, 
            testAmount, 
            activeUserUid
        );

        // 2. Get Safaricom Token
        const token = await mpesaAuth.getAccessToken();

        // 3. Trigger STK Push
        console.log(`📡 Sending STK Push for Internal ID: ${transaction.id}...`);
        const result = await mpesaService.sendStkPush(
            testPhone, 
            testAmount, 
            `ID-${transaction.id}`, 
            token
        );

        if (result.success) {
            // 4. Link Safaricom ID to DB
            await dbService.linkCheckoutId(transaction.id, result.checkoutRequestId);
            
            console.log("\n✅ SUCCESS: Check your phone for the PIN prompt!");
            console.log("📡 Monitor your server terminal for the Callback result.");
        } else {
            console.error("\n❌ MPESA ERROR:", result.error);
        }

    } catch (error) {
        console.error("\n❌ SYSTEM ERROR:", error.message);
    }
}

runIntegratedTest();