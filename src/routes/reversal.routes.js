// src/routes/reversal.routes.js
import express from 'express';
import { 
    handleReversalResult, 
    handleReversalTimeout,
    getReversalStatus,
    getAllReversals,
    retryReversal
} from '../controllers/reversalController.js';
import { mpesaIpWhitelist } from '../middlewares/mpesa.middleware.js';

const router = express.Router();

// ============================================
// 📥 M-PESA CALLBACKS (with IP whitelist)
// ============================================

/**
 * M-PESA sends reversal results here
 * IP whitelist ensures only Safaricom can call
 */
router.post('/result', mpesaIpWhitelist, handleReversalResult);

/**
 * M-PESA sends timeout notifications here
 */
router.post('/timeout', mpesaIpWhitelist, handleReversalTimeout);


// ============================================
// 🔍 PUBLIC STATUS CHECKS (No auth required)
// ============================================

/**
 * Get reversal status for a specific transaction
 * Public endpoint - customers can check their reversal status
 */
router.get('/status/:transactionId', getReversalStatus);


// ============================================
// 👑 ADMIN ENDPOINTS (Add auth middleware later)
// ============================================

/**
 * Get all reversals with optional filtering
 * Admin only - view reversal history
 */
router.get('/all', getAllReversals);

/**
 * Manually retry a failed reversal
 * Admin only - for when auto-retry fails
 */
router.post('/retry/:transactionId', retryReversal);


// ============================================
// 🏓 HEALTH CHECK
// ============================================

/**
 * Simple ping to check if reversal routes are active
 */
router.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: 'active', 
        message: 'Reversal routes operational',
        timestamp: new Date().toISOString()
    });
});

export default router;