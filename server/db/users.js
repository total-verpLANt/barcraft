'use strict';

const crypto = require('crypto');
const { readJson, writeJson } = require('./fileDb');
const { generateId } = require('../utils/idGenerator');

const FILE = 'users.json';

function stripToken(user) {
  const { guestToken: _, ...safe } = user;
  return safe;
}

async function getUsers() {
  const data = await readJson(FILE);
  return data ? data.users.map(stripToken) : [];
}

async function getUserById(id) {
  const data = await readJson(FILE);
  const users = data ? data.users : [];
  const user = users.find(u => u.id === id) || null;
  return user ? stripToken(user) : null;
}

// Internal: returns full user record including guestToken — only for auth middleware
async function getUserByIdFull(id) {
  const data = await readJson(FILE);
  const users = data ? data.users : [];
  return users.find(u => u.id === id) || null;
}

async function createUser({ name }) {
  const data = await readJson(FILE);
  const users = data ? data.users : [];
  const guestToken = crypto.randomBytes(32).toString('hex');
  const user = {
    id: generateId('usr'),
    name,
    guestToken,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    orderCount: 0,
    socketId: null,
  };
  users.push(user);
  await writeJson(FILE, { users });
  return user;
}

async function updateUser(id, updates) {
  const data = await readJson(FILE);
  const users = data ? data.users : [];
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  await writeJson(FILE, { users });
  return users[idx];
}

async function incrementUserOrderCount(userId) {
  const data = await readJson(FILE);
  if (!data) return;
  const idx = data.users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    data.users[idx].orderCount = (data.users[idx].orderCount || 0) + 1;
    data.users[idx].lastActiveAt = new Date().toISOString();
    await writeJson(FILE, data);
  }
}

module.exports = { getUsers, getUserById, getUserByIdFull, createUser, updateUser, incrementUserOrderCount };
