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
    baseUrl: 'https://api.safaricom.co.ke', // Production Base URL
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    /**
     * 🛡️ SECURE AUTH GENERATION
     * Safaricom Production requires a very clean Base64 string.
     */
    getBasicAuthToken() {
        const key = this.consumerKey.trim();
        const secret = this.consumerSecret.trim();
        // Standard Buffer for Node.js ESM
        return Buffer.from(`${key}:${secret}`).toString('base64');
    }
};

/**
 * 🔐 PRODUCTION PASSWORD GENERATION
 * For Buy Goods: The password MUST be hashed using the Business Shortcode (Store Number).
 */
export const generateSTKPassword = (timestamp) => {
    // We use the shortCode (Store Number) for hashing as per Safaricom Production rules
    const codeToHash = mpesaConfig.shortCode; 
    const passkey = mpesaConfig.passkey;
    return Buffer.from(codeToHash + passkey + timestamp).toString('base64');
};

/**
 * 🕒 TIMESTAMP GENERATION (EAT SYNC)
 * Generates timestamp in YYYYMMDDHHmmss format.
 * Safaricom's production servers are strictly on East African Time (UTC+3).
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Safaricom production servers expect EAT (UTC+3)
    const eatOffset = 3 * 60 * 60 * 1000;
    const eatDate = new Date(now.getTime() + eatOffset);
    
    return eatDate.toISOString()
        .replace(/[-:T.Z]/g, '') // Removes special characters
        .slice(0, 14);           // Takes exactly YYYYMMDDHHmmss
};

export default mpesaConfig;