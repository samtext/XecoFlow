import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 */
app.set('trust proxy', 1);

/**
 * 🔐 CORS WHITELIST CONFIGURATION
 * We replace '*' with a dynamic check to allow ONLY your frontend.
 */
const allowedOrigins = [
    'https://your-frontend-domain.netlify.app', // 👈 REPLACE with your real frontend URL
    'https://your-frontend-domain.vercel.app',  // 👈 REPLACE or remove if not needed
    'http://localhost:3000',                     // React default
    'http://localhost:f'                      // Vite default
];

const corsOptions = {
    origin: function (origin, callback) {
        // 1. Allow requests with no 'origin' (like Mobile Apps, Postman, or our Curl test)
        if (!origin) return callback(null, true);

        // 2. Check if the origin is in our allowed list
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error(`🚫 [CORS BLOCKED]: Attempt from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS Security Policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true // Set to true if you plan to use cookies/sessions
};

/**
 * Middleware: Applying the secured CORS
 */
app.use(cors(corsOptions));
app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * ROUTES
 */
app.use('/api/v1/mpesa', mpesaRoutes);
app.use('/api/v1', apiRoutes);

// PORT handling for Render
const PORT = process.env.PORT || 5000;
const webhookUrl = process.env.MPESA_CALLBACK_URL;
const mpesaEnv = process.env.MPESA_ENVIRONMENT || 'production';

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 BIG-SYSTEM ENGINE: ONLINE ON PORT ${PORT}`);
    console.log(`🌍 MODE: ${mpesaEnv.toUpperCase()}`);
    
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