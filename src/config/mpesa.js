import axios from 'axios';
import 'dotenv/config';

const mpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    passKey: process.env.MPESA_PASSKEY,
    shortCode: process.env.MPESA_BUSINESS_SHORTCODE,
    
    // PRODUCTION URL
    baseUrl: 'https://api.safaricom.co.ke', 
    
    authEndpoint: '/oauth/v1/generate?grant_type=client_credentials',
    stkPushEndpoint: '/mpesa/stkpush/v1/processrequest',
    
    callbackUrl: process.env.MPESA_CALLBACK_URL,

    getBasicAuthToken() {
        return Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    }
};

export const getMpesaTimestamp = () => {
    const now = new Date();
    // Format: YYYYMMDDHHmmss (must be in East Africa Time/UTC+3 for production)
    return now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
};

export const generateSTKPassword = (timestamp) => {
    const str = `${mpesaConfig.shortCode}${mpesaConfig.passKey}${timestamp}`;
    return Buffer.from(str).toString('base64');
};

export default mpesaConfig;