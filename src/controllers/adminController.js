import { supabase } from '../config/supabase.js';

// Safely import audit service with fallback
let logAdminActivity = async () => {}; // Default no-op function

try {
  const auditModule = await import('../services/auditService.js');
  logAdminActivity = auditModule.logAdminActivity;
  console.log('✅ Audit service loaded successfully');
} catch (error) {
  console.warn('⚠️ Audit service not available, proceeding without audit logging');
  // logAdminActivity remains a no-op function
}

// ============================================
// AUTH FUNCTIONS (ADDED BACK WITH EXPORTS)
// ============================================

/**
 * Admin Login
 * @route POST /api/auth/admin-login
 */
export const loginAdmin = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email and password are required" 
      });
    }

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (authError) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Fetch admin profile
    const { data: adminProfile, error: profileError } = await supabase
      .from('admins')
      .select('role, full_name, permissions, status')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !adminProfile) {
      await supabase.auth.signOut();
      return res.status(403).json({ 
        success: false,
        message: "Access denied: Not an authorized administrator." 
      });
    }

    // Check if admin account is active
    if (adminProfile.status === 'suspended' || adminProfile.status === 'inactive') {
      await supabase.auth.signOut();
      return res.status(403).json({ 
        success: false,
        message: "Account is not active. Please contact support." 
      });
    }

    // Update last login
    await supabase
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', authData.user.id);

    // Log activity
    if (logAdminActivity) {
      await logAdminActivity({
        adminId: authData.user.id,
        action: 'LOGIN',
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: adminProfile.role,
        name: adminProfile.full_name,
        permissions: adminProfile.permissions || []
      }
    });

  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred" 
    });
  }
};

/**
 * Get Admin Profile
 * @route GET /api/auth/admin/profile
 */
export const getAdminProfile = async (req, res) => {
  try {
    if (!req.admin || !req.admin.id) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const { data: adminProfile, error } = await supabase
      .from('admins')
      .select('role, full_name, email, permissions, last_login, status, created_at')
      .eq('id', req.admin.id)
      .single();

    if (error || !adminProfile) {
      return res.status(404).json({ 
        success: false,
        message: "Admin profile not found" 
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: req.admin.id,
        email: adminProfile.email,
        role: adminProfile.role,
        name: adminProfile.full_name,
        permissions: adminProfile.permissions || [],
        last_login: adminProfile.last_login,
        member_since: adminProfile.created_at
      }
    });

  } catch (error) {
    console.error("❌ Get Profile Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch profile" 
    });
  }
};

/**
 * Update Admin Password
 * @route PUT /api/auth/admin/password
 */
export const updateAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: "All password fields are required" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: "New passwords do not match" 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        message: "Password must be at least 8 characters" 
      });
    }

    // Verify current password
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.admin.email,
      password: currentPassword,
    });

    if (verifyError) {
      return res.status(401).json({ 
        success: false,
        message: "Current password is incorrect" 
      });
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return res.status(400).json({ 
        success: false,
        message: "Failed to update password" 
      });
    }

    // Log activity
    if (logAdminActivity) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'PASSWORD_CHANGE',
        ip: req.ip
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Password updated successfully" 
    });

  } catch (error) {
    console.error("❌ Update Password Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred" 
    });
  }
};

/**
 * Request Password Reset
 * @route POST /api/auth/admin/reset-password
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: "Email is required" 
      });
    }

    // Check if admin exists
    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    // Always return success (security through obscurity)
    if (admin) {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.ADMIN_URL}/reset-password`,
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "If an account exists, you will receive a password reset link." 
    });

  } catch (error) {
    console.error("❌ Password Reset Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred" 
    });
  }
};

/**
 * Logout Admin
 * @route POST /api/auth/admin/logout
 */
export const logoutAdmin = async (req, res) => {
  try {
    if (req.admin && logAdminActivity) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'LOGOUT',
        ip: req.ip
      });
    }

    await supabase.auth.signOut();

    return res.status(200).json({ 
      success: true,
      message: "Logged out successfully" 
    });

  } catch (error) {
    console.error("❌ Logout Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred" 
    });
  }
};

/**
 * Verify 2FA
 * @route POST /api/auth/admin/verify-2fa
 */
export const verifyTwoFactor = async (req, res) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      return res.status(400).json({ 
        success: false,
        message: "Verification code and token are required" 
      });
    }

    // Implement your 2FA verification logic here
    const isValid = code.length === 6 && /^\d+$/.test(code);

    if (!isValid) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid verification code" 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "2FA verification successful",
      token: "new-authenticated-token"
    });

  } catch (error) {
    console.error("❌ 2FA Verification Error:", error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred" 
    });
  }
};

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

/**
 * Get Dashboard Statistics
 * @route GET /api/admin/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  // ... (your existing dashboard stats code)
};

/**
 * List All Transactions with Pagination
 * @route GET /api/admin/transactions
 */
export const getTransactions = async (req, res) => {
  // ... (your existing transactions code)
};

/**
 * Get Single Transaction by ID
 * @route GET /api/admin/transactions/:id
 */
export const getTransactionById = async (req, res) => {
  // ... (your existing transaction by ID code)
};

/**
 * Get Sales Overview for Charts
 * @route GET /api/admin/sales/overview
 */
export const getSalesOverview = async (req, res) => {
  // ... (your existing sales overview code)
};

/**
 * Export Transactions
 * @route GET /api/admin/transactions/export
 */
export const exportTransactions = async (req, res) => {
  // ... (your existing export code)
};