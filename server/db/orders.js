'use strict';

const { readJson, writeJson } = require('./fileDb');
const { generateId } = require('../utils/idGenerator');

const FILE = 'orders.json';

async function getOrders() {
  const data = await readJson(FILE);
  return data ? data.orders : [];
}

async function getOrderById(id) {
  const orders = await getOrders();
  return orders.find(o => o.id === id) || null;
}

function normalizeLines(items, drink, quantity) {
  if (items && Array.isArray(items) && items.length > 0) {
    return items.map((line) => {
      const name = line.drink && String(line.drink.name || '').trim();
      if (!name) throw new Error('Invalid drink in order line');
      return {
        drink: { ...line.drink, name },
        quantity: Math.min(99, Math.max(1, parseInt(line.quantity, 10) || 1)),
      };
    });
  }
  const dn = drink && String(drink.name || '').trim();
  if (dn) {
    return [{ drink: { ...drink, name: dn }, quantity: Math.min(99, Math.max(1, parseInt(quantity, 10) || 1)) }];
  }
  return null;
}

async function createOrder({ userId, userName, userAvatar, items, drink, quantity }) {
  const lines = normalizeLines(items, drink, quantity);
  if (!lines || lines.length === 0) {
    throw new Error('No order lines');
  }
  if (lines.length > 30) {
    throw new Error('Too many line items');
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const primaryDrink =
    lines.length === 1 ? lines[0].drink : { name: `${lines.length} Artikel`, isMulti: true };

  const data = await readJson(FILE);
  const orders = data ? data.orders : [];
  const order = {
    id: generateId('ord'),
    userId,
    userName,
    userAvatar: userAvatar || null,
    items: lines,
    drink: primaryDrink,
    quantity: totalQty,
    status: 'pending',
    barComment: null,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    completedAt: null,
    rejectedAt: null,
  };
  orders.push(order);
  await writeJson(FILE, { orders });
  return order;
}

async function updateOrder(id, updates) {
  const data = await readJson(FILE);
  const orders = data ? data.orders : [];
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...updates };
  await writeJson(FILE, { orders });
  return orders[idx];
}

module.exports = { getOrders, getOrderById, createOrder, updateOrder };
