import axios from 'axios';

/**
 * 🚩 THE FIX: 
 * If your app.js uses app.use('/api/v1/gateway', mpesaRoutes), 
 * the URL MUST include '/gateway'.
 */
const TARGET_URL = 'https://xecoflow.onrender.com/api/v1/gateway/payments/c2b-confirmation';
const PING_URL = 'https://xecoflow.onrender.com/api/v1/gateway/ping';

const fakePayment = {
    "TransactionType": "Pay Bill",
    "TransID": "FAKE" + Math.random().toString(36).substring(2, 10).toUpperCase(),
    "TransTime": new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14),
    "TransAmount": "10.00",
    "BusinessShortCode": "9203342",
    "BillRefNumber": "TEST_LINE_2",
    "MSISDN": "254700000000",
    "FirstName": "Fake",
    "MiddleName": "Money",
    "LastName": "Tester",
    "OrgAccountBalance": "5000.00"
};

async function testC2B() {
    console.log(`\n🔍 [PRE-CHECK]: Pinging gateway at ${PING_URL}...`);
    try {
        await axios.get(PING_URL);
        console.log("✅ [GATEWAY_ALIVE]: The server is responding!");
    } catch (err) {
        console.error("⚠️ [GATEWAY_OFFLINE]: Could not reach the ping route. Check your Render logs.");
    }

    console.log(`\n🚀 [TEST_START]: Sending fake payment to Line Two...`);
    console.log(`🔗 URL: ${TARGET_URL}`);
    console.log(`📦 TransID: ${fakePayment.TransID}\n`);

    try {
        const res = await axios.post(TARGET_URL, fakePayment);
        
        console.log("✅ [SERVER_REPLY]:", res.data);
        console.log("\n--- NEXT STEPS ---");
        console.log("1. Check Render Logs: Look for 💰 [C2B_RECEIPT]");
        console.log("2. Check Supabase: The transaction should be in 'airtime_transactions'");
        console.log("------------------\n");
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ [TEST_FAILED]: Status", err.response?.status);
        console.error("📦 ERROR_BODY:", JSON.stringify(errorData, null, 2));
        
        if (err.response?.status === 404) {
            console.log("\n💡 Still 404? Double check your app.use() prefix in app.js.");
            console.log("If it is app.use('/api/v1', ...), remove '/gateway' from the TARGET_URL above.");
        }
    }
}

testC2B();