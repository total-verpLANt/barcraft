'use strict';

// Shared socket.io client wrapper
(function () {
  let _socket = null;

  function getSocket() {
    if (!_socket) {
      _socket = io({ transports: ['websocket', 'polling'] });
    }
    return _socket;
  }

  window.SocketClient = { getSocket };
})();
