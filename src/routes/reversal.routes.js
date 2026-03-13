// src/routes/reversal.routes.js
import express from 'express';
import { handleReversalResult, handleReversalTimeout } from '../controllers/reversalController.js';
import { mpesaIpWhitelist } from '../middlewares/mpesa.middleware.js';

const router = express.Router();

// M-PESA callbacks for reversal results
router.post('/result', mpesaIpWhitelist, handleReversalResult);
router.post('/timeout', mpesaIpWhitelist, handleReversalTimeout);

export default router;