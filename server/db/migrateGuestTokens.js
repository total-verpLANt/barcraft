'use strict';

const crypto = require('crypto');
const { readJson, writeJson } = require('./fileDb');

async function migrateGuestTokens() {
  const data = await readJson('users.json');
  if (!data || !Array.isArray(data.users)) return;

  let migrated = 0;
  for (const user of data.users) {
    if (!user.guestToken) {
      user.guestToken = crypto.randomBytes(32).toString('hex');
      migrated++;
    }
  }

  if (migrated > 0) {
    await writeJson('users.json', data);
    console.log(`[migration] assigned guestToken to ${migrated} existing user(s)`);
  }
}

module.exports = { migrateGuestTokens };
