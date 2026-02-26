import stkService from '../services/stk.service.js';
import c2bService from '../services/c2b.service.js';

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '0.0.0.0';
};

/**
 * 🚀 LANE 1: STK PUSH CALLBACK
 * Updated: Explicitly extracts nested IDs to prevent blank DB fields.
 */
export const handleMpesaCallback = async (req, res) => {
    // 1. ACKNOWLEDGE IMMEDIATELY (Crucial for Safaricom)
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    // 2. Process in the background so we don't hold the connection
    try {
        const ipAddress = getClientIp(req);
        const { Body } = req.body;

        // Diagnostic log: See exactly what arrived
        console.log(`📥 [STK_WEBHOOK]: From ${ipAddress}`);

        if (!Body || !Body.stkCallback) {
            console.warn("⚠️ [INVALID_PAYLOAD]: Payload missing 'Body.stkCallback' structure.");
            return;
        }

        const callbackData = Body.stkCallback;
        
        // ✨ DATA EXTRACTION: These match your DB columns
        const { 
            CheckoutRequestID, 
            MerchantRequestID, // Added to fix blank fields
            ResultCode, 
            ResultDesc 
        } = callbackData;

        console.log(`📦 [TRANSACTION]: ID ${CheckoutRequestID} | Status: ${ResultCode} (${ResultDesc})`);

        // Only process success metadata if ResultCode is 0
        if (ResultCode === 0 && callbackData.CallbackMetadata) {
            console.log("✅ [SUCCESS_DATA]:", JSON.stringify(callbackData.CallbackMetadata, null, 2));
        }

        // Delegate to service with enriched data object
        try {
            // We pass the full body + the extracted IDs to ensure the service has everything
            await stkService.handleStkResult({
                ...callbackData,
                full_payload: req.body // Providing the raw payload for logging
            });
        } catch (serviceErr) {
            console.error("❌ [STK_SERVICE_ERROR]:", serviceErr.message);
        }

    } catch (error) {
        console.error("❌ [CRITICAL_CALLBACK_FAIL]:", error.message);
    }
};

/**
 * 🛡️ LANE 2: C2B VALIDATION
 * Updated: Parses amount to ensure it meets minimum requirements before DB check.
 */
export const handleC2BValidation = async (req, res) => {
    try {
        const amount = parseFloat(req.body.TransAmount);
        console.log(`🔍 [C2B_VALIDATION]: ID ${req.body.TransID} | Amount: ${amount}`);
        
        // 🚩 DEBUG: Check if amount is below your DB constraint (likely 5.00)
        if (amount < 1.0) {
             console.warn(`⚠️ [LOW_AMOUNT]: Rejecting ${amount} KES as it is too low.`);
             return res.status(200).json({ "ResultCode": "C2B00016", "ResultDesc": "Rejected: Below Minimum Amount" });
        }

        await c2bService.handleValidation(req.body);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
        
    } catch (error) {
        console.error("❌ [C2B_VALID_ERROR]:", error.message);
        return res.status(200).json({ "ResultCode": 0, "ResultDesc": "Accepted" });
    }
};

/**
 * 💰 LANE 3: C2B CONFIRMATION
 * Updated: Added error-safe acknowledgment to prevent Safaricom retries during DB Constraint errors.
 */
export const handleC2BConfirmation = async (req, res) => {
    // Immediate ACK (Required: M-Pesa will timeout in 10s otherwise)
    res.status(200).json({ "ResultCode": 0, "ResultDesc": "Success" });

    try {
        const amount = parseFloat(req.body.TransAmount);
        console.log(`💰 [C2B_CONFIRMATION]: TransID: ${req.body.TransID} | Amount: ${amount}`);
        
        // 🚩 DATA CLEANING: Ensure service receives a sanitized object
        const sanitizedData = {
            ...req.body,
            TransAmount: amount, // Overwrite string with float
            BillRefNumber: req.body.BillRefNumber || "N/A"
        };

        await c2bService.handleConfirmation(sanitizedData);
        
    } catch (error) {
        // 🚩 LOGGING THE SPECIFIC DB ERROR (e.g., Amount Constraint)
        console.error("❌ [C2B_CONF_ERROR]:", error.message);
        if (error.message.includes('constraint')) {
            console.error("👉 TIP: Run the SQL command to drop your 'amount_check' constraint in the DB.");
        }
    }
};