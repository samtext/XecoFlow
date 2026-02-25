import express from 'express';
import { db } from '../config/db.js';
import { getProviderBalance, getFloatLedger } from '../controllers/aggregatorController.js';
import aggregatorService from '../services/aggregator.service.js'; // Import service for metrics

const router = express.Router();

// ==========================================
// 1. DASHBOARD ROUTES (NEW)
// ==========================================

/**
 * 📊 PATH: /api/v1/dashboard/metrics
 * Job: Fetches all data for the 4 top cards on the dashboard
 */
router.get('/dashboard/metrics', async (req, res) => {
    try {
        // 1. Fetch live balance from Statum
        const statum = await aggregatorService.fetchProviderBalance();
        
        // 2. Fetch Sales Stats from Supabase (Example)
        // const { count: totalSales } = await db.from('airtime_transactions').select('*', { count: 'exact', head: true }).eq('status', 'SUCCESS');

        const metrics = [
            { 
              id: 1, 
              value: `Kes ${statum.success ? statum.balance.toLocaleString() : '0.00'}`, 
              label: 'CURRENT FLOAT', 
              bgColor: '#e6f3ff' 
            },
            { id: 2, value: '0', label: 'TOTAL SALES', bgColor: '#fff0e6' }, // Update with real DB count later
            { id: 3, value: '0', label: 'TOTAL TRANSACTION', bgColor: '#e6f0e6' },
            { id: 4, value: '0.0%', label: 'SALES MARGIN', bgColor: '#f0e6f0' }
        ];

        res.status(200).json(metrics);
    } catch (error) {
        console.error("❌ [METRICS_ERROR]:", error.message);
        res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
});

// ==========================================
// 2. AGGREGATOR / STATUM ROUTES
// ==========================================

router.get('/aggregator/balance', getProviderBalance);
router.get('/aggregator/ledger', getFloatLedger);


// ==========================================
// 3. TRANSACTION STATUS ROUTES
// ==========================================

router.get('/status/:checkoutRequestId', async (req, res) => {
    // ... (Your existing status logic remains exactly as is)
    try {
        const { checkoutRequestId } = req.params;
        const { data, error } = await db.from('airtime_transactions') // Fixed: .from() is standard for Supabase
            .select('status, mpesa_receipt, amount, phone_number, metadata')
            .eq('checkout_id', checkoutRequestId)
            .maybeSingle(); 

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, status: 'NOT_FOUND' });

        return res.status(200).json({
            success: true,
            status: data.status,
            receipt: data.mpesa_receipt,
            checkoutRequestId,
            meta: { amount: data.amount, phone: data.phone_number }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

export default router;