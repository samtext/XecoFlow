import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: callbackController
 * Job: Receive and log the result from Safaricom
 */

// Helper to get the most accurate IP on Render
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.socket.remoteAddress || 
           '0.0.0.0';
};

// --- 🛡️ LANE 1: STK PUSH CALLBACK ---
export const handleMpesaCallback = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);

        console.log(`\n=========================================`);
        console.log(`📥 [STK CALLBACK RECEIVED]`);
        console.log(`🌐 Source IP: ${ipAddress}`);
        console.log(`📦 Raw Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        // 2. IMMEDIATE RESPONSE (CRITICAL)
        res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Success" 
        });

        // 3. Background processing
        const callbackData = req.body;
        mpesaService.handleCallback(callbackData, ipAddress)
            .then(() => console.log(`✅ [DB UPDATE]: STK record finalized.`))
            .catch(err => console.error("❌ [DATABASE ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [CALLBACK_CONTROLLER_CRITICAL_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).send("OK");
    }
};

// --- 🛡️ LANE 2: C2B VALIDATION ---
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`\n=========================================`);
        console.log(`🔍 [C2B VALIDATION REQUEST]`);
        console.log(`📦 Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        /**
         * Safaricom expects a specific JSON response to allow/reject.
         * ResultCode 0 = Accept, any other code = Reject.
         */
        return res.status(200).json({
            "ResultCode": 0,
            "ResultDesc": "Accepted"
        });
    } catch (error) {
        console.error("❌ [C2B_VALIDATION_ERROR]:", error.message);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

// --- 🛡️ LANE 2: C2B CONFIRMATION ---
export const handleC2BConfirmation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);

        console.log(`\n=========================================`);
        console.log(`💰 [C2B CONFIRMATION RECEIVED]`);
        console.log(`🌐 Source IP: ${ipAddress}`);
        console.log(`📦 Raw Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        // 1. Immediate response to Safaricom
        res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

        // 2. Data Structuring for Database
        const c2bData = {
            transaction_id: req.body.TransID,
            amount: req.body.TransAmount,
            phone: req.body.MSISDN,
            bill_ref: req.body.BillRefNumber,
            full_name: `${req.body.FirstName || ''} ${req.body.MiddleName || ''} ${req.body.LastName || ''}`.trim(),
            raw_data: req.body, // Store everything for audit
            source_ip: ipAddress,
            received_at: new Date().toISOString()
        };

        // 3. Hand off to service
        mpesaService.handleC2BConfirmation(c2bData)
            .then(() => console.log(`✅ [C2B DB UPDATE]: Payment logged.`))
            .catch(err => console.error("❌ [C2B DATABASE ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [C2B_CONFIRMATION_CRITICAL_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).send("OK");
    }
};