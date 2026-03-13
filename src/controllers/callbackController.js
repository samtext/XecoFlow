import Joi from 'joi';
import { randomUUID } from 'crypto';
import stkService from '../services/stk.service.js';
import c2bService from '../services/c2b.service.js';
import reversalService from '../services/reversal.service.js';
import * as auditService from '../services/auditService.js';
import { transactionRules, calculateProfit } from '../config/businessRules.js';

// ============================================
// 📱 UTILITY FUNCTIONS
// ============================================
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '0.0.0.0';
};

const maskPhone = (phone) => {
    if (!phone) return phone;
    const cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length < 10) return '***';
    return cleaned.slice(0, 4) + '***' + cleaned.slice(-3);
};

const normalizePhone = (phone) => {
    if (!phone) return null;
    
    let cleaned = phone.toString().replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7')) {
        cleaned = '254' + cleaned;
    } else if (cleaned.startsWith('2547')) {
        return cleaned;
    } else if (cleaned.startsWith('+254')) {
        cleaned = cleaned.substring(1);
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('254')) {
        return cleaned;
    }
    
    return null;
};

// ============================================
// 💰 AMOUNT VALIDATION HELPER
// ============================================
const validateAmount = (amount, transactionId = 'unknown') => {
    const parsedAmount = parseFloat(amount);
    
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return {
            valid: false,
            code: "C2B00016",
            message: "Invalid amount format",
            amount: 0
        };
    }
    
    if (parsedAmount < transactionRules.minAmount) {
        console.warn(`🚫 Amount too low: KES ${parsedAmount} (min: KES ${transactionRules.minAmount})`, {
            transactionId,
            amount: parsedAmount,
            minAmount: transactionRules.minAmount
        });
        
        return {
            valid: false,
            code: "C2B00016",
            message: transactionRules.messages.belowMinimum(transactionRules.minAmount),
            amount: parsedAmount
        };
    }
    
    if (parsedAmount > transactionRules.maxAmount) {
        console.warn(`🚫 Amount too high: KES ${parsedAmount} (max: KES ${transactionRules.maxAmount})`);
        
        return {
            valid: false,
            code: "C2B00016",
            message: transactionRules.messages.aboveMaximum(transactionRules.maxAmount),
            amount: parsedAmount
        };
    }
    
    // Optional: Check business hours
    if (process.env.CHECK_BUSINESS_HOURS === 'true') {
        const hour = new Date().getHours();
        const { start, end } = transactionRules.businessHours;
        
        if (hour < start || hour >= end) {
            return {
                valid: false,
                code: "C2B00016",
                message: transactionRules.messages.outsideBusinessHours,
                amount: parsedAmount
            };
        }
    }
    
    return {
        valid: true,
        amount: parsedAmount,
        profitAnalysis: calculateProfit(parsedAmount)
    };
};

// ============================================
// ✅ VALIDATION SCHEMAS
// ============================================
const stkSchema = Joi.object({
    Body: Joi.object({
        stkCallback: Joi.object({
            CheckoutRequestID: Joi.string().required(),
            MerchantRequestID: Joi.string().required(),
            ResultCode: Joi.number().required(),
            ResultDesc: Joi.string().required(),
            CallbackMetadata: Joi.object({
                Item: Joi.array().items(
                    Joi.object({
                        Name: Joi.string().required(),
                        Value: Joi.any().required()
                    })
                )
            }).optional()
        }).required()
    }).required()
});

const c2bSchema = Joi.object({
    TransactionType: Joi.string().optional(),
    TransID: Joi.string().required(),
    TransTime: Joi.string().optional(),
    TransAmount: Joi.string().required(),
    BusinessShortCode: Joi.string().optional(),
    BillRefNumber: Joi.string().optional().allow('').default('N/A'),
    InvoiceNumber: Joi.string().optional(),
    OrgAccountBalance: Joi.string().optional(),
    ThirdPartyTransID: Joi.string().optional(),
    MSISDN: Joi.string().required(),
    FirstName: Joi.string().optional(),
    MiddleName: Joi.string().optional(),
    LastName: Joi.string().optional()
});

