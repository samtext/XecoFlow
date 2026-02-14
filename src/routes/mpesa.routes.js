import express from 'express';
import mpesaService from '../services/mpesa.service.js';
import { db } from '../config/db.js'; // Ensure DB is imported for status checks

const router = express.Router();

/**
 * 1. INITIATE STK PUSH
 * Path: /api/v1/stkpush
 */
router.post('/stkpush', async (req, res) => {
    try {
        // UPDATED: Destructure userId from req.body to match your MpesaService requirements
        const { phoneNumber, amount, userId } = req.body;
        
        // UPDATED: Added userId check to prevent calling the service with missing data
        if (!phoneNumber || !amount || !userId) {
            return res.status(400).json({ error: "Phone number, amount, and userId are required" });
        }

        console.log(`🚀 INITIATING STK PUSH FOR: ${phoneNumber} Amount: ${amount} User: ${userId}`);
        
        // UPDATED: Added 'userId' as the 3rd argument to satisfy MpesaService.initiateSTKPush(phoneNumber, amount, userId)
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        return res.status(200).json(response);
    } catch (error) {
        console.error("❌ STK_PUSH_ROUTE_ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 2. TRANSACTION STATUS CHECK
 * New Endpoint for Frontend Polling
 * Path: /api/v1/status/:checkoutRequestId
 */
router.get('/status/:checkoutRequestId', async (req, res) => {
    try {
        const { checkoutRequestId } = req.params;

        // Query your database for the current status of this transaction
        const { data, error } = await db.airtime_transactions()
            .select('status, mpesa_receipt')
            .eq('checkout_id', checkoutRequestId);

        if (error) throw error;

        // Check if transaction exists
        if (!data || data.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Transaction not found" 
            });
        }

        // Return the most recent transaction status
        return res.status(200).json({
            success: true,
            status: data[0]?.status || 'PENDING',
            receipt: data[0]?.mpesa_receipt
        });

    } catch (error) {
        console.error("❌ STATUS_CHECK_ERROR:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: "Could not fetch status" 
        });
    }
});

/**
 * 3. MPESA CALLBACK ROUTE
 * Path: /api/v1/mpesa/callback
 * UPDATED: Changed path from /payments/callback to /mpesa/callback to match your MpesaService payload
 */
router.post('/mpesa/callback', async (req, res) => {
    try {
        console.log("📥 MPESA CALLBACK RECEIVED!");

        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.socket.remoteAddress || 
                         '0.0.0.0';

        if (req.body.TransactionType && !req.body.TransID) {
            console.log("🛡️ VALIDATION REQUEST: Accepted for IP:", ipAddress);
            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        }

        const isStk = req.body?.Body?.stkCallback;
        const isC2B = req.body?.TransID;

        if (!isStk && !isC2B) {
            console.warn("⚠️ INVALID CALLBACK PAYLOAD: Unknown structure");
            return res.status(400).json({ 
                ResultCode: 1, 
                ResultDesc: "Invalid Payload" 
            });
        }

        res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Success"
        });

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