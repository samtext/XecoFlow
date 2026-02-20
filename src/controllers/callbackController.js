import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: callbackController
 * Optimized for M-Pesa C2B v2 & STK Push
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
        console.log(`📥 [STK CALLBACK]: Received from ${ipAddress}`);

        // 1. Send response immediately to M-Pesa (prevents retries)
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 2. Process in background
        mpesaService.handleCallback(req.body, ipAddress)
            .catch(err => console.error("❌ [STK DB ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [STK_CRITICAL_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).json({ ResultCode: 1, ResultDesc: "Internal Error" });
    }
};

// --- 🛡️ LANE 2: C2B VALIDATION (The "Gatekeeper") ---
export const handleC2BValidation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        // C2B v2 Payload destructuring
        const { TransID, MSISDN, TransAmount, BillRefNumber } = req.body;
        
        console.log(`🔍 [V2_VALIDATION]: ID ${TransID} | From ${MSISDN} | Amount ${TransAmount} | IP ${ipAddress}`);

        /**
         * 🚨 CRITICAL: Validation must return ResultCode 0 for Safaricom to complete the payment.
         * If you want to reject (e.g., wrong BillRef), return ResultCode 1.
         */
        return res.status(200).json({
            "ResultCode": 0,
            "ResultDesc": "Accepted"
        });
    } catch (error) {
        console.error("❌ [C2B_VAL_ERROR]:", error.message);
        // Always accept by default in case of code error to avoid blocking real payments
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

// --- 🛡️ LANE 3: C2B CONFIRMATION (The "Money" Record) ---
export const handleC2BConfirmation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);
        
        /**
         * C2B v2 Payloads are flat. Example keys:
         * TransID, TransTime, TransAmount, BusinessShortCode, BillRefNumber, MSISDN, FirstName, etc.
         */
        const { TransID, TransAmount, MSISDN, BillRefNumber, FirstName, MiddleName, LastName } = req.body;

        console.log(`💰 [V2_CONFIRMATION]: Payment ${TransID} | ${TransAmount} KES | From ${MSISDN}`);

        // 1. Immediate acknowledgment to Safaricom
        res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

        // 2. Data Structuring for Service
        const c2bData = {
            transaction_id: TransID,
            amount: TransAmount,
            phone: MSISDN,
            bill_ref: BillRefNumber,
            full_name: `${FirstName || ''} ${MiddleName || ''} ${LastName || ''}`.trim() || 'M-PESA CUSTOMER',
            raw_data: req.body,
            source_ip: ipAddress,
            received_at: new Date().toISOString()
        };

        // 3. Background Processing to Database
        mpesaService.handleC2BConfirmation(c2bData)
            .then(() => console.log(`✅ [V2_C2B_DB]: Saved Transaction ${TransID}`))
            .catch(err => console.error("❌ [V2_C2B_DB_ERROR]:", err.message));

    } catch (error) {
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).json({ "ResultCode": 1, "ResultDesc": "Failed" });
    }
};