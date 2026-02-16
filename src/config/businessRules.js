/**
 * BIG-SYSTEM-V1.2 | BUSINESS RULES (SOURCE OF TRUTH)
 * These define the financial and operational boundaries of the app.
 */

export const AIRTIME_RULES = {
    MIN_PURCHASE_AMOUNT_KES: 5,                                 // 5 KES is the minimum airtime/data to buy
    MAX_PURCHASE_AMOUNT_KES: 10000,                            // 10,000 KES limit to prevent accidental high-value draining
    DAILY_LIMIT_PER_MSISDN_KES: 15000,                        // Anti-Fraud: Max amount one phone number can receive per 24 hours
    ALLOW_DECIMAL_PURCHASES_KES: false,                      // If true, the system will allow 10.50. If false, only 10, 11, etc.
};

export const PAYMENT_RULES = {
    STK_WAIT_TIME_MS: 60000,                             // Human-readable seconds. We multiply by 1000 in the code logic.
    MAX_STATUS_CHECK_ATTEMPTS: 5,                       // Maximum times we check the Safaricom status before giving up
    BASE_CURRENCY: "KES",                              // Currency - used for display and API requests
    MPESA_TX_DESCRIPTION: "Xeco Flow Airtime",        // Transaction description that appears in the customer's M-Pesa SMS
};

export const SUPPORT_CONFIG = {
    BUSINESS_NAME: "XECO FLOW",
    CONTACT_WHATSAPP: "2547XXXXXXXX",
    SUPPORT_EMAIL: "help@xecoflow.com"
};

// Ensure all major objects are exported
export { 
    AIRTIME_RULES, 
    PAYMENT_RULES, 
    SUPPORT_CONFIG, 
    SYSTEM_TIMINGS, 
    TX_STATES, 
    PROVIDER_RULES, 
    MPESA_STATUS_CODES, 
    PROVIDER_CONFIG_AGGREGATORS, 
    NETWORKS_SUPPORTED_OPERATOR_PREFIXES, 
    HTTP_STATUS, 
    DB_MAPPING, 
    TIME_STANDARDS, // <--- Double check this one specifically
    SECURITY_VELOCITY_RULES, 
    DATA_RETENTION_RULES, 
    INPUT_VALIDATION_RULES, 
    MONITORING_ALERTS, 
    REFUND_POLICY 
};




