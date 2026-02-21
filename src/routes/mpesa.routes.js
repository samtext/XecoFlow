import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { mpesaIpWhitelist } from '../middlewares/mpesa.middleware.js'; // Ensure correct path
import c2bService from '../services/c2b.service.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger
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

// 0. DIAGNOSTIC PING
router.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: "Gateway Active", 
        timestamp: new Date().toISOString(),
        mount_path: req.baseUrl,
        note: "Webhook routes are live."
    });
});

// 💳 CATEGORY 1: ACTIVE REQUESTS (User-Facing)
router.post('/stkpush', initiatePayment);

// 🔗 CATEGORY 2: ADMINISTRATION (Dev-Facing)
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
 * We combine:
 * 1. Specific JSON parsing for webhooks
 * 2. IP Whitelisting for 2026 Production security
 * 3. Network logging for easier debugging
 */
const webhookMiddleware = [express.json({ limit: '100kb' }), mpesaIpWhitelist, networkLogger];

router.post('/hooks/stk-callback', ...webhookMiddleware, handleMpesaCallback);
router.post('/hooks/v2-validation', ...webhookMiddleware, handleC2BValidation);
router.post('/hooks/v2-confirmation', ...webhookMiddleware, handleC2BConfirmation);

export default router;