import { db } from '../config/db.js';
import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';
import dotenv from 'dotenv';

dotenv.config();

class ReconService {

    /**
     * ⚙️ MAIN RECONCILIATION LOOP
     */
    async runReconciliation() {
        console.log("\n🔍 [RECON]: Checking for missing transactions...");
        
        // 🚩 STEP 0: PRE-FLIGHT DEBUGGER
        const requiredEnv = [
            'MPESA_CONSUMER_KEY', 
            'MPESA_CONSUMER_SECRET', 
            'MPESA_INITIATOR_NAME', 
            'MPESA_SECURITY_CREDENTIAL', 
            'MPESA_STORE_SHORTCODE'
        ];

        const missing = requiredEnv.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error(`❌ [RECON_CONFIG_ERROR]: The following variables are missing in Render: ${missing.join(', ')}`);
            return; // Stop here if variables are missing
        }

        try {
            const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
            const { data } = await axios.get(
                `${mpesaConfig.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                { headers: { Authorization: `Basic ${auth}` } }
            );

            await this.fetchSafaricomLedger(data.access_token);

        } catch (error) {
            console.error("❌ [RECON_LOOP_ERROR]: Token Generation Failed. Check Consumer Key/Secret.");
        }
    }

    /**
     * 📡 THE ACTUAL SAFARICOM LEDGER CALL
     */
    async fetchSafaricomLedger(token) {
        const url = `${mpesaConfig.baseUrl}/mpesa/accountbalance/v1/query`;
        
        const body = {
            "Initiator": process.env.MPESA_INITIATOR_NAME,
            "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL,
            "CommandID": "AccountBalance",
            "PartyA": process.env.MPESA_STORE_SHORTCODE, 
            "IdentifierType": "2", 
            "Remarks": "Routine Reconciliation",
            "QueueTimeOutURL": "https://xecoflow.onrender.com/api/v1/gateway/recon-timeout",
            "ResultURL": "https://xecoflow.onrender.com/api/v1/gateway/recon-result"
        };

        try {
            const response = await axios.post(url, body, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log("✅ [RECON_API_SUCCESS]: Store Ledger query accepted.");
            return response.data;
        } catch (error) {
            const errorData = error.response?.data;
            console.error("❌ [RECON_API_ERROR]: Safaricom rejected the request.");
            
            // 🚩 Specific Error Breakdown
            if (errorData?.errorCode === '400.002.02') {
                console.error(`👉 CAUSE: The Shortcode "${process.env.MPESA_STORE_SHORTCODE}" is incorrect or doesn't match the Initiator.`);
            } else if (errorData?.errorCode === '401.002.01') {
                console.error("👉 CAUSE: The Security Credential is wrong or expired.");
            }
            
            console.log("📄 Raw Error from Safaricom:", errorData);
            return null;
        }
    }

    async processMissingTransaction(details) {
        console.log("📝 [RECON_SYNC]: Syncing transaction to database...");
    }
}

export default new ReconService();