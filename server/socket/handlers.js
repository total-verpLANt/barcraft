'use strict';

const { SOCKET_EVENTS, ROOMS } = require('../utils/constants');
const { updateUser } = require('../db/users');
const { hasSession } = require('../db/sessions');

// userId → socketId map
const userSocketMap = new Map();

function getUserSocketMap() {
  return userSocketMap;
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.GUEST_JOIN, async ({ userId }) => {
      if (!userId) return;
      userSocketMap.set(userId, socket.id);
      socket.userId = userId;
      // Update user's socketId in DB
      await updateUser(userId, { socketId: socket.id, lastActiveAt: new Date().toISOString() });
    });

    socket.on(SOCKET_EVENTS.BAR_JOIN, () => {
      const token = socket.handshake.auth?.token;
      if (!token || !hasSession(token)) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      socket.join(ROOMS.BAR);
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        userSocketMap.delete(socket.userId);
        updateUser(socket.userId, { socketId: null }).catch(() => {});
      }
    });
  });
}

module.exports = { setupSocketHandlers, getUserSocketMap };
