import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

/**
 * 🛠️ LOG FLUSHER (RENDER FIX)
 */
const originalLog = console.log;
console.log = (...args) => {
    originalLog(...args);
    if (process.env.NODE_ENV === 'production') {
        process.stdout.write(''); // Force a flush of the stream
    }
};

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 * Tells Express to trust the X-Forwarded-For header from Render's Load Balancer.
 */
app.set('trust proxy', 1); 

/**
 * 🔐 CORS CONFIGURATION
 */
const allowedOrigins = [
    'https://your-frontend-domain.netlify.app', 
    'https://your-frontend-domain.vercel.app',  
    'http://localhost:3000',                     
    'http://localhost:5173',                       
    'http://localhost:5174'
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (crucial for Safaricom/Postman)
        if (!origin || allowedOrigins.includes(origin)) {
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

// 1. Global Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); 

/**
 * 🕵️ DEBUG & NETWORK LOGGING
 */
app.use((req, res, next) => {
    if (req.originalUrl.includes('mpesa')) {
        console.log(`📡 [NETWORK_LOG]: ${req.method} ${req.originalUrl} | IP: ${req.ip}`);
    }
    next();
});

// 2. Health Check & Diagnostics
app.get('/', (req, res) => res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE'));

// Diagnostic route to verify router is alive (checks if /api/v1/mpesa is reachable)
app.get('/api/v1/mpesa/ping', (req, res) => res.json({ status: "Router is active", timestamp: new Date() }));

/**
 * 🛣️ ROUTES
 * Registered BEFORE the 404 handler
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/mpesa', mpesaRoutes);
app.use('/api/v1', apiRoutes);

/**
 * 🛑 404 HANDLER
 * Must be AFTER all successful route definitions
 */
app.use((req, res) => {
    console.warn(`⚠️  [404]: ${req.method} ${req.originalUrl} not found.`);
    res.status(404).json({ error: "Endpoint not found" });
});

/**
 * 🔥 GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
    console.error('❌ [GLOBAL_ERROR]:', err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});

/**
 * 🚀 SERVER INITIALIZATION
 */
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 BIG-SYSTEM ENGINE: ONLINE ON PORT ${PORT}`);
    console.log(`🌍 ENVIRONMENT: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=========================================\n`);
    
    // Safety check for production variables
    const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE"];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.warn(`⚠️  WARNING: Missing variables: ${missing.join(', ')}`);
    }
});