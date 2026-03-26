'use strict';

const { readJson, writeJson } = require('./fileDb');
const { generateId } = require('../utils/idGenerator');

const FILE = 'drinks.json';

async function getDrinks() {
  const data = await readJson(FILE);
  return data ? data.drinks : [];
}

async function getDrinkById(id) {
  const drinks = await getDrinks();
  return drinks.find(d => d.id === id) || null;
}

async function createDrink({ name, category }) {
  const data = await readJson(FILE);
  const drinks = data ? data.drinks : [];
  const drink = {
    id: generateId('drk'),
    name,
    category: category || 'soft',
    available: true,
    orderCount: 0,
    createdAt: new Date().toISOString(),
  };
  drinks.push(drink);
  await writeJson(FILE, { drinks });
  return drink;
}

async function updateDrink(id, updates) {
  const data = await readJson(FILE);
  const drinks = data ? data.drinks : [];
  const idx = drinks.findIndex(d => d.id === id);
  if (idx === -1) return null;
  drinks[idx] = { ...drinks[idx], ...updates };
  await writeJson(FILE, { drinks });
  return drinks[idx];
}

async function incrementDrinkOrderCount(drinkId) {
  const data = await readJson(FILE);
  if (!data) return;
  const idx = data.drinks.findIndex(d => d.id === drinkId);
  if (idx !== -1) {
    data.drinks[idx].orderCount = (data.drinks[idx].orderCount || 0) + 1;
    await writeJson(FILE, data);
  }
}

module.exports = { getDrinks, getDrinkById, createDrink, updateDrink, incrementDrinkOrderCount };
