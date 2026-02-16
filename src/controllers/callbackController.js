import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: callbackController
 * Job: Receive and log the result from Safaricom
 */
export const handleMpesaCallback = async (req, res) => {
    try {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.socket.remoteAddress || 
                         '0.0.0.0';

        // 1. ENHANCED LOGGING: See the raw data from Safaricom
        console.log(`\n=========================================`);
        console.log(`📥 [CALLBACK RECEIVED]`);
        console.log(`🌐 Source IP: ${ipAddress}`);
        
        // This logs the actual payment result (Success/Fail/Cancel)
        console.log(`📦 Raw Payload:`, JSON.stringify(req.body, null, 2));
        console.log(`=========================================\n`);

        // 2. Immediate response to Safaricom (Critical to prevent retries)
        res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Success" 
        });

        // 3. Background processing
        // We log here to track the hand-off to the Database Service
        console.log(`⏳ [PROCESSING]: Updating database with callback data...`);
        
        mpesaService.handleCallback(req.body, ipAddress)
            .then(() => {
                console.log(`✅ [DB UPDATE]: Transaction record finalized.`);
            })
            .catch(err => {
                console.error("❌ [DATABASE ERROR]:", err.message);
            });

    } catch (error) {
        console.error("❌ [CALLBACK_CONTROLLER_CRITICAL_ERROR]:", error.message);
    }
};