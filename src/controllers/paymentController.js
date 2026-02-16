import mpesaService from '../services/mpesa.service.js';
// ✅ Import rules for security checks
import { AIRTIME_RULES, TIME_STANDARDS } from '../config/businessRules.js';

/**
 * MANAGER: paymentController
 * Job: Handle the Request/Response for STK Initiation
 */
export const initiatePayment = async (req, res) => {
    try {
        // 1. Destructure data from the frontend request
        // Added packageId for verification
        const { phoneNumber, amount, userId, packageId } = req.body;
        
        // 2. ENHANCED LOGGING: This will now definitely show up in Render
        console.log(`\n=========================================`);
        console.log(`💳 [NEW REQUEST] STK Push Initiation`);
        console.log(`📱 Phone Number: ${phoneNumber}`);
        console.log(`💰 Amount: Ksh ${amount}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`📦 Package ID: ${packageId || 'N/A'}`);
        console.log(`=========================================\n`);

        // 3. Validation
        if (!phoneNumber || !amount || !userId) {
            console.error("❌ [VALIDATION ERROR]: Missing required fields in req.body");
            return res.status(400).json({ 
                error: "Phone number, amount, and userId are required" 
            });
        }

        // --- 🛡️ SECURITY LAYER A: MIDNIGHT RECONCILIATION GATE ---
        // Prevents transactions during the 3-minute daily cleanup window
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { 
            timeZone: TIME_STANDARDS.DISPLAY_TIMEZONE, 
            hour12: false 
        });

        if (currentTime >= TIME_STANDARDS.RECONCILIATION_GATE_TIME && currentTime <= "23:59:59") {
            console.warn(`⚠️ [GATE KEEPER]: Transaction blocked during Midnight Reconciliation (${currentTime})`);
            return res.status(503).json({ 
                error: "System maintenance. Please try again in 5 minutes." 
            });
        }

        // --- 🛡️ SECURITY LAYER B: GLOBAL LIMITS CHECK ---
        if (amount < AIRTIME_RULES.MIN_PURCHASE_AMOUNT_KES || amount > AIRTIME_RULES.MAX_PURCHASE_AMOUNT_KES) {
            console.error(`🚨 [LIMIT ERROR]: User tried to pay Ksh ${amount}`);
            return res.status(400).json({ 
                error: `Amount must be between Ksh ${AIRTIME_RULES.MIN_PURCHASE_AMOUNT_KES} and Ksh ${AIRTIME_RULES.MAX_PURCHASE_AMOUNT_KES}` 
            });
        }

        // 4. Call the Service (The logic specialist)
        console.log(`⏳ [PROCESSING]: Requesting STK Push from Safaricom...`);
        const response = await mpesaService.initiateSTKPush(phoneNumber, amount, userId);
        
        // 5. Check if service returned an error instead of throwing
        if (response.success === false) {
            console.error(`❌ [SERVICE_REJECTION]: ${response.error}`);
            return res.status(400).json(response);
        }

        // 6. Success Logging
        console.log(`✅ [SUCCESS]: Safaricom Accepted Request`);
        console.log(`🆔 CheckoutRequestID: ${response.checkoutRequestId || 'N/A'}`);

        // 7. Send success back to React
        return res.status(200).json(response);

    } catch (error) {
        // 8. Error Logging
        console.error(`\n❌ [STK_PUSH_CONTROLLER_ERROR]:`);
        console.error(`👉 Message: ${error.message}`);
        console.error(`=========================================\n`);
        
        return res.status(500).json({ 
            success: false,   
            error: error.message 
        });
    }
};