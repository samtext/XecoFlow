import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

// ============================================
// ✅ COMPREHENSIVE ENVIRONMENT VALIDATION
// ============================================
const requiredEnvVars = {
    critical: [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'MPESA_CONSUMER_KEY',
        'MPESA_CONSUMER_SECRET',
        'MPESA_PASSKEY',
        'MPESA_SHORTCODE',
        'MPESA_TILL'
    ],
    payment: [
        'MPESA_BUSINESS_SHORTCODE',
        'MPESA_CALLBACK_URL',
        'MPESA_ENVIRONMENT'
    ],
    aggregator: [
        'AGGREGATOR_API_KEY',
        'AGGREGATOR_BASE_URL',
        'AGGREGATOR_SECRET_KEY'
    ],
    optional: [
        'SUPABASE_SERVICE_ROLE_KEY',
        'MPESA_INITIATOR_NAME',
        'MPESA_SECURITY_CREDENTIAL',
        'MPESA_STORE_SHORTCODE'
    ]
};

console.log('\n🔍 CHECKING ENVIRONMENT VARIABLES:');
console.log('=' .repeat(50));

// Check critical vars first
const missingCritical = requiredEnvVars.critical.filter(varName => !process.env[varName]);
if (missingCritical.length > 0) {
    console.error('❌ FATAL: Missing critical environment variables:');
    missingCritical.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n📝 Add these in Render Dashboard → Environment tab');
    console.error('Then click "Manual Deploy" → "Clear build cache & deploy"');
    process.exit(1);
}
console.log('✅ All critical variables present!');

// Check other categories (warn only)
const missingPayment = requiredEnvVars.payment.filter(varName => !process.env[varName]);
if (missingPayment.length > 0) {
    console.warn('⚠️ Warning: Missing payment variables (add if needed):', missingPayment.join(', '));
}

const missingAggregator = requiredEnvVars.aggregator.filter(varName => !process.env[varName]);
if (missingAggregator.length > 0) {
    console.warn('⚠️ Warning: Missing aggregator variables (add for airtime):', missingAggregator.join(', '));
}

// Log present variables (masked)
console.log('\n📋 Configured variables:');
console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   MPESA_TILL: ${process.env.MPESA_TILL ? '✅ ' + process.env.MPESA_TILL : '❌ Missing'}`);
console.log(`   MPESA_ENVIRONMENT: ${process.env.MPESA_ENVIRONMENT || 'sandbox (default)'}`);
console.log('=' .repeat(50) + '\n');

// ============================================
// 📊 ENHANCED LOGGING
// ============================================
const log = {
    info: (...args) => console.log(`📌 [INFO] ${new Date().toISOString()}:`, ...args),
    warn: (...args) => console.warn(`⚠️ [WARN] ${new Date().toISOString()}:`, ...args),
    error: (...args) => console.error(`❌ [ERROR] ${new Date().toISOString()}:`, ...args),
    debug: (...args) => {
        if (process.env.DEBUG === 'true') {
            console.debug(`🔍 [DEBUG] ${new Date().toISOString()}:`, ...args);
        }
    },
    callback: (msg, data) => {
        console.log(`💰 [MPESA] ${new Date().toISOString()}: ${msg}`);
        if (data) {
            // Mask sensitive data in logs
            const masked = { ...data };
            if (masked.MSISDN) masked.MSISDN = maskPhone(masked.MSISDN);
            if (masked.phone) masked.phone = maskPhone(masked.phone);
            if (masked.TransID) console.log(`   Transaction: ${masked.TransID}`);
            if (masked.TransAmount) console.log(`   Amount: KES ${masked.TransAmount}`);
            console.log('   Full Data:', JSON.stringify(masked, null, 2));
        }
    },
    mpesa: (msg, data) => {
        console.log(`💳 [MPESA] ${new Date().toISOString()}: ${msg}`);
        if (data) console.log('   ', data);
    }
};

// ============================================
// 📱 PHONE NUMBER NORMALIZATION
// ============================================
export const normalizePhone = (phone) => {
    if (!phone) return null;
    
    // Remove all non-digits
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
        // 0712345678 -> 254712345678
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7')) {
        // 712345678 -> 254712345678
        cleaned = '254' + cleaned;
    } else if (cleaned.startsWith('2547')) {
        // Already in correct format
        return cleaned;
    } else if (cleaned.startsWith('+254')) {
        // +254712345678 -> 254712345678
        cleaned = cleaned.substring(1);
    }
    
    // Validate length (Kenyan numbers are 12 digits with 254)
    if (cleaned.length === 12 && cleaned.startsWith('254')) {
        return cleaned;
    }
    
    log.warn('Invalid phone number format:', phone);
    return null;
};

// ============================================
// 📱 MASK PHONE FOR LOGS
// ============================================
const maskPhone = (phone) => {
    if (!phone) return phone;
    const normalized = phone.toString().replace(/\D/g, '');
    if (normalized.length < 10) return '***';
    return normalized.slice(0, 4) + '***' + normalized.slice(-3);
};

// ============================================
// 🛡️ SUPABASE CLIENT WITH CONNECTION RESILIENCE
// ============================================
const supabaseClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: { persistSession: false },
        db: { schema: 'public' },
        global: {
            fetch: async (url, options = {}) => {
                const MAX_RETRIES = 3;
                const RETRY_DELAY = 1000;
                
                for (let i = 0; i < MAX_RETRIES; i++) {
                    try {
                        const response = await fetch(url, options);
                        return response;
                    } catch (error) {
                        if (i === MAX_RETRIES - 1) throw error;
                        log.warn(`Supabase connection attempt ${i + 1} failed, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
                    }
                }
            }
        }
    }
);

