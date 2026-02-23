import express from 'express';
import { db } from '../config/db.js';
import { getProviderBalance, getFloatLedger } from '../controllers/aggregatorController.js';

const router = express.Router();

// ==========================================
// 1. AGGREGATOR / STATUM ROUTES
// ==========================================

/**
 * 💰 PATH: /api/v1/aggregator/balance
 * Job: Pulls live float balance from Statum and logs it
 */
router.get('/aggregator/balance', getProviderBalance);

/**
 * 📒 PATH: /api/v1/aggregator/ledger
 * Job: Fetches the history of float changes
 */
router.get('/aggregator/ledger', getFloatLedger);


// ==========================================
// 2. TRANSACTION STATUS ROUTES
// ==========================================

/**
 * 🔍 PATH: /api/v1/status/:checkoutRequestId
 * Job: Check the database for the result of an STK Push
 */
router.get('/status/:checkoutRequestId', async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        // 1. Query the specific transaction using checkout_id
        // Note: phone changed to phone_number to match your DB schema
        const { data, error } = await db.airtime_transactions()
            .select('status, mpesa_receipt, amount, phone_number, metadata')
            .eq('checkout_id', checkoutRequestId)
            .maybeSingle(); 

        if (error) {
            console.error("❌ [DB_QUERY_ERROR]:", error.message);
            throw error;
        }

        // 2. Handle missing record
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                status: 'NOT_FOUND',
                message: "Transaction not found in our records." 
            });
        }

        // 3. Return the current state
        // Status will be 'PENDING_PAYMENT', 'PAYMENT_SUCCESS', or 'PAYMENT_FAILED'
        return res.status(200).json({
            success: true,
            status: data.status,
            receipt: data.mpesa_receipt || null,
            checkoutRequestId: checkoutRequestId,
            meta: {
                amount: data.amount,
                phone: data.phone_number,
                package: data.metadata?.package_id || 'default'
            }
        });

    } catch (error) {
        console.error("❌ [STATUS_CHECK_CRITICAL]:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: "Internal Server Error while fetching status" 
        });
    }
});

export default router;