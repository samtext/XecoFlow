// ============================================
// 📈 TRANSACTION ANALYTICS
// ============================================

import { transactionRules } from '../config/businessRules.js';

export const analyzeTransactionPatterns = async (transactions) => {
    const stats = {
        totalTransactions: transactions.length,
        totalVolume: 0,
        averageAmount: 0,
        profitableCount: 0,
        unprofitableCount: 0,
        belowMinimumCount: 0,
        revenue: 0,
        costs: 0
    };
    
    transactions.forEach(t => {
        const amount = t.amount;
        stats.totalVolume += amount;
        
        const profit = amount * (transactionRules.marginPercentage / 100);
        const netProfit = profit - transactionRules.costPerTransaction;
        
        if (amount < transactionRules.minAmount) {
            stats.belowMinimumCount++;
        }
        
        if (netProfit > 0) {
            stats.profitableCount++;
        } else {
            stats.unprofitableCount++;
        }
        
        stats.revenue += profit;
        stats.costs += transactionRules.costPerTransaction;
    });
    
    stats.averageAmount = stats.totalVolume / stats.totalTransactions;
    stats.netProfit = stats.revenue - stats.costs;
    
    return stats;
};