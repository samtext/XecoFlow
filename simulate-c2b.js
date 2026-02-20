import mpesaService from './src/services/mpesa.service.js';
import axios from 'axios';

const simulate = async () => {
    const token = await mpesaService.getAccessToken();
    const url = "https://api.safaricom.co.ke/mpesa/c2b/v1/simulate";
    
    const payload = {
        ShortCode: "7450249",
        CommandID: "CustomerPayBillOnline", // Use this even for Tills
        Amount: "1",
        Msisdn: "254708374149", // Use your phone number
        BillRefNumber: "Test001"
    };

    const res = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Simulation Result:", res.data);
};
simulate();