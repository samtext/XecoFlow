import aggregatorService from '../services/aggregator.service.js';
import { db } from '../config/db.js';

export const getProviderBalance = async (req, res) => {
    try {
        console.log("📊 [ADMIN]: Requesting provider balance update...");
        
        // 1. Fetch from Provider API
        const balanceResult = await aggregatorService.fetchProviderBalance();

        if (!balanceResult.success) {
            console.error("❌ [CONTROLLER_FETCH_FAIL]:", balanceResult.error);
            return res.status(502).json({
                success: false,
                message: "Failed to fetch balance from Statum",
                error: balanceResult.error
            });
        }

        // 2. Log the pull in provider_float_ledger
        // We use 'STATUM' to match your ledger entries
        try {
            await aggregatorService.logFloatChange(
                0,                  // No change in amount for a refresh
                'PULL',
                balanceResult.balance,
                'Manual balance refresh from admin dashboard'
            );
        } catch (logError) {
            // We log the error but don't stop the response 
            // because we already have the balance successfully
            console.warn("⚠️ [LEDGER_LOG_WARNING]: Balance fetched but logging failed", logError.message);
        }

        // 3. Send successful response
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
 * Get the history of float changes for the admin dashboard
 */
export const getFloatLedger = async (req, res) => {
    try {
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