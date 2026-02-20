import mpesaService from './src/services/mpesa.service.js'; 
import axios from 'axios';

const registerUrls = async () => {
    try {
        console.log("🔑 Step 1: Fetching Fresh Access Token...");
        const accessToken = await mpesaService.getAccessToken();

        // Patrick from Safaricom specifically said use V2
        const url = "https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl";
        
        const payload = {
            ShortCode: "7450249", // Your Business Short Code
            ResponseType: "Completed", 
            // 🚨 UPDATED: Removed the word 'mpesa' from the URLs to satisfy Safaricom's security rules
            ConfirmationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation",
            ValidationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-validation"
        };

        console.log("📡 Step 2: Sending Registration Request to Safaricom V2...");
        const response = await axios.post(url, payload, {
            headers: { 
                Authorization: `Bearer ${accessToken.trim()}`,
                "Content-Type": "application/json"
            }
        });

        console.log("✅ SUCCESS! Safaricom Response:", response.data);
    } catch (error) {
        console.error("❌ REGISTRATION FAILED");
        if (error.response) {
            console.error("Error Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error Message:", error.message);
        }
    }
};

registerUrls();