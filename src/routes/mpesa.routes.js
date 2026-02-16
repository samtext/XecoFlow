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

// --- 🛡️ SPAM SHIELD CONFIGURATION ---
const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 Minutes window
    max: 3, // Limit each IP to 3 STK requests per 5 minutes
    message: { 
        error: "Too many payment attempts. Please wait 5 minutes before trying again." 
    },
    standardHeaders: true, 
    legacyHeaders: false, 
});

/**
 * 1. INITIATE STK PUSH (LANE 1)
 * Full Path: /api/v1/mpesa/stkpush
 */
router.post('/stkpush', paymentLimiter, initiatePayment);

/**
 * 2. MPESA STK CALLBACK ROUTE
 * Full Path: /api/v1/mpesa/callback
 */
router.post('/callback', handleMpesaCallback);

/**
 * 3. C2B REGISTRATION (ONE-TIME SETUP)
 * Full Path: /api/v1/mpesa/setup-c2b-urls
 * Visit this in your browser once to register your Render URL with Safaricom
 */
router.get('/setup-c2b-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Registering C2B URLs with Safaricom...");
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
 */
router.post('/c2b-validation', handleC2BValidation);

/**
 * 5. C2B CONFIRMATION (LANE 2)
 * Full Path: /api/v1/mpesa/c2b-confirmation
 */
router.post('/c2b-confirmation', handleC2BConfirmation);

export default router;