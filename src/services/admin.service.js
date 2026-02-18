// src/services/admin.service.js
import mongoose from 'mongoose'; // If using MongoDB
import axios from 'axios';

export const fetchDashboardData = async () => {
    // 1. In a real app, you'd query your Transaction Model
    // Example: const totalSales = await Transaction.find({ status: 'Completed' })
    
    return {
        airtimeFloat: 50000, // This would come from your provider's API
        totalSales: 125400,
        totalCommission: 3762, // e.g., 3% of sales
        recentTransactions: [
            { id: 'MPESA991', phone: '254700123456', amount: 100, type: 'STK', status: 'Success' },
            { id: 'MPESA992', phone: '254711222333', amount: 500, type: 'C2B', status: 'Success' }
        ]
    };
};

export const checkSystemHealth = async () => {
    const healthStatus = {
        database: 'Offline',
        safaricom: 'Offline',
        status: 'Critical'
    };

    try {
        // Check DB (Mongoose example)
        if (mongoose.connection.readyState === 1) healthStatus.database = 'Online';
        
        // Check Safaricom (Ping Daraja Auth)
        const safaricomRes = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: `Basic ${process.env.SAFARICOM_AUTH}` }
        });
        if (safaricomRes.status === 200) healthStatus.safaricom = 'Online';

        healthStatus.status = (healthStatus.database === 'Online' && healthStatus.safaricom === 'Online') ? 'Healthy' : 'Degraded';
    } catch (error) {
        console.error("Health Check Error:", error.message);
    }

    return healthStatus;
};