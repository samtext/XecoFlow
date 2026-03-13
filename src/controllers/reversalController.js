// src/controllers/reversalController.js
import reversalService from '../services/reversal.service.js';
import { db } from '../config/db.js';

/**
 * Handle reversal result callback from M-PESA
 */
export const handleReversalResult = async (req, res) => {
    // Immediate ACK to M-PESA
    res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Success" 
    });

    // Process in background
    setImmediate(async () => {
        try {
            await reversalService.handleReversalResult(req.body);
        } catch (error) {
            console.error('❌ [REVERSAL_RESULT] Error:', error.message);
        }
    });
};

/**
 * Handle reversal timeout callback from M-PESA
 */
export const handleReversalTimeout = async (req, res) => {
    // Immediate ACK
    res.status(200).json({ 
        ResultCode: 0, 
        ResultDesc: "Success" 
    });

    setImmediate(async () => {
        try {
            await reversalService.handleReversalTimeout(req.body);
        } catch (error) {
            console.error('❌ [REVERSAL_TIMEOUT] Error:', error.message);
        }
    });
};

/**
 * Get reversal status for a transaction
 */
export const getReversalStatus = async (req, res) => {
    try {
        const { transactionId } = req.params;

        const { data, error } = await db
            .from('reversal_logs')
            .select('*')
            .eq('transaction_id', transactionId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No reversal found for this transaction'
            });
        }

        return res.status(200).json({
            success: true,
            data: data[0]
        });

    } catch (error) {
        console.error('❌ [REVERSAL_STATUS] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};