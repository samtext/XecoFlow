import axios from 'axios';
import 'dotenv/config';

const mpesaConfig = {
    // Trim keys to prevent "Invalid Access Token" caused by accidental spaces
    consumerKey: (process.env.MPESA_CONSUMER_KEY || "").trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || "").trim(),
    passKey: (process.env.MPESA_PASSKEY || "").trim(),
    shortCode: (process.env.MPESA_BUSINESS_SHORTCODE || "").trim(), 
    
    // Explicitly check for 'production' string
    baseUrl: process.env.MPESA_ENVIRONMENT === 'production' 
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
 * PRODUCTION TIMESTAMP
 * Safaricom requires YYYYMMDDHHMMSS
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Safaricom expects time in East Africa Time (EAT)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * GENERATE STK PASSWORD
 * Base64 encode: ShortCode + PassKey + Timestamp
 */
export const generateSTKPassword = (timestamp) => {
    // Ensure no spaces in the password string concatenation
    const str = `${mpesaConfig.shortCode.trim()}${mpesaConfig.passKey.trim()}${timestamp}`;
    return Buffer.from(str).toString('base64');
};

export default mpesaConfig;