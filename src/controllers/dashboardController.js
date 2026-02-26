import aggregatorService from '../services/aggregator.service.js';
import { db } from '../config/db.js'; // Updated to use the { db } object import

export const getMetrics = async (req, res) => {
  try {
    // 1. Fetch live balance from Statum/M-Pesa
    // Note: This returns 0 if the security credential (8006) is still locked
    const statumData = await aggregatorService.fetchProviderBalance();
    const liveBalance = statumData.success ? statumData.balance : 0;

    // 2. Fetch Real Data from "airtime_transactions" using your standardized helper
    // Uses .select('*') to ensure it pulls from the correct supabaseAdmin instance
    const { data: transactions, error: dbError } = await db.airtime_transactions()
      .select('amount')
      .eq('status', 'PAYMENT_SUCCESS');

    if (dbError) throw dbError;

    // Calculate totals from the returned array
    const totalTransactions = transactions?.length || 0;
    const totalSales = transactions?.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0) || 0;

    // 3. Construct the response to match your React Frontend state
    const metrics = [
      { 
        id: 1, 
        value: `Kes ${liveBalance.toLocaleString()}`, 
        label: 'CURRENT FLOAT', 
        bgColor: '#e6f3ff' 
      },
      { 
        id: 2, 
        value: `Kes ${totalSales.toLocaleString()}`, 
        label: 'TOTAL SALES', 
        bgColor: '#fff0e6' 
      },
      { 
        id: 3, 
        value: totalTransactions.toLocaleString(), 
        label: 'TOTAL TRANSACTION', 
        bgColor: '#e6f0e6' 
      },
      { 
        id: 4, 
        value: '47.0%', 
        label: 'SALES MARGIN', 
        bgColor: '#f0e6f0' 
      }
    ];

    res.json(metrics);
  } catch (error) {
    console.error("❌ [DASHBOARD_CONTROLLER_ERROR]:", error.message);
    res.status(500).json({ error: error.message });
  }
};