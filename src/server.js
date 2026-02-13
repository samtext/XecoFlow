import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; // Added this
import mpesaRoutes from './routes/mpesa.routes.js';

const app = express();

// Middleware: MUST be before routes
app.use(cors()); // Added to allow your frontend to connect
app.use(express.json());

// Health Check - Used by Render to see if your app is alive
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * ROUTES
 * We changed the prefix to '/api/v1' to match your registered 
 * production URL: /api/v1/payments/callback
 */
app.use('/api/v1', mpesaRoutes);

// PORT handling for Render (Render sets process.env.PORT automatically)
const PORT = process.env.PORT || 5000;
const webhookUrl = process.env.MPESA_CALLBACK_URL;

// Start Server: '0.0.0.0' allows Render to map the external URL to your internal port
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 CALLBACK LISTENER ACTIVE ON PORT ${PORT}`);
    
    // We update the log to show the precise endpoint path
    const fullPath = webhookUrl ? webhookUrl : `http://localhost:${PORT}/api/v1/payments/callback`;
    console.log(`📬 LIVE ENDPOINT: ${fullPath}`); 
    console.log(`=========================================\n`);
    
    // Safety check for production
    if (!webhookUrl) {
        console.error("❌ CRITICAL: MPESA_CALLBACK_URL is not defined!");
    } else if (webhookUrl.includes('localhost') || webhookUrl.includes('loca.lt') || webhookUrl.includes('cloudflare')) {
        console.log("⚠️ NOTICE: You are using a tunnel/local URL. Change this in Render Env settings for Production.");
    }
});