import express from 'express';
import { db } from '../config/db.js';
import { getProviderBalance, getFloatLedger } from '../controllers/aggregatorController.js';
import aggregatorService from '../services/aggregator.service.js';

const router = express.Router();

// ==========================================
// 1. DASHBOARD METRICS
// ==========================================
router.get('/dashboard/metrics', async (req, res) => {
    try {
        console.log("📊 [DASHBOARD]: Fetching metrics...");
        
        // 1. Fetch the KES 17.2 from Statum
        const statum = await aggregatorService.fetchProviderBalance();
        const liveBalance = statum.success ? statum.balance : 0;

        // 2. Fetch Total Successful Sales Amount
        const { data: salesData } = await db
            .from('airtime_transactions')
            .select('amount')
            .eq('status', 'SUCCESS');

        const totalSalesSum = salesData?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

        // 3. Fetch Total Transaction Count
        const { count: totalTransactions } = await db
            .from('airtime_transactions')
            .select('*', { count: 'exact', head: true });

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
                value: '10.0%', // You can calculate actual margin here later
                label: 'SALES MARGIN', 
                bgColor: '#f0e6f0' 
            }
        ];

        res.status(200).json(metrics);
    } catch (error) {
        console.error("❌ [METRICS_ERROR]:", error.message);
        res.status(500).json({ error: error.message });
    }
});

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

export default router;