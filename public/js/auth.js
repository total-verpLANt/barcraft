'use strict';

(function () {
  const TOKEN_KEY = 'barcraft_token';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  async function requireAuth() {
    if (getToken()) {
      hideOverlay();
      return;
    }
    showOverlay();
  }

  function showOverlay() {
    const overlay = document.getElementById('password-overlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    const overlay = document.getElementById('password-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  async function submitPassword(password) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const { token } = await res.json();
      setToken(token);
      hideOverlay();
      return true;
    }
    return false;
  }

  // Wire up the password form if present
  document.addEventListener('DOMContentLoaded', () => {
    requireAuth();

    const form = document.getElementById('password-form');
    const errorEl = document.getElementById('auth-error');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="password"]');
        if (!input) return;
        const ok = await submitPassword(input.value);
        if (!ok) {
          if (errorEl) errorEl.textContent = 'Wrong password. Try again.';
          input.value = '';
          input.focus();
        }
      });
    }
  });

  window.Auth = { getToken, setToken, clearToken };
})();
