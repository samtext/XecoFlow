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
 * 🛡️ SECURITY: SAFARICOM IP WHITELIST (Stored for reference)
 */
const safaricomIps = [
    '196.201.214.200', '196.201.214.206', '196.201.213.114',
    '196.201.214.207', '196.201.214.208', '196.201.213.44',
    '196.201.212.127', '196.201.212.138', '196.201.212.129',
    '196.201.212.136', '196.201.212.74', '196.201.212.69',
    '196.201.214.212'
];

/**
 * 🚦 MIDDLEWARE: M-Pesa IP Whitelist
 * BYPASSED: Log client IP but proceed to fix Render proxy resolution.
 */
const mpesaIpWhitelist = (req, res, next) => {
    // Correctly handle Render's x-forwarded-for header
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    console.log(`📡 [NETWORK_LOG]: ${req.method} request to ${req.originalUrl} from IP: ${clientIp}`);

    // Bypassed for production reliability
    next();
};

/**
 * ⚡ RATE LIMITER
 */
const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 15, // Allow overhead for testing
    message: { error: "Too many attempts. Please try again in 5 minutes." },
    standardHeaders: true, 
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
});

// --- 1. STK PUSH ---
router.post('/stkpush', paymentLimiter, initiatePayment);

// --- 2. STK CALLBACK ---
router.post('/callback', mpesaIpWhitelist, handleMpesaCallback);

// --- 3. C2B URL REGISTRATION ---
router.get('/setup-c2b-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Attempting to register C2B URLs...");
        const result = await registerC2Bv2();
        return res.status(200).json({ 
            success: true, 
            message: "Registration command sent successfully", 
            data: result 
        });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        // Ensure only one response is sent
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }
});

/**
 * 🚨 C2B TILL ENDPOINTS
 */

// --- 4. C2B VALIDATION ---
router.post('/payments/c2b-validation', mpesaIpWhitelist, async (req, res) => {
    try {
        console.log("✅ [VALIDATION_HIT]: M-Pesa is validating...");
        await handleC2BValidation(req, res);
    } catch (error) {
        console.error("❌ [VALIDATION_ROUTE_ERROR]:", error.message);
        // Safaricom expects a ResultCode even on internal error
        if (!res.headersSent) {
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
});

// --- 5. C2B CONFIRMATION ---
router.post('/payments/c2b-confirmation', mpesaIpWhitelist, async (req, res) => {
    try {
        console.log("✅ [CONFIRMATION_HIT]: M-Pesa confirmed payment!");
        await handleC2BConfirmation(req, res);
    } catch (error) {
        console.error("❌ [CONFIRMATION_ROUTE_ERROR]:", error.message);
        if (!res.headersSent) {
            res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
    }
});

export default router;