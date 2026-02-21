import stkService from '../services/stk.service.js';
import c2bService from '../services/c2b.service.js';

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '0.0.0.0';
};

/**
 * 🚀 LANE 1: STK PUSH CALLBACK
 * Matches the route: /hooks/stk-callback
 */
export const handleMpesaCallback = async (req, res) => {
    // 1. Immediate response to Safaricom 
    // We do this first to ensure Safaricom doesn't time out or retry
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    try {
        const ipAddress = getClientIp(req);
        
        console.log(`\n📥 [STK CALLBACK RECEIVED] From IP: ${ipAddress}`);
        
        // 2. Background processing
        const { Body } = req.body;
        
        if (Body?.stkCallback) {
            const callbackData = Body.stkCallback;
            const checkoutID = callbackData.CheckoutRequestID;
            const resultCode = callbackData.ResultCode;
            
            console.log(`📦 [PAYLOAD]: ${checkoutID} | Result: ${resultCode}`);

            // Safaricom Sandbox debugging: Log the full metadata if successful
            if (resultCode === 0) {
                console.log('✅ [SUCCESS_METADATA]:', JSON.stringify(callbackData.CallbackMetadata, null, 2));
            }

            // Wrap service call in a try-catch so it doesn't kill the callback process
            try {
                await stkService.handleStkResult(callbackData);
            } catch (serviceErr) {
                console.error("❌ [SERVICE_PROCESSING_FAIL]:", serviceErr.message);
            }
        } else {
            console.warn("⚠️ [RAW_BODY_DEBUG]: Received unknown structure:", JSON.stringify(req.body));
        }
    } catch (error) {
        console.error("❌ [STK_CALLBACK_CRITICAL_ERROR]:", error.message);
    }
};

/**
 * 🛡️ LANE 2: C2B VALIDATION
 * Matches the route: /hooks/v2-validation
 */
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`🔍 [C2B_VALIDATION]: ID ${req.body.TransID} | Amount: ${req.body.TransAmount}`);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    } catch (error) {
        console.error("❌ [C2B_VALID_ERROR]:", error.message);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

/**
 * 💰 LANE 3: C2B CONFIRMATION
 * Matches the route: /hooks/v2-confirmation
 */
export const handleC2BConfirmation = async (req, res) => {
    // 1. Immediate response
    res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

    try {
        console.log(`💰 [C2B_CONFIRMATION RECEIVED]: TransID: ${req.body.TransID}`);
        await c2bService.handleC2BConfirmation(req.body);
    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
    }
};