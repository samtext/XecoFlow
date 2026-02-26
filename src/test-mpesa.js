import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const getTimestamp = () => {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
};

const testConnection = async () => {
    console.log("🔗 Starting Safaricom Handshake...");
    
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');

    try {
        // 1. Get Access Token
        const { data } = await axios.get(
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}` } }
        );

        console.log("✅ ACCESS_TOKEN: Received Successfully.");

        // 2. Test Account Balance (The Ledger Query for Store Number)
        const balanceData = {
            Initiator: process.env.MPESA_INITIATOR_NAME, // SWANJIKU
            SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
            CommandID: 'AccountBalance',
            PartyA: process.env.MPESA_SHORTCODE, // Your Store Number: 9203342
            IdentifierType: '2', // 🚩 CRITICAL: Changed to '2' for Store Numbers
            Remarks: 'Testing Store Ledger',
            QueueTimeOutURL: 'https://yourdomain.com/timeout',
            ResultURL: 'https://yourdomain.com/result'
        };

        console.log(`📡 Sending Ledger Query for Store ${process.env.MPESA_SHORTCODE}...`);
        
        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/accountbalance/v1/query',
            balanceData,
            { headers: { Authorization: `Bearer ${data.access_token}` } }
        );

        console.log("🚀 SAFARICOM RESPONSE:", response.data);

    } catch (error) {
        console.error("❌ CONNECTION FAILED:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            
            if(error.response.data.errorCode === '400.002.02') {
                console.log("💡 Tip: Verify that 9203342 is definitely the STORE number and not the TILL number.");
            }
        } else {
            console.error(error.message);
        }
    }
};

testConnection();