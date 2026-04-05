'use strict';

const express = require('express');
const router = express.Router();
const config = require('../../config.json');

const { getUsers, getUserById, createUser, updateUser } = require('../db/users');
const { getDrinks, createDrink, updateDrink, deleteDrink, incrementDrinkOrderCount } = require('../db/drinks');
const { getOrders, getOrderById, createOrder, updateOrder } = require('../db/orders');
const { incrementUserOrderCount } = require('../db/users');
const { getStats } = require('../db/stats');
const { readJson, writeJson } = require('../db/fileDb');
const { ORDER_STATUS, SOCKET_EVENTS, ROOMS } = require('../utils/constants');
const { sendPushToUser } = require('../utils/pushNotifications');
const crypto = require('crypto');

const activeSessions = new Set();

let _io = null;
let _userSocketMap = null;

function setIo(io, userSocketMap) {
  _io = io;
  _userSocketMap = userSocketMap;
}

function emitToGuest(userId, event, payload) {
  if (!_io || !_userSocketMap) return;
  const socketId = _userSocketMap.get(userId);
  if (socketId) {
    _io.to(socketId).emit(event, payload);
  }
}

async function broadcastStats() {
  if (!_io) return;
  const stats = await getStats();
  _io.emit(SOCKET_EVENTS.STATS_UPDATED, { stats });
}

function verifyBarToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  return activeSessions.has(token);
}

function requireBarAuth(req, res, next) {
  if (!verifyBarToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Auth ---
router.post('/auth', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (password === config.password) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    return res.json({ token, barName: config.barName });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// --- Users ---
router.get('/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const user = await createUser({ name: name.trim() });
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Drinks ---
router.get('/drinks', async (req, res) => {
  try {
    const drinks = await getDrinks();
    res.json({ drinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/drinks', requireBarAuth, async (req, res) => {
  const { name, category } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const drink = await createDrink({ name: name.trim(), category: category || 'soft' });
    res.status(201).json({ drink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/drinks/:id', requireBarAuth, async (req, res) => {
  try {
    const drink = await updateDrink(req.params.id, req.body);
    if (!drink) return res.status(404).json({ error: 'Drink not found' });
    res.json({ drink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/drinks/:id', requireBarAuth, async (req, res) => {
  try {
    const ok = await deleteDrink(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Drink not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Orders ---
router.get('/orders', async (req, res) => {
  try {
    const orders = await getOrders();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id/avatar', async (req, res) => {
  const { avatarDataUrl } = req.body;
  if (!avatarDataUrl) return res.status(400).json({ error: 'avatarDataUrl required' });
  if (!avatarDataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image data' });
  try {
    const user = await updateUser(req.params.id, { avatarDataUrl });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders', async (req, res) => {
  const { userId, userName, drink, quantity } = req.body;
  if (!userId || !drink) return res.status(400).json({ error: 'userId and drink required' });

  try {
    // Check bar state
    const barState = await readJson('bar-state.json');
    if (barState && barState.status === 'closed') {
      return res.status(403).json({ error: 'Bar is closed' });
    }
    if (barState && barState.status === 'paused') {
      return res.status(403).json({ error: 'Bar is paused' });
    }

    const user = await getUserById(userId);
    const userAvatar = user?.avatarDataUrl || null;
    const order = await createOrder({ userId, userName, userAvatar, drink, quantity });

    // Increment counters
    if (!drink.isFreeText && drink.drinkId) {
      await incrementDrinkOrderCount(drink.drinkId);
    }
    await incrementUserOrderCount(userId);

    // Emit to bar
    if (_io) _io.to(ROOMS.BAR).emit(SOCKET_EVENTS.BAR_NEW_ORDER, { order });

    await broadcastStats();
    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/orders/:id', async (req, res) => {
  const { status, barComment } = req.body;
  const validStatuses = [ORDER_STATUS.ACCEPTED, ORDER_STATUS.REJECTED, ORDER_STATUS.COMPLETED];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const existing = await getOrderById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const now = new Date().toISOString();
    const updates = { status, barComment: barComment || null };
    if (status === ORDER_STATUS.ACCEPTED) updates.acceptedAt = now;
    if (status === ORDER_STATUS.REJECTED) updates.rejectedAt = now;
    if (status === ORDER_STATUS.COMPLETED) updates.completedAt = now;

    const order = await updateOrder(req.params.id, updates);

    // Emit to bar room
    if (_io) _io.to(ROOMS.BAR).emit(SOCKET_EVENTS.BAR_ORDER_UPDATED, { order });

    // Emit to guest
    const eventMap = {
      [ORDER_STATUS.ACCEPTED]: SOCKET_EVENTS.GUEST_ORDER_ACCEPTED,
      [ORDER_STATUS.REJECTED]: SOCKET_EVENTS.GUEST_ORDER_REJECTED,
      [ORDER_STATUS.COMPLETED]: SOCKET_EVENTS.GUEST_ORDER_COMPLETED,
    };
    const guestEvent = eventMap[status];
    if (guestEvent) {
      emitToGuest(order.userId, guestEvent, { orderId: order.id, barComment: order.barComment });
      // Send push notification as fallback
      const pushPayload = {
        title: 'Barcraft',
        body: status === ORDER_STATUS.ACCEPTED
          ? `Your order of ${order.drink.name} was accepted!`
          : status === ORDER_STATUS.REJECTED
          ? `Your order was rejected. ${order.barComment || ''}`
          : `Your ${order.drink.name} is ready! Come pick it up.`,
        orderId: order.id,
        status,
      };
      sendPushToUser(order.userId, pushPayload).catch(() => {});
    }

    await broadcastStats();
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Stats ---
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bar State ---
router.get('/bar-state', async (req, res) => {
  try {
    const state = await readJson('bar-state.json');
    res.json(state || { status: 'open', closingTime: null, message: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/bar-state', async (req, res) => {
  try {
    const current = (await readJson('bar-state.json')) || { status: 'open', closingTime: null, message: '' };
    const { status, closingTime, message } = req.body;
    if (status !== undefined) current.status = status;
    if (closingTime !== undefined) current.closingTime = closingTime;
    if (message !== undefined) current.message = message;
    if (status === 'paused') current.pausedAt = new Date().toISOString();
    if (status === 'open') current.pausedAt = null;
    await writeJson('bar-state.json', current);

    if (_io) _io.emit(SOCKET_EVENTS.BAR_STATE_CHANGED, current);
    res.json(current);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, setIo };
