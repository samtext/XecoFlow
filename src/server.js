import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
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
// 🔌 WEBSOCKET SETUP - ENHANCED FOR STABILITY
// ============================================

/**
 * Create HTTP server (required for WebSockets)
 */
const server = http.createServer(app);

/**
 * Initialize Socket.IO with enhanced configuration
 */
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
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
    // 🔧 ENHANCED: Increased timeouts for better stability
    pingTimeout: 120000,        // Increased from 60000 to 120000 (2 minutes)
    pingInterval: 30000,        // Keep at 30 seconds
    connectTimeout: 30000,      // Connection timeout
    maxHttpBufferSize: 1e6,     // Max message size
    transports: ['websocket', 'polling'], // Allow both transports
    allowEIO3: true,            // Compatibility
    // 🔧 ENHANCED: Better error handling
    handlePreflightRequest: (req, res) => {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': req.headers.origin || '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        });
        res.end();
    }
});

/**
 * Make io available to routes
 */
app.set('io', io);

/**
 * Socket.IO connection handler with enhanced logging
 */
io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                     socket.handshake.address;
    
    console.log(`🔌 [SOCKET_CONNECTED]: ${socket.id} from ${clientIp}`);

    // Send socket ID to client
    socket.emit('socket-id', socket.id);

    // Client wants to watch a specific payment
    socket.on('watch-payment', (checkoutId) => {
        socket.join(`payment-${checkoutId}`);
        console.log(`👀 [SOCKET_WATCHING]: ${socket.id} watching payment ${checkoutId}`);
        
        // Store in socket data for debugging
        socket.data.watching = checkoutId;
    });

    // Client stops watching
    socket.on('unwatch-payment', (checkoutId) => {
        socket.leave(`payment-${checkoutId}`);
        console.log(`👋 [SOCKET_UNWATCH]: ${socket.id} stopped watching ${checkoutId}`);
        socket.data.watching = null;
    });

    // Handle pings from client (keep-alive)
    socket.on('ping', () => {
        socket.emit('pong');
        console.log(`📤 [SOCKET_PING]: ${socket.id} - pong sent`);
    });

    // Handle disconnection with reason
    socket.on('disconnect', (reason) => {
        console.log(`🔌 [SOCKET_DISCONNECTED]: ${socket.id} - Reason: ${reason}`);
        console.log(`   Last watched payment: ${socket.data.watching || 'none'}`);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error(`❌ [SOCKET_ERROR]: ${socket.id} - ${error.message}`);
    });

    // Handle connection transport upgrade
    socket.on('upgrade', (transport) => {
        console.log(`⬆️ [SOCKET_UPGRADE]: ${socket.id} upgraded to ${transport.name}`);
    });
});

/**
 * Helper function to emit payment updates with better error handling
 */
export const emitPaymentUpdate = (checkoutId, status, data = {}) => {
    console.log(`📡 [SOCKET_EMIT]: Attempting to emit for payment ${checkoutId} - ${status}`);
    
    try {
        // Emit to specific room
        io.to(`payment-${checkoutId}`).emit('payment-update', {
            checkoutId,
            status,
            data,
            timestamp: new Date().toISOString()
        });
        
        console.log(`✅ [SOCKET_EMIT]: Successfully emitted to room payment-${checkoutId}`);
        
        // Also log room size for debugging
        const room = io.sockets.adapter.rooms.get(`payment-${checkoutId}`);
        const roomSize = room ? room.size : 0;
        console.log(`   Room size: ${roomSize} client(s) watching`);
        
    } catch (error) {
        console.error(`❌ [SOCKET_EMIT_ERROR]: Failed to emit for ${checkoutId}:`, error.message);
    }
};

/**
 * Helper to check socket health
 */
export const getSocketHealth = () => {
    const connectedSockets = io.engine.clientsCount;
    const rooms = io.sockets.adapter.rooms;
    
    console.log('\n📊 [SOCKET_HEALTH]:');
    console.log(`   Connected clients: ${connectedSockets}`);
    console.log(`   Active rooms: ${rooms.size}`);
    
    return {
        connectedClients: connectedSockets,
        activeRooms: rooms.size
    };
};

// ============================================
// 🚀 START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SERVER_LIVE]: Port ${PORT}`);
    console.log(`🔌 [WEBSOCKET_READY]: Socket.IO server attached with:`);
    console.log(`   - Ping timeout: 120000ms (2 minutes)`);
    console.log(`   - Ping interval: 30000ms`);
    console.log(`   - Transports: websocket, polling`);
});

export { io };