// ============================================
// 📊 METADATA EXTRACTOR FOR STK
// ============================================
const extractStkMetadata = (callbackData) => {
    if (!callbackData.CallbackMetadata?.Item) return {};
    
    const metadata = {};
    callbackData.CallbackMetadata.Item.forEach(item => {
        metadata[item.Name] = item.Value;
    });
    
    return {
        amount: metadata.Amount,
        phone: normalizePhone(metadata.PhoneNumber),
        receiptNumber: metadata.MpesaReceiptNumber,
        transactionDate: metadata.TransactionDate,
        balance: metadata.OrgAccountBalance
    };
};

// ============================================
// 🚀 LANE 1: STK PUSH CALLBACK
// ============================================
export const handleMpesaCallback = async (req, res) => {
    const requestId = randomUUID();
    const startTime = Date.now();
    
    // 1. ACKNOWLEDGE IMMEDIATELY
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
    
    // 2. Process in background
    setImmediate(async () => {
        try {
            const ipAddress = getClientIp(req);
            
            console.log(`\n📥 [${requestId}] STK CALLBACK RECEIVED`);
            console.log(`   IP: ${ipAddress}`);
            console.log(`   Content-Type: ${req.headers['content-type']}`);
            
            // 3. Validate input
            const { error, value } = stkSchema.validate(req.body);
            
            if (error) {
                console.error(`❌ [${requestId}] STK Validation failed:`, error.message);
                
                await auditService.logError('stk_validation_error', {
                    requestId,
                    error: error.message,
                    receivedBody: req.body,
                    headers: req.headers,
                    ip: ipAddress,
                    timestamp: new Date().toISOString()
                });
                return;
            }
            
            const callbackData = value.Body.stkCallback;
            const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc } = callbackData;
            
            console.log(`📦 [${requestId}] Transaction: ${CheckoutRequestID}`);
            console.log(`   Status: ${ResultCode} - ${ResultDesc}`);
            
            // 4. Check idempotency
            const existing = await c2bService.checkTransaction({
                id: CheckoutRequestID,
                type: 'STK'
            });
            
            if (existing) {
                console.log(`🔄 [${requestId}] Duplicate STK: ${CheckoutRequestID}`);
                await auditService.logInfo('duplicate_stk', {
                    requestId,
                    transactionId: CheckoutRequestID,
                    status: existing.status
                });
                return;
            }
            
            // 5. Extract metadata for successful transactions
            let metadata = {};
            if (ResultCode === 0) {
                metadata = extractStkMetadata(callbackData);
                console.log(`📱 [${requestId}] Customer: ${metadata.phone || 'Unknown'}`);
                console.log(`💰 Amount: KES ${metadata.amount || 'Unknown'}`);
                console.log(`🧾 Receipt: ${metadata.receiptNumber || 'N/A'}`);
                
                // 6. Validate amount for successful transactions
                if (metadata.amount) {
                    const amountValidation = validateAmount(metadata.amount, CheckoutRequestID);
                    
                    if (!amountValidation.valid) {
                        console.warn(`⚠️ [${requestId}] Amount validation failed:`, amountValidation.message);
                        
                        await auditService.logInfo('stk_amount_rejected', {
                            requestId,
                            transactionId: CheckoutRequestID,
                            amount: metadata.amount,
                            reason: amountValidation.message
                        });
                        
                        // Still save but mark as rejected
                        metadata.amountValid = false;
                        metadata.rejectionReason = amountValidation.message;
                    } else {
                        metadata.amountValid = true;
                        metadata.profitAnalysis = amountValidation.profitAnalysis;
                        console.log(`📊 Profit: ${amountValidation.profitAnalysis.netProfit > 0 ? '✅' : '⚠️'}`);
                    }
                }
            }
            
            // 7. Prepare data for service
            const stkData = {
                checkoutRequestId: CheckoutRequestID,
                merchantRequestId: MerchantRequestID,
                resultCode: ResultCode,
                resultDesc: ResultDesc,
                ...metadata,
                requestId,
                rawPayload: req.body,
                ipAddress
            };
            
            // 8. Delegate to service
            await stkService.handleStkResult(stkData);
            
            const duration = Date.now() - startTime;
            console.log(`✅ [${requestId}] STK processed in ${duration}ms`);
            
        } catch (error) {
            console.error(`❌ [${requestId}] STK Fatal error:`, error.message);
            
            await auditService.logError('stk_fatal_error', {
                requestId,
                error: error.message,
                stack: error.stack,
                headers: req.headers,
                body: req.body,
                ip: getClientIp(req),
                url: req.url,
                method: req.method,
                timestamp: new Date().toISOString()
            });
        }
    });
};

