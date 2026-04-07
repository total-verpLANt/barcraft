'use strict';

const express = require('express');
const router = express.Router();
const { saveSubscription, getVapidPublicKey } = require('../utils/pushNotifications');
const { requireGuestAuth } = require('../middleware/guestAuth');

router.get('/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  res.json({ publicKey: key });
});

router.post('/subscribe', requireGuestAuth, async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'userId and subscription required' });
  }
  try {
    await saveSubscription(userId, subscription);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
