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
    try {
        const ipAddress = getClientIp(req);
        
        // 1. Log the RAW body immediately to see what Safaricom is sending
        console.log(`📥 [STK CALLBACK RECEIVED] From IP: ${ipAddress}`);
        console.log('📦 [RAW PAYLOAD]:', JSON.stringify(req.body, null, 2));

        // 2. Immediate response to Safaricom (Crucial to prevent retries)
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 3. Background processing
        const { Body } = req.body;
        if (Body?.stkCallback) {
            const checkoutID = Body.stkCallback.CheckoutRequestID;
            const resultCode = Body.stkCallback.ResultCode;
            
            console.log(`🔍 [PROCESSING]: CheckoutID: ${checkoutID} | Result: ${resultCode === 0 ? 'SUCCESS' : 'FAILED/CANCELLED'}`);
            
            // Logic moved to specialist service
            await stkService.handleStkResult(Body.stkCallback);
        } else {
            console.warn("⚠️ [STK CALLBACK]: Received payload missing Body.stkCallback structure.");
        }
    } catch (error) {
        console.error("❌ [STK_CALLBACK_ERROR]:", error.message);
        // Note: Do not send error status to Safaricom here as we already sent 200
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
    try {
        // 1. Immediate response
        res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

        // 2. Logic delegated to specialist service
        console.log(`💰 [C2B_CONFIRMATION RECEIVED]: TransID: ${req.body.TransID}`);
        console.log('📦 [C2B DATA]:', JSON.stringify(req.body, null, 2));
        
        await c2bService.handleC2BConfirmation(req.body);
    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
    }
};