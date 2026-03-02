// backend/socket/helper.js
import { emitPaymentUpdate } from '../server.js';

/**
 * Store socketId mapping in memory (or database in production)
 * In production, use Redis or MongoDB for this
 */
const socketMappings = new Map();

/**
 * Store mapping between checkoutId and socketId
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} socketId - Client socket ID
 */
export const storeSocketMapping = (checkoutId, socketId) => {
    socketMappings.set(checkoutId, socketId);
    console.log(`📝 [SOCKET_MAPPED]: ${checkoutId} -> ${socketId}`);
    
    // Auto-cleanup after 10 minutes (600,000 ms)
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
 * Emit payment update using stored mapping
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} status - Payment status
 * @param {object} data - Additional data
 */
export const emitPaymentToClient = (checkoutId, status, data = {}) => {
    const socketId = getSocketId(checkoutId);
    
    if (socketId) {
        emitPaymentUpdate(checkoutId, status, {
            ...data,
            targetSocket: socketId
        });
    } else {
        console.warn(`⚠️ [SOCKET_NO_MAPPING]: No socket found for ${checkoutId}`);
        // Still emit to room as fallback
        emitPaymentUpdate(checkoutId, status, data);
    }
};