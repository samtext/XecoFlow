import express from 'express';
import { db } from '../config/db.js';
import { getProviderBalance, getFloatLedger } from '../controllers/aggregatorController.js';
import aggregatorService from '../services/aggregator.service.js';

const router = express.Router();

// ==========================================
// 1. DASHBOARD METRICS (Alias added for /stats)
// ==========================================
const fetchMetrics = async (req, res) => {
    try {
        console.log("📊 [DASHBOARD]: Fetching live metrics...");
        
        // 1. Fetch live balance from Statum/M-Pesa
        // Note: Returns 0 if Security Credential is locked (Code 8006)
        const statum = await aggregatorService.fetchProviderBalance();
        const liveBalance = statum.success ? statum.balance : 0;

        // 2. Fetch Total Successful Sales
        // Updated to 'PAYMENT_SUCCESS' to match your internal transaction logic
        const { data: salesData, error: salesError } = await db
            .from('airtime_transactions')
            .select('amount')
            .eq('status', 'PAYMENT_SUCCESS');

        if (salesError) console.error("⚠️ [DB_SALES_ERROR]:", salesError.message);

        const totalSalesSum = salesData?.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) || 0;

        // 3. Fetch Total Transaction Count
        const { count: totalTransactions, error: countError } = await db
            .from('airtime_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PAYMENT_SUCCESS');

        if (countError) console.error("⚠️ [DB_COUNT_ERROR]:", countError.message);

        const metrics = [
            { 
                id: 1, 
                value: `Kes ${liveBalance.toLocaleString()}`, 
                label: 'CURRENT FLOAT', 
                bgColor: '#e6f3ff' 
            },
            { 
                id: 2, 
                value: `Kes ${totalSalesSum.toLocaleString()}`, 
                label: 'TOTAL SALES', 
                bgColor: '#fff0e6' 
            },
            { 
                id: 3, 
                value: (totalTransactions || 0).toString(), 
                label: 'TOTAL TRANSACTION', 
                bgColor: '#e6f0e6' 
            },
            { 
                id: 4, 
                value: '10.0%', 
                label: 'SALES MARGIN', 
                bgColor: '#f0e6f0' 
            }
        ];

        res.status(200).json(metrics);
    } catch (error) {
        console.error("❌ [METRICS_ERROR]:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// Supporting both endpoints to prevent frontend "404 Not Found" errors
router.get('/dashboard/metrics', fetchMetrics);
router.get('/dashboard/stats', fetchMetrics); 

// ==========================================
// 2. AGGREGATOR / STATUM ROUTES
// ==========================================
router.get('/aggregator/balance', getProviderBalance);
router.get('/aggregator/ledger', getFloatLedger);

// ==========================================
// 3. TRANSACTION STATUS
// ==========================================
router.get('/status/:checkoutRequestId', async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        const { data, error } = await db
            .from('airtime_transactions')
            .select('status, mpesa_receipt, amount, phone_number, metadata')
            .eq('checkout_id', checkoutRequestId)
            .maybeSingle(); 

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: "Not found" });

        return res.status(200).json({
            success: true,
            status: data.status,
            receipt: data.mpesa_receipt,
            meta: { amount: data.amount, phone: data.phone_number }
        });

    } catch (error) {
        console.error("❌ [STATUS_ERROR]:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Health check endpoint for Render
router.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));

export default router;