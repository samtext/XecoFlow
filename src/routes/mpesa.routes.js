import express from 'express';
import mpesaService from '../services/mpesa.service.js';

const router = express.Router();

/**
 * 1. INITIATE STK PUSH
 * Path: /api/v1/mpesa/stkpush
 */
router.post('/stkpush', async (req, res) => {
    try {
        const { phoneNumber, amount, userId } = req.body;
        
        if (!phoneNumber || !amount || !userId) {
            return res.status(400).json({ error: "Phone number, amount, and userId are required" });
        }

        console.log(`🚀 INITIATING STK PUSH FOR: ${phoneNumber} Amount: ${amount}`);
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        return res.status(200).json(response);
    } catch (error) {
        console.error("❌ STK_PUSH_ROUTE_ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 2. MPESA CALLBACK ROUTE
 * Path: /api/v1/mpesa/callback
 */
router.post('/callback', async (req, res) => {
    try {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.socket.remoteAddress || 
                         '0.0.0.0';

        // Immediate response to Safaricom to acknowledge receipt
        res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

        // Background processing so we don't block the Safaricom response
        mpesaService.handleCallback(req.body, ipAddress).catch(err => {
            console.error("❌ Background DB Process Error:", err.message);
        });
    } catch (error) {
        console.error("❌ CALLBACK_ROUTE_ERROR:", error.message);
    }
});

export default router;