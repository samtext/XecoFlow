import aggregatorService from '../services/aggregator.service.js';
import { db } from '../config/db.js';

/**
 * 💰 GET PROVIDER BALANCE
 * Logic: Pulls live balance from Statum and records a 'CREDIT' entry with 0 amount
 * to update the ledger history without violating DB constraints.
 */
export const getProviderBalance = async (req, res) => {
    try {
        console.log("📊 [ADMIN]: Requesting provider balance update...");
        
        // 1. Fetch from Statum V2 API
        const balanceResult = await aggregatorService.fetchProviderBalance();

        if (!balanceResult.success) {
            console.error("❌ [CONTROLLER_FETCH_FAIL]:", balanceResult.error);
            return res.status(502).json({
                success: false,
                message: "Failed to fetch balance from Statum",
                error: balanceResult.error
            });
        }

        // 2. Log the sync in provider_float_ledger
        // NOTE: Using 'CREDIT' with 0 amount because your SQL check constraint 
        // only allows ('DEBIT', 'CREDIT')
        try {
            await aggregatorService.logFloatChange(
                0,                                  // No financial change
                'CREDIT',                           // Complies with DB CHECK constraint
                balanceResult.balance,
                'Manual balance sync from dashboard'
            );
        } catch (logError) {
            console.warn("⚠️ [LEDGER_LOG_WARNING]: Balance fetched but ledger update failed", logError.message);
        }

        // 3. Send clean response to Frontend
        return res.status(200).json({
            success: true,
            balance: balanceResult.balance,
            currency: 'KES',
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error("❌ [AGGREGATOR_CONTROLLER_ERROR]:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error while fetching balance" 
        });
    }
};

/**
 * 📒 GET FLOAT LEDGER
 * Fetches the most recent 50 entries from the provider_float_ledger table
 */
export const getFloatLedger = async (req, res) => {
    try {
        // Fetch ledger history sorted by newest first
        const { data, error } = await db.from('provider_float_ledger')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error("❌ [LEDGER_QUERY_ERROR]:", error.message);
            throw error;
        }

        return res.status(200).json({
            success: true,
            history: data || []
        });
    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};