import stkService from '../services/stk.service.js';
import c2bService from '../services/c2b.service.js';

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '0.0.0.0';
};

/**
 * 🚀 LANE 1: STK PUSH CALLBACK
 * Unchanged: Safely handles STK results in the background.
 */
export const handleMpesaCallback = async (req, res) => {
    // 1. ACKNOWLEDGE IMMEDIATELY (Crucial for Safaricom)
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // 2. Process in the background so we don't hold the connection
    try {
        const ipAddress = getClientIp(req);
        const { Body } = req.body;

        // Diagnostic log: See exactly what arrived
        console.log(`📥 [STK_WEBHOOK]: From ${ipAddress}`);

        if (!Body || !Body.stkCallback) {
            console.warn("⚠️ [INVALID_PAYLOAD]: Payload missing 'Body.stkCallback' structure.");
            return;
        }

        const callbackData = Body.stkCallback;
        const { CheckoutRequestID, ResultCode, ResultDesc } = callbackData;

        console.log(`📦 [TRANSACTION]: ID ${CheckoutRequestID} | Status: ${ResultCode} (${ResultDesc})`);

        // Only process success metadata if ResultCode is 0
        if (ResultCode === 0 && callbackData.CallbackMetadata) {
            console.log("✅ [SUCCESS_DATA]:", JSON.stringify(callbackData.CallbackMetadata, null, 2));
        }

        // Delegate to service with its own error boundary
        try {
            await stkService.handleStkResult(callbackData);
        } catch (serviceErr) {
            console.error("❌ [STK_SERVICE_ERROR]:", serviceErr.message);
        }

    } catch (error) {
        console.error("❌ [CRITICAL_CALLBACK_FAIL]:", error.message);
    }
};

/**
 * 🛡️ LANE 2: C2B VALIDATION
 * Updated: Passes data to c2bService for any pre-approval logic.
 */
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`🔍 [C2B_VALIDATION]: ID ${req.body.TransID} | Amount: ${req.body.TransAmount}`);
        
        // Pass to service if you have logic to check user accounts/min-amounts
        await c2bService.handleValidation(req.body);

        // Safaricom expects a specific JSON format for validation
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    } catch (error) {
        console.error("❌ [C2B_VALID_ERROR]:", error.message);
        // Default to Accepted even on error to prevent blocking payments unless necessary
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

/**
 * 💰 LANE 3: C2B CONFIRMATION
 * Updated: Linked to c2bService.handleConfirmation to save C2B receipts to DB.
 */
export const handleC2BConfirmation = async (req, res) => {
    // Immediate ACK (Required: M-Pesa will timeout in 10s otherwise)
    res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

    try {
        console.log(`💰 [C2B_CONFIRMATION]: TransID: ${req.body.TransID} | Amount: ${req.body.TransAmount}`);
        
        // Logic for recording the transaction and logging to audit trail
        await c2bService.handleConfirmation(req.body);
        
    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
    }
};