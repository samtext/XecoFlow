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
         * Safaricom expects a 200 OK within seconds. 
         */
        res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Success" 
        });

        // 3. Background processing (Async)
        console.log(`⏳ [PROCESSING]: Updating database with callback data...`);
        
        /**
         * 🛠️ FIX: We extract the raw data and ensure it's a clean object for the service.
         * If the service expects a specific metadata structure, we ensure req.body is passed cleanly.
         */
        const callbackData = req.body;

        // Using the service we fixed earlier which now handles the .trim() and DB updates
        mpesaService.handleCallback(callbackData, ipAddress)
            .then(() => {
                console.log(`✅ [DB UPDATE]: Transaction record finalized.`);
            })
            .catch(err => {
                console.error("❌ [DATABASE ERROR]:", err.message);
            });

    } catch (error) {
        console.error("❌ [CALLBACK_CONTROLLER_CRITICAL_ERROR]:", error.message);
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
        
        /**
         * 🛠️ FIX: Structuring the C2B data explicitly to ensure the Service 
         * picks it up as a proper object for the 'metadata' jsonb column.
         */
        const c2bData = {
            ...req.body,
            source_ip: ipAddress,
            received_at: new Date().toISOString()
        };

        mpesaService.handleC2BConfirmation(c2bData)
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