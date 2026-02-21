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
 * 🚦 MIDDLEWARE: Network Logger
 * This helps you track the IP address of every incoming request. 
 * Crucial for debugging why a callback might not be hitting your Render server.
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`📡 [GATEWAY_LOG]: ${req.method} ${req.originalUrl} | IP: ${clientIp}`);
    next();
};

// --- 0. DIAGNOSTIC PING ---
// Used to verify if the M-Pesa route file is correctly mounted in app.js
router.get('/ping', (req, res) => {
    res.status(200).json({ status: "Gateway Active", timestamp: new Date() });
});

/**
 * 💳 CATEGORY 1: ACTIVE REQUESTS (User-Facing)
 * These routes are triggered by your Frontend/React application.
 */
router.post('/stkpush', initiatePayment);

/**
 * 🔗 CATEGORY 2: ADMINISTRATION (Dev-Facing)
 * One-time setup route to tell Safaricom where to send your C2B data.
 */
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

/**
 * 📥 CATEGORY 3: WEBHOOKS (Safaricom-Facing)
 * These endpoints are "Passive"—they wait for Safaricom to send data.
 * Grouped under /hooks/ for better URL management.
 */

// Result of STK Push (PIN prompt outcome)
router.post('/hooks/stk-callback', networkLogger, handleMpesaCallback);

// C2B v2 Validation (Safaricom asks your permission for a manual Paybill)
router.post('/hooks/v2-validation', networkLogger, handleC2BValidation);

// C2B v2 Confirmation (Safaricom confirms the money is in your Till/Paybill)
router.post('/hooks/v2-confirmation', networkLogger, handleC2BConfirmation);

export default router;