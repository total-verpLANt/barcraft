'use strict';

// Shared socket.io client wrapper
(function () {
  let _socket = null;

  function getSocket() {
    if (!_socket) {
      const token = window.Auth?.getToken?.() || null;
      _socket = io({ transports: ['websocket', 'polling'], auth: { token } });
    }
    return _socket;
  }

  window.SocketClient = { getSocket };
})();
