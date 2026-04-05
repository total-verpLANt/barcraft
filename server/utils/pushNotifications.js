'use strict';

const webpush = require('web-push');
const { readJson, writeJson } = require('../db/fileDb');

const FILE = 'push-subscriptions.json';
const VAPID_FILE = 'vapid-keys.json';

let vapidPublicKey = null;

async function initWebPush() {
  const email = 'mailto:admin@barcraft.local';

  let publicKey = null;
  let privateKey = null;

  // Keys aus data/vapid-keys.json laden
  const stored = await readJson(VAPID_FILE);
  if (stored && stored.publicKey && stored.privateKey) {
    publicKey = stored.publicKey;
    privateKey = stored.privateKey;
  }

  // Keine Keys vorhanden: neue generieren und speichern
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await writeJson(VAPID_FILE, { publicKey, privateKey });
    console.log('[push] VAPID keys generated and saved to data/vapid-keys.json');
  }

  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    vapidPublicKey = publicKey;
    return true;
  } catch (err) {
    console.warn('[push] Invalid VAPID keys, push notifications disabled:', err.message);
    vapidPublicKey = null;
    return false;
  }
}

function getVapidPublicKey() {
  return vapidPublicKey;
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

module.exports = { initWebPush, getVapidPublicKey, saveSubscription, sendPushToUser };
