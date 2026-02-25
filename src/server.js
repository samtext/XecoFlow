import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

const app = express();

/**
 * 🛠️ LOG FLUSHER (Cleaned up for better Render readability)
 */
if (process.env.NODE_ENV === 'production') {
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog(...args);
    };
}

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 */
app.set('trust proxy', 1); 

/**
 * 🔐 CORS CONFIGURATION
 * Improved to explicitly catch common local/production origin variations
 */
const allowedOrigins = [
    'https://xecoflow.onrender.com',      // Your Render Domain
    'http://localhost:3000', 
    'http://localhost:5173',              // Vite
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like postman, curl, or same-origin)
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                          origin.includes('localhost') || 
                          origin.includes('127.0.0.1');

        if (isAllowed) {
            callback(null, true);
        } else {
            // This will show up in your Render Logs so you can see what URL is being blocked
            console.error(`🚫 [CORS_BLOCKED]: Origin ${origin} is not in allowed list.`);
            callback(new Error('Not allowed by CORS Security Policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

/**
 * 📦 BODY PARSING
 */
app.use(express.json({ limit: '50kb' })); 
app.use(express.urlencoded({ extended: true }));

/**
 * 🕵️ CALLBACK HANDSHAKE LOGGER & DATA REFINER
 */
app.use((req, res, next) => {
    const url = req.originalUrl;
    if (url.includes('callback') || url.includes('hooks') || url.includes('payments')) {
        console.log(`\n🔔 [INTERCEPTED]: ${req.method} ${url}`);
        
        if (req.body?.Body?.stkCallback) {
            const cb = req.body.Body.stkCallback;
            req.mpesaData = {
                merchantRequestId: cb.MerchantRequestID,
                checkoutRequestId: cb.CheckoutRequestID,
                resultCode: cb.ResultCode,
                resultDesc: cb.ResultDesc,
                transId: cb.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null
            };
            console.log(`📦 REFINED DATA: ID ${req.mpesaData.checkoutRequestId} | Code: ${req.mpesaData.resultCode}`);
        }
    }
    next();
});

// 2. Health Check
app.get('/', (req, res) => res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE'));

/**
 * 🛣️ ROUTES
 */
app.use('/api/v1/gateway', mpesaRoutes); 
app.use('/api/v1/payments', mpesaRoutes); 
app.use('/api/v1/auth', authRoutes);    
app.use('/api/v1', apiRoutes); 

/**
 * 🛑 404 HANDLER
 */
app.use((req, res) => {
    console.warn(`⚠️ [404]: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `Endpoint ${req.originalUrl} not found.` });
});

/**
 * 🔥 GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
    console.error('❌ [GLOBAL_ERROR]:', err.message);
    res.status(500).json({ 
        error: "Internal Server Error",
        message: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    console.log(`✅ LIVE URL: https://xecoflow.onrender.com`);
    console.log(`=========================================\n`);
});