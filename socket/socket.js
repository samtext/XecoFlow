// backend/socket/socket.js
const { Server } = require('socket.io');

let io;

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
const setupSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5174",
      credentials: true,
      methods: ["GET", "POST"]
    },
    // Optional: Configure reconnection behavior
    pingTimeout: 60000, // How long to wait for a pong before closing connection
    pingInterval: 25000  // How often to ping the client
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Send the socket ID to the client so they can use it in API calls
    socket.emit('socket-id', socket.id);

    // Client can join a specific room for their payment
    socket.on('watch-payment', (checkoutId) => {
      socket.join(`payment-${checkoutId}`);
      console.log(`👀 Client ${socket.id} watching payment: ${checkoutId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Emit payment status to a specific client
 * @param {string} socketId - Target client socket ID
 * @param {string} checkoutId - M-Pesa checkout ID
 * @param {string} status - Payment status
 * @param {object} data - Additional data
 */
const emitPaymentStatus = (socketId, checkoutId, status, data = {}) => {
  if (io) {
    // Emit to specific socket
    io.to(socketId).emit('payment-update', {
      checkoutId,
      status,
      data,
      timestamp: new Date().toISOString()
    });
    
    // Also emit to room (if multiple clients watching same payment)
    io.to(`payment-${checkoutId}`).emit('payment-update', {
      checkoutId,
      status,
      data,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = { setupSocket, emitPaymentStatus };