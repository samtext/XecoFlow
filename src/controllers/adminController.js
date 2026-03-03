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

/**
 * ============================================
 * EXISTING AUTH FUNCTIONS (KEEP AS IS)
 * ============================================
 * - loginAdmin
 * - getAdminProfile
 * - updateAdminPassword
 * - requestPasswordReset
 * - logoutAdmin
 * - verifyTwoFactor
 * 
 * (Your existing auth functions remain above this line)
 */

// ============================================
// NEW ADMIN DASHBOARD FUNCTIONS
// ============================================

/**
 * Get Dashboard Statistics - Returns all stats for admin dashboard
 * @route GET /api/admin/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    // Get current date for time-based queries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Run all queries in parallel for better performance
    const [
      totalSalesResult,
      transactionCountResult,
      todaySalesResult,
      pendingCountResult,
      failedCountResult,
      monthlySalesResult,
      uniqueCustomersResult
    ] = await Promise.all([
      // Total sales (all time successful transactions)
      supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'PAYMENT_SUCCESS'),
      
      // Total transaction count
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true }),
      
      // Today's sales
      supabase
        .from('transactions')
        .select('amount')
        .eq('status', 'PAYMENT_SUCCESS')
        .gte('created_at', today.toISOString()),
      
      // Pending transactions count
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING'),
      
      // Failed transactions count
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PAYMENT_FAILED'),
      
      // Monthly sales for current year
      supabase
        .from('transactions')
        .select('created_at, amount')
        .eq('status', 'PAYMENT_SUCCESS')
        .gte('created_at', startOfYear.toISOString()),
      
      // Unique customers count
      supabase
        .from('transactions')
        .select('phone', { count: 'exact', distinct: true })
    ]);

    // Calculate total sales sum
    const totalSales = totalSalesResult.data?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    
    // Calculate today's sales sum
    const todaySales = todaySalesResult.data?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

    // Calculate average transaction value
    const avgTransactionValue = transactionCountResult.count > 0 
      ? totalSales / transactionCountResult.count 
      : 0;

    // Calculate success rate
    const totalAttempts = (transactionCountResult.count || 0) + (failedCountResult.count || 0);
    const successRate = totalAttempts > 0 
      ? ((transactionCountResult.count || 0) / totalAttempts * 100).toFixed(1)
      : 0;

    // Log admin activity (safe call even if audit service not available)
    if (req.admin) {
      try {
        await logAdminActivity({
          adminId: req.admin.id,
          action: 'VIEW_DASHBOARD',
          ip: req.ip
        });
      } catch (auditError) {
        // Silently fail - audit logging is optional
        console.debug('Audit log skipped:', auditError.message);
      }
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
        // These would come from your float management system
        currentFloat: 350000, // You'll need to implement this
        salesMargin: 2.5, // You'll need to calculate this based on your business logic
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

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('transactions')
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
      query = query.or(`phone.ilike.%${search}%,reference.ilike.%${search}%,mpesa_receipt.ilike.%${search}%`);
    }

    // Apply pagination and ordering
    const { data: transactions, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Log admin activity
    if (req.admin) {
      try {
        await logAdminActivity({
          adminId: req.admin.id,
          action: 'VIEW_TRANSACTIONS',
          details: { page, limit, filters: { status, startDate, endDate, search } },
          ip: req.ip
        });
      } catch (auditError) {
        // Silently fail
      }
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

    // Fetch transaction from database
    const { data: transaction, error } = await supabase
      .from('transactions')
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
    if (req.admin) {
      try {
        await logAdminActivity({
          adminId: req.admin.id,
          action: 'VIEW_TRANSACTION_DETAILS',
          details: { transactionId: id },
          ip: req.ip
        });
      } catch (auditError) {
        // Silently fail
      }
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
    const period = req.query.period || 'monthly'; // 'daily', 'monthly', 'yearly'
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month); // For daily view

    let startDate, endDate, groupBy;

    // Set date range based on period
    if (period === 'daily' && month) {
      // Daily view for specific month
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
      groupBy = 'day';
    } else if (period === 'monthly') {
      // Monthly view for specific year
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
      groupBy = 'month';
    } else if (period === 'yearly') {
      // Yearly view for last 5 years
      startDate = new Date(year - 4, 0, 1);
      endDate = new Date(year, 11, 31);
      groupBy = 'year';
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid period specified"
      });
    }

    // Fetch all successful transactions in date range
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('created_at, amount')
      .eq('status', 'PAYMENT_SUCCESS')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw error;
    }

    // Group data based on period
    let groupedData = [];

    if (groupBy === 'day') {
      // Group by day of month
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
          dailyData[dayIndex].sales += t.amount || 0;
          dailyData[dayIndex].count++;
        }
      });

      groupedData = dailyData.filter(d => d.count > 0);
    } 
    else if (groupBy === 'month') {
      // Group by month
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
          monthlyData[monthIndex].sales += t.amount || 0;
          monthlyData[monthIndex].count++;
        }
      });

      groupedData = monthlyData.filter(d => d.count > 0);
    } 
    else if (groupBy === 'year') {
      // Group by year
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
          yearEntry.sales += t.amount || 0;
          yearEntry.count++;
        }
      });

      groupedData = yearData.filter(d => d.count > 0);
    }

    // Calculate totals
    const totalSales = groupedData.reduce((sum, d) => sum + d.sales, 0);
    const totalCount = groupedData.reduce((sum, d) => sum + d.count, 0);

    // Log admin activity
    if (req.admin) {
      try {
        await logAdminActivity({
          adminId: req.admin.id,
          action: 'VIEW_SALES_OVERVIEW',
          details: { period, year, month },
          ip: req.ip
        });
      } catch (auditError) {
        // Silently fail
      }
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

    // Build query
    let query = supabase
      .from('transactions')
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
    if (req.admin) {
      try {
        await logAdminActivity({
          adminId: req.admin.id,
          action: 'EXPORT_TRANSACTIONS',
          details: { count: transactions?.length || 0, filters: { startDate, endDate, status } },
          ip: req.ip
        });
      } catch (auditError) {
        // Silently fail
      }
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

// ============================================
// YOUR EXISTING AUTH FUNCTIONS REMAIN BELOW
// ============================================
// (Keep all your existing functions like loginAdmin, 
// getAdminProfile, updateAdminPassword, etc. here)