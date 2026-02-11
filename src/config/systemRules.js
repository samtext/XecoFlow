/**
 * BIG-SYSTEM-V1.2
 * SYSTEM MECHANICS & ENGINEERING CONSTANTS
 * * PURPOSE: These are the 'Laws of Physics' for the engine. 
 * They govern how the server breathes, survives errors, and talks to APIs.
 * Unlike Business Rules, these change how the code PERFORMS, not what it SELLS.
 */

// 1. ENGINE TIMINGS (The Pulse)
// Using _MS suffix to ensure developers know the unit is Milliseconds.
export const SYSTEM_TIMINGS = {
    EXTERNAL_API_TIMEOUT_MS: 30000,               // Kill internal requests if safaricom or statum failed to respond within 30000ms SERVER TO SERVER
    STK_CALLBACK_WAIT_MS: 60000,                 // How long to wait for the user to enter their M-Pesa PIN 60000MS
    TX_EXPIRY_THRESHOLD_MINUTES: 10,            // Maximum time a transaction can stay in 'PENDING' before being marked 'EXPIRED' 10min
    HEALER_INTERVAL_MS: 60000,                 // Ensures anyone who PAID but didn't get airtime is serviced immediately.
    QUERY_RETRY_DELAY_MS: 30000,              // If callback hasn't arrived, wait this long before pulling transactionfrom Safaricom  API
    SESSION_CLEANUP_INTERVAL_MS: 300000,     // How often to clean up dead/expired sessions from the database
    AXIOS_DEFAULT_TIMEOUT: 15000,           // Must always be <= EXTERNAL_API_TIMEOUT_MS
    ACTION_DEBOUNCE_MS: 3000,              // Debounce time: Prevents a user from clicking "Buy" 10 times in a row
    IDEMPOTENCY_WINDOW_MS: 60000,         // Prevent duplicate STK pushes for the same user/amount/target and within a 60 sec window to avoid "Double Charging."
    BALANCE_CHECK_INTERVAL_MS: 3600000 // Check once every hour
};

// 2. TRANSACTIONS STATUS
export const TX_STATES = {
    INITIATED: "INITIATED",                            // When User clicked 'Pay' it record to our database
    PENDING_PAYMENT: "PENDING_PAYMENT",               // STK Sent, waiting for PIN
    PAYMENT_SUCCESS: "PAYMENT_SUCCESS",              // M-Pesa confirmed (Money in)
    PAYMENT_FAILED: "PAYMENT_FAILED",               // M-Pesa rejected/cancelled
  
  // Delivery Phase
    PROCESSING: "PROCESSING",                   // Currently calling Statum
    COMPLETED: "COMPLETED",                      // Airtime delivered to phone
  
  // Recovery Phase
    HEALING: "HEALING",                       // The Healer has taken over the retry
    RECONCILIATION: "RECONCILIATION",        // Manual/Cron check against M-Pesa logs
    FAILED_PERMANENT: "FAILED_PERMANENT",   // Total failure (Requires Support)
   
    //Retry limit for healer
    RECOVERY_POLICY: {
    HEALER_MAX_RETRIES: 3                 // If the Healer tries to fix it 3 times and fails every time (maybe Statum's API is completely dead), it must stop.The Result: It moves the transaction to FAILED_PERMANENT.        
},
        
};

    /**
 * 3. PROVIDER INVENTORY (FLOAT) RULES
 * Governs airtime stock availability and protects against overselling
 * Source of truth for provider balance enforcement
 */

export const PROVIDER_RULES = Object.freeze({

    FLOAT_CURRENCY: "KES",    // Currency used for provider float calculations
    LOW_FLOAT_THRESHOLD_KES: 1000,  //Soft warning threshold When balance falls to or below this, admin is alerted
    CRITICAL_STOP_THRESHOLD_KES: 100, // Hard stop threshold When balance falls to or below this, new transactions are BLOCKED Prevents accepting payments when airtime stock is 100 or below
    ALERT_RESET_BUFFER_KES: 500,   // Safety buffer to avoid rapid on/off toggling of alerts

// Provider float health states (derived from balance checks)
  FLOAT_STATUS: Object.freeze({ 
    HEALTHY: "HEALTHY",        // Balance above LOW threshold
    LOW: "LOW",                // Balance <= LOW threshold
    CRITICAL: "CRITICAL"       // Balance <= CRITICAL threshold
  })

});

