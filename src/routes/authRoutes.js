import express from 'express';
import { 
  loginAdmin, 
  getAdminProfile, 
  updateAdminPassword 
} from '../controllers/adminController.js';
import { protect, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate admin & get token
 * @access  Public
 */
router.post('/login', loginAdmin);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current logged-in admin profile
 * @access  Private
 */
router.get('/profile', protect, getAdminProfile);

/**
 * @route   PUT /api/auth/update-password
 * @desc    Update admin password
 * @access  Private
 */
router.put('/update-password', protect, updateAdminPassword);

/**
 * @route   GET /api/auth/admin-list
 * @desc    Get all admins (SuperAdmin only)
 * @access  Private/SuperAdmin
 */
// This is where your 'authorize' middleware shines
router.get('/admin-list', protect, authorize('superadmin'), async (req, res) => {
    // Example inline logic or call a function from adminController
    res.status(200).json({ message: "Access granted to admin directory" });
});

export default router;