'use strict';

const _sessions = new Set();

function addSession(token) { _sessions.add(token); }
function removeSession(token) { _sessions.delete(token); }
function hasSession(token) { return _sessions.has(token); }

module.exports = { addSession, removeSession, hasSession };
