import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';

// ✅ FIXED: Importing from the correct specialized service
import c2bService from '../services/c2b.service.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`📡 [GATEWAY_LOG]: ${req.method} ${req.originalUrl} | IP: ${clientIp}`);
    next();
};

// --- 0. DIAGNOSTIC PING ---
router.get('/ping', (req, res) => {
    res.status(200).json({ status: "Gateway Active", timestamp: new Date() });
});

/**
 * 💳 CATEGORY 1: ACTIVE REQUESTS (User-Facing)
 */
router.post('/stkpush', initiatePayment);

/**
 * 🔗 CATEGORY 2: ADMINISTRATION (Dev-Facing)
 */
router.get('/setup-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Triggering C2B v2 registration...");
        
        // ✅ FIXED: Calling the method from the c2bService instance
        const result = await c2bService.registerC2Bv2();
        
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 📥 CATEGORY 3: WEBHOOKS (Safaricom-Facing)
 */
router.post('/hooks/stk-callback', networkLogger, handleMpesaCallback);
router.post('/hooks/v2-validation', networkLogger, handleC2BValidation);
router.post('/hooks/v2-confirmation', networkLogger, handleC2BConfirmation);

export default router;