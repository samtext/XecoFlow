// src/controllers/adminController.js
import * as AdminService from '../services/admin.service.js';

export const getDashboardStats = async (req, res) => {
    try {
        const data = await AdminService.fetchDashboardData();
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getHealthReport = async (req, res) => {
    try {
        const health = await AdminService.checkSystemHealth();
        res.status(200).json({ success: true, health });
    } catch (error) {
        res.status(500).json({ success: false, error: "Health check failed" });
    }
};