// Export with connection check
export const supabase = {
    ...supabaseClient,
    checkConnection: async () => {
        try {
            const { error } = await supabaseClient
                .from('mpesa_transactions')
                .select('count')
                .limit(1)
                .single();
            return !error;
        } catch {
            return false;
        }
    }
};

// ============================================
// 🛡️ PROXY TRUST
// ============================================
app.set('trust proxy', 1);

// ============================================
// 📦 BODY PARSING
// ============================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================
// 🚦 RATE LIMITING
// ============================================
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: 'Too many auth attempts' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    message: { error: 'Rate limit exceeded' }
});

const callbackLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Increased for production
    message: { ResultCode: '1', ResultDesc: 'Rate limit exceeded' },
    skip: (req) => {
        // Skip rate limiting for Safaricom IPs
        const safaricomIPs = ['196.201.212.69', '196.201.212.70', '196.201.214.200'];
        return safaricomIPs.includes(req.ip);
    }
});

// ============================================
// 🔐 CORS
// ============================================
const allowedOrigins = [
    'https://xecoflow.onrender.com',
    'https://xecoflow-ui.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
            callback(null, true);
        } else {
            log.warn('CORS rejected:', origin);
            callback(null, false);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

// ============================================
// 📝 REQUEST LOGGING
// ============================================
app.use((req, res, next) => {
    const start = Date.now();
    
    // Special logging for M-PESA endpoints
    if (req.url.includes('c2b') || req.url.includes('callback')) {
        console.log('\n' + '='.repeat(50));
        console.log(`📡 [MPESA WEBHOOK] ${req.method} ${req.url}`);
        console.log(`🏠 FROM_IP: ${req.ip}`);
        if (req.body && Object.keys(req.body).length > 0) {
            console.log('📦 BODY:', JSON.stringify(req.body, null, 2));
        }
        console.log('='.repeat(50) + '\n');
    }
    
    setImmediate(() => {
        log.info(`${req.method} ${req.url} - IP: ${req.ip}`);
    });
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {
            log.warn(`Slow request: ${req.method} ${req.url} took ${duration}ms`);
        }
    });
    
    next();
});

// ============================================
// 🔍 IDEMPOTENCY MIDDLEWARE
// ============================================
const idempotencyMiddleware = async (req, res, next) => {
    if (!req.url.includes('c2b')) return next();
    
    const { TransactionID, TransID, TransAmount, MSISDN } = req.body;
    const transId = TransactionID || TransID;
    
    if (!transId) {
        log.error('Callback missing TransactionID');
        return res.status(200).json({ 
            ResultCode: '1', 
            ResultDesc: 'Invalid request - missing transaction ID' 
        });
    }
    
    try {
        const normalizedPhone = normalizePhone(MSISDN);
        
        const { data: existing, error } = await supabase
            .from('mpesa_transactions')
            .select('id, status')
            .eq('transaction_id', transId)
            .maybeSingle();
        
        if (error) {
            log.error('Database error in idempotency check:', error);
            req.mpesaTransaction = { 
                TransactionID: transId, 
                TransAmount, 
                MSISDN: normalizedPhone || MSISDN 
            };
            return next();
        }
        
        if (existing) {
            log.callback('🔄 Duplicate callback prevented', { 
                TransactionID: transId, 
                status: existing.status 
            });
            
            return res.json({
                ResultCode: '0',
                ResultDesc: 'Success'
            });
        }
        
        req.mpesaTransaction = { 
            TransactionID: transId, 
            TransAmount, 
            MSISDN: normalizedPhone || MSISDN 
        };
        next();
        
    } catch (error) {
        log.error('Idempotency check failed:', error.message);
        req.mpesaTransaction = { TransactionID: transId, TransAmount, MSISDN };
        next();
    }
};

