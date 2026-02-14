// src/config/mpesa.js
import dotenv from 'dotenv';
dotenv.config();

const mpesaConfig = {
    environment: process.env.MPESA_ENVIRONMENT || 'production',
    consumerKey: (process.env.MPESA_CONSUMER_KEY || '').trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || '').trim(),
    passkey: (process.env.MPESA_PASSKEY || '').trim(),
    
    // The "Parent" code (e.g., 7450249) used for auth and password hashing
    shortCode: process.env.MPESA_BUSINESS_SHORTCODE, 
    
    // The actual Buy Goods Till (e.g., 4938110) where money is sent
    till: process.env.MPESA_TILL, 
    
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    baseUrl: 'https://api.safaricom.co.ke',
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    getBasicAuthToken() {
        return Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    }
};

/**
 * PRODUCTION PASSWORD GENERATION
 * For Buy Goods: The password MUST be hashed using the Business Shortcode (7450249).
 */
export const generateSTKPassword = (timestamp) => {
    const codeToHash = mpesaConfig.shortCode; 
    const passkey = mpesaConfig.passkey;
    return Buffer.from(codeToHash + passkey + timestamp).toString('base64');
};

/**
 * Generates timestamp in YYYYMMDDHHmmss format
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Adjust to EAT (UTC+3)
    const eatOffset = 3 * 60 * 60 * 1000;
    const eatDate = new Date(now.getTime() + eatOffset);
    
    return eatDate.toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14);
};

export default mpesaConfig;