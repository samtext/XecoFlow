import { supabase } from '../config/supabase.js';

// Safely import audit service with fallback
let logAdminActivity = async () => {}; // Default no-op function

try {
  const auditModule = await import('../services/auditService.js');
  logAdminActivity = auditModule.logAdminActivity;
  console.log('✅ Audit service loaded successfully');
} catch (error) {
  console.warn('⚠️ Audit service not available, proceeding without audit logging');
}

// ============================================
// AUTH FUNCTIONS
// ============================================

/**
 * Admin Login - SIMPLIFIED VERSION (no role check)
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

    // SIMPLIFIED: Just check if user exists in admins table (no role/status checks)
    const { data: adminProfile, error: profileError } = await supabase
      .from('admins')
      .select('full_name')  // Only need name for display
      .eq('id', authData.user.id)
      .single();

    if (profileError || !adminProfile) {
      await supabase.auth.signOut();
      return res.status(403).json({ 
        success: false,
        message: "Access denied: Not an authorized administrator." 
      });
    }

    // Update last login (optional)
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
        name: adminProfile.full_name || 'Admin User',
        // Default values since we removed role/permissions
        role: 'admin',
        permissions: []
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
 * Get Admin Profile - SIMPLIFIED
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
      .select('full_name, email, last_login, created_at')
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
        name: adminProfile.full_name || 'Admin User',
        role: 'admin', // Default role
        permissions: [],
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

// ============================================
// OTHER AUTH FUNCTIONS (unchanged)
// ============================================

/**
 * Update Admin Password
 */
export const updateAdminPassword = async (req, res) => {
  // ... (keep your existing code)
};

/**
 * Request Password Reset
 */
export const requestPasswordReset = async (req, res) => {
  // ... (keep your existing code)
};

/**
 * Logout Admin
 */
export const logoutAdmin = async (req, res) => {
  // ... (keep your existing code)
};

/**
 * Verify 2FA
 */
export const verifyTwoFactor = async (req, res) => {
  // ... (keep your existing code)
};

// ============================================
// DASHBOARD FUNCTIONS
// ============================================

export const getDashboardStats = async (req, res) => {
  // ... (your existing dashboard stats code)
};

export const getTransactions = async (req, res) => {
  // ... (your existing transactions code)
};

export const getTransactionById = async (req, res) => {
  // ... (your existing transaction by ID code)
};

export const getSalesOverview = async (req, res) => {
  // ... (your existing sales overview code)
};

export const exportTransactions = async (req, res) => {
  // ... (your existing export code)
};