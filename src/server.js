import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 * Set to true to correctly parse 'x-forwarded-for' headers from Render's load balancer.
 */
app.set('trust proxy', true); 

/**
 * 🔐 CORS WHITELIST CONFIGURATION
 */
const allowedOrigins = [
    'https://your-frontend-domain.netlify.app', 
    'https://your-frontend-domain.vercel.app',  
    'http://localhost:3000',                     
    'http://localhost:5173',                      
    'http://localhost:5174'
];

const corsOptions = {
    origin: function (origin, callback) {
        // 🚨 SAFARICOM FIX: Safaricom hits your URL from their servers (no origin header).
        // If !origin is true, we must allow it, or CORS will block the callback.
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error(`🚫 [CORS BLOCKED]: Unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS Security Policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true 
};

/**
 * Middleware
 */
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); 

// 🕵️ DEBUG MIDDLEWARE: Logs every request to M-Pesa endpoints
app.use('/api/v1/mpesa', (req, res, next) => {
    console.log(`📡 [NETWORK_LOG]: ${req.method} request to ${req.originalUrl} from IP: ${req.ip}`);
    next();
});

// Health Check
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * ROUTES
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/mpesa', mpesaRoutes);
app.use('/api/v1', apiRoutes);

/**
 * 404 & Error Handling
 */
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
});

// PORT handling
const PORT = process.env.PORT || 5000;
const mpesaEnv = process.env.MPESA_ENVIRONMENT || 'production';

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 BIG-SYSTEM ENGINE: ONLINE ON PORT ${PORT}`);
    console.log(`🌍 MODE: ${mpesaEnv.toUpperCase()}`);
    console.log(`🛡️ TRUST PROXY: ENABLED (Render Optimized)`);
    console.log(`=========================================\n`);
    
    // Logic Guard: Alert if credentials are missing on boot
    const missing = [];
    if (!process.env.MPESA_CONSUMER_KEY) missing.push("MPESA_CONSUMER_KEY");
    if (!process.env.MPESA_CONSUMER_SECRET) missing.push("MPESA_CONSUMER_SECRET");
    if (!process.env.MPESA_SHORTCODE) missing.push("MPESA_SHORTCODE");

    if (missing.length > 0) {
        console.error(`❌ CRITICAL: Missing Env Vars: ${missing.join(', ')}`);
    }
});