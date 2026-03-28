'use strict';

/**
 * @param {object} order
 * @returns {{ drink: object, quantity: number }[]}
 */
function getOrderLines(order) {
  if (!order) return [];
  if (order.items && Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }
  if (order.drink) {
    return [{ drink: order.drink, quantity: order.quantity || 1 }];
  }
  return [];
}

function totalPieces(order) {
  return getOrderLines(order).reduce((s, l) => s + (l.quantity || 1), 0);
}

/** One-line summary for widgets / notifications */
function formatOrderSummary(order) {
  const lines = getOrderLines(order);
  if (lines.length === 0) return 'Bestellung';
  if (lines.length === 1) {
    const l = lines[0];
    return l.quantity > 1 ? `${l.quantity}× ${l.drink.name}` : l.drink.name;
  }
  return `${lines.length} Artikel`;
}

/** Longer text for activity / push */
function formatOrderSummaryDetailed(order, maxLen = 120) {
  const lines = getOrderLines(order);
  if (lines.length === 0) return 'Bestellung';
  const parts = lines.map((l) => `${l.quantity}× ${l.drink.name}`);
  let s = parts.join(', ');
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

module.exports = {
  getOrderLines,
  totalPieces,
  formatOrderSummary,
  formatOrderSummaryDetailed,
};
