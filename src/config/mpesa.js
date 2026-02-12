import axios from 'axios';
import 'dotenv/config';

const mpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    passKey: process.env.MPESA_PASSKEY,
    // For BuyGoods/Till, this should be your Store Number (e.g., 7450249)
    shortCode: process.env.MPESA_BUSINESS_SHORTCODE, 
    
    // Switch between sandbox and production dynamically
    baseUrl: process.env.MPESA_ENVIRONMENT === 'production' 
        ? 'https://api.safaricom.co.ke' 
        : 'https://sandbox.safaricom.co.ke', 
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    callbackUrl: process.env.MPESA_CALLBACK_URL,

    getBasicAuthToken() {
        return Buffer.from(`${this.consumerKey.trim()}:${this.consumerSecret.trim()}`).toString('base64');
    }
};

/**
 * PRODUCTION TIMESTAMP (EAT/UTC+3)
 * Safaricom Production requires a very specific time sync.
 */
export const getMpesaTimestamp = () => {
    const date = new Date();
    // Force East Africa Time (UTC+3) regardless of where the server is hosted
    const offset = 3; 
    const eat = new Date(date.getTime() + (offset * 3600000) + (date.getTimezoneOffset() * 60000));
    
    return eat.getFullYear().toString() +
        (eat.getUTCMonth() + 1).toString().padStart(2, '0') +
        eat.getUTCDate().toString().padStart(2, '0') +
        eat.getUTCHours().toString().padStart(2, '0') +
        eat.getUTCMinutes().toString().padStart(2, '0') +
        eat.getUTCSeconds().toString().padStart(2, '0');
};

/**
 * GENERATE STK PASSWORD
 * Encodes ShortCode + PassKey + Timestamp
 */
export const generateSTKPassword = (timestamp) => {
    const str = `${mpesaConfig.shortCode}${mpesaConfig.passKey}${timestamp}`;
    return Buffer.from(str).toString('base64');
};

export default mpesaConfig;