// ============================================
// 🛣️ ROUTE MIDDLEWARE
// ============================================
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1', apiLimiter);
app.use('/api/v1/gateway/c2b', callbackLimiter, idempotencyMiddleware);
app.use('/api/v1/gateway/c2b-callback', callbackLimiter, idempotencyMiddleware);
app.use('/api/v1/payments/c2b-confirmation', callbackLimiter, idempotencyMiddleware);

// ============================================
// ✅ SIMPLE TEST ENDPOINT
// ============================================
app.post('/simple-callback', (req, res) => {
    console.log('\n✅✅✅ SIMPLE CALLBACK WORKING!');
    console.log('Time:', new Date().toISOString());
    console.log('Body:', req.body);
    console.log('✅✅✅\n');
    
    res.status(200).json({
        message: 'Test received',
        yourBody: req.body
    });
});

// ============================================
// ✅ HEALTH CHECKS
// ============================================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'XecoFlow API',
        environment: process.env.NODE_ENV || 'development',
        mpesaTill: process.env.MPESA_TILL || 'Not Set',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            test: '/simple-callback',
            c2b: '/api/v1/gateway/c2b-callback'
        }
    });
});

app.get('/health', async (req, res) => {
    let dbStatus = 'disconnected';
    let dbError = null;
    
    for (let i = 0; i < 2; i++) {
        try {
            const { error } = await supabase
                .from('mpesa_transactions')
                .select('count')
                .limit(1);
            
            if (!error) {
                dbStatus = 'connected';
                break;
            }
            dbError = error;
        } catch (error) {
            dbError = error;
        }
        
        if (i === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const health = {
        status: dbStatus === 'connected' ? 'healthy' : 'degraded',
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        mpesaTill: process.env.MPESA_TILL || 'Not Set',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    };
    
    if (dbError) {
        health.error = dbError.message;
    }
    
    res.status(dbStatus === 'connected' ? 200 : 503).json(health);
});

// ============================================
// 🛣️ ROUTES
// ============================================
app.use('/api/v1/gateway', mpesaRoutes);
app.use('/api/v1/payments', mpesaRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', apiRoutes);

// ============================================
// 🛑 404 HANDLER
// ============================================
app.use((req, res) => {
    log.warn('404 Not Found:', req.url);
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.url,
        method: req.method
    });
});

// ============================================
// 🔧 ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    log.error('Unhandled error:', err.stack);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        path: req.url
    });
});

// ============================================
// 🔌 WEBSOCKET SETUP
// ============================================
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.set('io', io);

const watchers = new Map();

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    log.info('🔌 Socket connected:', socket.id, 'from', clientIp);
    
    socket.on('watch-payment', (checkoutId) => {
        socket.join(`payment-${checkoutId}`);
        watchers.set(socket.id, checkoutId);
        log.debug('👀 Watching payment:', checkoutId);
    });
    
    socket.on('unwatch-payment', () => {
        const checkoutId = watchers.get(socket.id);
        if (checkoutId) {
            socket.leave(`payment-${checkoutId}`);
            watchers.delete(socket.id);
        }
    });
    
    socket.on('disconnect', (reason) => {
        watchers.delete(socket.id);
        log.debug('🔌 Socket disconnected:', socket.id, reason);
    });
});

export const emitPaymentUpdate = (checkoutId, status, data = {}) => {
    io.to(`payment-${checkoutId}`).emit('payment-update', {
        checkoutId,
        status,
        data,
        timestamp: new Date().toISOString()
    });
    
    const room = io.sockets.adapter.rooms.get(`payment-${checkoutId}`);
    log.debug('📡 Payment update sent:', { 
        checkoutId, 
        status, 
        watchers: room ? room.size : 0 
    });
};

// ============================================
// 🚀 START SERVER
// ============================================
const PORT = process.env.PORT || 10000;

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🚀 SERVER STARTED SUCCESSFULLY`);
    console.log('='.repeat(50));
    log.info(`📡 Port: ${PORT}`);
    log.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    log.info(`💰 M-PESA Till: ${process.env.MPESA_TILL || 'NOT SET'}`);
    log.info(`🔌 WebSocket: Ready`);
    log.info(`📊 Health: /health`);
    log.info(`💰 Callback: /api/v1/gateway/c2b-callback`);
    console.log('='.repeat(50) + '\n');
});

// ============================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================
const shutdown = (signal) => {
    log.info(`Received ${signal}, starting graceful shutdown...`);
    
    server.close(() => {
        log.info('HTTP server closed');
        io.close(() => {
            log.info('WebSocket server closed');
            log.info('Graceful shutdown complete');
            process.exit(0);
        });
    });
    
    setTimeout(() => {
        log.error('Forceful shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export { io };