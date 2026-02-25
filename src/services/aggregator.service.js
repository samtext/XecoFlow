import axios from 'axios';
import { db } from '../config/db.js';

class AggregatorService {
    constructor() {
        this.apiKey = process.env.AGGREGATOR_API_KEY;
        this.secretKey = process.env.AGGREGATOR_SECRET_KEY;
        this.baseUrl = process.env.AGGREGATOR_BASE_URL;
    }

    /**
     * 💰 FETCH BALANCE & LOG TO LEDGER
     * This now automatically logs a record to the ledger if the balance is fetched.
     */
    async fetchProviderBalance() {
        try {
            const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
            const url = `${cleanBaseUrl}/account-details`;

            const authString = Buffer.from(
                `${this.apiKey.trim()}:${this.secretKey.trim()}`
            ).toString('base64');

            console.log(`🔍 [STATUM V2]: Fetching from ${url}`);

            const response = await axios.get(url, {
                headers: { 
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/json'
                }
            });

            const balance = response.data?.organization?.details?.available_balance ?? 0;
            const parsedBalance = parseFloat(balance);

            console.log(`✅ [STATUM]: Balance retrieved: KES ${parsedBalance}`);

            // 📝 LOG THIS SYNC TO LEDGER (Optional, but keeps history accurate)
            // We use 0 amount because it's just a check/sync.
            await this.logFloatChange(0, 'CREDIT', parsedBalance, "Manual Balance Sync/Pull");

            return { 
                success: true, 
                balance: parsedBalance 
            };

        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error("❌ [STATUM_V2_ERROR]:", errorData);
            
            return { 
                success: false, 
                error: errorData?.description || "Failed to fetch Statum balance" 
            };
        }
    }

    /**
     * 📝 LEDGER LOGGER
     * Matches the public.provider_float_ledger schema.
     */
    async logFloatChange(amount, type, balanceAfter, description, disbursementId = null) {
        try {
            // According to your schema, type must be 'DEBIT' or 'CREDIT'
            // If it's a DEBIT (spending), balance_before was higher.
            // If it's a CREDIT (top-up or sync), balance_before was lower or same.
            let balanceBefore;
            if (type === 'DEBIT') {
                balanceBefore = balanceAfter + amount;
            } else {
                balanceBefore = balanceAfter - amount;
            }

            const { error } = await db.from('provider_float_ledger').insert([{
                provider_name: 'STATUM',
                transaction_type: type, // 'DEBIT' or 'CREDIT'
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