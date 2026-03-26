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

async function createOrder({ userId, userName, drink, quantity }) {
  const data = await readJson(FILE);
  const orders = data ? data.orders : [];
  const order = {
    id: generateId('ord'),
    userId,
    userName,
    drink,
    quantity: quantity || 1,
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
