'use strict';

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initializeDb } = require('./db/fileDb');
const { readJson, writeJson } = require('./db/fileDb');
const { router: apiRouter, setIo } = require('./routes/api');
const pushRouter = require('./routes/push');
const { setupSocketHandlers, getUserSocketMap } = require('./socket/handlers');
const { initWebPush } = require('./utils/pushNotifications');
const { SOCKET_EVENTS } = require('./utils/constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRouter);
app.use('/api/push', pushRouter);

// Socket.io
setupSocketHandlers(io);
setIo(io, getUserSocketMap());

// Closing time checker — every 30 seconds
setInterval(async () => {
  try {
    const state = await readJson('bar-state.json');
    if (!state || state.status === 'closed' || !state.closingTime) return;
    const [hh, mm] = state.closingTime.split(':').map(Number);
    const now = new Date();
    if (now.getHours() === hh && now.getMinutes() >= mm) {
      state.status = 'closed';
      state.closingTime = null;
      state.message = 'Bar has closed for the night.';
      await writeJson('bar-state.json', state);
      io.emit(SOCKET_EVENTS.BAR_STATE_CHANGED, state);
    }
  } catch (_) {}
}, 30000);

const PORT = process.env.PORT || 3000;

async function start() {
  await initializeDb();
  await initWebPush();
  server.listen(PORT, () => {
    console.log(`Barcraft running at http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
