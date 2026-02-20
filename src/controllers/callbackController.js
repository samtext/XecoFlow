import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: callbackController
 */

// Helper to get the most accurate IP on Render (Checks the first IP in the forwarded chain)
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '0.0.0.0';
};

// --- 🛡️ LANE 1: STK PUSH CALLBACK ---
export const handleMpesaCallback = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        console.log(`📥 [STK CALLBACK]: From ${ipAddress}`);

        // 1. Send response immediately
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 2. Background process
        mpesaService.handleCallback(req.body, ipAddress)
            .catch(err => console.error("❌ [STK DB ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [STK_CRITICAL_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).send("OK");
    }
};

// --- 🛡️ LANE 2: C2B VALIDATION (The "Gatekeeper") ---
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`🔍 [VALIDATION]: Received from ${getClientIp(req)}`);
        console.log(`📦 Data:`, JSON.stringify(req.body));

        /**
         * 🚨 CRITICAL: Safaricom will NOT call Confirmation if this 
         * doesn't return ResultCode 0 within ~5 seconds.
         */
        return res.status(200).json({
            "ResultCode": 0,
            "ResultDesc": "Accepted"
        });
    } catch (error) {
        console.error("❌ [C2B_VAL_ERROR]:", error.message);
        // Default to Accept so you don't lose money if your code bugs out
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

// --- 🛡️ LANE 3: C2B CONFIRMATION (The "Money" Record) ---
export const handleC2BConfirmation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        console.log(`💰 [CONFIRMATION]: Payment received from ${ipAddress}`);

        // 1. Immediate response
        res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

        // 2. Data Structuring
        const c2bData = {
            transaction_id: req.body.TransID,
            amount: req.body.TransAmount,
            phone: req.body.MSISDN,
            bill_ref: req.body.BillRefNumber,
            full_name: `${req.body.FirstName || ''} ${req.body.MiddleName || ''} ${req.body.LastName || ''}`.trim(),
            raw_data: req.body,
            source_ip: ipAddress,
            received_at: new Date().toISOString()
        };

        // 3. Process to DB
        mpesaService.handleC2BConfirmation(c2bData)
            .then(() => console.log(`✅ [C2B DB]: Saved ${c2bData.transaction_id}`))
            .catch(err => console.error("❌ [C2B DB ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).send("OK");
    }
};