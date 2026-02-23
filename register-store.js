import axios from 'axios';

const CONSUMER_KEY = 'mdJODSyrjeUMBvWI9E7U937YyT2W8hB0jdJST4EeablPXCqF';
const CONSUMER_SECRET = 'oeoT4MN0AMxbKGc2wlsJgZATMeDNLuYtRYuFFU5wr7eqKwPx338L3pTYL2Kn6iuC';

// 📍 Use the Short Code shown in your Daraja screenshot
const SHORTCODE = '7450249'; 

const AUTH_URL = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
// ✅ CHANGED TO V2 to match your app's products
const REGISTER_URL = 'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl';

async function registerV2() {
    try {
        console.log("🔐 Fetching Production Token...");
        const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
        const tokenRes = await axios.get(AUTH_URL, {
            headers: { Authorization: `Basic ${auth}` }
        });
        const token = tokenRes.data.access_token;

        console.log(`📡 Registering C2B v2 URLs for ${SHORTCODE}...`);
        const data = {
            ShortCode: SHORTCODE,
            ResponseType: "Completed",
            ConfirmationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation",
            ValidationURL: "https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation" 
        };

        const res = await axios.post(REGISTER_URL, data, {
            headers: { 
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        console.log("\n✅ SUCCESS:", res.data);
    } catch (err) {
        console.error("\n❌ FAILED:", JSON.stringify(err.response?.data || err.message, null, 2));
    }
}

registerV2();