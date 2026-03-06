// backend/src/services/floatService.js
import { db } from '../config/db.js'; // Using your existing db config

/**
 * Float Service - Reads float balance from your database
 * (Data is populated by AggregatorService.logFloatChange)
 */
export const floatService = {
  /**
   * Get current float balance from database
   * @returns {Promise<number>} Current float balance
   */
  getCurrentFloat: async () => {
    try {
      console.log('💰 Reading current float from provider_float_ledger...');
      
      const { data, error } = await db
        .from('provider_float_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.warn('⚠️ No float records found in ledger, using default 0');
        return 0;
      }

      const balance = parseFloat(data.balance_after) || 0;
      console.log(`💰 Current float balance: Ksh ${balance.toLocaleString()}`);
      return balance;
    } catch (error) {
      console.error('❌ Error fetching float from ledger:', error);
      return 0;
    }
  },

  /**
   * Check if float has sufficient balance
   * @param {number} amount - Amount to check
   * @param {number} bufferPercent - Buffer percentage (default 10%)
   * @returns {Promise<{sufficient: boolean, balance: number, required: number}>}
   */
  checkSufficientFloat: async (amount, bufferPercent = 10) => {
    const currentFloat = await floatService.getCurrentFloat();
    const requiredAmount = amount * (1 + bufferPercent / 100);
    const sufficient = currentFloat >= requiredAmount;

    console.log(`💰 Float check:`, {
      current: currentFloat,
      requested: amount,
      required: requiredAmount,
      sufficient
    });

    return {
      sufficient,
      balance: currentFloat,
      required: requiredAmount,
      amount,
      bufferPercent
    };
  },

  // ============================================
  // 🆕 NEW FUNCTIONS ADDED BELOW
  // ============================================

  /**
   * Reserve float for pending transaction
   * @param {string} checkoutId - M-Pesa checkout ID
   * @param {number} amount - Amount to reserve
   * @returns {Promise<boolean>} Success status
   */
  reserveFloat: async (checkoutId, amount) => {
    try {
      console.log(`💰 [RESERVE] Attempting to reserve Ksh ${amount} for transaction ${checkoutId}`);
      
      // Get current float
      const currentFloat = await floatService.getCurrentFloat();
      const newFloat = currentFloat - amount;

      // Log the reservation in ledger
      const { error } = await db
        .from('provider_float_ledger')
        .insert([{
          provider_name: 'STATUM',
          transaction_type: 'RESERVE',
          amount: -amount,
          balance_before: currentFloat,
          balance_after: newFloat,
          disbursement_id: checkoutId,
          description: `Float reserved for transaction ${checkoutId}`,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('❌ [RESERVE] Failed to reserve float:', error);
        return false;
      }

      console.log(`✅ [RESERVE] Float reserved: Ksh ${amount} for ${checkoutId}. New balance: ${newFloat}`);
      return true;
    } catch (error) {
      console.error('❌ [RESERVE] Error reserving float:', error);
      return false;
    }
  },

  /**
   * Release float for failed/cancelled transactions
   * @param {string} checkoutId - M-Pesa checkout ID
   * @param {number} amount - Amount to release
   * @returns {Promise<boolean>} Success status
   */
  releaseFloat: async (checkoutId, amount) => {
    try {
      console.log(`💰 [RELEASE] Attempting to release Ksh ${amount} for transaction ${checkoutId}`);
      
      const currentFloat = await floatService.getCurrentFloat();
      const newFloat = currentFloat + amount;

      const { error } = await db
        .from('provider_float_ledger')
        .insert([{
          provider_name: 'STATUM',
          transaction_type: 'RELEASE',
          amount: amount,
          balance_before: currentFloat,
          balance_after: newFloat,
          disbursement_id: checkoutId,
          description: `Float released for transaction ${checkoutId}`,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('❌ [RELEASE] Failed to release float:', error);
        return false;
      }

      console.log(`✅ [RELEASE] Float released: Ksh ${amount} for ${checkoutId}. New balance: ${newFloat}`);
      return true;
    } catch (error) {
      console.error('❌ [RELEASE] Error releasing float:', error);
      return false;
    }
  },

  // ============================================
  // EXISTING FUNCTIONS (unchanged)
  // ============================================

  /**
   * Get float health status (for admin dashboard)
   * @returns {Promise<Object>} Float health info
   */
  getFloatHealth: async () => {
    const currentFloat = await floatService.getCurrentFloat();
    
    // Thresholds based on typical airtime sales
    const lowThreshold = 10000; // Ksh 10,000
    const criticalThreshold = 5000; // Ksh 5,000
    
    let status = 'healthy';
    if (currentFloat <= criticalThreshold) {
      status = 'critical';
    } else if (currentFloat <= lowThreshold) {
      status = 'low';
    }

    return {
      balance: currentFloat,
      status,
      lowThreshold,
      criticalThreshold,
      lastChecked: new Date().toISOString()
    };
  },

  /**
   * Get recent float ledger entries (for auditing)
   * @param {number} limit - Number of records to return
   * @returns {Promise<Array>} Float ledger entries
   */
  getFloatHistory: async (limit = 20) => {
    try {
      const { data, error } = await db
        .from('provider_float_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error fetching float history:', error);
      return [];
    }
  },

  /**
   * Calculate total float change over period
   * @param {string} period - 'day', 'week', 'month'
   * @returns {Promise<Object>} Float change statistics
   */
  getFloatStats: async (period = 'day') => {
    try {
      const now = new Date();
      let startDate = new Date();

      switch(period) {
        case 'day':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate.setHours(0, 0, 0, 0);
      }

      const { data, error } = await db
        .from('provider_float_ledger')
        .select('amount, transaction_type, created_at')
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const credits = data.filter(d => d.transaction_type === 'CREDIT')
                         .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
      
      const debits = data.filter(d => d.transaction_type === 'DEBIT')
                        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

      return {
        period,
        credits,
        debits,
        netChange: credits - debits,
        transactionCount: data.length,
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      };
    } catch (error) {
      console.error('❌ Error calculating float stats:', error);
      return null;
    }
  }
};

export default floatService;