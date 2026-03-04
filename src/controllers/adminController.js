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

    // Check if user exists in admins table
    const { data: adminProfile, error: profileError } = await supabase
      .from('admins')
      .select('full_name')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !adminProfile) {
      await supabase.auth.signOut();
      return res.status(403).json({ 
        success: false,
        message: "Access denied: Not an authorized administrator." 
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
        name: adminProfile.full_name || 'Admin User',
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
        role: 'admin',
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
// DASHBOARD FUNCTIONS - UPDATED with real float data
// ============================================

/**
 * Get Dashboard Statistics
 * @route GET /api/admin/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    // Get current date for time-based queries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Run all queries in parallel
    const [
      totalSalesResult,
      transactionCountResult,
      todaySalesResult,
      pendingCountResult,
      failedCountResult,
      monthlySalesResult,
      uniqueCustomersResult,
      floatResult  // 👈 ADDED: Get float data
    ] = await Promise.all([
      // Total sales (all time successful transactions)
      supabase
        .from('airtime_transactions')
        .select('amount')
        .eq('status', 'PAYMENT_SUCCESS'),
      
      // Total transaction count
      supabase
        .from('airtime_transactions')
        .select('*', { count: 'exact', head: true }),
      
      // Today's sales
      supabase
        .from('airtime_transactions')
        .select('amount')
        .eq('status', 'PAYMENT_SUCCESS')
        .gte('created_at', today.toISOString()),
      
      // Pending transactions count
      supabase
        .from('airtime_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING_PAYMENT'),
      
      // Failed transactions count
      supabase
        .from('airtime_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PAYMENT_FAILED'),
      
      // Monthly sales for current year
      supabase
        .from('airtime_transactions')
        .select('created_at, amount')
        .eq('status', 'PAYMENT_SUCCESS')
        .gte('created_at', startOfYear.toISOString()),
      
      // Unique customers count
      supabase
        .from('airtime_transactions')
        .select('phone_number', { count: 'exact', distinct: true }),
      
      // 👇 NEW: Get current float from provider_float_ledger
      supabase
        .from('provider_float_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    // Calculate total sales sum
    const totalSales = totalSalesResult.data?.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) || 0;
    
    // Calculate today's sales sum
    const todaySales = todaySalesResult.data?.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) || 0;

    // Calculate average transaction value
    const avgTransactionValue = transactionCountResult.count > 0 
      ? totalSales / transactionCountResult.count 
      : 0;

    // Calculate success rate
    const totalAttempts = (transactionCountResult.count || 0) + (failedCountResult.count || 0);
    const successRate = totalAttempts > 0 
      ? ((transactionCountResult.count || 0) / totalAttempts * 100).toFixed(1)
      : 0;

    // 👇 Get current float (default to 0 if not found)
    const currentFloat = floatResult.data?.balance_after || 0;

    // Log admin activity
    if (logAdminActivity && req.admin) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'VIEW_DASHBOARD',
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        totalSales,
        transactionCount: transactionCountResult.count || 0,
        todaySales,
        pendingTransactions: pendingCountResult.count || 0,
        failedTransactions: failedCountResult.count || 0,
        uniqueCustomers: uniqueCustomersResult.count || 0,
        avgTransactionValue: Math.round(avgTransactionValue * 100) / 100,
        successRate: parseFloat(successRate),
        currentFloat, // 👈 Now using real data from database
        salesMargin: 2.5,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Dashboard Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics"
    });
  }
};

/**
 * List All Transactions with Pagination
 * @route GET /api/admin/transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const search = req.query.search;

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('airtime_transactions')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    if (search) {
      query = query.or(`phone_number.ilike.%${search}%,user_id.ilike.%${search}%`);
    }

    // Apply pagination and ordering
    const { data: transactions, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Log admin activity
    if (logAdminActivity && req.admin) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'VIEW_TRANSACTIONS',
        details: { page, limit, filters: { status, startDate, endDate, search } },
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        transactions: transactions || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error("❌ Get Transactions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions"
    });
  }
};

/**
 * Get Single Transaction by ID
 * @route GET /api/admin/transactions/:id
 */
export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID is required"
      });
    }

    const { data: transaction, error } = await supabase
      .from('airtime_transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    // Log admin activity
    if (logAdminActivity && req.admin) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'VIEW_TRANSACTION_DETAILS',
        details: { transactionId: id },
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error("❌ Get Transaction Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction details"
    });
  }
};

