import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';
// Import workers (Ensure path is correct to avoid ERR_MODULE_NOT_FOUND)
import { startBackgroundWorkers } from './services/worker.service.js'; 

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 */
app.set('trust proxy', 1); 

/**
 * 📦 BODY PARSING (Must be BEFORE Loggers)
 */
app.use(express.json({ limit: '50kb' })); 
app.use(express.urlencoded({ extended: true }));

/**
 * 🚨 GLOBAL DEBUGGER: Catch-All Logger
 * This logs every single hit to your server.
 */
app.use((req, res, next) => {
    console.log(`\n📡 [INCOMING_REQUEST]: ${req.method} ${req.originalUrl}`);
    
    // Log the parsed body now that express.json() has run
    if (req.method === 'POST') {
        console.log(`📦 Body Context: ${JSON.stringify(req.body || {}, null, 2)}`);
    }
    next();
});

/**
 * 🔐 CORS CONFIGURATION
 * Updated to allow your specific Render UI to stop the "Failed to Fetch" error.
 */
const allowedOrigins = [
    'https://xecoflow.onrender.com',      // Backend
    'https://xecoflow-ui.onrender.com',   // React Frontend
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                          origin.includes('localhost') || 
                          origin.includes('127.0.0.1');

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`⚠️ [CORS_REJECTED]: ${origin}`);
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/**
 * 🕵️ CALLBACK LOGS (Existing logic preserved)
 */
app.use((req, res, next) => {
    const url = req.originalUrl;
    if (url.includes('callback') || url.includes('payments')) {
        console.log(`🔔 [CALLBACK_DEBUG]: ${req.method} ${url}`);
    }
    next();
});

// Health Check
app.get('/', (req, res) => res.status(200).send('🚀 ENGINE: ONLINE'));

/**
 * 🛣️ ROUTES
 */
app.use('/api/v1/gateway', mpesaRoutes); 
app.use('/api/v1/payments', mpesaRoutes); 
app.use('/api/v1/auth', authRoutes);    
app.use('/api/v1', apiRoutes); 

/**
 * 🛑 404 & ERROR HANDLING
 */
app.use((req, res) => {
    res.status(404).json({ error: `Endpoint ${req.originalUrl} not found.` });
});

app.use((err, req, res, next) => {
    console.error('❌ [SERVER_ERROR]:', err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER LIVE: Port ${PORT}`);
    
    // Initialize background tasks safely
    try {
        if (typeof startBackgroundWorkers === 'function') {
            startBackgroundWorkers();
            console.log("✅ [WORKERS_ACTIVE]");
        }
    } catch (workerError) {
        console.error("⚠️ [WORKER_INIT_FAILED]:", workerError.message);
    }
});