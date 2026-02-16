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

        // 1. ENHANCED LOGGING: See the raw data from Safaricom
        console.log(`\n=========================================`);
        console.log(`📥 [STK CALLBACK RECEIVED]`);
        console.log(`🌐 Source IP: ${ipAddress}`);
        
        // This logs the actual payment result (Success/Fail/Cancel)
        console.log(`📦 Raw Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        /**
         * 2. IMMEDIATE RESPONSE (CRITICAL)
         * Safaricom expects a 200 OK within seconds. If we wait for the 
         * database to finish, Safaricom might timeout and send the 
         * same callback again, causing duplicate transactions.
         */
        res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Success" 
        });

        // 3. Background processing (Async)
        console.log(`⏳ [PROCESSING]: Updating database with callback data...`);
        
        // Using the service we fixed earlier which now handles the .trim() and DB updates
        mpesaService.handleCallback(req.body, ipAddress)
            .then(() => {
                console.log(`✅ [DB UPDATE]: Transaction record finalized.`);
            })
            .catch(err => {
                console.error("❌ [DATABASE ERROR]:", err.message);
            });

    } catch (error) {
        console.error("❌ [CALLBACK_CONTROLLER_CRITICAL_ERROR]:", error.message);
        // We still send 200 to Safaricom even if our internal logging fails 
        // to prevent them from retrying an already processed payment.
        if (!res.headersSent) res.status(200).send("OK");
    }
};

// --- 🛡️ LANE 2: C2B VALIDATION (Manual Payment Check) ---
export const handleC2BValidation = async (req, res) => {
    try {
        console.log(`\n=========================================`);
        console.log(`🔍 [C2B VALIDATION REQUEST]`);
        console.log(`📦 Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        /**
         * Safaricom is asking: "Should I allow this manual payment?"
         * We return ResultCode 0 to accept. 
         * Note: Validation is synchronous; Safaricom waits for this answer.
         */
        return res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Accepted"
        });
    } catch (error) {
        console.error("❌ [C2B_VALIDATION_ERROR]:", error.message);
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
};

// --- 🛡️ LANE 2: C2B CONFIRMATION (Manual Payment Finalized) ---
export const handleC2BConfirmation = async (req, res) => {
    try {
        const ipAddress = getClientIp(req);

        console.log(`\n=========================================`);
        console.log(`💰 [C2B CONFIRMATION RECEIVED]`);
        console.log(`🌐 Source IP: ${ipAddress}`);
        console.log(`📦 Raw Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        // 1. Immediate response to Safaricom
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // 2. Hand off to the service for DB logging
        console.log(`⏳ [PROCESSING]: Processing manual payment in database...`);
        
        mpesaService.handleC2BConfirmation(req.body)
            .then(() => {
                console.log(`✅ [C2B DB UPDATE]: Manual payment record created.`);
            })
            .catch(err => {
                console.error("❌ [C2B DATABASE ERROR]:", err.message);
            });

    } catch (error) {
        console.error("❌ [C2B_CONFIRMATION_CRITICAL_ERROR]:", error.message);
        if (!res.headersSent) res.status(200).send("OK");
    }
};