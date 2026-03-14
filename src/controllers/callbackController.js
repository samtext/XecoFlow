import Joi from 'joi';
import { randomUUID } from 'crypto';
import axios from 'axios'; // ✅ ADDED: For Node.js compatibility
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
    } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) { // ✅ FIXED: Added '1' for new prefixes
        cleaned = '254' + cleaned;
    } else if (cleaned.startsWith('2547') || cleaned.startsWith('2541')) {
        return cleaned;
    } else if (cleaned.startsWith('+254')) {
        cleaned = cleaned.substring(1);
    }
    
    if (cleaned.length === 12 && (cleaned.startsWith('2547') || cleaned.startsWith('2541'))) {
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
            code: "C2B00012",
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
    TransactionType: Joi.string().optional().allow('').default('N/A'),
    TransTime: Joi.string().optional().allow('').default('N/A'),
    BusinessShortCode: Joi.string().optional().allow('').default('N/A'),
    BillRefNumber: Joi.string().optional().allow('').default('N/A'),
    InvoiceNumber: Joi.string().optional().allow('').default('N/A'),
    OrgAccountBalance: Joi.string().optional().allow('').default('N/A'),
    ThirdPartyTransID: Joi.string().optional().allow('').default('N/A'),
    FirstName: Joi.string().optional().allow('').default('N/A'),
    MiddleName: Joi.string().optional().allow('').default('N/A'),
    LastName: Joi.string().optional().allow('').default('N/A'),
    
    TransID: Joi.string().required(),
    TransAmount: Joi.string().required(),
    MSISDN: Joi.string().required()
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
            
            const { error, value } = stkSchema.validate(req.body);
            
            if (error) {
                console.error(`❌ [${requestId}] STK Validation failed:`, error.message);
                await auditService.logError('stk_validation_error', {
                    requestId,
                    error: error.message,
                    receivedBody: req.body,
                    ip: ipAddress
                });
                return;
            }
            
            const callbackData = value.Body.stkCallback;
            const { CheckoutRequestID, ResultCode } = callbackData;
            
            console.log(`📦 [${requestId}] Transaction: ${CheckoutRequestID} | Status: ${ResultCode}`);
            
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
            
            let metadata = {};
            if (ResultCode === 0) {
                metadata = extractStkMetadata(callbackData);
                
                if (metadata.amount) {
                    const amountValidation = validateAmount(metadata.amount, CheckoutRequestID);
                    metadata.amountValid = amountValidation.valid;
                    metadata.profitAnalysis = amountValidation.profitAnalysis;
                }
            }
            
            const stkData = {
                checkoutRequestId: CheckoutRequestID,
                ...callbackData,
                ...metadata,
                requestId,
                rawPayload: req.body,
                ipAddress
            };
            
            await stkService.handleStkResult(stkData);
            
            const duration = Date.now() - startTime;
            console.log(`✅ [${requestId}] STK processed in ${duration}ms`);
            
        } catch (error) {
            console.error(`❌ [${requestId}] STK Fatal error:`, error.message);
            await auditService.logError('stk_fatal_error', {
                requestId,
                error: error.message,
                body: req.body,
                ip: getClientIp(req)
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
        
        const startTime = Date.now();
        const amountValidation = validateAmount(req.body.TransAmount, req.body.TransID);
        
        if (!amountValidation.valid) {
            console.log(`🚫 [${requestId}] Amount rejected:`, amountValidation.message);
            
            await auditService.logInfo('c2b_validation_rejected', {
                requestId,
                transactionId: req.body.TransID,
                amount: amountValidation.amount,
                reason: amountValidation.message
            });
            
            const responseTime = Date.now() - startTime;
            console.log(`⏱️ [${requestId}] Validation response time: ${responseTime}ms`);
            
            return res.status(200).json({ 
                ResultCode: amountValidation.code,
                ResultDesc: amountValidation.message
            });
        }
        
        const { error, value } = c2bSchema.validate(req.body);
        
        if (error) {
            console.warn(`⚠️ [${requestId}] Schema validation failed:`, error.message);
            await auditService.logError('c2b_validation_schema_error', {
                requestId,
                error: error.message,
                receivedBody: req.body,
                ip: ipAddress
            });
            
            return res.status(200).json({ 
                ResultCode: "C2B00016", 
                ResultDesc: "Invalid request format" 
            });
        }
        
        await c2bService.handleValidation({
            ...value,
            amount: amountValidation.amount,
            profitAnalysis: amountValidation.profitAnalysis,
            normalizedPhone: normalizePhone(value.MSISDN),
            requestId,
            ipAddress
        });
        
        const responseTime = Date.now() - startTime;
        console.log(`✅ [${requestId}] Validation accepted (${responseTime}ms)`);
        
        return res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Accepted"
        });
        
    } catch (error) {
        console.error(`❌ [${requestId}] Validation error:`, error.message);
        await auditService.logError('c2b_validation_fatal', {
            requestId,
            error: error.message,
            body: req.body,
            ip: getClientIp(req)
        });
        
        return res.status(200).json({ 
            ResultCode: 1, 
            ResultDesc: "Rejected due to internal error" 
        });
    }
};

