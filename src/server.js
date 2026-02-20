import 'dotenv/config'; 
import express from 'express';
import cors from 'cors'; 
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js'; 
import authRoutes from './routes/authRoutes.js';

/**
 * 🛠️ LOG FLUSHER (RENDER FIX)
 * Overrides console.log to ensure output is written to stdout immediately.
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
 * Render uses a load balancer; 'trust proxy' must be true to get correct client IPs.
 */
app.set('trust proxy', true); 

/**
 * 🔐 CORS CONFIGURATION
 * Optimized for Safaricom callbacks which often have no 'origin' header.
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
        // Allow requests with no origin (like Safaricom server-to-server or Postman)
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

// Apply CORS before routes
app.use(cors(corsOptions));

// Body Parser with limit to prevent DOS
app.use(express.json({ limit: '10kb' })); 

/**
 * 🕵️ DEBUG MIDDLEWARE
 * Placed before routes to catch and log every hit.
 */
app.use((req, res, next) => {
    if (req.originalUrl.includes('mpesa')) {
        console.log(`📡 [NETWORK_LOG]: ${req.method} to ${req.originalUrl} | IP: ${req.ip}`);
    }
    next();
});

// Root Health Check
app.get('/', (req, res) => {
    res.status(200).send('🚀 BIG-SYSTEM ENGINE: ONLINE');
});

/**
 * 🛣️ ROUTES
 */
app.use('/api/v1/auth', authRoutes);   
app.use('/api/v1/mpesa', mpesaRoutes);
app.use('/api/v1', apiRoutes);

/**
 * 404 & Global Error Handling
 */
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
});

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
    console.log(`🛡️ TRUST PROXY: ENABLED`);
    console.log(`=========================================\n`);
    
    // Safety check for production
    const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE"];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.warn(`⚠️  WARNING: Missing variables: ${missing.join(', ')}`);
    }
});