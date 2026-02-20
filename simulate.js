import axios from 'axios';
import 'dotenv/config';

// 🌍 Production URLs
const BASE_URL = "https://api.safaricom.co.ke";

async function simulateTillV2() {
    try {
        console.log(`🚀 Starting C2B V2 Simulation...`);

        // 1. Generate Access Token (Basic Auth)
        const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
        const tokenRes = await axios.get(
            `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
            { headers: { Authorization: `Basic ${auth}` } }
        );
        const accessToken = tokenRes.data.access_token;
        console.log("🔑 Token Refreshed.");

        // 2. Simulate Payment (V2 Path)
        // 🚨 Note: V2 uses /mpesa/c2b/v2/simulate
        const payload = {
            "ShortCode": process.env.MPESA_BUSINESS_SHORTCODE, // Your Store Number
            "CommandID": "CustomerBuyGoodsOnline",
            "Amount": "1",
            "Msisdn": "254708374149", // Ensure this is a valid phone number format
            "BillRefNumber": "TestV2"
        };

        const simRes = await axios.post(
            `${BASE_URL}/mpesa/c2b/v2/simulate`,
            payload,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        console.log("✅ Simulation Response:", simRes.data);
    } catch (error) {
        console.error("❌ ERROR DETAILS:", error.response?.data || error.message);
    }
}

simulateTillV2();