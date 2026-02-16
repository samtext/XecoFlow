import express from 'express';
// Import the Managers (Controllers) we created
import { initiatePayment } from '../controllers/paymentController.js';
import { handleMpesaCallback } from '../controllers/callbackController.js';

const router = express.Router();

/**
 * 1. INITIATE STK PUSH
 * Path: /api/v1/mpesa/stkpush
 * Logic moved to: paymentController.initiatePayment
 */
router.post('/stkpush', initiatePayment);

/**
 * 2. MPESA CALLBACK ROUTE
 * Path: /api/v1/mpesa/callback
 * Logic moved to: callbackController.handleMpesaCallback
 */
router.post('/callback', handleMpesaCallback);

export default router;