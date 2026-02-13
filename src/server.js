import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';

const app = express();

/**
 * Middleware: MUST be before routes
 * Updated CORS to explicitly handle the headers your browser is sending
 */
app.use(cors({
    origin: '*', // Allows your localhost:5173 to connect
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health Check - Used by Render to see if your app is alive
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * ROUTES
 * Prefix '/api/v1' matches your registered 
 * production URL: /api/v1/payments/callback
 */
app.use('/api/v1', mpesaRoutes);

// PORT handling for Render
const PORT = process.env.PORT || 5000;
const webhookUrl = process.env.MPESA_CALLBACK_URL;
const mpesaEnv = process.env.MPESA_ENVIRONMENT || 'sandbox';

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 BIG-SYSTEM ENGINE: ONLINE ON PORT ${PORT}`);
    console.log(`🌍 MODE: ${mpesaEnv.toUpperCase()}`);
    
    const fullPath = webhookUrl ? webhookUrl : `http://localhost:${PORT}/api/v1/payments/callback`;
    console.log(`📬 LIVE ENDPOINT: ${fullPath}`); 
    console.log(`=========================================\n`);
    
    // Safety check for production
    if (!webhookUrl) {
        console.error("❌ CRITICAL: MPESA_CALLBACK_URL is not defined!");
    } else if (webhookUrl.includes('localhost') || webhookUrl.includes('loca.lt')) {
        console.log("⚠️ NOTICE: You are using a local URL. Ensure Render Env is set for Production.");
    }

    // New: Token Check Log
    if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) {
        console.error("❌ MISSING CREDENTIALS: Check MPESA_CONSUMER_KEY and SECRET in Render settings.");
    }
});