import stkService from '../services/stk.service.js';
import { AIRTIME_RULES, TIME_STANDARDS } from '../config/businessRules.js';

/**
 * MANAGER: paymentController
 * Job: Handle the Request/Response for STK Initiation
 */
export const initiatePayment = async (req, res) => {
    try {
        const { phoneNumber, amount, userId, packageId } = req.body;
        
        // 1. ENHANCED LOGGING
        console.log(`\n=========================================`);
        console.log(`💳 [STK_PUSH_TRIGGER] Initiation`);
        console.log(`📱 Phone: ${phoneNumber} | 💰 Amt: ${amount} | 📦 Pkg: ${packageId || 'N/A'}`);
        console.log(`=========================================\n`);

        // 2. Validation
        if (!phoneNumber || !amount || !userId) {
            return res.status(400).json({ error: "Phone number, amount, and userId are required" });
        }

        // --- 🛡️ SECURITY LAYER A: MIDNIGHT RECONCILIATION GATE ---
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { 
            timeZone: TIME_STANDARDS.DISPLAY_TIMEZONE, 
            hour12: false 
        });

        if (currentTime >= TIME_STANDARDS.RECONCILIATION_GATE_TIME && currentTime <= "23:59:59") {
            return res.status(503).json({ error: "System maintenance. Please try again in 5 minutes." });
        }

        // --- 🛡️ SECURITY LAYER B: GLOBAL LIMITS CHECK ---
        if (amount < AIRTIME_RULES.MIN_PURCHASE_AMOUNT_KES || amount > AIRTIME_RULES.MAX_PURCHASE_AMOUNT_KES) {
            return res.status(400).json({ 
                error: `Amount must be between Ksh ${AIRTIME_RULES.MIN_PURCHASE_AMOUNT_KES} and Ksh ${AIRTIME_RULES.MAX_PURCHASE_AMOUNT_KES}` 
            });
        }

        // 3. Call the Specialized STK Service
        // NOTE: Ensure your stkService.initiateSTKPush uses the following CallBackURL:
        // https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback
        const response = await stkService.initiateSTKPush(phoneNumber, amount, userId, packageId);
        
        if (response.success === false) {
            console.error(`❌ [MPESA_REJECTED]:`, response.error);
            return res.status(400).json(response);
        }

        console.log(`✅ [STK_QUEUED]: CheckoutID: ${response.data?.CheckoutRequestID || 'Pending'}`);
        return res.status(200).json(response);

    } catch (error) {
        console.error(`❌ [STK_CONTROLLER_ERROR]: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
    }
};