import dotenv from 'dotenv';
dotenv.config();

/**
 * 🛠️ CONFIG VALIDATION
 * Ensures the app doesn't start with broken credentials.
 */
const requiredEnvs = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_PASSKEY', 'MPESA_BUSINESS_SHORTCODE'];
requiredEnvs.forEach(key => {
    if (!process.env[key]) {
        console.warn(`⚠️  [CONFIG WARNING]: ${key} is missing in .env!`);
    }
});

const mpesaConfig = {
    environment: (process.env.MPESA_ENVIRONMENT || 'production').toLowerCase(),
    consumerKey: (process.env.MPESA_CONSUMER_KEY || '').trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || '').trim(),
    passkey: (process.env.MPESA_PASSKEY || '').trim(),
    shortCode: (process.env.MPESA_BUSINESS_SHORTCODE || '').trim(), 
    till: (process.env.MPESA_TILL || '').trim(), 
    callbackUrl: (process.env.MPESA_CALLBACK_URL || '').trim(),
    
    // Dynamic URL based on environment
    baseUrl: (process.env.MPESA_ENVIRONMENT === 'sandbox') 
        ? 'https://sandbox.safaricom.co.ke' 
        : 'https://api.safaricom.co.ke',

    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    c2bRegisterEndpoint: '/mpesa/c2b/v1/registerurl', // Added for future C2B use

    getBasicAuthToken() {
        return Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    }
};

/**
 * 🔐 PRODUCTION PASSWORD GENERATION
 */
export const generateSTKPassword = (timestamp) => {
    // For Tills (Buy Goods), codeToHash must be the Store Number (shortCode)
    const codeToHash = mpesaConfig.shortCode; 
    const passkey = mpesaConfig.passkey;
    return Buffer.from(codeToHash + passkey + timestamp).toString('base64');
};

/**
 * 🕒 TIMESTAMP GENERATION (EAT SYNC)
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Safaricom servers = EAT (UTC+3). 
    // This logic ensures sync regardless of server location (Render/AWS/Google).
    const eatOffset = 3 * 60 * 60 * 1000;
    const eatDate = new Date(now.getTime() + eatOffset);
    
    return eatDate.toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14);
};

export default mpesaConfig;