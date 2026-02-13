import axios from 'axios';
import 'dotenv/config';

const mpesaConfig = {
    // 1. Clean and validate credentials
    consumerKey: (process.env.MPESA_CONSUMER_KEY || "").trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || "").trim(),
    passKey: (process.env.MPESA_PASSKEY || "").trim(),
    shortCode: (process.env.MPESA_BUSINESS_SHORTCODE || "").trim(), 
    
    // 2. Robust Environment Check (Case-insensitive)
    // This ensures that "PRODUCTION", "Production", or "production" all work
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
 * PRODUCTION TIMESTAMP (Fixed for EAT)
 * Safaricom Production requires YYYYMMDDHHMMSS in UTC+3
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    // Convert to East Africa Time (UTC+3) to prevent "Invalid Timestamp" errors
    const eatOffset = 3 * 60; // 3 hours in minutes
    const localTime = now.getTime();
    const localOffset = now.getTimezoneOffset() * 60000;
    const utc = localTime + localOffset;
    const eatDate = new Date(utc + (3600000 * 3));

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
    const str = `${mpesaConfig.shortCode}${mpesaConfig.passKey}${timestamp}`;
    return Buffer.from(str).toString('base64');
};

export default mpesaConfig;