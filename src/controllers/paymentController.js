import mpesaService from '../services/mpesa.service.js';

/**
 * MANAGER: paymentController
 * Job: Handle the Request/Response for STK Initiation
 */
export const initiatePayment = async (req, res) => {
    try {
        // 1. Destructure data from the frontend request
        const { phoneNumber, amount, userId } = req.body;
        
        // 2. ENHANCED LOGGING: This will now definitely show up in Render
        console.log(`\n=========================================`);
        console.log(`💳 [NEW REQUEST] STK Push Initiation`);
        console.log(`📱 Phone Number: ${phoneNumber}`);
        console.log(`💰 Amount: Ksh ${amount}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`=========================================\n`);

        // 3. Validation
        if (!phoneNumber || !amount || !userId) {
            console.error("❌ [VALIDATION ERROR]: Missing required fields in req.body");
            return res.status(400).json({ 
                error: "Phone number, amount, and userId are required" 
            });
        }

        // 4. Call the Service (The logic specialist)
        console.log(`⏳ [PROCESSING]: Requesting STK Push from Safaricom...`);
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        // 5. Success Logging
        console.log(`✅ [SUCCESS]: Safaricom Accepted Request`);
        console.log(`🆔 CheckoutRequestID: ${response.CheckoutRequestID || 'N/A'}`);
        console.log(`📝 Response Message: ${response.CustomerMessage || 'Sent'}`);

        // 6. Send success back to React
        return res.status(200).json(response);

    } catch (error) {
        // 7. Error Logging
        console.error(`\n❌ [STK_PUSH_CONTROLLER_ERROR]:`);
        console.error(`👉 Message: ${error.message}`);
        console.error(`=========================================\n`);
        
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};