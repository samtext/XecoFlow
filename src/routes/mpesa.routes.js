import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { registerC2Bv2 } from '../services/mpesa.service.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger (Neutral naming)
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`📡 [GATEWAY_LOG]: ${req.method} ${req.originalUrl} | IP: ${clientIp}`);
    next();
};

// --- 0. DIAGNOSTIC PING ---
// New URL: https://xecoflow.onrender.com/api/v1/gateway/ping
router.get('/ping', (req, res) => {
    res.status(200).json({ status: "Gateway Active", timestamp: new Date() });
});

// --- 1. STK PUSH ---
router.post('/stkpush', initiatePayment);

// --- 2. STK CALLBACK ---
// New URL: https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback
router.post('/hooks/stk-callback', networkLogger, handleMpesaCallback);

// --- 3. URL REGISTRATION ---
// New URL: https://xecoflow.onrender.com/api/v1/gateway/setup-urls
router.get('/setup-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Triggering C2B v2 registration...");
        const result = await registerC2Bv2();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

// --- 4. C2B ENDPOINTS (Neutral naming for Safaricom approval) ---
router.post('/hooks/v2-validation', networkLogger, handleC2BValidation);
router.post('/hooks/v2-confirmation', networkLogger, handleC2BConfirmation);

export default router;