// backend/src/services/auditService.js

/**
 * Audit Service - Logs admin activities to database
 * This prevents the "ERR_MODULE_NOT_FOUND" error in adminController.js
 */

import { supabase } from '../config/supabase.js';

/**
 * Log admin activity to database
 * @param {Object} params - Activity details
 * @param {string} params.adminId - Admin user ID
 * @param {string} params.action - Action performed (LOGIN, LOGOUT, VIEW_DASHBOARD, etc.)
 * @param {Object} params.details - Additional details about the action
 * @param {string} params.ip - IP address of the admin
 */
export const logAdminActivity = async ({ adminId, action, details = {}, ip }) => {
  try {
    // Skip if no adminId (some actions might not have it)
    if (!adminId) {
      console.warn('⚠️ [AUDIT] No adminId provided for action:', action);
      return;
    }

    console.log(`📝 [AUDIT] Logging activity: ${action} for admin ${adminId}`);

    // Insert into audit_logs table (you need to create this table in Supabase)
    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        {
          admin_id: adminId,
          action,
          details,
          ip_address: ip,
          created_at: new Date().toISOString()
        }
      ]);

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
 * @param {string} adminId - Admin user ID
 * @param {Object} options - Pagination options
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
 * @param {Object} options - Pagination and filter options
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

export default {
  logAdminActivity,
  getAdminAuditLogs,
  getAllAuditLogs
};