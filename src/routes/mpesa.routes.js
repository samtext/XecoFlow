import express from 'express';
import mpesaService from '../services/mpesa.service.js';

const router = express.Router();

/**
 * MPESA CALLBACK ROUTE
 * URL: https://your-public-url.com/api/v1/mpesa/callback
 */
router.post('/callback', async (req, res) => {
    try {
        // 1. Log the raw hit for debugging
        console.log("📥 MPESA CALLBACK RECEIVED!");
        
        // 2. Extract the STK Callback body
        const { stkCallback } = req.body.Body;

        // 3. Send immediate acknowledgment to Safaricom (Crucial!)
        // If you don't do this, Safaricom will think your server is down and retry 20+ times.
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Success"
        });

        // 4. Process the logic in the background so we don't block Safaricom
        await mpesaService.handleCallback(stkCallback);

    } catch (error) {
        console.error("❌ CALLBACK_ROUTE_ERROR:", error.message);
        // Still send a 200 to Safaricom so they stop retrying
        res.status(200).json({ ResultCode: 1, ResultDesc: "Internal Error" });
    }
});

export default router;