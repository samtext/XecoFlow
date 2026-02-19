import axios from 'axios';

const testC2B = async () => {
    // 1. REPLACE with your actual Render URL
    const RENDER_URL = "https://xecoflow.onrender.com/api/v1/mpesa/c2b-confirmation";

    // 2. This is the exact format Safaricom sends for C2B
    const mockC2BPayload = {
        TransactionType: "Pay Bill",
        TransID: "RBT56HJK92", // Mock Receipt Number
        TransTime: "20260219142000",
        TransAmount: "10.00",
        BusinessShortCode: "4938110", // Your Paybill
        BillRefNumber: "XecoTest001", // The Account Number
        InvoiceNumber: "",
        OrgAccountBalance: "1000.00",
        ThirdPartyTransID: "",
        MSISDN: "254712345678",
        FirstName: "John",
        MiddleName: "Xeco",
        LastName: "Flow"
    };

    console.log("🚀 Sending Mock C2B Payment to Render...");

    try {
        const response = await axios.post(RENDER_URL, mockC2BPayload, {
            headers: { "Content-Type": "application/json" }
        });

        console.log("✅ Server Response:", response.data);
        console.log("👉 Now check your Supabase 'airtime_transactions' table for TransID: RBT56HJK92");
    } catch (error) {
        console.error("❌ Test Failed!");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.log("Message:", error.response.data);
            if (error.response.status === 403) {
                console.log("💡 Tip: Set NODE_ENV to 'development' on Render temporarily to bypass the IP Whitelist for this test.");
            }
        } else {
            console.error(error.message);
        }
    }
};

testC2B();