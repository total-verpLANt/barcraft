'use strict';

const crypto = require('crypto');
const cookie = require('cookie');
const { getUserByIdFull } = require('../db/users');

/**
 * Middleware: validates that the request carries a valid guest session token.
 *
 * The client must carry the httpOnly cookie 'guestToken' issued at user-creation time.
 * The userId is read from:
 *   - req.params.id    (PATCH /api/users/:id/avatar)
 *   - req.body.userId  (POST /api/orders, POST /api/push/subscribe)
 *
 * Responds 401 if token or userId is missing, 403 if the token does not
 * match the stored guestToken for that user.
 */
async function requireGuestAuth(req, res, next) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.guestToken;
  const userId = req.params?.id || req.body?.userId;
  if (!token || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const user = await getUserByIdFull(userId);
    const tokenMatch = user && user.guestToken && typeof token === 'string' &&
      token.length === user.guestToken.length &&
      crypto.timingSafeEqual(Buffer.from(user.guestToken, 'utf8'), Buffer.from(token, 'utf8'));
    if (!tokenMatch) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { requireGuestAuth };