// ============================================
// 🛡️ LANE 2: C2B VALIDATION
// ============================================
export const handleC2BValidation = async (req, res) => {
    const requestId = randomUUID();
    
    try {
        const ipAddress = getClientIp(req);
        
        console.log(`\n🔍 [${requestId}] C2B VALIDATION RECEIVED`);
        console.log(`   IP: ${ipAddress}`);
        
        // 1. AMOUNT VALIDATION FIRST (KES 10 minimum)
        const amountValidation = validateAmount(req.body.TransAmount, req.body.TransID);
        
        if (!amountValidation.valid) {
            console.log(`🚫 [${requestId}] Amount rejected:`, amountValidation.message);
            
            await auditService.logInfo('c2b_validation_rejected', {
                requestId,
                transactionId: req.body.TransID,
                amount: amountValidation.amount,
                reason: amountValidation.message
            });
            
            return res.status(200).json({ 
                ResultCode: amountValidation.code,
                ResultDesc: amountValidation.message
            });
        }
        
        // 2. Validate input schema (with fixed BillRefNumber)
        const { error, value } = c2bSchema.validate(req.body);
        
        if (error) {
            console.warn(`⚠️ [${requestId}] Schema validation failed:`, error.message);
            
            await auditService.logError('c2b_validation_schema_error', {
                requestId,
                error: error.message,
                receivedBody: req.body,
                headers: req.headers,
                ip: ipAddress
            });
            
            return res.status(200).json({ 
                ResultCode: "C2B00016", 
                ResultDesc: "Invalid request format" 
            });
        }
        
        console.log(`💰 Amount: KES ${amountValidation.amount} (Valid)`);
        console.log(`📊 Profit: ${amountValidation.profitAnalysis.netProfit > 0 ? '✅ Profitable' : '⚠️ Low margin'}`);
        console.log(`📱 From: ${maskPhone(value.MSISDN)}`);
        
        // 3. Delegate to service with validated amount
        await c2bService.handleValidation({
            ...value,
            amount: amountValidation.amount,
            profitAnalysis: amountValidation.profitAnalysis,
            normalizedPhone: normalizePhone(value.MSISDN),
            requestId,
            ipAddress
        });
        
        console.log(`✅ [${requestId}] Validation accepted`);
        
        return res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Accepted",
            info: {
                amount: amountValidation.amount,
                minAmount: transactionRules.minAmount,
                profitable: amountValidation.profitAnalysis.netProfit > 0
            }
        });
        
    } catch (error) {
        console.error(`❌ [${requestId}] Validation error:`, error.message);
        
        await auditService.logError('c2b_validation_fatal', {
            requestId,
            error: error.message,
            stack: error.stack,
            headers: req.headers,
            body: req.body,
            ip: getClientIp(req)
        });
        
        // Accept to prevent retries, but log the error
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
};

