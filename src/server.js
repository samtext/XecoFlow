import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

const app = express();

/**
 * 🛠️ LOG FLUSHER & RENDER "ALWAYS-ON" MOCK
 * Ensures logs don't get buffered/lost in Render's dashboard.
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
 * Required to get the real IP of Safaricom callbacks through Render's load balancer.
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
        // Allow requests with no origin (like mobile apps or curl/terminal tests)
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

// 1. Pre-Route Middleware
app.use(cors(corsOptions));

/**
 * 📦 BODY PARSING
 * Safaricom sends JSON. We set a limit and ensure it's available globally.
 */
app.use(express.json({ limit: '50kb' })); 
app.use(express.urlencoded({ extended: true }));

/**
 * 🕵️ DEBUG & NETWORK LOGGING
 */
app.use((req, res, next) => {
    if (req.originalUrl !== '/api/v1/gateway/ping') {
        console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// 2. Health Check
app.get('/', (req, res) => res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE'));

/**
 * 🛣️ ROUTES
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/gateway', mpesaRoutes); 
app.use('/api/v1', apiRoutes);

/**
 * 🛑 404 HANDLER
 */
app.use((req, res) => {
    console.warn(`⚠️  [404]: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `Endpoint ${req.originalUrl} not found.` });
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
    console.log(`🔗 CALLBACK: https://xecoflow.onrender.com/api/v1/gateway/hooks/stk-callback`);
    console.log(`=========================================\n`);
});