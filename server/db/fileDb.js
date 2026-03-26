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

const SEED_DRINKS = [
  { name: 'Club Mate', category: 'soft' },
  { name: 'Club Mate Cola', category: 'soft' },
  { name: 'Fritz Kola', category: 'soft' },
  { name: 'Red Bull', category: 'energy' },
  { name: 'Monster Energy', category: 'energy' },
  { name: 'Bionade Holunder', category: 'soft' },
  { name: 'Wasser still', category: 'soft' },
  { name: 'Wasser sprudel', category: 'soft' },
  { name: 'Bier', category: 'beer' },
  { name: 'Radler', category: 'beer' },
  { name: 'Whisky Cola', category: 'cocktail' },
  { name: 'Vodka Orange', category: 'cocktail' },
];

async function initializeDb() {
  await ensureDataDir();
  const { generateId } = require('../utils/idGenerator');

  const files = {
    'orders.json': { orders: [] },
    'users.json': { users: [] },
    'push-subscriptions.json': { subscriptions: [] },
    'bar-state.json': { status: 'open', closingTime: null, pausedAt: null, message: '' },
  };

  for (const [filename, defaultData] of Object.entries(files)) {
    const existing = await readJson(filename);
    if (!existing) {
      await writeJson(filename, defaultData);
    }
  }

  const existingDrinks = await readJson('drinks.json');
  if (!existingDrinks) {
    const now = new Date().toISOString();
    const drinks = SEED_DRINKS.map(d => ({
      id: generateId('drk'),
      name: d.name,
      category: d.category,
      available: true,
      orderCount: 0,
      createdAt: now,
    }));
    await writeJson('drinks.json', { drinks });
  }
}

module.exports = { readJson, writeJson, initializeDb };
