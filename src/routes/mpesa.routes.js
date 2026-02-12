import express from 'express';
import mpesaService from '../services/mpesa.service.js';

const router = express.Router();

/**
 * MPESA CALLBACK ROUTE
 * Handshake endpoint for Safaricom to report transaction results.
 */
router.post('/callback', async (req, res) => {
    try {
        console.log("📥 MPESA CALLBACK RECEIVED!");

        // 1. Immediate Validation
        // If the body doesn't have the Body.stkCallback structure, it's not from Safaricom.
        if (!req.body?.Body?.stkCallback) {
            console.warn("⚠️ INVALID CALLBACK PAYLOAD: Missing Body.stkCallback");
            return res.status(400).json({ 
                ResultCode: 1, 
                ResultDesc: "Invalid Payload" 
            });
        }

        /**
         * 2. Send acknowledgment to Safaricom (Crucial!)
         * We respond with a 200 OK immediately so Safaricom doesn't 
         * keep retrying the same request for the next 24 hours.
         */
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Success"
        });

        /**
         * 3. Process DB logic in the background
         * We pass the full req.body to the service handler.
         * By not using 'await' here, the HTTP response above finishes instantly,
         * keeping the connection window short and efficient.
         */
        mpesaService.handleCallback(req.body).catch(err => {
            console.error("❌ Background DB Process Error:", err.message);
        });

    } catch (error) {
        console.error("❌ CALLBACK_ROUTE_ERROR:", error.message);
        
        // 4. Emergency Response
        // Only attempt to send a response if headers haven't already been sent.
        if (!res.headersSent) {
            return res.status(200).json({ 
                ResultCode: 1, 
                ResultDesc: "Internal Error" 
            });
        }
    }
});

export default router;