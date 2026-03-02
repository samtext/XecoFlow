import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http'; // 👈 NEW: Import http to create server
import { Server } from 'socket.io'; // 👈 NEW: Import Socket.IO
import mpesaRoutes from './routes/mpesa.routes.js';
import apiRoutes from './routes/apiRoutes.js';
import authRoutes from './routes/authRoutes.js';

// ✅ ALL WORKER IMPORTS PERMANENTLY REMOVED TO FIX ERR_MODULE_NOT_FOUND

const app = express();

/**
 * 🛡️ PROXY TRUST (CRITICAL FOR RENDER)
 */
app.set('trust proxy', 1);

/**
 * 📦 BODY PARSING
 */
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * 🚨 GLOBAL DEBUGGER: Catch-All Logger
 */
app.use((req, res, next) => {
    console.log(`\n📡 [INCOMING_REQUEST]: ${req.method} ${req.originalUrl}`);
    
    if (req.method === 'POST') {
        console.log(`📦 Body Context: ${JSON.stringify(req.body || {}, null, 2)}`);
    }
    next();
});

/**
 * 🔐 CORS CONFIGURATION
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
 * 🕵️ CALLBACK LOGS
 */
app.use((req, res, next) => {
    const url = req.originalUrl;
    if (url.includes('callback') || url.includes('payments')) {
        console.log(`🔔 [CALLBACK_DEBUG]: ${req.method} ${url}`);
    }
    next();
});

// Health Check - Crucial for Render's zero-downtime deploys
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

// ============================================
// 🔌 WEBSOCKET SETUP - NEW SECTION
// ============================================

/**
 * Create HTTP server (required for WebSockets)
 */
const server = http.createServer(app); // 👈 Create server from app

/**
 * Initialize Socket.IO with CORS configuration
 */
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Use the same CORS logic as Express
            if (!origin) return callback(null, true);
            
            const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) ||
                              origin.includes('localhost') ||
                              origin.includes('127.0.0.1');
            
            if (isAllowed) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST']
    },
    // Additional Socket.IO options
    pingTimeout: 60000,
    pingInterval: 25000
});

/**
 * Make io available to routes
 */
app.set('io', io);

/**
 * Socket.IO connection handler
 */
io.on('connection', (socket) => {
    console.log(`🔌 [SOCKET_CONNECTED]: ${socket.id}`);

    // Send socket ID to client
    socket.emit('socket-id', socket.id);

    // Client wants to watch a specific payment
    socket.on('watch-payment', (checkoutId) => {
        socket.join(`payment-${checkoutId}`);
        console.log(`👀 [SOCKET_WATCHING]: ${socket.id} watching payment ${checkoutId}`);
    });

    // Client stops watching
    socket.on('unwatch-payment', (checkoutId) => {
        socket.leave(`payment-${checkoutId}`);
        console.log(`👋 [SOCKET_UNWATCH]: ${socket.id} stopped watching ${checkoutId}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`🔌 [SOCKET_DISCONNECTED]: ${socket.id} - Reason: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error(`❌ [SOCKET_ERROR]: ${socket.id} - ${error.message}`);
    });
});

/**
 * Helper function to emit payment updates
 * This will be imported by routes
 */
export const emitPaymentUpdate = (checkoutId, status, data = {}) => {
    console.log(`📡 [SOCKET_EMIT]: Payment ${checkoutId} - ${status}`);
    
    // Emit to specific room
    io.to(`payment-${checkoutId}`).emit('payment-update', {
        checkoutId,
        status,
        data,
        timestamp: new Date().toISOString()
    });
    
    // Also emit to all connected clients (optional - for debugging)
    io.emit('payment-update-global', {
        checkoutId,
        status,
        data,
        timestamp: new Date().toISOString()
    });
};

// ============================================
// 🚀 START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

// Use server.listen instead of app.listen
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SERVER_LIVE]: Port ${PORT}`);
    console.log(`🔌 [WEBSOCKET_READY]: Socket.IO server attached`);
    // ✅ BACKGROUND WORKER INITIALIZATION PERMANENTLY REMOVED
});