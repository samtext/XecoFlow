import express from 'express';
import mpesaService from '../services/mpesa.service.js';

const router = express.Router();

/**
 * MPESA CALLBACK ROUTE
 * Handshake endpoint for Safaricom to report transaction results.
 * Path: /api/v1/payments/callback
 */
router.post('/payments/callback', async (req, res) => {
    try {
        console.log("📥 MPESA CALLBACK RECEIVED!");

        // --- NEW: IP EXTRACTION ---
        // Grabs the real client IP behind Render's proxy
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.socket.remoteAddress || 
                         '0.0.0.0';

        // --- NEW: C2B VALIDATION HANDLER ---
        // Manual "Lipa na M-Pesa" payments send a Validation request first.
        // If it's a Validation request (has TransactionType but no TransID), we accept it.
        if (req.body.TransactionType && !req.body.TransID) {
            console.log("🛡️ VALIDATION REQUEST: Accepted for IP:", ipAddress);
            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        }

        // 1. Immediate Validation (Original Logic Kept)
        // Note: For Manual C2B, the structure is slightly different than STK.
        // We only enforce this for STK push responses.
        const isStk = req.body?.Body?.stkCallback;
        const isC2B = req.body?.TransID;

        if (!isStk && !isC2B) {
            console.warn("⚠️ INVALID CALLBACK PAYLOAD: Unknown structure");
            return res.status(400).json({ 
                ResultCode: 1, 
                ResultDesc: "Invalid Payload" 
            });
        }

        /**
         * 2. Send acknowledgment to Safaricom (Original Logic Kept)
         */
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Success"
        });

        /**
         * 3. Process DB logic in the background (Original Logic Updated with IP)
         * Now passing 'ipAddress' as the second argument to fix your empty DB column.
         */
        mpesaService.handleCallback(req.body, ipAddress).catch(err => {
            console.error("❌ Background DB Process Error:", err.message);
        });

    } catch (error) {
        console.error("❌ CALLBACK_ROUTE_ERROR:", error.message);
        
        if (!res.headersSent) {
            return res.status(200).json({ 
                ResultCode: 1, 
                ResultDesc: "Internal Error" 
            });
        }
    }
});

export default router;