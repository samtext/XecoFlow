/**
 * BIG-SYSTEM-V1.2 | BUSINESS RULES (SOURCE OF TRUTH)
 * These define the financial and operational boundaries of the app.
 */

// 1. Define constants WITHOUT 'export' at the start
const AIRTIME_RULES = {
    MIN_PURCHASE_AMOUNT_KES: 5,               // 5 KES is the minimum
    MAX_PURCHASE_AMOUNT_KES: 10000,           // 10,000 KES limit
    DAILY_LIMIT_PER_MSISDN_KES: 15000,        // Anti-Fraud limit
    ALLOW_DECIMAL_PURCHASES_KES: false,       // Only whole numbers
    // Legacy support for paymentController.js
    MIN_AMOUNT: 5,
    MAX_AMOUNT: 10000
};
// ============================================
// 📊 BUSINESS RULES CONFIGURATION
// ============================================

export const transactionRules = {
    // Amount limits
    minAmount: parseFloat(process.env.MIN_TRANSACTION_AMOUNT) || 10,
    maxAmount: parseFloat(process.env.MAX_TRANSACTION_AMOUNT) || 70000,
    
    // Profit margins (for reporting)
    marginPercentage: 5, // 5%
    
    // Infrastructure costs (for internal tracking)
    costPerTransaction: 0.30, // KES 0.30
    
    // Business hours (optional)
    allowWeekends: true,
    businessHours: {
        start: 6, // 6 AM
        end: 23   // 11 PM
    },
    
    // Validation messages
    messages: {
        belowMinimum: (min) => `Minimum transaction amount is KES ${min}`,
        aboveMaximum: (max) => `Maximum transaction amount is KES ${max}`,
        outsideBusinessHours: "Transactions only allowed between 6 AM - 11 PM"
    }
};

// Profitability calculator (for analytics)
export const calculateProfit = (amount) => {
    const revenue = amount * (transactionRules.marginPercentage / 100);
    const cost = transactionRules.costPerTransaction;
    return {
        grossProfit: revenue,
        netProfit: revenue - cost,
        isProfitable: (revenue - cost) > 0,
        breakEvenAmount: (cost / (transactionRules.marginPercentage / 100)).toFixed(2)
    };
};

const PAYMENT_RULES = {
    STK_WAIT_TIME_MS: 60000, 
    MAX_STATUS_CHECK_ATTEMPTS: 5, 
    BASE_CURRENCY: "KES", 
    MPESA_TX_DESCRIPTION: "Xeco Flow Airtime", 
};

const SUPPORT_CONFIG = {
    BUSINESS_NAME: "XECO FLOW",
    CONTACT_WHATSAPP: "2547XXXXXXXX",
    SUPPORT_EMAIL: "help@xecoflow.com",
    HELP_LINE: "2547XXXXXXXX" // Added to satisfy potential controller requirements
};

const TIME_STANDARDS = {
    DISPLAY_TIMEZONE: "Africa/Nairobi",
    TIMEZONE: "Africa/Nairobi", // Aliased for compatibility with paymentController
    RECONCILIATION_GATE_TIME: "23:57:00"
};

// 2. Export everything together ONCE at the bottom
// This matches the "Named Export" style used in your imports
export { 
    AIRTIME_RULES, 
    PAYMENT_RULES, 
    SUPPORT_CONFIG, 
    TIME_STANDARDS
};