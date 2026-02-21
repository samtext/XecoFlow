import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';

// ✅ Using the specialized C2B service instance
import c2bService from '../services/c2b.service.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger
 * Updated to log the RAW URL to detect path mismatches.
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`\n-----------------------------------------`);
    console.log(`📡 [INCOMING]: ${req.method} ${req.originalUrl}`);
    console.log(`🏠 FROM_IP: ${clientIp}`);
    console.log(`📦 PAYLOAD: ${req.body ? 'Parsed ✅' : 'Empty ❌'}`);
    console.log(`-----------------------------------------\n`);
    next();
};

// --- 0. DIAGNOSTIC PING ---
router.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: "Gateway Active", 
        timestamp: new Date().toISOString(),
        mount_path: req.baseUrl, // Tells us if it's mounted at /api/v1/gateway
        note: "Webhook routes are live."
    });
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
        const result = await c2bService.registerC2Bv2();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 📥 CATEGORY 3: WEBHOOKS (Safaricom-Facing)
 * 🔥 FIX: We apply express.json() specifically to these routes to ensure 
 * Safaricom's "application/json" header is parsed correctly regardless of global settings.
 */
const jsonParser = express.json({ limit: '100kb' });

router.post('/hooks/stk-callback', jsonParser, networkLogger, handleMpesaCallback);
router.post('/hooks/v2-validation', jsonParser, networkLogger, handleC2BValidation);
router.post('/hooks/v2-confirmation', jsonParser, networkLogger, handleC2BConfirmation);

export default router;