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
 * This will show you EXACTLY who is hitting your server in the Render logs.
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`\n📡 [INCOMING_WEBHOOK]: ${req.method} ${req.originalUrl}`);
    console.log(`🏠 FROM_IP: ${clientIp}`);
    console.log(`📦 BODY_SIZE: ${JSON.stringify(req.body).length} chars`);
    next();
};

// --- 0. DIAGNOSTIC PING ---
router.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: "Gateway Active", 
        timestamp: new Date().toISOString(),
        note: "Webhook routes are live at /hooks/..."
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
 * Explicitly using express.json() here ensures the body is parsed even if global config fails.
 */
router.post('/hooks/stk-callback', express.json(), networkLogger, handleMpesaCallback);
router.post('/hooks/v2-validation', express.json(), networkLogger, handleC2BValidation);
router.post('/hooks/v2-confirmation', express.json(), networkLogger, handleC2BConfirmation);

export default router;