import express from 'express';
import { handleReconResult, handleReconTimeout } from '../controllers/gateway.controller.js';

const router = express.Router();

// 📡 These match the URLs in your ReconService
router.post('/recon-result', handleReconResult);
router.post('/recon-timeout', handleReconTimeout);

export default router;