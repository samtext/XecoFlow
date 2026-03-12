// ============================================
// 💰 AMOUNT VALIDATION MIDDLEWARE
// ============================================

import { transactionRules, calculateProfit } from '../config/businessRules.js';

export const validateTransactionAmount = (req, res, next) => {
    // Extract amount from different possible fields
    const amount = parseFloat(
        req.body.TransAmount || 
        req.body.Amount || 
        req.body.amount || 
        0
    );
    
    const transactionId = req.body.TransID || req.body.TransactionID || 'unknown';
    
    // Check minimum
    if (amount < transactionRules.minAmount) {
        console.warn(`🚫 Amount too low: KES ${amount} (min: KES ${transactionRules.minAmount})`, {
            transactionId,
            amount,
            minAmount: transactionRules.minAmount
        });
        
        // Log for analytics
        logRejectedTransaction({
            reason: 'below_minimum',
            amount,
            transactionId,
            timestamp: new Date().toISOString()
        });
        
        return res.status(200).json({
            ResultCode: "C2B00016",
            ResultDesc: transactionRules.messages.belowMinimum(transactionRules.minAmount)
        });
    }
    
    // Check maximum
    if (amount > transactionRules.maxAmount) {
        console.warn(`🚫 Amount too high: KES ${amount} (max: KES ${transactionRules.maxAmount})`);
        
        return res.status(200).json({
            ResultCode: "C2B00016",
            ResultDesc: transactionRules.messages.aboveMaximum(transactionRules.maxAmount)
        });
    }
    
    // Optional: Check business hours
    if (process.env.CHECK_BUSINESS_HOURS === 'true') {
        const hour = new Date().getHours();
        const { start, end } = transactionRules.businessHours;
        
        if (hour < start || hour >= end) {
            console.warn(`🚫 Outside business hours: ${hour}:00`);
            
            return res.status(200).json({
                ResultCode: "C2B00016",
                ResultDesc: transactionRules.messages.outsideBusinessHours
            });
        }
    }
    
    // Attach parsed amount to request
    req.parsedAmount = amount;
    req.profitAnalysis = calculateProfit(amount);
    
    next();
};

// Helper to log rejected transactions
const logRejectedTransaction = async (data) => {
    // Log to audit service
    try {
        await fetch(`${process.env.AUDIT_SERVICE_URL}/rejected-transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        // Silent fail - don't block transaction
        console.error('Failed to log rejection:', error.message);
    }
};