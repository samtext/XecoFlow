// src/config/mpesa.js
import dotenv from 'dotenv';
dotenv.config();

const mpesaConfig = {
    environment: process.env.MPESA_ENVIRONMENT || 'production',
    consumerKey: (process.env.MPESA_CONSUMER_KEY || '').trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || '').trim(),
    passkey: (process.env.MPESA_PASSKEY || '').trim(),
    
    // UPDATED: Added trim() to prevent "Invalid PartyB" caused by hidden spaces
    shortCode: (process.env.MPESA_BUSINESS_SHORTCODE || '').trim(), 
    
    // UPDATED: Added trim() to ensure this matches your working test (4938110)
    till: (process.env.MPESA_TILL || '').trim(), 
    
    callbackUrl: (process.env.MPESA_CALLBACK_URL || '').trim(),
    baseUrl: 'https://api.safaricom.co.ke',
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    getBasicAuthToken() {
        // Double-check trimming here to ensure no malformed auth strings
        const key = this.consumerKey.trim();
        const secret = this.consumerSecret.trim();
        return Buffer.from(`${key}:${secret}`).toString('base64');
    }
};

/**
 * PRODUCTION PASSWORD GENERATION
 * For Buy Goods: The password MUST be hashed using the Business Shortcode.
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
    // Adjust to EAT (UTC+3) for Safaricom Production sync
    const eatOffset = 3 * 60 * 60 * 1000;
    const eatDate = new Date(now.getTime() + eatOffset);
    
    return eatDate.toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14);
};

export default mpesaConfig;