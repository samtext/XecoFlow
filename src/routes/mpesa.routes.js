import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { mpesaIpWhitelist } from '../middlewares/mpesa.middleware.js';
import c2bService from '../services/c2b.service.js';
import stkService from '../services/stk.service.js'; // Keep existing

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

// 🔍 Transaction Status Check Endpoint
router.get('/status/:checkoutId', async (req, res) => {
    try {
        const { checkoutId } = req.params;
        console.log(`🔍 Checking status for: ${checkoutId}`);
        
        const result = await stkService.getTransactionStatus(checkoutId);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                status: result.status,
                transaction: result.transaction
            });
        } else {
            return res.status(404).json({
                success: false,
                status: result.status,
                message: result.message
            });
        }
    } catch (error) {
        console.error("❌ [STATUS_ERROR]:", error.message);
        return res.status(500).json({
            success: false,
            status: 'ERROR',
            message: error.message
        });
    }
});

// 🔗 CATEGORY 2: ADMINISTRATION (Dev-Facing)
router.get('/setup-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Triggering C2B registration...");
        // Ensure your c2bService has a method that matches this call
        const result = await c2bService.registerUrls(); 
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 📥 CATEGORY 3: WEBHOOKS (Safaricom-Facing)
 */
const webhookMiddleware = [express.json({ limit: '100kb' }), mpesaIpWhitelist, networkLogger];

// STK Push Callback
router.post('/hooks/stk-callback', ...webhookMiddleware, handleMpesaCallback);

// ✅ NEW: C2B Routes (Matching your Daraja URL Management screenshot)
// Path: /api/v1/payments/c2b-confirmation
router.post('/payments/c2b-confirmation', ...webhookMiddleware, handleC2BConfirmation);
router.post('/payments/c2b-validation', ...webhookMiddleware, handleC2BValidation);

// Keep legacy v2 hooks just in case
router.post('/hooks/v2-validation', ...webhookMiddleware, handleC2BValidation);
router.post('/hooks/v2-confirmation', ...webhookMiddleware, handleC2BConfirmation);

export default router;