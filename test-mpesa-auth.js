import { getMpesaToken } from './src/config/mpesa.js';

async function testAuth() {
    console.log("🔐 Requesting Production OAuth Token...");
    try {
        const token = await getMpesaToken();
        console.log("✅ SUCCESS! Production Token received.");
        console.log("Token starts with:", token.substring(0, 10) + "...");
    } catch (err) {
        console.error("❌ Production Auth Failed. Check your Consumer Key/Secret.");
    }
}

testAuth();