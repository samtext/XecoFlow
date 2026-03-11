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
// ✅ ENVIRONMENT VALIDATION
// ============================================
const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_PASSKEY',
    'MPESA_SHORTCODE',
    'MPESA_TILL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

// ============================================
// 📊 SIMPLE LOGGING
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
            console.log('   Data:', JSON.stringify(masked, null, 2));
        }
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
    return normalized.slice(0, 6) + '***' + normalized.slice(-3);
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
            // Add retry logic
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
    // Helper to ensure connection is alive
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
    max: 10, // 10 attempts per hour
    message: { error: 'Too many auth attempts' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per 15 mins
    message: { error: 'Rate limit exceeded' }
});

const callbackLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 callbacks per minute
    message: { ResultCode: '1', ResultDesc: 'Rate limit exceeded' }
});

// ============================================
// 🔐 CORS
// ============================================
const allowedOrigins = [
    'https://xecoflow.onrender.com',
    'https://xecoflow-ui.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173'
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
    if (!req.url.includes('c2b-callback')) return next();
    
    const { TransactionID, TransAmount, MSISDN } = req.body;
    
    if (!TransactionID) {
        log.error('Callback missing TransactionID');
        return res.status(400).json({ 
            ResultCode: '1', 
            ResultDesc: 'Invalid request' 
        });
    }
    
    try {
        // Normalize phone number
        const normalizedPhone = normalizePhone(MSISDN);
        
        // Single query with proper error handling
        const { data: existing, error } = await supabase
            .from('mpesa_transactions')
            .select('id, status')
            .eq('transaction_id', TransactionID)
            .maybeSingle();
        
        if (error) {
            log.error('Database error in idempotency check:', error);
            // Fail open - process rather than block
            req.mpesaTransaction = { 
                TransactionID, 
                TransAmount, 
                MSISDN: normalizedPhone || MSISDN 
            };
            return next();
        }
        
        if (existing) {
            log.callback('Duplicate callback prevented', { 
                TransactionID, 
                status: existing.status 
            });
            
            return res.json({
                ResultCode: '0',
                ResultDesc: 'Success'
            });
        }
        
        // Attach normalized data
        req.mpesaTransaction = { 
            TransactionID, 
            TransAmount, 
            MSISDN: normalizedPhone || MSISDN 
        };
        next();
        
    } catch (error) {
        log.error('Idempotency check failed:', error.message);
        // Fail open - process rather than block
        req.mpesaTransaction = { TransactionID, TransAmount, MSISDN };
        next();
    }
};

// ============================================
// 🛣️ ROUTE MIDDLEWARE
// ============================================
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1', apiLimiter);
app.use('/api/v1/gateway/c2b-callback', callbackLimiter, idempotencyMiddleware);

// ============================================
// ✅ HEALTH CHECKS
// ============================================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'XecoFlow API',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', async (req, res) => {
    // Check Supabase connection with retry
    let dbStatus = 'disconnected';
    let dbError = null;
    
    for (let i = 0; i < 2; i++) {
        try {
            // Use a simple query that doesn't require a special table
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
    res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================
// 🔧 ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    log.error('Unhandled error:', err.stack);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
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

// For debugging only - not used for critical logic
const watchers = new Map();

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    log.info('Socket connected:', socket.id, 'from', clientIp);
    
    socket.on('watch-payment', (checkoutId) => {
        socket.join(`payment-${checkoutId}`);
        watchers.set(socket.id, checkoutId);
        log.debug('Watching payment:', checkoutId);
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
        log.debug('Socket disconnected:', socket.id, reason);
    });
});

// Helper to emit payment updates - uses io.to() NOT watchers
export const emitPaymentUpdate = (checkoutId, status, data = {}) => {
    io.to(`payment-${checkoutId}`).emit('payment-update', {
        checkoutId,
        status,
        data,
        timestamp: new Date().toISOString()
    });
    
    const room = io.sockets.adapter.rooms.get(`payment-${checkoutId}`);
    log.debug('Payment update sent:', { 
        checkoutId, 
        status, 
        watchers: room ? room.size : 0 
    });
};

// ============================================
// 🚀 START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
    log.info(`🚀 Server running on port ${PORT}`);
    log.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    log.info(`💰 M-PESA Till: ${process.env.MPESA_TILL_NUMBER}`);
});

// ============================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================
const shutdown = () => {
    log.info('Received shutdown signal');
    
    server.close(() => {
        log.info('HTTP server closed');
        io.close(() => {
            log.info('WebSocket server closed');
            process.exit(0);
        });
    });
    
    setTimeout(() => {
        log.error('Forceful shutdown');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    shutdown();
});

export { io };