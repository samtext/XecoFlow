import mpesaService from '../services/mpesa.service.js';

export const handleMpesaCallback = async (req, res) => {
    try {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.socket.remoteAddress || 
                         '0.0.0.0';

        // Immediate response to Safaricom
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // Background processing
        mpesaService.handleCallback(req.body, ipAddress).catch(err => {
            console.error("❌ Background DB Process Error:", err.message);
        });
    } catch (error) {
        console.error("❌ CALLBACK_CONTROLLER_ERROR:", error.message);
    }
};