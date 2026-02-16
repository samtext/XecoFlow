import express from 'express';
// We use curly braces because we are using 'Named Exports' in the controllers
import { initiatePayment } from '../controllers/paymentController.js';
import { handleMpesaCallback } from '../controllers/callbackController.js';

const router = express.Router();

/**
 * 1. INITIATE STK PUSH
 * Full Path: /api/v1/mpesa/stkpush
 */
router.post('/stkpush', initiatePayment);

/**
 * 2. MPESA CALLBACK ROUTE
 * Full Path: /api/v1/mpesa/callback
 */
router.post('/callback', handleMpesaCallback);

export default router;