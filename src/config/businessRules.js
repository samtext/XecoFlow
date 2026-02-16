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
    SUPPORT_EMAIL: "help@xecoflow.com"
};

const TIME_STANDARDS = {
    DISPLAY_TIMEZONE: "Africa/Nairobi",
    RECONCILIATION_GATE_TIME: "23:57:00"
};

// ... Define other objects (TX_STATES, SYSTEM_TIMINGS, etc.) here if they exist ...

// 2. Export everything together ONCE at the bottom
export { 
    AIRTIME_RULES, 
    PAYMENT_RULES, 
    SUPPORT_CONFIG, 
    TIME_STANDARDS,
    // Add other constants here as you define them above
    /* SYSTEM_TIMINGS, 
    TX_STATES, 
    PROVIDER_RULES, 
    MPESA_STATUS_CODES 
    */
};