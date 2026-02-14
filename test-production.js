import 'dotenv/config';
import mpesaService from './src/services/mpesa.service.js';

async function testProduction() {
    const phoneNumber = "254708050827";  // Your test phone
    const amount = 10;  // Test with small amount

    console.log("🏭 TESTING PRODUCTION BUY GOODS STK PUSH");
    console.log("========================================");
    console.log(`📱 Phone: ${phoneNumber}`);
    console.log(`💰 Amount: KES ${amount}`);
    console.log(`🏪 Till: ${process.env.MPESA_TILL}`);
    console.log("");

    try {
        const result = await mpesaService.initiateSTKPush(phoneNumber, amount);
        
        if (result.success) {
            console.log("\n✅ STK PUSH SENT SUCCESSFULLY!");
            console.log("📋 Checkout ID:", result.checkoutRequestId);
            console.log("📱 Please check your phone for the M-Pesa prompt");
            console.log("\n⏳ Waiting for callback...");
        } else {
            console.log("\n❌ FAILED:", result.error);
        }
    } catch (error) {
        console.error("\n❌ ERROR:", error.message);
    }
}

testProduction();