// 4. MPESA STATUS CODE
//WE FREEZE THE OBJECT SO THAT CANNOT EDITED WHEN CREATED (IMMUTABLE)
export const MPESA_STATUS_CODES = Object.freeze({
  MPESA_SUCCESS_CODE: "0",                                   // This show that the transaction was successful
  MPESA_INSUFFICIENT_FUNDS_CODE: "1",                       // User doesn't have enough money in M-Pesa
  MPESA_INTERNAL_SYSTEM_ERROR_CODE: "5",                   // Safaricom is having a bad day
  MPESA_USER_CANCELLED_CODE: "1032",                      // User rejected the STK Push
  MPESA_TIMEOUT_CODE: "2081",                            // User took too long to enter PIN
  MPESA_AMBIGUOUS_RESPONSE_CODE: "26",                  // Network failure (requires HEALING)
  MPESA_DUPLICATE_REQUEST_CODE: "17",                  // You sent the same CheckoutRequestID twice
  MPESA_API_KEYS_INVALID: "404.001"                   // Your API keys in .env are wrong
});

// 5.THIS IS PROVIDERS SECTIONS AND TELECOMMUNICATIONS COMPANIES NAMES

/**
 * 5. PROVIDER & AGGREGATOR CONFIGURATION
 * This section manages our external airtime suppliers.
 * Object.freeze ensures that API URLs and success logic cannot be changed at runtime.
 */
export const PROVIDER_CONFIG_AGGREGATORS = Object.freeze({
    // Routing logic: PRIMARY is the default, SECONDARY is the failover for Lane 3 (Healing)
    PRIMARY: "STATUM",
    SECONDARY: null, //NOT IMPLEMENTED — DO NOT ROUTE

    // STATUM: Current active aggregator (Kenya)
    STATUM: {
        NAME: "STATUM",
        BASE_URL: "https://api.statum.co.ke/api/v2", //Statum base_url
       
        ENDPOINTS: {
        AIRTIME: "/airtime",   //statum airtime endpoint
        SMS: "/sms",          //statum sms endpoint
        },

        SUCCESS_CODE: "200",    // The specific success indicator in their response body
        RESPONSE_KEY: "status" // The key we look for in the JSON response to find the code
    },

    // FUTURE_SLOT: Placeholder for redundancy (e.g., Africa's Talking or Mobidev)
   // To implement: Fill these fields and update 'SECONDARY' above.
    AGGREGATOR_NAME_HERE: {
        NAME: "XXXXXXXXX",
        BASE_URL: "XXXXXXXXXXXXXXXXXXXXX",
        
    ENDPOINTS: {
        MINUTES: "/XXXXXXXX",      //for future minutes endpoint
        DATA_BUNDLES: "/XXXXXX",  //for future data bundle endpoint
        },

        SUCCESS_CODE: "XXX",    // The specific success indicator in their response body
        RESPONSE_KEY: "status" // The key we look for in the JSON response to find the code
    },     
});

/**
 * 6. TELECOMMUNICATIONS NETWORK REGISTRY
 * Maps Kenyan phone number prefixes to their respective Telco IDs.
 * This is used for auto-detecting the network and routing to the correct API endpoint.
 */
