import 'dotenv/config';
import mpesaService from './src/services/mpesa.service.js';

async function runIntegratedTest() {
    // Test phone and amount
    const testPhone = "254708050827"; 
    const testAmount = 900; 

    try {
        console.log("🚀 STARTING MPESA TEST...");

        // Trigger STK Push
        console.log(`📡 Sending STK Push to ${testPhone} for KES ${testAmount}...`);
        
        const result = await mpesaService.initiateSTKPush(testPhone, testAmount);

        if (result.success) {
            console.log("\n✅ STK Push sent successfully!");
            console.log("📱 Check your phone for the M-Pesa PIN prompt");
            console.log(`📋 Checkout Request ID: ${result.checkoutRequestId}`);
            console.log("\n📡 Waiting for callback response...");
        } else {
            console.error("\n❌ MPESA ERROR:", result.error);
        }

    } catch (error) {
        console.error("\n❌ SYSTEM ERROR:", error.message);
    }
}

runIntegratedTest();