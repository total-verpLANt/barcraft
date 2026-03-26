'use strict';

const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
};

const SOCKET_EVENTS = {
  // Client → Server
  GUEST_JOIN: 'client:guest_join',
  BAR_JOIN: 'client:bar_join',

  // Server → Bar room
  BAR_NEW_ORDER: 'bar:new_order',
  BAR_ORDER_UPDATED: 'bar:order_updated',

  // Server → Guest socket
  GUEST_ORDER_ACCEPTED: 'guest:order_accepted',
  GUEST_ORDER_REJECTED: 'guest:order_rejected',
  GUEST_ORDER_COMPLETED: 'guest:order_completed',

  // Server → All
  STATS_UPDATED: 'global:stats_updated',
  BAR_STATE_CHANGED: 'global:bar_state_changed',
};

const BAR_STATUS = {
  OPEN: 'open',
  PAUSED: 'paused',
  CLOSED: 'closed',
};

const ROOMS = {
  BAR: 'bar',
};

module.exports = { ORDER_STATUS, SOCKET_EVENTS, BAR_STATUS, ROOMS };
