import express from 'express';
import { db } from '../config/db.js';

const router = express.Router();

/**
 * 🔍 PATH: /api/v1/status/:checkoutRequestId
 * Job: Check the database for the result of an STK Push
 */
router.get('/status/:checkoutRequestId', async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        // 1. Query the specific transaction using checkout_id
        const { data, error } = await db.airtime_transactions()
            .select('status, mpesa_receipt, amount, phone')
            .eq('checkout_id', checkoutRequestId)
            .single(); // Use .single() if you expect only one unique record

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
        // Status will be 'PENDING' (default), 'SUCCESS', or 'FAILED'
        return res.status(200).json({
            success: true,
            status: data.status,
            receipt: data.mpesa_receipt || null,
            meta: {
                amount: data.amount,
                phone: data.phone
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