import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';
import MpesaService from '../services/mpesa.service.js';

async function registerC2BUrl() {
    try {
        console.log("🚀 XECO-ENGINE: Initiating Production URL Registration...");
        
        const accessToken = await MpesaService.getAccessToken();

        // Ensure we are using the NEW URL from .env (the one without 'mpesa')
        const payload = {
            ShortCode: mpesaConfig.shortCode, 
            ResponseType: "Completed",
            ConfirmationURL: mpesaConfig.callbackUrl,
            ValidationURL: mpesaConfig.callbackUrl 
        };

        if (payload.ConfirmationURL.toLowerCase().includes('mpesa')) {
            console.error("❌ ERROR: Your URL still contains the word 'mpesa'. Safaricom will reject it.");
            return;
        }

        console.log(`📡 Registering URLs for ShortCode: ${payload.ShortCode}`);
        console.log(`🔗 New Target URL: ${payload.ConfirmationURL}`);

        const registrationUrl = "https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl";

        const response = await axios.post(
            registrationUrl,
            payload,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        console.log("✅ SAFARICOM RESPONSE:", response.data);
        
        if (response.data.ResponseCode === "0") {
            console.log("✨ SUCCESS: Your URL is registered!");
        }
    } catch (error) {
        console.error("❌ REGISTRATION CRASHED:", error.response?.data || error.message);
    }
}

registerC2BUrl();