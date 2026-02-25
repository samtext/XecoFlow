import axios from 'axios';
import mpesaAuth from './src/services/mpesa.auth.js'; 

const registerURL = async () => {
    try {
        // 1. Get Token
        const token = await mpesaAuth.getAccessToken();
        
        // 2. USE PRODUCTION URL (api.safaricom.co.ke)
        const url = "https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl";
        
        console.log(`🚀 [MPESA]: Attempting registration for Store: ${process.env.MPESA_STORE_NUMBER}`);

        const response = await axios.post(url, {
            "ShortCode": process.env.MPESA_STORE_NUMBER, 
            "ResponseType": "Completed", // Or "Cancelled"
            "ConfirmationURL": "https://xecoflow.onrender.com/api/v1/payments/callback",
            "ValidationURL": "https://xecoflow.onrender.com/api/v1/payments/validation"
        }, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        console.log("✅ [SAFARICOM]: Registration Success:", response.data);
    } catch (error) {
        // Log the full error to see exactly what Safaricom doesn't like
        console.error("❌ [REGISTRATION_ERROR]:", error.response?.data || error.message);
    }
};

registerURL();