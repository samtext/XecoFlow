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