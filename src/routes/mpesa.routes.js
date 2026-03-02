import express from 'express';
import { initiatePayment } from '../controllers/paymentController.js';
import { 
    handleMpesaCallback, 
    handleC2BValidation, 
    handleC2BConfirmation 
} from '../controllers/callbackController.js';
import { mpesaIpWhitelist } from '../middlewares/mpesa.middleware.js';
import c2bService from '../services/c2b.service.js';
import stkService from '../services/stk.service.js';
import { storeSocketMapping, emitPaymentToClient } from '../socket/helper.js'; // 👈 NEW

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger & Data Extractor
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    
    // Log basic request info
    console.log(`\n-----------------------------------------`);
    console.log(`📡 [INCOMING]: ${req.method} ${req.originalUrl}`);
    console.log(`🏠 FROM_IP: ${clientIp}`);

    // Data Extraction for STK Push Callbacks
    if (req.body?.Body?.stkCallback) {
        const cb = req.body.Body.stkCallback;
        req.refinedData = {
            merchantRequestId: cb.MerchantRequestID,
            checkoutRequestId: cb.CheckoutRequestID,
            resultCode: cb.ResultCode,
            resultDesc: cb.ResultDesc,
            transId: cb.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null
        };
        console.log(`🆔 STK_ID: ${req.refinedData.checkoutRequestId} | Result: ${req.refinedData.resultCode}`);
    }
    
    // Data Extraction for C2B Callbacks
    if (req.body?.TransID) {
        console.log(`💰 C2B_TRANS: ${req.body.TransID} | Amount: ${req.body.TransAmount} | Ref: ${req.body.BillRefNumber}`);
    }

    console.log(`-----------------------------------------\n`);
    next();
};

/**
 * 📥 WEBHOOK CONFIGURATION (Safaricom-Facing)
 */
const webhookMiddleware = [
    express.json({ limit: '100kb' }), 
    mpesaIpWhitelist, 
    networkLogger
];

// 0. DIAGNOSTIC PING
router.get('/ping', (req, res) => {
    res.status(200).json({ status: "Gateway Active", timestamp: new Date().toISOString() });
});

// 💳 CATEGORY 1: ACTIVE REQUESTS (User-Facing)
router.post('/stkpush', async (req, res, next) => {
    // 👇 Capture socketId from request body
    const { socketId } = req.body;
    
    // Store socketId in request for later use
    if (socketId) {
        req.pendingSocketId = socketId;
        console.log(`🔌 [SOCKET_REQ]: Client socket ID received: ${socketId}`);
    }
    
    // Call the original controller
    initiatePayment(req, res, next);
});

router.get('/status/:checkoutId', async (req, res) => {
    try {
        const { checkoutId } = req.params;
        const result = await stkService.getTransactionStatus(checkoutId);
        res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 🔗 CATEGORY 2: ADMINISTRATION (Register URLs)
// Trigger this once to link your Paybill to this server
router.get('/setup-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Triggering Safaricom v2 registration...");
        
        // Ensure c2bService is imported correctly as a default export
        const result = await c2bService.registerUrls(); 
        
        return res.status(200).json({ 
            success: true, 
            message: "Safaricom v2 Registration successful", 
            data: result 
        });
    } catch (error) {
        console.error("❌ [SETUP_ERROR]:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: "Registration Failed",
                details: error.message 
            });
        }
    }
});

/**
 * 📥 CATEGORY 3: WEBHOOKS
 * These paths must match exactly what you send in registerUrls()
 */
// STK Push - Enhanced with WebSocket support
router.post('/hooks/stk-callback', ...webhookMiddleware, async (req, res, next) => {
    // First, let the original controller handle the callback
    await handleMpesaCallback(req, res, (err) => {
        if (err) return next(err);
        
        // 👇 AFTER callback is processed, emit WebSocket update
        if (req.refinedData) {
            const { checkoutRequestId, resultCode, resultDesc, transId } = req.refinedData;
            const status = resultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            // Emit real-time update to the client
            emitPaymentToClient(checkoutRequestId, status, {
                resultCode,
                resultDesc,
                receiptNumber: transId,
                message: resultCode === 0 ? 'Payment successful!' : 'Payment failed'
            });
        }
    });
});

// C2B (Paybill/Till)
router.post('/payments/c2b-confirmation', ...webhookMiddleware, async (req, res, next) => {
    await handleC2BConfirmation(req, res, (err) => {
        if (err) return next(err);
        
        // 👆 Add WebSocket support for C2B if needed
        // C2B payments typically don't have real-time frontend updates
        // But you could add if you have a dashboard
    });
});

router.post('/payments/c2b-validation', ...webhookMiddleware, handleC2BValidation);

export default router;