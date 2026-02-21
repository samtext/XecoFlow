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
        console.log(`📥 [STK CALLBACK]: Received from ${ipAddress}`);

        // 1. Immediate response to Safaricom
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 2. Background processing
        const { Body } = req.body;
        if (Body?.stkCallback) {
            // Logic moved to specialist service
            await stkService.handleStkResult(Body.stkCallback);
        }
    } catch (error) {
        console.error("❌ [STK_CALLBACK_ERROR]:", error.message);
    }
};

/**
 * 🛡️ LANE 2: C2B VALIDATION
 * Matches the route: /hooks/v2-validation
 */
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`🔍 [C2B_VALIDATION]: ID ${req.body.TransID}`);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    } catch (error) {
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
        console.log(`💰 [C2B_CONFIRMATION]: ID ${req.body.TransID}`);
        await c2bService.handleC2BConfirmation(req.body);
    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
    }
};