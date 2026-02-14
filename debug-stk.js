import 'dotenv/config';
import axios from 'axios';
import mpesaConfig, { generateSTKPassword, getMpesaTimestamp } from './src/config/mpesa.js';

async function debugSTKPush() {
    const testPhone = "254708050827";
    const testAmount = 10; // Use small amount for testing

    try {
        console.log("🔍 DEBUGGING STK PUSH");
        console.log("=====================");
        
        // 1. Check Configuration
        console.log("\n📋 CONFIGURATION CHECK:");
        console.log("Short Code:", mpesaConfig.shortCode);
        console.log("Environment:", mpesaConfig.environment);
        console.log("Base URL:", mpesaConfig.baseUrl);
        console.log("Callback URL:", mpesaConfig.callbackUrl);
        console.log("Passkey Set:", mpesaConfig.passkey ? "✅ YES" : "❌ NO");
        console.log("Consumer Key Set:", mpesaConfig.consumerKey ? "✅ YES" : "❌ NO");
        console.log("Consumer Secret Set:", mpesaConfig.consumerSecret ? "✅ YES" : "❌ NO");

        // 2. Get Token
        console.log("\n🔑 GETTING ACCESS TOKEN...");
        const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
        
        const tokenResponse = await axios.get(
            `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`, 
            { 
                headers: { 
                    Authorization: `Basic ${auth}` 
                } 
            }
        );
        
        const token = tokenResponse.data.access_token;
        console.log("✅ Token obtained successfully");

        // 3. Prepare STK Push
        console.log("\n📦 PREPARING STK PUSH PAYLOAD...");
        const timestamp = getMpesaTimestamp();
        const password = generateSTKPassword(timestamp);
        
        console.log("Timestamp:", timestamp);
        console.log("Password generated:", password ? "✅" : "❌");

        const payload = {
            BusinessShortCode: mpesaConfig.shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.round(testAmount),
            PartyA: testPhone,
            PartyB: mpesaConfig.shortCode,
            PhoneNumber: testPhone,
            CallBackURL: mpesaConfig.callbackUrl,
            AccountReference: `TEST${Date.now()}`,
            TransactionDesc: "Test Payment"
        };

        console.log("Payload:", JSON.stringify(payload, null, 2));

        // 4. Send STK Push
        console.log("\n📤 SENDING STK PUSH REQUEST...");
        const response = await axios.post(
            `${mpesaConfig.baseUrl}${mpesaConfig.stkPushEndpoint}`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log("\n📥 MPESA RESPONSE:");
        console.log(JSON.stringify(response.data, null, 2));

        // 5. Analyze Response
        console.log("\n🔍 RESPONSE ANALYSIS:");
        if (response.data.ResponseCode === "0") {
            console.log("✅ ResponseCode: 0 (Success)");
        } else {
            console.log("❌ ResponseCode:", response.data.ResponseCode);
        }
        
        console.log("ResponseDescription:", response.data.ResponseDescription);
        console.log("CustomerMessage:", response.data.CustomerMessage);
        console.log("CheckoutRequestID:", response.data.CheckoutRequestID);

        if (response.data.ResponseCode !== "0") {
            console.log("\n⚠️ M-PESA ERROR:", response.data.ResponseDescription);
        } else {
            console.log("\n✅ STK Push sent successfully!");
            console.log("📱 Check your phone - you should receive the prompt within 30 seconds");
            console.log("⚠️ If you don't receive it, check:");
            console.log("   - Phone number is correct (254708050827)");
            console.log("   - You have network coverage");
            console.log("   - M-PESA app is working");
            console.log("   - You're using a Safaricom line");
        }

    } catch (error) {
        console.error("\n❌ ERROR:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            console.error("Headers:", error.response.headers);
        } else {
            console.error(error.message);
        }
    }
}

debugSTKPush();