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