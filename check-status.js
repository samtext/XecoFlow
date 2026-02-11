import mpesaService from './src/services/mpesa.service.js';
import mpesaConfig, { getMpesaTimestamp, generateSTKPassword } from './src/config/mpesa.js';
import axios from 'axios';

async function checkStatus(checkoutID) {
    const token = await mpesaService.getAccessToken();
    const timestamp = getMpesaTimestamp();
    const password = generateSTKPassword(timestamp);

    const payload = {
        BusinessShortCode: mpesaConfig.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutID
    };

    try {
        const response = await axios.post(
            `${mpesaConfig.baseUrl}/mpesa/stkpushquery/v1/query`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("🔍 SAFARICOM SAYS:", response.data.ResultDesc);
    } catch (error) {
        console.error("❌ Query Failed:", error.response?.data?.errorMessage || error.message);
    }
}

// Paste the ID from your terminal here:
checkStatus("ws_CO_09022026171816160708050827");