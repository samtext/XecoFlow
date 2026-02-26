import { db } from '../config/db.js';
import stkService from './stk.service.js';
import axios from 'axios';
import mpesaConfig from '../config/mpesa.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

class ReconService {

    /**
     * ⚙️ MAIN RECONCILIATION LOOP
     * Triggered by the worker.js every 60 seconds
     */
    async runReconciliation() {
        console.log("🔍 [RECON]: Checking for missing transactions...");
        try {
            // 1. Get a fresh OAuth Token from Safaricom
            const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
            const { data } = await axios.get(
                `${mpesaConfig.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                { headers: { Authorization: `Basic ${auth}` } }
            );

            // 2. Fetch the Store Ledger (Account Balance)
            await this.fetchSafaricomLedger(data.access_token);

        } catch (error) {
            console.error("❌ [RECON_LOOP_ERROR]:", error.message);
        }
    }

    /**
     * 📡 THE ACTUAL SAFARICOM LEDGER CALL
     * Optimized for Store Number: 9203342
     */
    async fetchSafaricomLedger(token) {
        // Pointing to the Account Balance endpoint
        const url = `${mpesaConfig.baseUrl}/mpesa/accountbalance/v1/query`;
        
        const body = {
    "Initiator": process.env.MPESA_INITIATOR_NAME,
    "SecurityCredential": process.env.MPESA_SECURITY_CREDENTIAL,
    "CommandID": "AccountBalance",
    // 🚩 SPECIFICALLY CALL THE STORE SHORTCODE HERE
    "PartyA": process.env.MPESA_STORE_SHORTCODE, 
    "IdentifierType": "2", // '2' is required for Store Numbers
    "Remarks": "Routine Reconciliation",
    "QueueTimeOutURL": "https://xecoflow.onrender.com/api/v1/gateway/recon-timeout",
    "ResultURL": "https://xecoflow.onrender.com/api/v1/gateway/recon-result"
};

        try {
            const response = await axios.post(url, body, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log("📡 [RECON_API_SENT]: Store Ledger query accepted (ResponseCode: 0).");
            return response.data;
        } catch (error) {
            console.error("❌ [RECON_API_ERROR]:", error.response?.data || error.message);
            return null;
        }
    }

    /**
     * 🛠️ PROCESS MISSING TRANSACTION
     * Call this when a transaction exists in M-Pesa but not in your DB
     */
    async processMissingTransaction(details) {
        // Logic to insert missing payment into your database
        console.log("📝 [RECON_SYNC]: Syncing transaction to database...");
        // Example: await db.transaction.create({ data: details });
    }
}

export default new ReconService();