export const NETWORKS_SUPPORTED_OPERATOR_PREFIXES = Object.freeze({
    NETWORKS_SUPPORTED: {
        // ID 1: Safaricom - includes the modern '011' prefix range
        SAFARICOM: { 
            ID: 1, 
            PREFIXES: ['070', '071', '072', '074', '079', '011'], 
            NAME: "Safaricom" 
        },
        // ID 2: Airtel - includes the modern '010' prefix range
        AIRTEL: { 
            ID: 2, 
            PREFIXES: ['073', '075', '078', '010'], 
            NAME: "Airtel" 
        },
        // ID 3: Telkom - restricted to the '077' prefix range
        TELKOM: { 
            ID: 3, 
            PREFIXES: ['077'], 
            NAME: "Telkom" 
        }
    }
});

/**
 * 7. HTTP STATUS CODES
 * Standardized response codes to communicate with the Frontend and external APIs.
 */
export const HTTP_STATUS = Object.freeze({
    // 2xx: Success (The Green Light)
    OK: 200,               // Request completed perfectly (e.g., getting transaction history)
    CREATED: 201,         // A new resource was made (e.g., a new Airtime Request initiated)
    ACCEPTED: 202,       // Received, but still processing (Perfect for M-Pesa STK Push)

    // 4xx: Client Errors (The "User" or "Developer" messed up)
    BAD_REQUEST: 400,    // Missing phone number or invalid amount/Error in our data or code structure. DO NOT RETRY.
    UNAUTHORIZED: 401,   // Invalid API Key/Token or session expired
    FORBIDDEN: 403,      // Authenticated, but not allowed to do this action
    NOT_FOUND: 404,      // The transaction ID doesn't exist in Supabase
    CONFLICT: 409,       // Duplicate transaction detected (Idempotency check failed) used for protecting money against twice sending airtime
    
    // 5xx: Server Errors (The "System" or "Provider" messed up)
    INTERNAL_SERVER_ERROR: 500, // Our code crashed (The one we try to avoid!)
    BAD_GATEWAY: 502,             // Statum or Safaricom is sending back garbage
    SERVICE_UNAVAILABLE: 503,    // Provider is down for maintenance
    GATEWAY_TIMEOUT: 504        // Provider took too long to answer
    
});

export const DB_MAPPING = Object.freeze({

    TABLES: {
    TRANSACTIONS: "airtime_transactions", // RETAIL LAYER: The "User Journey" Source of Truth.  // Records the intent (what was bought), the payment status, and the final delivery state.
    DISBURSEMENTS: "provider_disbursements",// WHOLESALE LAYER: The "Delivery Track."// Manages the actual attempts to send airtime. Supports multiple retries for a single transaction.
    MPESA_LOGS: "mpesa_callback_logs",// PAYMENT EVIDENCE: Raw M-Pesa Hook data. // The proof of payment used to validate and move a transaction from 'pending' to 'paid'.
    PROVIDER_LOGS: "aggregator_responses",// TECHNICAL AUDIT: The "API Conversation" log.// Stores the raw handshake, status codes, and latency from the external airtime aggregator.
    FLOAT_LEDGER: "provider_float_ledger",// FINANCIAL INTEGRITY: The "Internal Bank Statement."// A double-entry ledger tracking every cent of your wholesale float (Credits and Debits).
    SYSTEM_HEALTH: "system_health_record", // IMMUNE SYSTEM: The "Vitals Monitor." // Tracks service uptime, memory usage, and API success rates to alert you before a crash.
    IDEMPOTENCY: "idempotency_keys" // SAFETY LOCK: The "Anti-Double-Click" brain.// Prevents double-charging by ensuring a unique request is only processed once within a time window.
}

 });

