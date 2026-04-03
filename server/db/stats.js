'use strict';

const { readJson } = require('./fileDb');
const { getOrderLines, formatOrderSummaryDetailed, totalPieces } = require('../utils/orderHelpers');

async function getStats() {
  const [ordersData, drinksData, usersData] = await Promise.all([
    readJson('orders.json'),
    readJson('drinks.json'),
    readJson('users.json'),
  ]);

  const orders = ordersData ? ordersData.orders : [];
  const drinks = drinksData ? drinksData.drinks : [];
  const users = usersData ? usersData.users : [];

  const totalOrders = orders.length;
  const servedOrders = orders.filter(o => o.status === 'completed').length;

  // Top drinks by orderCount
  const drinkCounts = {};
  for (const order of orders) {
    if (order.status === 'completed' || order.status === 'accepted') {
      for (const line of getOrderLines(order)) {
        const name = line.drink.name;
        drinkCounts[name] = (drinkCounts[name] || 0) + (line.quantity || 1);
      }
    }
  }
  const topDrinks = Object.entries(drinkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Top users by order count
  const userCounts = {};
  for (const order of orders) {
    if (order.userId) {
      if (!userCounts[order.userId]) {
        userCounts[order.userId] = { name: order.userName, count: 0 };
      }
      userCounts[order.userId].count += 1;
    }
  }
  const topUsers = Object.values(userCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent activity (last 10 orders)
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(o => ({
      id: o.id,
      userName: o.userName,
      drink: o.drink ? o.drink.name : '',
      summary: formatOrderSummaryDetailed(o, 100),
      quantity: totalPieces(o),
      status: o.status,
      createdAt: o.createdAt,
    }));

  return {
    totalOrders,
    servedOrders,
    topDrink: topDrinks[0] || null,
    topUser: topUsers[0] || null,
    topDrinks,
    topUsers,
    recentOrders,
  };
}

module.exports = { getStats };
