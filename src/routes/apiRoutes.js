import express from 'express';
import { db } from '../config/db.js';

const router = express.Router();

/**
 * Path: /api/v1/status/:checkoutRequestId
 */
router.get('/status/:checkoutRequestId', async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        const { data, error } = await db.airtime_transactions()
            .select('status, mpesa_receipt')
            .eq('checkout_id', checkoutRequestId);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: "Transaction not found" });
        }

        return res.status(200).json({
            success: true,
            status: data[0]?.status || 'PENDING',
            receipt: data[0]?.mpesa_receipt
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: "Could not fetch status" });
    }
});

export default router;