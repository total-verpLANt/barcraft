'use strict';

const webpush = require('web-push');
const { readJson, writeJson } = require('../db/fileDb');

const FILE = 'push-subscriptions.json';

function initWebPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(
        VAPID_EMAIL || 'mailto:admin@barcraft.local',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      );
      return true;
    } catch (err) {
      console.warn('[push] Invalid VAPID keys, push notifications disabled:', err.message);
      return false;
    }
  }
  console.warn('[push] No VAPID keys configured, push notifications disabled.');
  return false;
}

async function saveSubscription(userId, subscription) {
  const data = (await readJson(FILE)) || { subscriptions: [] };
  const idx = data.subscriptions.findIndex(s => s.userId === userId);
  if (idx !== -1) {
    data.subscriptions[idx].subscription = subscription;
  } else {
    data.subscriptions.push({ userId, subscription, createdAt: new Date().toISOString() });
  }
  await writeJson(FILE, data);
}

async function getSubscriptionByUserId(userId) {
  const data = await readJson(FILE);
  if (!data) return null;
  const entry = data.subscriptions.find(s => s.userId === userId);
  return entry ? entry.subscription : null;
}

async function sendPushToUser(userId, payload) {
  const subscription = await getSubscriptionByUserId(userId);
  if (!subscription) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — remove it
      const data = await readJson(FILE);
      if (data) {
        data.subscriptions = data.subscriptions.filter(s => s.userId !== userId);
        await writeJson(FILE, data);
      }
    }
  }
}

module.exports = { initWebPush, saveSubscription, sendPushToUser };
