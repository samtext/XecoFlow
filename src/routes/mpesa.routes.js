import express from 'express';
import rateLimit from 'express-rate-limit';

// 🚨 ESM Compatibility
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { registerC2Bv2 } from '../services/mpesa.service.js';

const router = express.Router();

/**
 * 🛡️ SECURITY: SAFARICOM IP WHITELIST (2026 Updated)
 */
const safaricomIps = [
    '196.201.214.200', '196.201.214.206', '196.201.213.114',
    '196.201.214.207', '196.201.214.208', '196.201.213.44',
    '196.201.212.127', '196.201.212.138', '196.201.212.129',
    '196.201.212.136', '196.201.212.74', '196.201.212.69',
    '196.201.214.212'
];

const isIpInRange = (ip, range) => {
    if (!range || !ip) return false;
    if (!range.includes('/')) return ip === range;
    const [rangeIp] = range.split('/');
    const subnet = rangeIp.split('.').slice(0, 3).join('.');
    return ip.startsWith(subnet);
};

const mpesaIpWhitelist = (req, res, next) => {
    // 🚨 RENDER FIX: Safaricom's real IP is in x-forwarded-for
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    if (process.env.NODE_ENV === 'production') {
        const isAllowed = safaricomIps.includes(clientIp) || 
                          isIpInRange(clientIp, '196.201.214.0/24') ||
                          isIpInRange(clientIp, '196.201.212.0/24') ||
                          isIpInRange(clientIp, '196.201.213.0/24');

        if (!isAllowed) {
            console.warn(`🚨 [SECURITY]: Blocked unauthorized IP: ${clientIp}`);
            // During testing, you might want to log this and call next() to see if it works
            return res.status(403).json({ error: "Access Denied" });
        }
    }
    next();
};

const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 3, 
    message: { error: "Too many attempts. Wait 5 mins." },
    standardHeaders: true, 
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
});

// 1. STK PUSH
router.post('/stkpush', paymentLimiter, initiatePayment);

// 2. STK CALLBACK
router.post('/callback', mpesaIpWhitelist, handleMpesaCallback);

// 3. C2B REGISTRATION
router.get('/setup-c2b-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Registering C2B URLs...");
        const result = await registerC2Bv2();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 🚨 CRITICAL: C2B ENDPOINTS
 * Safaricom hits Validation FIRST. If Validation doesn't return ResultCode 0,
 * it will NOT hit Confirmation.
 */

// 4. C2B VALIDATION
router.post('/payments/c2b-validation', mpesaIpWhitelist, (req, res, next) => {
    // Log the hit so we know Safaricom reached us
    console.log("✅ [VALIDATION_HIT]:", req.body);
    handleC2BValidation(req, res, next);
});

// 5. C2B CONFIRMATION
router.post('/payments/c2b-confirmation', mpesaIpWhitelist, (req, res, next) => {
    console.log("✅ [CONFIRMATION_HIT]:", req.body);
    handleC2BConfirmation(req, res, next);
});

export default router;