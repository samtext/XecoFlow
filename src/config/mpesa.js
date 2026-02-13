import axios from 'axios';
import 'dotenv/config';

const mpesaConfig = {
    // 1. Clean and validate credentials to prevent "Invalid Access Token"
    consumerKey: (process.env.MPESA_CONSUMER_KEY || "").trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || "").trim(),
    passKey: (process.env.MPESA_PASSKEY || "").trim(),
    shortCode: (process.env.MPESA_BUSINESS_SHORTCODE || "").trim(), 
    
    // 2. Robust Environment Check
    // Handles case sensitivity (e.g., 'Production' vs 'production')
    baseUrl: (process.env.MPESA_ENVIRONMENT?.toLowerCase() === 'production' || 
              process.env.MPESA_BASE_URL?.includes('api.safaricom.co.ke'))
        ? 'https://api.safaricom.co.ke' 
        : 'https://sandbox.safaricom.co.ke', 
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    callbackUrl: process.env.MPESA_CALLBACK_URL,

    getBasicAuthToken() {
        return Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    }
};

/**
 * PRODUCTION TIMESTAMP (EAT/UTC+3)
 * Safaricom Production requires time in East Africa Time
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Convert current time to East Africa Time (UTC+3)
    const eatDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3 * 3600000));
    
    const year = eatDate.getFullYear();
    const month = String(eatDate.getMonth() + 1).padStart(2, '0');
    const day = String(eatDate.getDate()).padStart(2, '0');
    const hours = String(eatDate.getHours()).padStart(2, '0');
    const minutes = String(eatDate.getMinutes()).padStart(2, '0');
    const seconds = String(eatDate.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * GENERATE STK PASSWORD
 */
export const generateSTKPassword = (timestamp) => {
    // Ensure no spaces or null values in the password string concatenation
    const str = `${mpesaConfig.shortCode}${mpesaConfig.passKey}${timestamp}`;
    return Buffer.from(str).toString('base64');
};

export default mpesaConfig;