import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';

class MpesaAuth {
    constructor() {
        this.accessToken = null;
        this.expiryTime = null;
    }

    /**
     * 🔑 GET ACCESS TOKEN
     * Fetches a new token or returns the cached one if still valid.
     */
    async getAccessToken() {
        // 1. Check if we already have a valid token in memory (Cache)
        if (this.accessToken && this.expiryTime && Date.now() < this.expiryTime) {
            return this.accessToken;
        }

        console.log("📡 [AUTH]: Fetching new Access Token from Safaricom...");

        // 2. Prepare request
        try {
            const auth = mpesaConfig.getBasicAuthToken();
            const url = `${mpesaConfig.baseUrl}${mpesaConfig.authEndpoint}`;

            const response = await axios.get(url, {
                headers: { 
                    Authorization: `Basic ${auth.trim()}`,
                    "Content-Type": "application/json"
                }
            });

            // 3. Validate Response
            if (!response.data || !response.data.access_token) {
                throw new Error("Access token missing in Safaricom response");
            }

            // 4. Update Cache
            // We subtract 60 seconds from expires_in to refresh the token 1 minute before it dies
            const expiresInSeconds = parseInt(response.data.expires_in) || 3599;
            
            this.accessToken = response.data.access_token.trim();
            this.expiryTime = Date.now() + (expiresInSeconds - 60) * 1000;

            console.log("✅ [AUTH]: New Token Acquired.");
            return this.accessToken;

        } catch (error) {
            // Detailed error logging for debugging
            const errorData = error.response?.data || error.message;
            console.error("❌ [MPESA_AUTH_ERROR]:", JSON.stringify(errorData, null, 2));
            
            // Clean error for the service layers
            throw new Error(`M-Pesa Authentication Failed: ${error.response?.statusText || error.message}`);
        }
    }
}

// Export as a Singleton (single shared instance)
const mpesaAuth = new MpesaAuth();
export default mpesaAuth;