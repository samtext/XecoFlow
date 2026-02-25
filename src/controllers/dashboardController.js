import aggregatorService from '../services/aggregator.service.js';

export const getMetrics = async (req, res) => {
  try {
    // 1. Fetch live balance from Statum
    const statumData = await aggregatorService.fetchProviderBalance();
    const liveBalance = statumData.success ? statumData.balance : 0;

    // 2. Fetch other stats from your DB (Transactions, Sales, etc.)
    // const totalSales = await db.from('transactions').select(...);

    // 3. Construct the response to match your frontend state
    const metrics = [
      { 
        id: 1, 
        value: `Kes ${liveBalance.toLocaleString()}`, 
        label: 'CURRENT FLOAT', 
        bgColor: '#e6f3ff' 
      },
      { id: 2, value: '3,435', label: 'TOTAL SALES', bgColor: '#fff0e6' },
      { id: 3, value: '1,245', label: 'TOTAL TRANSACTION', bgColor: '#e6f0e6' },
      { id: 4, value: '47.0%', label: 'SALES MARGIN', bgColor: '#f0e6f0' }
    ];

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};