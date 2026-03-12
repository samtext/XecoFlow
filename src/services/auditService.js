// backend/src/services/auditService.js

/**
 * Audit Service - Logs admin activities and system events to database
 */

import { supabase } from '../config/supabase.js';

// ============================================
// 📝 SYSTEM-WIDE AUDIT FUNCTIONS
// ============================================

/**
 * Log error events from anywhere in the system
 */
export const logError = async (type, data = {}) => {
  try {
    const logEntry = {
      level: 'error',
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    console.error(`📝 [AUDIT:ERROR] ${type}:`, JSON.stringify(logEntry, null, 2));
    
    // Store in database if needed
    try {
      const { error } = await supabase
        .from('system_logs')
        .insert([{
          level: 'error',
          category: type,
          message: data.error || 'Unknown error',
          details: data,
          ip_address: data.ip,
          created_at: new Date().toISOString()
        }]);
      
      if (error) console.warn('⚠️ Could not save error to DB:', error.message);
    } catch (dbError) {
      // Silent fail
    }
    
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT] Error in logError:', error.message);
    return { success: false };
  }
};

/**
 * Log info events from anywhere in the system
 */
export const logInfo = async (type, data = {}) => {
  try {
    const logEntry = {
      level: 'info',
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    console.log(`📝 [AUDIT:INFO] ${type}:`, JSON.stringify(logEntry, null, 2));
    
    if (process.env.STORE_INFO_LOGS === 'true') {
      try {
        await supabase
          .from('system_logs')
          .insert([{
            level: 'info',
            category: type,
            message: data.message || type,
            details: data,
            ip_address: data.ip,
            created_at: new Date().toISOString()
          }]);
      } catch (dbError) {
        // Silent fail
      }
    }
    
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT] Error in logInfo:', error.message);
    return { success: false };
  }
};

/**
 * Log warning events
 */
export const logWarn = async (type, data = {}) => {
  try {
    const logEntry = {
      level: 'warn',
      type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    console.warn(`📝 [AUDIT:WARN] ${type}:`, JSON.stringify(logEntry, null, 2));
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT] Error in logWarn:', error.message);
    return { success: false };
  }
};

// ============================================
// 👤 ADMIN AUDIT FUNCTIONS
// ============================================

/**
 * Log admin activity to database
 */
export const logAdminActivity = async ({ adminId, action, details = {}, ip }) => {
  try {
    if (!adminId) {
      console.warn('⚠️ [AUDIT] No adminId provided for action:', action);
      return;
    }

    console.log(`📝 [AUDIT] Logging activity: ${action} for admin ${adminId}`);

    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        admin_id: adminId,
        action,
        details,
        ip_address: ip,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('❌ [AUDIT] Failed to log activity:', error.message);
    }

    return { success: !error, error };
  } catch (error) {
    console.error('❌ [AUDIT] Error logging activity:', error.message);
    return { success: false, error };
  }
};

/**
 * Get audit logs for an admin
 */
export const getAdminAuditLogs = async (adminId, { page = 1, limit = 50 } = {}) => {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    console.error('❌ [AUDIT] Error fetching logs:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get all audit logs (superadmin only)
 */
export const getAllAuditLogs = async ({ page = 1, limit = 50, action = null } = {}) => {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('audit_logs')
      .select('*, admins(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (action) {
      query = query.eq('action', action);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    console.error('❌ [AUDIT] Error fetching all logs:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get recent system errors for dashboard
 */
export const getRecentErrors = async (limit = 20) => {
  try {
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .eq('level', 'error')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('❌ [AUDIT] Error fetching errors:', error.message);
    return { success: false, error: error.message };
  }
};

// ============================================
// 📦 DEFAULT EXPORT (for backward compatibility)
// ============================================

export default {
  logError,
  logInfo,
  logWarn,
  logAdminActivity,
  getAdminAuditLogs,
  getAllAuditLogs,
  getRecentErrors
};