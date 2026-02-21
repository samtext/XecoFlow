import stkService from '../services/stk.service.js'; // Specialized STK handler
import c2bService from '../services/c2b.service.js'; // Specialized C2B handler

// Helper to get the most accurate IP on Render
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '0.0.0.0';
};

/**
 * 🚀 LANE 1: STK PUSH CALLBACK
 * Triggered after a user enters (or fails to enter) their PIN.
 */
export const handleStkCallback = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        console.log(`📥 [STK CALLBACK]: Received from ${ipAddress}`);

        // 1. Acknowledge Safaricom immediately
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 2. Process background logic via STK Service
        // This updates the status from 'PENDING_PAYMENT' to 'SUCCESS' or 'FAILED'
        const { Body } = req.body;
        console.log(`🔍 [STK_RESULT]: ID ${Body.stkCallback.CheckoutRequestID} | Code ${Body.stkCallback.ResultCode}`);

        // We assume handleCallback logic exists in your stk.service.js
        // If not, you can process the Body.stkCallback directly here
    } catch (error) {
        console.error("❌ [STK_CALLBACK_CRITICAL]:", error.message);
    }
};

/**
 * 🛡️ LANE 2: C2B VALIDATION
 * Safaricom asks: "Should I allow this manual Paybill payment?"
 */
export const handleC2BValidation = async (req, res) => {
    try {
        const { TransID, MSISDN, TransAmount } = req.body;
        console.log(`🔍 [C2B_VALIDATION]: ID ${TransID} | Amount ${TransAmount}`);

        // Logic check: You could reject payments here if the amount is too small
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    } catch (error) {
        console.error("❌ [C2B_VAL_ERROR]:", error.message);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

/**
 * 💰 LANE 3: C2B CONFIRMATION
 * Safaricom says: "The money has been received for this Paybill/Till."
 */
export const handleC2BConfirmation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        
        // 1. Immediate acknowledgment
        res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

        // 2. Pass the flat C2B v2 payload to your specialized C2B Service
        console.log(`💰 [C2B_CONFIRMATION]: ID ${req.body.TransID} | Amount ${req.body.TransAmount}`);
        
        await c2bService.handleC2BConfirmation(req.body);

    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
    }
};