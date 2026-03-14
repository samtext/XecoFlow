// src/controllers/reversalController.js
import reversalService from '../services/reversal.service.js';
import { db } from '../config/db.js';

/**
 * 📥 Handle reversal result callback from M-PESA
 * This is called when M-PESA completes processing a reversal
 */
export const handleReversalResult = async (req, res) => {
    console.log(`\n📞 [REVERSAL_CALLBACK] Result callback received`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
    
    // Immediate ACK to M-PESA (must respond quickly)
    res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Success" 
    });

    // Process in background (don't block M-PESA)
    setImmediate(async () => {
        try {
            console.log(`🔄 [REVERSAL_CALLBACK] Processing in background...`);
            await reversalService.handleReversalResult(req.body);
            console.log(`✅ [REVERSAL_CALLBACK] Processed successfully`);
        } catch (error) {
            console.error(`❌ [REVERSAL_CALLBACK] Error:`, error.message);
            
            // Log to database if possible
            try {
                await db.from('reversal_logs').insert([{
                    status: 'CALLBACK_ERROR',
                    error_message: error.message,
                    raw_callback: req.body,
                    created_at: new Date().toISOString()
                }]);
            } catch (logError) {
                // Silent fail - don't crash
            }
        }
    });
};

/**
 * ⏰ Handle reversal timeout callback from M-PESA
 * Called if M-PESA doesn't process within expected time
 */
export const handleReversalTimeout = async (req, res) => {
    console.log(`\n⏰ [REVERSAL_CALLBACK] Timeout callback received`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
    
    // Immediate ACK
    res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Success" 
    });

    setImmediate(async () => {
        try {
            console.log(`🔄 [REVERSAL_CALLBACK] Processing timeout...`);
            await reversalService.handleReversalTimeout(req.body);
            console.log(`✅ [REVERSAL_CALLBACK] Timeout processed successfully`);
        } catch (error) {
            console.error(`❌ [REVERSAL_CALLBACK] Timeout error:`, error.message);
            
            try {
                await db.from('reversal_logs').insert([{
                    status: 'TIMEOUT_ERROR',
                    error_message: error.message,
                    raw_callback: req.body,
                    created_at: new Date().toISOString()
                }]);
            } catch (logError) {
                // Silent fail
            }
        }
    });
};

/**
 * 🔍 Get reversal status for a transaction
 * Public endpoint - returns latest reversal attempt
 */
export const getReversalStatus = async (req, res) => {
    try {
        const { transactionId } = req.params;
        
        console.log(`🔍 [REVERSAL_STATUS] Checking status for: ${transactionId}`);

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Transaction ID is required'
            });
        }

        // Get the most recent reversal log for this transaction
        const { data, error } = await db
            .from('reversal_logs')
            .select('*')
            .eq('transaction_id', transactionId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            console.log(`📭 [REVERSAL_STATUS] No reversal found for ${transactionId}`);
            return res.status(404).json({
                success: false,
                message: 'No reversal found for this transaction'
            });
        }

        console.log(`✅ [REVERSAL_STATUS] Found reversal for ${transactionId}: ${data[0].status}`);
        
        return res.status(200).json({
            success: true,
            data: {
                transactionId: data[0].transaction_id,
                amount: data[0].amount,
                status: data[0].status,
                initiatedAt: data[0].initiated_at,
                completedAt: data[0].completed_at,
                resultCode: data[0].result_code,
                resultDesc: data[0].result_desc,
                mpesaConversationId: data[0].mpesa_conversation_id,
                attempts: data[0].attempt
            }
        });

    } catch (error) {
        console.error('❌ [REVERSAL_STATUS] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * 📊 Get all reversals (Admin only)
 * Supports filtering by status and pagination
 */
export const getAllReversals = async (req, res) => {
    try {
        const { limit = 50, status, page = 1 } = req.query;
        const offset = (page - 1) * limit;
        
        console.log(`📊 [REVERSAL_LIST] Fetching reversals (page ${page}, limit ${limit})`);

        let query = db
            .from('reversal_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error, count } = await query;

        if (error) throw error;

        console.log(`✅ [REVERSAL_LIST] Found ${data.length} reversals (total: ${count})`);
        
        return res.status(200).json({
            success: true,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / limit)
            },
            data: data.map(log => ({
                transactionId: log.transaction_id,
                amount: log.amount,
                status: log.status,
                initiatedAt: log.initiated_at,
                completedAt: log.completed_at,
                resultCode: log.result_code
            }))
        });

    } catch (error) {
        console.error('❌ [REVERSAL_LIST] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * 🔄 Manually retry a failed reversal (Admin only)
 */
export const retryReversal = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { amount, reason } = req.body;

        console.log(`🔄 [REVERSAL_RETRY] Manual retry for: ${transactionId}`);

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Transaction ID is required'
            });
        }

        // Get transaction details if amount not provided
        let reversalAmount = amount;
        if (!reversalAmount) {
            const { data: transaction } = await db
                .from('mpesa_transactions')
                .select('amount')
                .eq('transaction_id', transactionId)
                .maybeSingle();
            
            if (transaction) {
                reversalAmount = transaction.amount;
            }
        }

        // Initiate reversal manually
        const result = await reversalService.initiateReversal(
            transactionId,
            reversalAmount || 0,
            reason || 'Manual retry',
            { manual: true, requestedBy: 'admin' }
        );

        if (result.success) {
            console.log(`✅ [REVERSAL_RETRY] Successfully initiated for ${transactionId}`);
            return res.status(200).json({
                success: true,
                message: 'Reversal initiated successfully',
                data: result.data
            });
        } else {
            console.error(`❌ [REVERSAL_RETRY] Failed for ${transactionId}:`, result.error);
            return res.status(500).json({
                success: false,
                error: result.error,
                message: result.message
            });
        }

    } catch (error) {
        console.error('❌ [REVERSAL_RETRY] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};