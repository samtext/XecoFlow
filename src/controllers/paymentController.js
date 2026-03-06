import stkService from '../services/stk.service.js';
import floatService from '../services/floatService.js'; // 👈 NEW import
import { AIRTIME_RULES, TIME_STANDARDS } from '../config/businessRules.js';
import { storeSocketMapping } from '../../socket/helper.js';

/**
 * MANAGER: paymentController
 * Job: Handle the Request/Response for STK Initiation
 */
export const initiatePayment = async (req, res) => {
    try {
        const { phoneNumber, amount, userId, packageId, socketId } = req.body;
        
        // 1. ENHANCED LOGGING
        console.log(`\n=========================================`);
        console.log(`💳 [STK_PUSH_TRIGGER] Initiation`);
        console.log(`📱 Phone: ${phoneNumber} | 💰 Amt: ${amount} | 📦 Pkg: ${packageId || 'N/A'}`);
        
        if (socketId) {
            console.log(`🔌 Socket ID: ${socketId}`);
        }
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

        // --- 🆕 SECURITY LAYER C: FLOAT BALANCE CHECK ---
        console.log(`💰 Checking float balance for amount: Ksh ${amount}`);
        const floatCheck = await floatService.checkSufficientFloat(amount, 10); // 10% buffer
        
        console.log(`💰 Float status:`, {
            sufficient: floatCheck.sufficient,
            currentBalance: floatCheck.balance,
            required: floatCheck.required,
            amount: floatCheck.amount
        });

        if (!floatCheck.sufficient) {
            console.error(`❌ Insufficient float! Balance: ${floatCheck.balance}, Required: ${floatCheck.required}`);
            
            // Alert admin if float is critically low (optional)
            if (floatCheck.balance < floatCheck.required / 2) {
                console.error(`🚨 CRITICAL: Float critically low at Ksh ${floatCheck.balance}`);
                // You could send email/SMS alert here
            }
            
            return res.status(400).json({ 
                success: false,
                error: `Insufficient float balance. Current float is Ksh ${floatCheck.balance.toLocaleString()}. Maximum you can purchase is Ksh ${Math.floor(floatCheck.balance / 1.1).toLocaleString()}.`,
                floatInfo: {
                    currentBalance: floatCheck.balance,
                    requestedAmount: amount,
                    maxAllowed: Math.floor(floatCheck.balance / 1.1)
                }
            });
        }

        // 3. Call the Specialized STK Service
        const response = await stkService.initiateSTKPush(phoneNumber, amount, userId, packageId);
        
        if (response.success === false) {
            console.error(`❌ [MPESA_REJECTED]:`, response.error);
            return res.status(400).json(response);
        }

        // 4. Store socket mapping and reserve float
        if (response.data?.CheckoutRequestID) {
            const checkoutId = response.data.CheckoutRequestID;
            
            // Reserve the float for this transaction (prevents double-spending)
            await floatService.reserveFloat(checkoutId, amount);
            
            // Store socket mapping for real-time updates
            if (socketId) {
                storeSocketMapping(checkoutId, socketId);
                console.log(`🔌 [SOCKET_MAPPED]: Payment ${checkoutId} -> ${socketId}`);
            }
        }

        console.log(`✅ [STK_QUEUED]: CheckoutID: ${response.data?.CheckoutRequestID || 'Pending'}`);
        
        // 5. Return response with float info
        return res.status(200).json({
            ...response,
            floatInfo: {
                currentBalance: floatCheck.balance,
                remainingAfterReserve: floatCheck.balance - amount
            }
        });

    } catch (error) {
        console.error(`❌ [STK_CONTROLLER_ERROR]: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Release float for failed transactions
 * @route POST /api/payments/release-float
 */
export const releaseFloat = async (req, res) => {
    try {
        const { checkoutId, amount } = req.body;
        
        if (!checkoutId || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: "CheckoutId and amount required" 
            });
        }

        const released = await floatService.releaseFloat(checkoutId, amount);
        
        if (released) {
            return res.status(200).json({ 
                success: true, 
                message: "Float released successfully" 
            });
        } else {
            return res.status(500).json({ 
                success: false, 
                error: "Failed to release float" 
            });
        }
    } catch (error) {
        console.error("❌ Release float error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};