import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

const app = express();

/**
 * 🛠️ LOG FLUSHER & RENDER FIX
 */
const originalLog = console.log;
console.log = (...args) => {
    originalLog(...args);
    if (process.env.NODE_ENV === 'production') {
        process.stdout.write(''); 
    }
};

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 */
app.set('trust proxy', 1); 

/**
 * 🔐 CORS CONFIGURATION
 */
const allowedOrigins = [
    'https://xecoflow.onrender.com',
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://localhost:5174'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('localhost')) {
            callback(null, true);
        } else {
            console.error(`🚫 [CORS BLOCKED]: ${origin}`);
            callback(new Error('Not allowed by CORS Security Policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};

// 1. Global Middleware
app.use(cors(corsOptions));

/**
 * 📦 BODY PARSING
 * Added a specific check for JSON to ensure Safaricom's payload is captured.
 */
app.use(express.json({ 
    limit: '50kb',
    verify: (req, res, buf) => { req.rawBody = buf; } // Stores raw body for debugging if needed
})); 
app.use(express.urlencoded({ extended: true }));

/**
 * 🕵️ DEBUG & NETWORK LOGGING
 */
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString();
    console.log(`📡 [${time}] ${req.method} ${req.originalUrl}`);
    // Log headers for callbacks to ensure Safaricom is hitting us correctly
    if (req.originalUrl.includes('hooks')) {
        console.log(`🔌 Webhook Headers: ${JSON.stringify(req.headers['content-type'])}`);
    }
    next();
});

// 2. Health Check
app.get('/', (req, res) => res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE'));

/**
 * 🛣️ ROUTES
 * IMPORTANT: If 'mpesaRoutes' also has '/api/v1/gateway' inside it, 
 * you must remove it from the router file to prevent /api/v1/gateway/api/v1/gateway
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/gateway', mpesaRoutes); 
app.use('/api/v1', apiRoutes);

/**
 * 🛑 404 HANDLER
 * Enhanced to show if the error is due to an unsupported method (e.g., GET instead of POST)
 */
app.use((req, res) => {
    console.warn(`⚠️ [404 ERROR]: ${req.method} ${req.originalUrl} - Not Found`);
    res.status(404).json({ 
        error: `Endpoint ${req.originalUrl} not found.`,
        hint: `Ensure you are using the correct HTTP Method (POST for callbacks).`
    });
});

/**
 * 🔥 GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
    console.error('❌ [GLOBAL_ERROR]:', err.message);
    res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    console.log(`🔗 STK PUSH:  POST /api/v1/gateway/stkpush`);
    console.log(`🔗 CALLBACK:  POST /api/v1/gateway/hooks/stk-callback`);
    console.log(`=========================================\n`);
});