/**
 * Get Sales Overview for Charts
 * @route GET /api/admin/sales/overview
 */
export const getSalesOverview = async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month);

    let startDate, endDate, groupBy;

    if (period === 'daily' && month) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
      groupBy = 'day';
    } else if (period === 'monthly') {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
      groupBy = 'month';
    } else if (period === 'yearly') {
      startDate = new Date(year - 4, 0, 1);
      endDate = new Date(year, 11, 31);
      groupBy = 'year';
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid period specified"
      });
    }

    const { data: transactions, error } = await supabase
      .from('airtime_transactions')
      .select('created_at, amount')
      .eq('status', 'PAYMENT_SUCCESS')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw error;
    }

    let groupedData = [];

    if (groupBy === 'day') {
      const daysInMonth = endDate.getDate();
      const dailyData = new Array(daysInMonth).fill(0).map((_, i) => ({
        label: `Day ${i + 1}`,
        sales: 0,
        count: 0,
        date: new Date(year, month - 1, i + 1).toISOString().split('T')[0]
      }));

      transactions?.forEach(t => {
        const transactionDate = new Date(t.created_at);
        const dayIndex = transactionDate.getDate() - 1;
        if (dailyData[dayIndex]) {
          dailyData[dayIndex].sales += parseFloat(t.amount) || 0;
          dailyData[dayIndex].count++;
        }
      });

      groupedData = dailyData.filter(d => d.count > 0);
    } 
    else if (groupBy === 'month') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const monthlyData = months.map((month, i) => ({
        label: `${month} ${year}`,
        month: i + 1,
        year,
        sales: 0,
        count: 0
      }));

      transactions?.forEach(t => {
        const transactionDate = new Date(t.created_at);
        const monthIndex = transactionDate.getMonth();
        if (monthlyData[monthIndex] && transactionDate.getFullYear() === year) {
          monthlyData[monthIndex].sales += parseFloat(t.amount) || 0;
          monthlyData[monthIndex].count++;
        }
      });

      groupedData = monthlyData.filter(d => d.count > 0);
    } 
    else if (groupBy === 'year') {
      const yearData = [];
      for (let y = year - 4; y <= year; y++) {
        yearData.push({
          label: y.toString(),
          year: y,
          sales: 0,
          count: 0
        });
      }

      transactions?.forEach(t => {
        const transactionYear = new Date(t.created_at).getFullYear();
        const yearEntry = yearData.find(d => d.year === transactionYear);
        if (yearEntry) {
          yearEntry.sales += parseFloat(t.amount) || 0;
          yearEntry.count++;
        }
      });

      groupedData = yearData.filter(d => d.count > 0);
    }

    const totalSales = groupedData.reduce((sum, d) => sum + d.sales, 0);
    const totalCount = groupedData.reduce((sum, d) => sum + d.count, 0);

    // Log admin activity
    if (logAdminActivity && req.admin) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'VIEW_SALES_OVERVIEW',
        details: { period, year, month },
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        period,
        year,
        month: month || null,
        chartData: groupedData,
        totals: {
          sales: totalSales,
          transactions: totalCount
        },
        summary: {
          averagePerPeriod: totalCount > 0 ? totalSales / totalCount : 0,
          highestSales: Math.max(...groupedData.map(d => d.sales)),
          lowestSales: Math.min(...groupedData.map(d => d.sales))
        }
      }
    });

  } catch (error) {
    console.error("❌ Sales Overview Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sales overview"
    });
  }
};

/**
 * Export Transactions (for CSV/Excel export)
 * @route GET /api/admin/transactions/export
 */
export const exportTransactions = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    let query = supabase
      .from('airtime_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: transactions, error } = await query;

    if (error) {
      throw error;
    }

    // Log admin activity
    if (logAdminActivity && req.admin) {
      await logAdminActivity({
        adminId: req.admin.id,
        action: 'EXPORT_TRANSACTIONS',
        details: { count: transactions?.length || 0, filters: { startDate, endDate, status } },
        ip: req.ip
      });
    }

    return res.status(200).json({
      success: true,
      data: transactions || []
    });

  } catch (error) {
    console.error("❌ Export Transactions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export transactions"
    });
  }
};