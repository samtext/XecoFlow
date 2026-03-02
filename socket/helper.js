// backend/socket/helper.js

/**
 * In-memory store for socket mappings
 * Maps checkoutId -> socketId for real-time updates
 */
const socketMappings = new Map();

/**
 * Store mapping between checkoutId and socketId
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} socketId - Client socket ID
 */
export const storeSocketMapping = (checkoutId, socketId) => {
    if (!checkoutId || !socketId) {
        console.warn('⚠️ [SOCKET_MAPPING]: Missing checkoutId or socketId');
        return;
    }
    
    socketMappings.set(checkoutId, socketId);
    console.log(`📝 [SOCKET_MAPPED]: ${checkoutId} -> ${socketId}`);
    
    // Auto-cleanup after 10 minutes
    setTimeout(() => {
        if (socketMappings.has(checkoutId)) {
            socketMappings.delete(checkoutId);
            console.log(`🧹 [SOCKET_CLEANUP]: Removed mapping for ${checkoutId}`);
        }
    }, 600000);
};

/**
 * Get socketId for a checkoutId
 * @param {string} checkoutId - M-Pesa checkout ID
 * @returns {string|null} Socket ID or null if not found
 */
export const getSocketId = (checkoutId) => {
    return socketMappings.get(checkoutId) || null;
};

/**
 * Emit payment update to a specific client
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} status - Payment status
 * @param {object} data - Additional data
 */
export const emitPaymentToClient = (checkoutId, status, data = {}) => {
    // ✅ CORRECT PATH: Go up one level, then into src/
    import('../src/server.js').then((serverModule) => {
        // Assuming your server exports a named export 'io'
        const { io } = serverModule;
        if (io) {
            io.to(`payment-${checkoutId}`).emit('payment-update', {
                checkoutId,
                status,
                data,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [SOCKET_EMIT]: ${checkoutId} -> ${status}`);
        } else {
            console.warn('⚠️ [SOCKET_EMIT]: io not available in server module');
        }
    }).catch(err => {
        console.error('❌ [SOCKET_EMIT]: Could not import server', err.message);
    });
};