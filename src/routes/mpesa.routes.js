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
import { storeSocketMapping, emitPaymentToClient, getSocketId, getAllMappings } from '../../socket/helper.js';

const router = express.Router();

/**
 * 🚦 MIDDLEWARE: Network Logger & Data Extractor
 */
const networkLogger = (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    
    console.log(`\n-----------------------------------------`);
    console.log(`📡 [INCOMING]: ${req.method} ${req.originalUrl}`);
    console.log(`🏠 FROM_IP: ${clientIp}`);

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
    console.log('\n🔵 ===== ROUTE: STK PUSH =====');
    console.log('1. Full request body:', JSON.stringify(req.body, null, 2));
    console.log('2. Headers:', req.headers);
    
    const { socketId } = req.body;
    
    console.log('3. Extracted socketId:', socketId);
    
    if (socketId) {
        req.pendingSocketId = socketId;
        console.log('4. ✅ Stored socketId in req.pendingSocketId');
    } else {
        console.log('4. ❌ No socketId in request body');
    }
    
    console.log('🔵 ===== END ROUTE DEBUG =====\n');
    
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
router.get('/setup-urls', async (req, res) => {
    try {
        console.log("🔗 [SETUP]: Triggering Safaricom v2 registration...");
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
 */
// STK Push - Enhanced with WebSocket support
router.post('/hooks/stk-callback', ...webhookMiddleware, async (req, res) => {
    try {
        console.log('\n🟢 ===== STK CALLBACK RECEIVED =====');
        console.log('1. Timestamp:', new Date().toISOString());
        console.log('2. Full body:', JSON.stringify(req.body, null, 2));
        
        // Process the callback - NOTE: handleMpesaCallback might send a response
        await handleMpesaCallback(req, res);
        
        // 👇 EMIT WEBSOCKET UPDATE
        if (req.refinedData) {
            const { checkoutRequestId, resultCode, resultDesc, transId } = req.refinedData;
            const status = resultCode === 0 ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED';
            
            console.log('\n🟡 ===== WEBSOCKET EMIT PREPARATION =====');
            console.log('3. Checkout ID:', checkoutRequestId);
            console.log('4. Status:', status);
            console.log('5. Result:', resultCode, '-', resultDesc);
            
            // Check all current mappings
            console.log('6. All current mappings:', getAllMappings());
            
            // Get socketId from mapping
            const socketId = getSocketId(checkoutRequestId);
            console.log('7. Socket ID from mapping:', socketId || '❌ NOT FOUND');
            
            // Emit real-time update to the client
            if (socketId) {
                // Get io instance from app
                const io = req.app.get('io');
                console.log('8. io instance available:', !!io);
                
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
                    console.log('9. ✅ Successfully emitted to socket', socketId);
                } else {
                    console.error('9. ❌ io not available, using fallback');
                    emitPaymentToClient(checkoutRequestId, status, {
                        resultCode,
                        resultDesc,
                        receiptNumber: transId
                    });
                }
            } else {
                console.log('9. ⚠️ No socket mapping found, trying fallback emission');
                emitPaymentToClient(checkoutRequestId, status, {
                    resultCode,
                    resultDesc,
                    receiptNumber: transId
                });
            }
            console.log('🟡 ===== END WEBSOCKET PREP =====\n');
        } else {
            console.log('⚠️ No refinedData available in request');
        }
        
        console.log('🟢 ===== CALLBACK PROCESSING COMPLETE =====\n');
        
    } catch (error) {
        console.error('❌ [STK_CALLBACK_ERROR]:', error);
    } finally {
        // ⚠️ IMPORTANT: Only send response if not already sent
        // handleMpesaCallback might have already sent a response
        if (!res.headersSent) {
            res.json({
                ResultCode: 0,
                ResultDesc: "Success"
            });
        } else {
            console.log('⚠️ Response already sent, skipping final response');
        }
    }
});

// ============================================
// 🛡️ C2B VALIDATION - FIXED: Removed duplicate /payments
// ============================================
router.post('/c2b-validation', ...webhookMiddleware, async (req, res) => {
    console.log('\n⚪ ===== C2B VALIDATION RECEIVED =====');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Extract amount for logging
        const amount = parseFloat(req.body.TransAmount);
        console.log(`💰 Amount: KES ${amount}`);
        
        // Call controller - it has the KES 10 minimum logic!
        await handleC2BValidation(req, res);
        
        console.log('⚪ ===== C2B VALIDATION COMPLETE =====\n');
        
    } catch (error) {
        console.error('❌ [C2B_VALIDATION_ERROR]:', error.message);
        
        // Only send response if not already sent
        if (!res.headersSent) {
            // Fail open - accept to prevent M-PESA retries
            res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        }
    }
});

// ============================================
// 💰 C2B CONFIRMATION - FIXED: Removed duplicate /payments
// ============================================
router.post('/c2b-confirmation', ...webhookMiddleware, async (req, res) => {
    try {
        console.log('\n🟣 ===== C2B CONFIRMATION RECEIVED =====');
        console.log('Body:', JSON.stringify(req.body, null, 2));
        
        const amount = parseFloat(req.body.TransAmount);
        console.log(`💰 Amount: KES ${amount}`);
        
        // Check minimum amount BEFORE processing
        if (amount < 10) {
            console.log(`🚫 Amount below minimum - WILL NEED REFUND!`);
        }
        
        await handleC2BConfirmation(req, res);
        
        console.log('🟣 ===== C2B CONFIRMATION COMPLETE =====\n');
        
    } catch (error) {
        console.error('❌ [C2B_CONFIRMATION_ERROR]:', error);
        // Only send response if not already sent
        if (!res.headersSent) {
            res.json({
                ResultCode: 0,
                ResultDesc: "Success"
            });
        }
    }
});

// ============================================
// 🔍 DIAGNOSTIC: Check what Safaricom sees
// ============================================
router.get('/debug/endpoints', (req, res) => {
    res.json({
        validation: 'https://xecoflow.onrender.com/api/v1/payments/c2b-validation',
        confirmation: 'https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation',
        stk: 'https://xecoflow.onrender.com/api/v1/hooks/stk-callback',
        status: 'active',
        minimumAmount: 10
    });
});

export default router;