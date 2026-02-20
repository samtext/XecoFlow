import express from 'express';
import rateLimit from 'express-rate-limit';

// 🚨 ESM Compatibility Imports
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { registerC2Bv2 } from '../services/mpesa.service.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: M-Pesa Network Logger
 * This ensures you see every hit in your Render logs immediately.
 */
const mpesaLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`📡 [ROUTER_LOG]: ${req.method} ${req.originalUrl} | IP: ${clientIp}`);
    next();
};

/**
 * ⚡ RATE LIMITER: STK Push Protection
 */
const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 15,
    message: { error: "Too many attempts. Please try again in 5 minutes." },
    standardHeaders: true, 
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
});

// --- 0. DIAGNOSTIC PING ---
// Visit: https://xecoflow.onrender.com/api/v1/mpesa/ping
router.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: "M-Pesa Router Active", 
        timestamp: new Date().toISOString() 
    });
});

// --- 1. STK PUSH ---
router.post('/stkpush', paymentLimiter, initiatePayment);

// --- 2. STK CALLBACK ---
router.post('/callback', mpesaLogger, handleMpesaCallback);

// --- 3. C2B URL REGISTRATION (Daraja 2.0 / v2) ---
// Visit: https://xecoflow.onrender.com/api/v1/mpesa/setup-c2b-urls
router.get('/setup-c2b-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Registering C2B v2 URLs with Safaricom...");
        const result = await registerC2Bv2();
        return res.status(200).json({ 
            success: true, 
            message: "C2B Registration complete", 
            data: result 
        });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
});

/**
 * 🚨 C2B TILL ENDPOINTS (v2)
 */

// --- 4. C2B VALIDATION ---
router.post('/payments/c2b-validation', mpesaLogger, async (req, res) => {
    try {
        console.log("✅ [VALIDATION_HIT]: Processing M-Pesa Validation...");
        await handleC2BValidation(req, res);
    } catch (error) {
        console.error("❌ [VALIDATION_ROUTE_ERROR]:", error.message);
        if (!res.headersSent) {
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
});

// --- 5. C2B CONFIRMATION ---
router.post('/payments/c2b-confirmation', mpesaLogger, async (req, res) => {
    try {
        console.log("💰 [CONFIRMATION_HIT]: Processing M-Pesa Confirmation...");
        await handleC2BConfirmation(req, res);
    } catch (error) {
        console.error("❌ [CONFIRMATION_ROUTE_ERROR]:", error.message);
        if (!res.headersSent) {
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
});

export default router;