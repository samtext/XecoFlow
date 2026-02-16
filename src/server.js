import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; // 1. Added the new API data route

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 * Tells Express to trust the X-Forwarded-For header sent by Render's proxy.
 * Render uses a single proxy, so we set this to 1.
 * This ensures req.ip inside paymentController.js and the rate limiter is correct.
 */
app.set('trust proxy', 1);

/**
 * Middleware: MUST be before routes
 */
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * ROUTES
 * We now have two clear departments:
 */

// Department A: M-Pesa Actions (STK Push, C2B Registration & Callback)
// Full Path Example: /api/v1/mpesa/setup-c2b-urls
app.use('/api/v1/mpesa', mpesaRoutes);

// Department B: General Data (Status Polling)
// Access via: /api/v1/status/:id
app.use('/api/v1', apiRoutes);

// PORT handling for Render
const PORT = process.env.PORT || 5000;
const webhookUrl = process.env.MPESA_CALLBACK_URL;
// Fixed to default to production for your specific use case
const mpesaEnv = process.env.MPESA_ENVIRONMENT || 'production';

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 BIG-SYSTEM ENGINE: ONLINE ON PORT ${PORT}`);
    console.log(`🌍 MODE: ${mpesaEnv.toUpperCase()}`);
    
    // Path Calculation
    const fullPath = webhookUrl ? webhookUrl : `http://localhost:${PORT}/api/v1/mpesa/callback`;
    console.log(`📬 LIVE ENDPOINT: ${fullPath}`); 
    console.log(`=========================================\n`);
    
    if (!webhookUrl) {
        console.warn("⚠️ WARNING: MPESA_CALLBACK_URL is not defined in Environment Variables!");
    }

    if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) {
        console.error("❌ CRITICAL MISSING CREDENTIALS: Check Render Environment settings.");
    }
});