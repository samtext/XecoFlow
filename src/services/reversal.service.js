// src/services/reversal.service.js
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../config/db.js';
import stkService from './stk.service.js';
import mpesaConfig from '../config/mpesa.js';
import { sendAdminAlert } from '../utils/alertUtils.js';

class ReversalService {
    /**
     * Calculate wait time based on amount (your rules)
     */
    getWaitTimeMinutes(amount) {
        if (amount <= 150) return 2;
        if (amount <= 300) return 3;
        if (amount <= 500) return 6;
        return null; // >500 - no auto-reversal
    }

    /**
     * Check if transaction is eligible for auto-reversal
     */
    isEligibleForAutoReversal(transaction) {
        // Must have payment success
        if (transaction.status !== 'PAYMENT_SUCCESS') return false;
        
        // Must have failed airtime
        if (transaction.airtime_status !== 'FAILED') return false;
        
        // Amount must be between 10 and 500
        const amount = parseFloat(transaction.amount);
        if (amount < 10 || amount > 500) return false;
        
        // Not already reversed
        if (transaction.reversal_status) return false;
        
        // Check if wait time has elapsed
        const waitMinutes = this.getWaitTimeMinutes(amount);
        if (!waitMinutes) return false;
        
        const createdTime = new Date(transaction.created_at).getTime();
        const now = Date.now();
        const elapsedMinutes = (now - createdTime) / (1000 * 60);
        
        return elapsedMinutes >= waitMinutes;
    }

