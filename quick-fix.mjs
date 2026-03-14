import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config(); // This will pull keys directly from your .env file

// Use keys from .env to avoid manual copy-paste errors
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY?.trim();
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET?.trim();
const TILL_NUMBER = "4938110"; 

const runRegistration = async () => {
    try {
        if (!CONSUMER_KEY || !CONSUMER_SECRET) {
            throw new Error("Missing keys in .env file. Check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.");
        }

        console.log("🔑 Step 1: Requesting Token...");
        const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
        
        const tokenRes = await axios({
            method: 'get',
            url: "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            headers: { 
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });

        const token = tokenRes.data.access_token;
        console.log("✅ Token Acquired.");

        console.log("📡 Step 2: Registering URLs (Cancelled mode)...");
        const regRes = await axios.post(
            "https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl",
            {
                ShortCode: TILL_NUMBER,
                ResponseType: "Cancelled",
                ConfirmationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation",
                ValidationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-validation"
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                } 
            }
        );

        console.log("🎉 SUCCESS:", JSON.stringify(regRes.data, null, 2));
    } catch (err) {
        console.error("❌ FAILED:");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("Error:", err.message);
        }
    }
};

runRegistration();