import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: paymentController
 * Job: Handle the Request/Response for STK Initiation
 */
export const initiatePayment = async (req, res) => {
    try {
        // 1. Destructure data from the frontend request
        const { phoneNumber, amount, userId } = req.body;
        
        // 2. Log for debugging - if you see this, the route is connected!
        console.log(`🎮 Controller received STK request: ${phoneNumber} | User: ${userId}`);

        // 3. Validation
        if (!phoneNumber || !amount || !userId) {
            console.error("❌ Controller Validation Failed: Missing fields");
            return res.status(400).json({ 
                error: "Phone number, amount, and userId are required" 
            });
        }

        // 4. Call the Service (The logic specialist)
        // Ensure the service file exports an object with 'initiateSTKPush'
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        // 5. Send success back to React
        return res.status(200).json(response);

    } catch (error) {
        console.error("❌ STK_PUSH_CONTROLLER_ERROR:", error.message);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};