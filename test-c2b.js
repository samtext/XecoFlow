import axios from 'axios';

const TARGET_URL = 'https://xecoflow.onrender.com/api/v1/payments/c2b-confirmation';

const mockC2BPayload = {
    TransactionType: "Pay Bill",
    TransID: "RKT7S9LX8" + Math.floor(Math.random() * 100), // Randomize ID to avoid duplicate errors
    TransTime: "20260223104500",
    TransAmount: "10.00",
    BusinessShortCode: "7450249",
    BillRefNumber: "LINE_TWO_TEST",
    InvoiceNumber: "",
    OrgAccountBalance: "100.00",
    ThirdPartyTransID: "",
    MSISDN: "254712345678",
    FirstName: "Test",
    MiddleName: "C2B",
    LastName: "User"
};

async function runTest() {
    console.log(`🚀 Sending Mock C2B Confirmation to: ${TARGET_URL}...`);
    try {
        const response = await axios.post(TARGET_URL, mockC2BPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log("✅ SERVER_RESPONSE:", response.data);
        console.log("\n--- NEXT STEPS ---");
        console.log("1. Check Render logs for: 💰 [C2B_CONFIRMATION]");
        console.log("2. Check Supabase 'mpesa_callback_logs' for the raw payload.");
        console.log("3. Check Supabase 'airtime_transactions' for the status 'PAYMENT_SUCCESS'.");
    } catch (error) {
        console.error("❌ TEST_FAILED:", error.response?.data || error.message);
    }
}

runTest();