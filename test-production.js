import 'dotenv/config';
// Ensure this filename matches your file: src/services/mpesa.service.js
import mpesaService from './src/services/mpesa.service.js'; 

async function testProduction() {
    const phoneNumber = "254712071385"; 
    const amount = 10; 
    
    // Using the authenticated User ID you provided
    const testUserId = "e4ed507f-753b-4f80-917b-8b03f9c8726c";

    console.log("🏭 TESTING PRODUCTION BUY GOODS STK PUSH");
    console.log("========================================");
    console.log(`👤 User ID: ${testUserId}`);
    console.log(`📱 Phone: ${phoneNumber}`);
    console.log(`💰 Amount: KES ${amount}`);
    console.log("----------------------------------------");

    try {
        const result = await mpesaService.initiateSTKPush(phoneNumber, amount, testUserId);
        
        if (result.success) {
            console.log("\n✅ STK PUSH SENT SUCCESSFULLY!");
            console.log("📋 Checkout ID:", result.checkoutRequestId);
            console.log("📱 Action: Enter your PIN on your phone now.");
            console.log("\n⏳ Once you enter the PIN, check your Render logs for the callback!");
        } else {
            console.log("\n❌ FAILED:", result.error);
        }
    } catch (error) {
        console.error("\n❌ ERROR:", error.message);
    }
}

testProduction();