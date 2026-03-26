'use strict';

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const writeQueue = new Map();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function filePath(filename) {
  return path.join(DATA_DIR, filename);
}

async function readJson(filename) {
  try {
    const raw = await fs.readFile(filePath(filename), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(filename, data) {
  const current = writeQueue.get(filename) || Promise.resolve();
  const next = current.then(() =>
    fs.writeFile(filePath(filename), JSON.stringify(data, null, 2), 'utf8')
  );
  writeQueue.set(filename, next.catch(() => {}));
  return next;
}

async function initializeDb() {
  await ensureDataDir();

  const files = {
    'orders.json': { orders: [] },
    'users.json': { users: [] },
    'drinks.json': { drinks: [] },
    'push-subscriptions.json': { subscriptions: [] },
    'bar-state.json': { status: 'open', closingTime: null, pausedAt: null, message: '' },
  };

  for (const [filename, defaultData] of Object.entries(files)) {
    const existing = await readJson(filename);
    if (!existing) {
      await writeJson(filename, defaultData);
    }
  }
}

module.exports = { readJson, writeJson, initializeDb };
