import express from 'express';
// ✅ Import the rate limiter package
import rateLimit from 'express-rate-limit';

// 🚨 CRITICAL FIX: Added '.js' extensions to all local imports for Render/ESM compatibility
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { registerC2Bv2 } from '../services/mpesa.service.js';

const router = express.Router();

/**
 * 🛡️ SECURITY: SAFARICOM IP WHITELIST
 * These are the official Safaricom Daraja Production IP addresses.
 */
const safaricomIps = [
    // Original IPs
    '196.201.214.200', '196.201.214.206', '196.201.213.114',
    '196.201.214.207', '196.201.214.208', '196.201.213.44',
    '196.201.212.127', '196.201.212.138', '196.201.212.129',
    '196.201.212.136', '196.201.212.74', '196.201.212.69',
    // New 2026 Production Ranges (CIDR blocks)
    '196.201.214.212', 
    '196.201.214.0/24', // Covers 196.201.214.1 to 196.201.214.254
    '196.201.212.0/24', // Covers the .212 range
    '196.201.213.0/24'  // Covers the .213 range
];

const mpesaIpWhitelist = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

    // Only enforce in production to allow local/Postman testing in dev
    if (process.env.NODE_ENV === 'production' && !safaricomIps.includes(clientIp)) {
        console.warn(`🚨 [SECURITY]: Blocked unauthorized access attempt from IP: ${clientIp}`);
        return res.status(403).json({ error: "Access Denied: Unauthorized IP" });
    }
    next();
};

// --- 🛡️ SPAM SHIELD CONFIGURATION ---
const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 Minutes window
    max: 3, // Limit each IP to 3 STK requests per 5 minutes
    message: { 
        error: "Too many payment attempts. Please wait 5 minutes before trying again." 
    },
    standardHeaders: true, 
    legacyHeaders: false,
    keyGenerator: (req) => {
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (xForwardedFor) {
            return xForwardedFor.split(',')[0].trim();
        }
        return req.ip;
    },
});

/**
 * 1. INITIATE STK PUSH (LANE 1)
 * Full Path: /api/v1/mpesa/stkpush
 */
router.post('/stkpush', paymentLimiter, initiatePayment);

/**
 * 2. MPESA STK CALLBACK ROUTE
 * Full Path: /api/v1/mpesa/callback
 * Protected: Only Safaricom IPs allowed
 */
router.post('/callback', mpesaIpWhitelist, handleMpesaCallback);

/**
 * 3. C2B REGISTRATION (ONE-TIME SETUP)
 * Full Path: /api/v1/mpesa/setup-c2b-urls
 */
router.get('/setup-c2b-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Registering C2B URLs with Safaricom (V2 with V1 Fallback)...");
        const result = await registerC2Bv2();
        
        res.status(200).json({ 
            success: true, 
            message: "C2B URLs Registered Successfully", 
            data: result 
        });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * 4. C2B VALIDATION (LANE 2)
 * Full Path: /api/v1/mpesa/c2b-validation
 * Protected: Only Safaricom IPs allowed
 */
router.post('/c2b-validation', mpesaIpWhitelist, handleC2BValidation);

/**
 * 5. C2B CONFIRMATION (LANE 2)
 * Full Path: /api/v1/mpesa/c2b-confirmation
 * Protected: Only Safaricom IPs allowed
 */
router.post('/c2b-confirmation', mpesaIpWhitelist, handleC2BConfirmation);

export default router;