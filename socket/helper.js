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
    console.log('\n🔵 ===== STORE MAPPING DEBUG =====');
    console.log('1. Timestamp:', new Date().toISOString());
    console.log('2. Input checkoutId:', checkoutId);
    console.log('3. Input socketId:', socketId);
    console.log('4. Map size before:', socketMappings.size);
    
    if (!checkoutId || !socketId) {
        console.warn('⚠️ [SOCKET_MAPPING]: Missing checkoutId or socketId');
        console.log('🔵 ===== END DEBUG (FAILED) =====\n');
        return;
    }
    
    // Store the mapping
    socketMappings.set(checkoutId, socketId);
    
    console.log('5. Map size after:', socketMappings.size);
    console.log('6. Verification - get:', socketMappings.get(checkoutId));
    console.log('7. All current mappings:', Array.from(socketMappings.entries()));
    console.log(`📝 [SOCKET_MAPPED]: ${checkoutId} -> ${socketId}`);
    console.log('🔵 ===== END DEBUG =====\n');
    
    // Auto-cleanup after 10 minutes
    setTimeout(() => {
        if (socketMappings.has(checkoutId)) {
            socketMappings.delete(checkoutId);
            console.log(`🧹 [SOCKET_CLEANUP]: Removed mapping for ${checkoutId} at ${new Date().toISOString()}`);
            console.log('📊 Remaining mappings:', Array.from(socketMappings.entries()));
        }
    }, 600000); // 10 minutes
};

/**
 * Get socketId for a checkoutId
 * @param {string} checkoutId - M-Pesa checkout ID
 * @returns {string|null} Socket ID or null if not found
 */
export const getSocketId = (checkoutId) => {
    console.log('\n🟡 ===== GET MAPPING DEBUG =====');
    console.log('1. Timestamp:', new Date().toISOString());
    console.log('2. Looking for checkoutId:', checkoutId);
    console.log('3. Current map size:', socketMappings.size);
    console.log('4. All current mappings:', Array.from(socketMappings.entries()));
    
    const socketId = socketMappings.get(checkoutId) || null;
    
    console.log('5. Found socketId:', socketId || '❌ NOT FOUND');
    console.log('🟡 ===== END DEBUG =====\n');
    
    return socketId;
};

/**
 * Emit payment update to a specific client
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} status - Payment status
 * @param {object} data - Additional data
 */
export const emitPaymentToClient = (checkoutId, status, data = {}) => {
    console.log('\n🟢 ===== EMIT PAYMENT DEBUG =====');
    console.log('1. Timestamp:', new Date().toISOString());
    console.log('2. CheckoutId:', checkoutId);
    console.log('3. Status:', status);
    console.log('4. Data:', data);
    
    // First try to get the socketId from mapping
    const socketId = getSocketId(checkoutId);
    
    if (!socketId) {
        console.log('5. ❌ No socketId found for this checkoutId');
        console.log('🟢 ===== EMIT ABORTED =====\n');
        return;
    }
    
    console.log('5. Found socketId:', socketId);
    
    // Import server to get io instance
    import('../src/server.js').then((serverModule) => {
        const { io } = serverModule;
        
        console.log('6. io instance available:', !!io);
        
        if (io) {
            // Emit to specific socket
            io.to(socketId).emit('payment-update', {
                checkoutId,
                status,
                data,
                timestamp: new Date().toISOString()
            });
            
            // Also emit to room (backward compatibility)
            io.to(`payment-${checkoutId}`).emit('payment-update', {
                checkoutId,
                status,
                data,
                timestamp: new Date().toISOString()
            });
            
            console.log(`7. ✅ [SOCKET_EMIT]: Successfully emitted to socket ${socketId}`);
            console.log(`8. 📡 Payment ${checkoutId} -> ${status}`);
            
            // Check room size
            const room = io.sockets.adapter.rooms.get(`payment-${checkoutId}`);
            const roomSize = room ? room.size : 0;
            console.log(`9. Room size: ${roomSize} client(s) watching`);
            
        } else {
            console.error('7. ❌ io not available in server module');
        }
        
        console.log('🟢 ===== EMIT COMPLETE =====\n');
        
    }).catch(err => {
        console.error('❌ [SOCKET_EMIT]: Could not import server', err.message);
        console.log('🟢 ===== EMIT FAILED =====\n');
    });
};

/**
 * Check if a mapping exists
 * @param {string} checkoutId - M-Pesa checkout ID
 * @returns {boolean} True if mapping exists
 */
export const hasMapping = (checkoutId) => {
    return socketMappings.has(checkoutId);
};

/**
 * Get all current mappings (for debugging)
 * @returns {Array} Array of [checkoutId, socketId] pairs
 */
export const getAllMappings = () => {
    return Array.from(socketMappings.entries());
};

/**
 * Remove a specific mapping
 * @param {string} checkoutId - M-Pesa checkout ID
 */
export const removeMapping = (checkoutId) => {
    if (socketMappings.has(checkoutId)) {
        socketMappings.delete(checkoutId);
        console.log(`🗑️ [SOCKET_REMOVED]: Removed mapping for ${checkoutId}`);
        return true;
    }
    return false;
};

/**
 * Clear all mappings (use with caution)
 */
export const clearAllMappings = () => {
    const size = socketMappings.size;
    socketMappings.clear();
    console.log(`🧹 [SOCKET_CLEAR]: Cleared ${size} mappings`);
};

// Export all functions
export default {
    storeSocketMapping,
    getSocketId,
    emitPaymentToClient,
    hasMapping,
    getAllMappings,
    removeMapping,
    clearAllMappings
};