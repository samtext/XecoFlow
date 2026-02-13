import axios from 'axios';

async function simulatePayment() {
    const testPayload = {
        TransactionType: "Pay Bill",
        TransID: "RKTQ123456",
        TransTime: "20240314120101",
        TransAmount: "10.00",
        BusinessShortCode: "7450249",
        BillRefNumber: "MANUAL_TEST",
        MSISDN: "254712345678",
        FirstName: "John"
    };

    try {
        console.log("📡 Simulating Manual Payment to Render...");
        const res = await axios.post('https://xecoflow.onrender.com/api/v1/payments/callback', testPayload);
        console.log("✅ Server Response:", res.data);
    } catch (error) {
        console.error("❌ Simulation Failed:", error.response?.data || error.message);
    }
}

simulatePayment();