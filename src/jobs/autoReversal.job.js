// src/jobs/reversalQueue.job.js
import cron from 'node-cron';
import { db } from '../config/db.js';
import reversalService from '../services/reversal.service.js';

/**
 * Reversal Queue Job - Runs every minute
 * Checks for transactions that need reversal based on amount-based wait times
 */
export const startReversalQueue = () => {
    console.log('⏰ [JOB] Reversal queue started - running every minute');
    
    cron.schedule('* * * * *', async () => {
        console.log('\n🔍 [JOB] Checking for transactions needing reversal...');
        
        try {
            // Find all transactions that need reversal
            const { data: transactions, error } = await db
                .from('mpesa_transactions')
                .select('*')
                .eq('status', 'PAYMENT_SUCCESS')
                .eq('airtime_status', 'FAILED')
                .is('reversal_status', null)
                .gte('amount', 10)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (!transactions || transactions.length === 0) {
                console.log('✅ [JOB] No transactions needing reversal');
                return;
            }

            console.log(`📊 [JOB] Found ${transactions.length} transactions to check`);

            for (const tx of transactions) {
                const amount = parseFloat(tx.amount);
                
                // Handle high-value transactions (>500)
                if (amount > 500) {
                    console.log(`⚠️ [JOB] High value transaction ${tx.transaction_id} (KES ${amount}) - alerting admin`);
                    await reversalService.handleHighValueFailure(tx);
                    continue;
                }

                // Check if transaction is eligible for auto-reversal
                if (reversalService.isEligibleForAutoReversal(tx)) {
                    console.log(`🔄 [JOB] Transaction ${tx.transaction_id} (KES ${amount}) is ready for reversal`);
                    
                    // Initiate reversal with retry logic
                    await reversalService.initiateReversal(
                        tx.transaction_id,
                        amount,
                        'Airtime delivery failed - auto reversal'
                    );
                } else {
                    const waitMinutes = reversalService.getWaitTimeMinutes(amount);
                    const createdTime = new Date(tx.created_at);
                    const now = new Date();
                    const elapsedMinutes = (now - createdTime) / (1000 * 60);
                    
                    console.log(`⏳ [JOB] Transaction ${tx.transaction_id} (KES ${amount}) needs ${waitMinutes}min wait. Elapsed: ${elapsedMinutes.toFixed(1)}min`);
                }
            }

        } catch (error) {
            console.error('❌ [JOB] Error processing reversal queue:', error.message);
        }
    });
};