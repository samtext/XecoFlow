import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';

class MpesaAuth {
    constructor() {
        this.accessToken = null;
        this.expiryTime = null;
    }

    async getAccessToken() {
        if (this.accessToken && this.expiryTime && Date.now() < this.expiryTime) {
            return this.accessToken;
        }

        const auth = mpesaConfig.getBasicAuthToken();
        
        /**
         * UPDATED: Using mpesaConfig.authEndpoint 
         * instead of mpesaConfig.endpoints.auth
         */
        const url = `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`;

        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Basic ${auth}` }
            });

            this.accessToken = response.data.access_token;
            this.expiryTime = Date.now() + (response.data.expires_in - 60) * 1000;
            return this.accessToken;
        } catch (error) {
            console.error("❌ MPESA_AUTH_ERROR:", error.response?.data || error.message);
            throw new Error("Failed to authenticate with Safaricom.");
        }
    }
}

export default new MpesaAuth();