// ============================================
// 💰 LANE 3: C2B CONFIRMATION WITH AUTO-REVERSAL
// ============================================
export const handleC2BConfirmation = async (req, res) => {
    const requestId = randomUUID();
    const startTime = Date.now();
    
    // 1. IMMEDIATE ACK
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
    
    // 2. Process in background
    setImmediate(async () => {
        try {
            const ipAddress = getClientIp(req);
            
            console.log(`\n💰 [${requestId}] C2B CONFIRMATION RECEIVED`);
            console.log(`   IP: ${ipAddress}`);
            console.log(`   Content-Type: ${req.headers['content-type']}`);
            
            // 3. AMOUNT VALIDATION FIRST (KES 10 minimum)
            const amountValidation = validateAmount(req.body.TransAmount, req.body.TransID);
            
            if (!amountValidation.valid) {
                console.log(`🚫 [${requestId}] Amount rejected:`, amountValidation.message);
                
                await auditService.logInfo('c2b_confirmation_rejected', {
                    requestId,
                    transactionId: req.body.TransID,
                    amount: amountValidation.amount,
                    reason: amountValidation.message,
                    ip: ipAddress
                });
                
                // ============================================
                // 🚀 AUTO-REVERSAL FOR BELOW MINIMUM AMOUNTS
                // ============================================
                try {
                    console.log(`🔄 [${requestId}] INITIATING AUTO-REVERSAL for ${req.body.TransID}`);
                    
                    // ✅ FIXED: Pass the full request body as the 4th parameter
                    const reversalResult = await reversalService.initiateReversal(
                        req.body.TransID,
                        amountValidation.amount,
                        'Below minimum transaction amount',
                        req.body  // Pass the full request data
                    );
                    
                    if (reversalResult.success) {
                        console.log(`✅ [${requestId}] Reversal initiated successfully`);
                        await auditService.logInfo('reversal_initiated', {
                            requestId,
                            transactionId: req.body.TransID,
                            amount: amountValidation.amount,
                            conversationId: reversalResult.data?.ConversationID
                        });
                    } else {
                        console.error(`❌ [${requestId}] Reversal initiation failed:`, reversalResult.error);
                        await auditService.logError('reversal_failed', {
                            requestId,
                            transactionId: req.body.TransID,
                            amount: amountValidation.amount,
                            error: reversalResult.error
                        });
                    }
                } catch (reversalError) {
                    console.error(`❌ [${requestId}] Reversal error:`, reversalError.message);
                    await auditService.logError('reversal_exception', {
                        requestId,
                        transactionId: req.body.TransID,
                        amount: amountValidation.amount,
                        error: reversalError.message
                    });
                }
                
                return; // Don't process further
            }
            
            // 4. Validate input schema (with fixed BillRefNumber)
            const { error, value } = c2bSchema.validate(req.body);
            
            if (error) {
                console.error(`❌ [${requestId}] Schema validation failed:`, error.message);
                
                await auditService.logError('c2b_confirmation_schema_error', {
                    requestId,
                    error: error.message,
                    receivedBody: req.body,
                    receivedBodyKeys: req.body ? Object.keys(req.body) : [],
                    headers: req.headers,
                    ip: ipAddress,
                    contentType: req.headers['content-type'],
                    timestamp: new Date().toISOString()
                });
                
                return;
            }
            
            const amount = amountValidation.amount;
            
            console.log(`   Transaction: ${value.TransID}`);
            console.log(`   Amount: KES ${amount} (Validated)`);
            console.log(`   From: ${maskPhone(value.MSISDN)}`);
            console.log(`   Ref: ${value.BillRefNumber || 'N/A'}`);
            console.log(`   Profit: KES ${amountValidation.profitAnalysis.netProfit.toFixed(2)}`);
            
            // 5. Check idempotency with type
            const existing = await c2bService.checkTransaction({
                id: value.TransID,
                type: 'C2B'
            });
            
            if (existing) {
                console.log(`🔄 [${requestId}] Duplicate transaction: ${value.TransID}`);
                
                await auditService.logInfo('c2b_confirmation_duplicate', {
                    requestId,
                    transactionId: value.TransID,
                    amount,
                    status: existing.status,
                    originalTime: existing.created_at
                });
                
                return;
            }
            
            // 6. Prepare sanitized data
            const sanitizedData = {
                ...value,
                TransAmount: amount,
                normalizedPhone: normalizePhone(value.MSISDN),
                profitAnalysis: amountValidation.profitAnalysis,
                requestId,
                ipAddress,
                rawPayload: req.body,
                processedAt: new Date().toISOString(),
                meetsMinimum: true,
                isProfitable: amountValidation.profitAnalysis.netProfit > 0
            };
            
            // 7. Delegate to service
            await c2bService.handleConfirmation(sanitizedData);
            
            const duration = Date.now() - startTime;
            console.log(`✅ [${requestId}] Confirmation processed in ${duration}ms`);
            console.log(`   Transaction ${value.TransID} saved to database`);
            
            // 8. Log success with profitability info
            await auditService.logInfo('c2b_confirmation_success', {
                requestId,
                transactionId: value.TransID,
                amount,
                phone: maskPhone(value.MSISDN),
                profit: amountValidation.profitAnalysis.netProfit,
                profitable: amountValidation.profitAnalysis.netProfit > 0,
                duration
            });
            
            // 9. Alert if transaction is unprofitable (for business review)
            if (amountValidation.profitAnalysis.netProfit <= 0 && process.env.ALERT_ON_UNPROFITABLE === 'true') {
                try {
                    await fetch(process.env.ALERT_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'UNPROFITABLE_TRANSACTION',
                            requestId,
                            transactionId: value.TransID,
                            amount,
                            profitAnalysis: amountValidation.profitAnalysis,
                            time: new Date().toISOString()
                        })
                    });
                } catch (alertError) {
                    // Silent fail
                }
            }
            
        } catch (error) {
            console.error(`❌ [${requestId}] Fatal error:`, error.message);
            
            // Log EVERYTHING including full body
            const errorContext = {
                error: error.message,
                stack: error.stack,
                requestId,
                ip: getClientIp(req),
                url: req.url,
                method: req.method,
                headers: req.headers,
                timestamp: new Date().toISOString()
            };
            
            if (req.body) {
                errorContext.bodyType = typeof req.body;
                errorContext.bodyKeys = Object.keys(req.body);
                errorContext.bodySample = JSON.stringify(req.body).substring(0, 500);
                errorContext.fullBody = req.body;
                errorContext.transactionId = req.body.TransID || 'MISSING';
                errorContext.amount = req.body.TransAmount || 'MISSING';
            } else {
                errorContext.bodyStatus = 'NO BODY RECEIVED';
            }
            
            // Try to use auditService, but don't crash if it fails
            try {
                await auditService.logError('c2b_confirmation_fatal', errorContext);
            } catch (auditError) {
                console.error('⚠️ Audit service failed:', auditError.message);
                // Fallback to console
                console.error('FATAL ERROR CONTEXT:', JSON.stringify(errorContext, null, 2));
            }
            
            if (error.message.includes('constraint') || error.message.includes('duplicate key')) {
                console.error(`👉 TIP: Database constraint issue for ${req.body?.TransID || 'unknown'}`);
            }
            
            // Send alert for critical errors
            if (process.env.ALERT_WEBHOOK_URL) {
                try {
                    await fetch(process.env.ALERT_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'CRITICAL_PAYMENT_ERROR',
                            requestId,
                            transactionId: req.body?.TransID || 'UNKNOWN',
                            error: error.message,
                            time: new Date().toISOString(),
                            environment: process.env.NODE_ENV
                        })
                    });
                } catch (alertError) {
                    // Silent fail
                }
            }
        }
    });
};

// ============================================
// 🏓 HELPER: Check transaction status
// ============================================
export const checkTransactionStatus = async (req, res) => {
    try {
        const { transactionId } = req.params;
        
        if (!transactionId) {
            return res.status(400).json({ error: 'Transaction ID required' });
        }
        
        const transaction = await c2bService.getTransaction(transactionId);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Calculate profitability for response
        const profitAnalysis = calculateProfit(transaction.amount);
        
        return res.status(200).json({
            status: 'success',
            transaction: {
                id: transaction.transaction_id,
                amount: transaction.amount,
                phone: maskPhone(transaction.phone),
                status: transaction.status,
                time: transaction.created_at,
                profitability: {
                    netProfit: profitAnalysis.netProfit,
                    isProfitable: profitAnalysis.netProfit > 0
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Status check error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// ============================================
// 📊 EXPORT CONFIG FOR OTHER FILES
// ============================================
export const getMinimumAmount = () => transactionRules.minAmount;
export const getMaximumAmount = () => transactionRules.maxAmount;