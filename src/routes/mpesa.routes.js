import express from 'express';
// ✅ Import the rate limiter package
import rateLimit from 'express-rate-limit';
// We use curly braces because we are using 'Named Exports' in the controllers
import { initiatePayment } from '../controllers/paymentController.js';
import { handleMpesaCallback } from '../controllers/callbackController.js';

const router = express.Router();

// --- 🛡️ SPAM SHIELD CONFIGURATION ---
const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 Minutes window
    max: 3, // Limit each IP to 3 STK requests per 5 minutes
    message: { 
        error: "Too many payment attempts. Please wait 5 minutes before trying again." 
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * 1. INITIATE STK PUSH
 * Full Path: /api/v1/mpesa/stkpush
 * ✅ Added paymentLimiter to protect this route from spam
 */
router.post('/stkpush', paymentLimiter, initiatePayment);

/**
 * 2. MPESA CALLBACK ROUTE
 * Full Path: /api/v1/mpesa/callback
 * ⚠️ Note: Do NOT add a rate limiter here. 
 * Safaricom must always be able to send us the payment results.
 */
router.post('/callback', handleMpesaCallback);

export default router;