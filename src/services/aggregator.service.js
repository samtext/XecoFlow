import axios from 'axios';
import { db } from '../config/db.js';

class AggregatorService {
    constructor() {
        this.apiKey = process.env.AGGREGATOR_API_KEY;
        this.secretKey = process.env.AGGREGATOR_SECRET_KEY;
        this.baseUrl = process.env.AGGREGATOR_BASE_URL;
    }

    async fetchProviderBalance() {
        try {
            console.log("🔍 [STATUM]: Fetching float balance...");
            
            const response = await axios.get(`${this.baseUrl}/account/balance`, {
                headers: { 
                    'api-key': this.apiKey,
                    'api-secret': this.secretKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            });

            // Log raw response to Render logs so you can see the exact structure
            console.log("📥 [STATUM_RAW]:", JSON.stringify(response.data));

            /**
             * STATUM FIX: Checking multiple possible paths for the balance value.
             * It usually resides in response.data.data.balance or response.data.balance
             */
            const currentBalance = response.data?.data?.balance 
                ?? response.data?.balance 
                ?? response.data?.credit 
                ?? 0;

            return { 
                success: true, 
                balance: parseFloat(currentBalance) 
            };
        } catch (error) {
            const errorDetail = error.response?.data || error.message;
            console.error("❌ [STATUM_API_ERROR]:", errorDetail);
            return { success: false, error: errorDetail };
        }
    }

    async logFloatChange(amount, type, balanceAfter, description) {
        try {
            // According to your screenshot, the table needs balance_before and balance_after
            // We calculate balance_before based on current balance and the change
            const balanceBefore = type === 'PULL' ? balanceAfter : (balanceAfter + amount);

            const { error } = await db.from('provider_float_ledger').insert([{
                provider_name: 'STATUM',
                transaction_type: type, // 'PULL', 'DEBIT', 'CREDIT'
                amount: amount,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                description: description,
                created_at: new Date().toISOString()
            }]);

            if (error) throw error;
            
            console.log(`✅ [LEDGER_UPDATE]: ${type} logged. New Balance: ${balanceAfter}`);
            return true;
        } catch (error) {
            console.error("❌ [LEDGER_ERROR]:", error.message);
            return false;
        }
    }
}

export default new AggregatorService();