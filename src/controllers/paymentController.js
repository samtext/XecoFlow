import mpesaService from '../services/mpesa.service.js';

export const initiatePayment = async (req, res) => {
    try {
        const { phoneNumber, amount, userId } = req.body;
        
        if (!phoneNumber || !amount || !userId) {
            return res.status(400).json({ error: "Phone number, amount, and userId are required" });
        }

        console.log(`🚀 INITIATING STK PUSH FOR: ${phoneNumber} Amount: ${amount}`);
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        return res.status(200).json(response);
    } catch (error) {
        console.error("❌ STK_PUSH_CONTROLLER_ERROR:", error.message);
        return res.status(500).json({ error: error.message });
    }
};