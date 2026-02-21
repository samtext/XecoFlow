import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

const app = express();

/**
 * 🛠️ LOG FLUSHER (RENDER FIX)
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
 * Ensure your actual frontend URL (Netlify/Vercel) is added here.
 */
const allowedOrigins = [
    'https://xecoflow.onrender.com', // Your backend itself
    'https://your-frontend-domain.netlify.app', 
    'https://your-frontend-domain.vercel.app',  
    'http://localhost:3000',                     
    'http://localhost:5173',                       
    'http://localhost:5174'
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
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
    console.log(`📡 [INCOMING]: ${req.method} ${req.originalUrl}`);
    next();
});

// 2. Health Check
app.get('/', (req, res) => res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE'));

/**
 * 🛣️ ROUTES
 * CRITICAL: Your STK Push is now at /api/v1/gateway/stkpush
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/gateway', mpesaRoutes); // M-Pesa logic is behind "/gateway"
app.use('/api/v1', apiRoutes);

/**
 * 🛑 404 HANDLER
 */
app.use((req, res) => {
    console.warn(`⚠️  [404]: ${req.method} ${req.originalUrl} not found.`);
    res.status(404).json({ error: `Endpoint ${req.originalUrl} not found on this server.` });
});

/**
 * 🔥 GLOBAL ERROR HANDLER
 */
app.use((err, req, res, next) => {
    console.error('❌ [GLOBAL_ERROR]:', err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    console.log(`📡 STK PUSH ENDPOINT: http://localhost:${PORT}/api/v1/gateway/stkpush`);
});