    /**
     * Initiate reversal with retry logic (3 attempts)
     * FIXED: Now works even if transaction isn't in database yet
     */
    async initiateReversal(transactionId, amount, reason = 'Airtime delivery failed', requestData = null) {
        console.log(`🔄 [REVERSAL] Starting for transaction: ${transactionId}, Amount: KES ${amount}`);
        
        let attempts = 0;
        const MAX_RETRIES = 3;
        let lastError = null;

        while (attempts < MAX_RETRIES) {
            attempts++;
            try {
                console.log(`📡 [REVERSAL] Attempt ${attempts}/${MAX_RETRIES} for ${transactionId}`);
                
                // 🚨 FIX: Don't fail if transaction not in DB - just proceed with reversal
                // The transaction might not be saved yet (below minimum case)
                let transaction = null;
                try {
                    const { data, error } = await db
                        .from('mpesa_transactions')
                        .select('*')
                        .eq('transaction_id', transactionId)
                        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error
                    
                    if (!error && data) {
                        transaction = data;
                        console.log(`📦 [REVERSAL] Found transaction in DB:`, transactionId);
                        
                        // Check if already reversed
                        if (transaction.reversal_status === 'SUCCESS') {
                            console.log(`⚠️ [REVERSAL] Transaction ${transactionId} already reversed`);
                            return { success: true, message: 'Already reversed' };
                        }
                    } else {
                        console.log(`📦 [REVERSAL] Transaction ${transactionId} not in DB yet - continuing with reversal`);
                    }
                } catch (dbError) {
                    console.log(`⚠️ [REVERSAL] DB check failed (non-critical):`, dbError.message);
                    // Continue with reversal even if DB check fails
                }

                // Get M-PESA access token
                const token = await stkService.getOAuthToken();

                // Prepare reversal request
                const url = mpesaConfig.environment === 'production'
                    ? 'https://api.safaricom.co.ke/mpesa/reversal/v1/request'
                    : 'https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request';

                // Generate unique originator conversation ID
                const originatorConversationID = crypto.randomUUID();

                const requestBody = {
                    Initiator: process.env.MPESA_INITIATOR_NAME,
                    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
                    CommandID: 'TransactionReversal',
                    TransactionID: transactionId,
                    Amount: amount,
                    ReceiverParty: process.env.MPESA_SHORTCODE,
                    RecieverIdentifierType: '11',
                    ResultURL: `${process.env.BASE_URL}/api/v1/reversal/result`,
                    QueueTimeOutURL: `${process.env.BASE_URL}/api/v1/reversal/timeout`,
                    Remarks: reason.substring(0, 100) // M-PESA limit
                };

                console.log(`📤 [REVERSAL] Request body:`, JSON.stringify(requestBody, null, 2));

                // Call M-PESA reversal API with timeout
                const response = await axios.post(url, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                });

                console.log(`📥 [REVERSAL] Response:`, response.data);

                // Try to log reversal attempt (don't fail if DB error)
                try {
                    await db.from('reversal_logs').insert([{
                        transaction_id: transactionId,
                        amount: amount,
                        status: 'PENDING',
                        initiated_by: 'SYSTEM',
                        initiated_at: new Date().toISOString(),
                        mpesa_conversation_id: response.data.ConversationID,
                        mpesa_originator_conversation_id: response.data.OriginatorConversationID,
                        raw_callback: response.data,
                        attempt: attempts,
                        request_data: requestData
                    }]);
                    console.log(`✅ [REVERSAL] Log saved to database`);
                } catch (logError) {
                    console.log(`⚠️ [REVERSAL] Could not save log to DB:`, logError.message);
                    // Continue - reversal already initiated
                }

                // Try to update transaction status if it exists
                if (transaction) {
                    try {
                        await db.from('mpesa_transactions')
                            .update({
                                reversal_status: 'PENDING',
                                reversal_initiated_at: new Date().toISOString(),
                                reversal_attempts: attempts
                            })
                            .eq('transaction_id', transactionId);
                        console.log(`✅ [REVERSAL] Transaction status updated`);
                    } catch (updateError) {
                        console.log(`⚠️ [REVERSAL] Could not update transaction:`, updateError.message);
                    }
                }

                return {
                    success: true,
                    data: response.data,
                    message: 'Reversal initiated successfully'
                };

            } catch (error) {
                lastError = error;
                console.error(`❌ [REVERSAL] Attempt ${attempts} failed:`, error.message);
                
                // Try to log failed attempt
                try {
                    await db.from('reversal_logs').insert([{
                        transaction_id: transactionId,
                        amount: amount,
                        status: 'FAILED',
                        initiated_by: 'SYSTEM',
                        initiated_at: new Date().toISOString(),
                        error_message: error.message,
                        attempt: attempts,
                        request_data: requestData
                    }]);
                } catch (logError) {
                    // Silent fail
                }

                // Wait before retry (exponential backoff)
                if (attempts < MAX_RETRIES) {
                    const waitTime = attempts * 2000; // 2s, 4s, 6s
                    console.log(`⏳ Waiting ${waitTime}ms before retry ${attempts + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        // All retries failed - alert admin
        console.error(`❌ [REVERSAL] All ${MAX_RETRIES} attempts failed for ${transactionId}`);
        
        // Try to mark for manual review
        try {
            // First check if transaction exists
            const { data: transaction } = await db
                .from('mpesa_transactions')
                .select('id')
                .eq('transaction_id', transactionId)
                .maybeSingle();
            
            if (transaction) {
                await db.from('mpesa_transactions')
                    .update({
                        reversal_status: 'FAILED',
                        requires_manual_review: true
                    })
                    .eq('transaction_id', transactionId);
            }
        } catch (dbError) {
            console.log(`⚠️ [REVERSAL] Could not mark for manual review:`, dbError.message);
        }

        // Send admin alert
        await sendAdminAlert({
            type: 'REVERSAL_FAILED',
            transactionId,
            amount,
            error: lastError?.message,
            attempts: MAX_RETRIES
        });

        return {
            success: false,
            error: lastError?.message,
            message: 'All retry attempts failed'
        };
    }

    /**
     * Handle reversal result callback from M-PESA
     */
    async handleReversalResult(callbackData) {
        console.log(`📞 [REVERSAL] Result callback received:`, JSON.stringify(callbackData, null, 2));

        try {
            const result = callbackData.Result;
            const transactionId = result.TransactionID;
            const resultCode = result.ResultCode;
            const resultDesc = result.ResultDesc;

            // Find the original transaction ID from result parameters
            let originalTransactionId = transactionId;
            if (result.ResultParameters?.ResultParameter) {
                const originalParam = result.ResultParameters.ResultParameter.find(
                    p => p.Key === 'OriginalTransactionID'
                );
                if (originalParam) {
                    originalTransactionId = originalParam.Value;
                }
            }

            // Update reversal log
            await db.from('reversal_logs')
                .update({
                    status: resultCode === 0 ? 'SUCCESS' : 'FAILED',
                    completed_at: new Date().toISOString(),
                    result_code: resultCode,
                    result_desc: resultDesc,
                    raw_callback: callbackData
                })
                .eq('mpesa_conversation_id', result.ConversationID);

            // Update transaction if it exists
            try {
                await db.from('mpesa_transactions')
                    .update({
                        reversal_status: resultCode === 0 ? 'SUCCESS' : 'FAILED',
                        reversal_completed_at: new Date().toISOString()
                    })
                    .eq('transaction_id', originalTransactionId);
            } catch (updateError) {
                console.log(`⚠️ [REVERSAL] Could not update transaction:`, updateError.message);
            }

            if (resultCode === 0) {
                console.log(`✅ [REVERSAL] Success for transaction ${originalTransactionId}`);
            } else {
                console.log(`⚠️ [REVERSAL] Failed for transaction ${originalTransactionId}: ${resultDesc}`);
                
                // If failed, check if we should retry
                if (resultCode === 'R000002' || resultCode === 'R000001') {
                    // Invalid or already reversed - don't retry
                    console.log(`📌 [REVERSAL] Permanent failure, not retrying`);
                } else {
                    console.log(`📌 [REVERSAL] Temporary failure, will be retried by queue`);
                }
            }

            return { success: true };

        } catch (error) {
            console.error(`❌ [REVERSAL] Error handling callback:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle reversal timeout callback
     */
    async handleReversalTimeout(callbackData) {
        console.log(`⏰ [REVERSAL] Timeout callback received:`, JSON.stringify(callbackData, null, 2));
        
        // Log timeout
        await db.from('reversal_logs')
            .update({
                status: 'TIMEOUT',
                completed_at: new Date().toISOString(),
                raw_callback: callbackData
            })
            .eq('mpesa_conversation_id', callbackData.ConversationID);

        // Transaction will be picked up by queue job for retry
        return { success: true };
    }

    /**
     * Process high-value failures (>500) - alert only
     */
    async handleHighValueFailure(transaction) {
        console.log(`⚠️ [HIGH_VALUE] Transaction ${transaction.transaction_id} KES ${transaction.amount} failed`);

        // Create admin alert
        await db.from('admin_alerts').insert([{
            transaction_id: transaction.transaction_id,
            amount: transaction.amount,
            alert_type: 'HIGH_VALUE_FAILURE',
            message: `KES ${transaction.amount} payment failed - requires manual review`,
            created_at: new Date().toISOString()
        }]);

        // Send email alert
        await sendAdminAlert({
            type: 'HIGH_VALUE_FAILURE',
            transactionId: transaction.transaction_id,
            amount: transaction.amount,
            message: 'Manual intervention required'
        });

        // Mark transaction
        await db.from('mpesa_transactions')
            .update({
                requires_manual_review: true,
                manual_review_reason: 'High value failure (>500)'
            })
            .eq('transaction_id', transaction.transaction_id);
    }
}

export default new ReversalService();