// ============================================
// 💰 LANE 3: C2B CONFIRMATION (OPTIMIZED)
// ============================================
export const handleC2BConfirmation = async (req, res) => {
    const requestId = randomUUID();
    
    // 1. IMMEDIATE ACK - Before any processing!
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
    
    // 2. Process everything in background
    setImmediate(async () => {
        const startTime = Date.now();
        const businessShortcode = req.body.BusinessShortCode;
        
        try {
            const ipAddress = getClientIp(req);
            
            console.log(`\n💰 [${requestId}] C2B CONFIRMATION RECEIVED`);
            console.log(`   IP: ${ipAddress}`);
            console.log(`   Business: ${businessShortcode}`);
            console.log(`   Transaction: ${req.body.TransID}`);
            
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
                
                // Auto-reversal for below minimum (only if amount >= 10)
                // Skip reversal for very small amounts to avoid negative ROI
                if (amountValidation.amount >= 10) {
                    try {
                        console.log(`🔄 [${requestId}] INITIATING AUTO-REVERSAL for ${req.body.TransID}`);
                        
                        const reversalResult = await reversalService.initiateReversal(
                            req.body.TransID,
                            amountValidation.amount,
                            'Below minimum transaction amount',
                            req.body
                        );
                        
                        if (reversalResult.success) {
                            console.log(`✅ [${requestId}] Reversal initiated successfully`);
                            await auditService.logInfo('reversal_initiated', {
                                requestId,
                                transactionId: req.body.TransID,
                                amount: amountValidation.amount
                            });
                        } else {
                            console.error(`❌ [${requestId}] Reversal initiation failed:`, reversalResult.error);
                            // This will be logged to critical_failures table via service layer
                        }
                    } catch (reversalError) {
                        console.error(`❌ [${requestId}] Reversal error:`, reversalError.message);
                    }
                } else {
                    console.log(`ℹ️ [${requestId}] Amount below reversal threshold - manual refund required`);
                }
                
                return;
            }
            
            const { error, value } = c2bSchema.validate(req.body);
            
            if (error) {
                console.error(`❌ [${requestId}] Schema validation failed:`, error.message);
                await auditService.logError('c2b_confirmation_schema_error', {
                    requestId,
                    error: error.message,
                    receivedBody: req.body,
                    ip: ipAddress
                });
                return;
            }
            
            const existing = await c2bService.checkTransaction({
                id: value.TransID,
                type: 'C2B'
            });
            
            if (existing) {
                console.log(`🔄 [${requestId}] Duplicate transaction: ${value.TransID}`);
                await auditService.logInfo('c2b_confirmation_duplicate', {
                    requestId,
                    transactionId: value.TransID,
                    amount: amountValidation.amount
                });
                return;
            }
            
            const sanitizedData = {
                ...value,
                TransAmount: amountValidation.amount,
                normalizedPhone: normalizePhone(value.MSISDN),
                business_shortcode: businessShortcode,
                request_type: businessShortcode ? 'EXTERNAL' : 'INTERNAL',
                profitAnalysis: amountValidation.profitAnalysis,
                requestId,
                ipAddress,
                rawPayload: req.body,
                processedAt: new Date().toISOString()
            };
            
            await c2bService.handleConfirmation(sanitizedData);
            
            const duration = Date.now() - startTime;
            console.log(`✅ [${requestId}] Confirmation processed in ${duration}ms`);
            
            // Alert if transaction is unprofitable
            if (amountValidation.profitAnalysis.netProfit <= 0 && process.env.ALERT_ON_UNPROFITABLE === 'true') {
                try {
                    await axios.post(process.env.ALERT_WEBHOOK_URL, {
                        type: 'UNPROFITABLE_TRANSACTION',
                        requestId,
                        transactionId: value.TransID,
                        amount: amountValidation.amount,
                        profitAnalysis: amountValidation.profitAnalysis,
                        time: new Date().toISOString()
                    }, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (alertError) {
                    console.warn(`⚠️ Alert failed: ${alertError.message}`);
                }
            }
            
        } catch (error) {
            console.error(`❌ [${requestId}] Fatal error:`, error.message);
            
            const errorContext = {
                error: error.message,
                stack: error.stack,
                requestId,
                ip: getClientIp(req),
                transactionId: req.body?.TransID,
                amount: req.body?.TransAmount,
                businessShortcode
            };
            
            await auditService.logError('c2b_confirmation_fatal', errorContext);
            
            // Send alert for critical errors
            if (process.env.ALERT_WEBHOOK_URL) {
                try {
                    await axios.post(process.env.ALERT_WEBHOOK_URL, {
                        type: 'CRITICAL_PAYMENT_ERROR',
                        requestId,
                        transactionId: req.body?.TransID || 'UNKNOWN',
                        error: error.message,
                        time: new Date().toISOString()
                    }, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (alertError) {
                    console.warn(`⚠️ Critical alert failed: ${alertError.message}`);
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
        
        const profitAnalysis = calculateProfit(transaction.amount);
        
        return res.status(200).json({
            success: true,
            data: {
                id: transaction.transaction_id,
                amount: transaction.amount,
                phone: maskPhone(transaction.phone),
                status: transaction.status,
                time: transaction.created_at,
                business_shortcode: transaction.business_shortcode,
                request_type: transaction.request_type,
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

export const getMinimumAmount = () => transactionRules.minAmount;
export const getMaximumAmount = () => transactionRules.maxAmount;