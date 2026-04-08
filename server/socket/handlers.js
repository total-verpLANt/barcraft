'use strict';

const crypto = require('crypto');
const cookie = require('cookie');
const { SOCKET_EVENTS, ROOMS } = require('../utils/constants');
const { updateUser, getUserByIdFull } = require('../db/users');
const { hasSession } = require('../db/sessions');

// userId → socketId map
const userSocketMap = new Map();

function getUserSocketMap() {
  return userSocketMap;
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.GUEST_JOIN, async ({ userId }) => {
      try {
        const cookies = cookie.parse(socket.handshake.headers.cookie || '');
        const guestToken = cookies.guestToken;
        if (!userId || !guestToken) {
          socket.disconnect(true);
          return;
        }
        const user = await getUserByIdFull(userId);
        const tokenMatch = user && user.guestToken && typeof guestToken === 'string' &&
          guestToken.length === user.guestToken.length &&
          crypto.timingSafeEqual(Buffer.from(user.guestToken, 'utf8'), Buffer.from(guestToken, 'utf8'));
        if (!tokenMatch) {
          socket.disconnect(true);
          return;
        }
        userSocketMap.set(userId, socket.id);
        socket.userId = userId;
        // Update user's socketId in DB
        await updateUser(userId, { socketId: socket.id, lastActiveAt: new Date().toISOString() });
      } catch (err) {
        socket.disconnect(true);
      }
    });

    socket.on(SOCKET_EVENTS.BAR_JOIN, () => {
      const token = socket.handshake.auth?.token;
      if (!token || !hasSession(token)) {
        socket.emit('error', { message: 'Unauthorized' });
        socket.disconnect(true);
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
