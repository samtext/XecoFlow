import axios from 'axios';
import { db } from '../config/db.js';

class AggregatorService {
    constructor() {
        // Defensive check: Ensure variables exist to avoid .trim() or .replace() crashes
        this.apiKey = process.env.AGGREGATOR_API_KEY || '';
        this.secretKey = process.env.AGGREGATOR_SECRET_KEY || '';
        this.baseUrl = process.env.AGGREGATOR_BASE_URL || 'https://api.statum.co.ke';
    }

    /**
     * 💰 FETCH BALANCE & LOG TO LEDGER
     */
    async fetchProviderBalance() {
        try {
            // 🛑 CRASH PROTECTION: Check if baseUrl is valid before calling .replace()
            if (!this.baseUrl) {
                throw new Error("AGGREGATOR_BASE_URL is not defined in environment variables");
            }

            const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
            const url = `${cleanBaseUrl}/account-details`;

            // 🛑 CRASH PROTECTION: Ensure API Keys exist before calling .trim()
            if (!this.apiKey || !this.secretKey) {
                throw new Error("Statum API Key or Secret is missing");
            }

            const authString = Buffer.from(
                `${this.apiKey.trim()}:${this.secretKey.trim()}`
            ).toString('base64');

            console.log(`🔍 [STATUM V2]: Fetching from ${url}`);

            const response = await axios.get(url, {
                headers: { 
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // Added timeout to prevent hanging
            });

            // Navigate the response path safely
            const balance = response.data?.organization?.details?.available_balance ?? 0;
            const parsedBalance = parseFloat(balance);

            console.log(`✅ [STATUM]: Balance retrieved: KES ${parsedBalance}`);

            // 📝 LOG THIS SYNC TO LEDGER
            await this.logFloatChange(0, 'CREDIT', parsedBalance, "Manual Balance Sync/Pull");

            return { 
                success: true, 
                balance: parsedBalance 
            };

        } catch (error) {
            // Refined error logging
            const errorMessage = error.response?.data?.description || error.message;
            console.error("❌ [STATUM_V2_ERROR]:", errorMessage);
            
            return { 
                success: false, 
                error: errorMessage || "Failed to fetch Statum balance" 
            };
        }
    }

    /**
     * 📝 LEDGER LOGGER
     */
    async logFloatChange(amount, type, balanceAfter, description, disbursementId = null) {
        try {
            let balanceBefore;
            if (type === 'DEBIT') {
                balanceBefore = balanceAfter + amount;
            } else {
                balanceBefore = balanceAfter - amount;
            }

            const { error } = await db.from('provider_float_ledger').insert([{
                provider_name: 'STATUM',
                transaction_type: type, 
                amount: amount,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                disbursement_id: disbursementId,
                description: description,
                created_at: new Date().toISOString()
            }]);

            if (error) throw error;
            
            console.log(`📊 [LEDGER]: ${type} recorded. New Balance: ${balanceAfter}`);
            return true;
        } catch (error) {
            console.error("❌ [LEDGER_ERROR]:", error.message);
            return false;
        }
    }
}

export default new AggregatorService();