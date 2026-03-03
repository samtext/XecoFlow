// backend/src/routes/adminRoutes.js
import express from 'express';
import { protect, authorize } from '../middlewares/auth.middleware.js'; // Using your existing middleware
import {
  getDashboardStats,
  getTransactions,
  getTransactionById,
  getSalesOverview,
  exportTransactions
} from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect); // First verify the user is authenticated
router.use(authorize('admin', 'superadmin', 'manager')); // Then check they have admin role

// ==========================================
// DASHBOARD ROUTES
// ==========================================
router.get('/dashboard/stats', getDashboardStats);

// ==========================================
// SALES OVERVIEW (for charts)
// ==========================================
router.get('/sales/overview', getSalesOverview);

// ==========================================
// TRANSACTION MANAGEMENT
// ==========================================
router.get('/transactions', getTransactions);
router.get('/transactions/export', exportTransactions);
router.get('/transactions/:id', getTransactionById);

export default router;