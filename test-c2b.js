import axios from 'axios';

// ✅ Using the exact path registered in your Daraja Portal
// Since we updated app.js to support /api/v1 directly, this will now work!
const TARGET_URL = 'https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation';

const fakePayment = {
    "TransactionType": "Pay Bill",
    "TransID": "FAKE" + Math.random().toString(36).substring(2, 10).toUpperCase(),
    "TransTime": new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14),
    "TransAmount": "10.00",
    "BusinessShortCode": "7450249",
    "BillRefNumber": "TEST_LINE_2",
    "MSISDN": "254700000000",
    "FirstName": "Fake",
    "MiddleName": "Money",
    "LastName": "Tester",
    "OrgAccountBalance": "5000.00"
};

async function testC2B() {
    console.log(`\n🚀 [TEST_START]: Sending fake payment to Line Two...`);
    console.log(`🔗 URL: ${TARGET_URL}`);
    console.log(`📦 TransID: ${fakePayment.TransID}\n`);

    try {
        const res = await axios.post(TARGET_URL, fakePayment);
        
        console.log("✅ [SERVER_REPLY]:", res.data);
        console.log("\n--- NEXT STEPS ---");
        console.log("1. Go to Render Logs: Look for 🔔 [INTERCEPTED]");
        console.log("2. Go to Supabase: Look for TransID in 'airtime_transactions'");
        console.log("------------------\n");
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("❌ [TEST_FAILED]:", JSON.stringify(errorData, null, 2));
        
        if (err.response?.status === 404) {
            console.log("\n💡 Still getting 404? Make sure you DEPLOYED the app.js changes to Render first!");
        }
    }
}

testC2B();