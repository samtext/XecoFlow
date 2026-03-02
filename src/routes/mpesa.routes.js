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
import { storeSocketMapping, emitPaymentToClient, getSocketId } from '../../socket/helper.js'; // 👈 Added getSocketId

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
        console.log(`📝 Result Description: ${req.refinedData.resultDesc}`);
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
router.post('/hooks/stk-callback', ...webhookMiddleware, async (req, res) => {
    try {
        console.log('📞 [STK_CALLBACK] Received from Safaricom');
        
        // Process the callback
        await handleMpesaCallback(req, res);
        
        // 👇 EMIT WEBSOCKET UPDATE - THIS IS CRITICAL
        if (req.refinedData) {
            const { checkoutRequestId, resultCode, resultDesc, transId } = req.refinedData;
            const status = resultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            console.log(`🔍 [WEBSOCKET_EMIT] Preparing to emit for ${checkoutRequestId}`);
            console.log(`   Status: ${status}, Result: ${resultCode} - ${resultDesc}`);
            
            // Get socketId from mapping
            const socketId = getSocketId(checkoutRequestId);
            console.log(`   Socket ID from mapping: ${socketId || 'NOT FOUND'}`);
            
            // Emit real-time update to the client
            if (socketId) {
                // Get io instance from app
                const io = req.app.get('io');
                
                if (io) {
                    io.to(socketId).emit('payment-update', {
                        checkoutId: checkoutRequestId,
                        status,
                        data: {
                            resultCode,
                            message: resultDesc,
                            receiptNumber: transId
                        }
                    });
                    console.log(`✅ [WEBSOCKET_EMIT] Successfully emitted to socket ${socketId}`);
                } else {
                    console.error('❌ [WEBSOCKET_EMIT] io not available in app');
                    // Fallback to helper function
                    emitPaymentToClient(checkoutRequestId, status, {
                        resultCode,
                        resultDesc,
                        receiptNumber: transId
                    });
                }
            } else {
                console.log(`⚠️ [WEBSOCKET_EMIT] No socket mapping found for ${checkoutRequestId}`);
                // Try fallback emission
                emitPaymentToClient(checkoutRequestId, status, {
                    resultCode,
                    resultDesc,
                    receiptNumber: transId
                });
            }
        } else {
            console.log('⚠️ [WEBSOCKET_EMIT] No refinedData available');
        }
        
    } catch (error) {
        console.error('❌ [STK_CALLBACK_ERROR]:', error);
        // Always respond with success to M-Pesa
        res.json({
            ResultCode: 0,
            ResultDesc: "Success"
        });
    }
});

// C2B (Paybill/Till)
router.post('/payments/c2b-confirmation', ...webhookMiddleware, async (req, res) => {
    try {
        await handleC2BConfirmation(req, res);
        
        // Add WebSocket support for C2B if needed
        // You can emit updates for admin dashboard here
        
    } catch (error) {
        console.error('❌ [C2B_CONFIRMATION_ERROR]:', error);
        res.json({
            ResultCode: 0,
            ResultDesc: "Success"
        });
    }
});

router.post('/payments/c2b-validation', ...webhookMiddleware, (req, res) => {
    handleC2BValidation(req, res);
});

export default router;