export const TIME_STANDARDS = Object.freeze({
    STORAGE_TIMEZONE: "UTC",              // Always store in UTC to avoid daylight savings issues
    DISPLAY_TIMEZONE: "Africa/Nairobi",   // Local time for Kenyan users
    DATE_FORMAT_ISO: "YYYY-MM-DD",        // Standard for database queries
    DATETIME_FORMAT_ISO: "YYYY-MM-DDTHH:mm:ss.sssZ", 
    MPESA_TIMESTAMP_FORMAT: "YYYYMMDDHHmmss", // Specific format for Safaricom API
    MAX_ALLOWED_CLOCK_DRIFT_SEC: 60,   //If a request comes from your frontend with a timestamp more than 60 seconds different from your server's time, Reject it.
    HEALER_MIN_AGE_SEC: 300,    //(5 Minutes) The Healer should never touch a transaction that is less than 5 minutes old. Why? Because M-Pesa might still be processing.
    RECONCILIATION_GATE_TIME: "23:57:00"  //To ensure clean accounting, block new transactions for 3 minutes before midnight. This gives the system time to finish all "Pending" transactions before the daily report is generated.
    /*system must pause money movement for a few minutes,
     without users noticing and without breaking trust Between 23:57 → 00:00:
     ✅ ACCEPT the user request
     ✅ Save it in the database
     ✅ Respond normally
     Never send STK Push before midnight during that window*/

});

//This is your "Digital Shield." It prevents brute-force attacks and limits your exposure to fraud
export const SECURITY_VELOCITY_RULES = Object.freeze({
    MAX_FAILED_ATTEMPTS_PER_IP_HOURLY: 5,  // Block an IP if they fail 5 STK pushes in an hour
    SUSPICIOUS_AMOUNT_THRESHOLD_KES: 5000, // Flag for manual review if someone buys exactly 5k+ multiple times
    BLOCK_INTERNATIONAL_IPS: true,         // Only allow Kenyan IPs to initiate transactions
    BLOCK_INTERNATIONAL_PREFIXES: true,    // Only allow +254 (Kenya)
    IDEMPOTENCY_EXPIRY_HOURS: 24           // How long to remember a 'Buy' click to prevent duplicates
});

//This is the "Janitor" logic. It ensures your database doesn't become slow by deleting or archiving old "junk" data.
export const DATA_RETENTION_RULES = Object.freeze({
    FINANCIAL_RECORDS_DAYS: 2555,          // 7 Years: Mandatory legal compliance for accounting
    ARCHIVE_SUCCESSFUL_TX_AFTER_DAYS: 90, // Move successful records to an archive table after 3 months
    PURGE_EXPIRED_TX_AFTER_DAYS: 30,      // Remove 'EXPIRED' transactions after a month
    TECHNICAL_LOGS_DAYS: 30,               // 1 Month: Save DB space by removing old API logs
    KEEP_CALLBACK_LOGS_DAYS: 7,            // Raw M-Pesa logs are large; keep for only 1 week
    HEALTH_METRICS_DAYS: 7                 // Keep system pulse data for only 7 days
});

//This ensures that "Garbage Data" never enters your system. It cleans the user's input before it hits the database.
export const INPUT_VALIDATION_RULES = Object.freeze({
    ENFORCE_STRICT_PREFIX_MATCH: true,    // Reject immediately if it doesn't start with 07/01 or 254
    STRIP_COUNTRY_CODE: true,             // Standardize input (Convert 254... to 07...) for processing
    LENGTH_CHECK: [10, 12],               // Validates 07XXXXXXXX (10) or 2547XXXXXXXX (12)
});

//This is the "Immune System." It watches for transactions that are stuck and alerts the Admin.
export const MONITORING_ALERTS = Object.freeze({
    STUCK_IN_PROCESSING_ALARM_MIN: 15,    // Alert Admin if a transaction stays 'PROCESSING' for 15 mins
    STK_ABANDONMENT_THRESHOLD_MIN: 5,      // If no M-Pesa callback after 5 mins, mark as 'EXPIRED'
    LEDGER_FREEZE_TIME_DAILY: "23:59:59",  // The moment we take a "Snapshot" of float for accounting
});

//Business-level rules on how to handle failed money.
export const REFUND_POLICY = Object.freeze({
    AUTO_REFUND_ON_PERMANENT_FAILURE: false, // Set to true only if B2C/Reversal API is configured
    MAX_REFUND_CLAIM_DAYS: 7,                 // Customer cannot claim a refund after 7 days
});

  


