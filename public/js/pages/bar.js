'use strict';

(function () {
  const { escapeHtml, formatRelativeTime, formatElapsed, triggerFlash } = Utils;
  const socket = SocketClient.getSocket();

  let orders = [];
  let timerInterval = null;

  // Join bar room
  socket.emit('client:bar_join');

  // === Drinks management ===
  async function loadDrinks() {
    try {
      const res = await fetch('/api/drinks');
      const { drinks } = await res.json();
      renderDrinks(drinks || []);
    } catch (err) { console.error(err); }
  }

  const CATEGORIES = [
    { value: 'soft',     label: 'Soft Drink' },
    { value: 'energy',   label: 'Energy' },
    { value: 'beer',     label: 'Bier' },
    { value: 'cocktail', label: 'Cocktail' },
    { value: 'other',    label: 'Sonstiges' },
  ];

  function categoryOptions(selected) {
    return CATEGORIES.map(c =>
      `<option value="${c.value}"${c.value === selected ? ' selected' : ''}>${c.label}</option>`
    ).join('');
  }

  function renderDrinks(drinks) {
    const list = document.getElementById('drinks-list');
    const noMsg = document.getElementById('no-drinks-msg');
    if (drinks.length === 0) {
      list.innerHTML = '';
      noMsg.classList.remove('hidden');
      return;
    }
    noMsg.classList.add('hidden');
    list.innerHTML = drinks.map(d => `
      <div style="display:flex;align-items:center;gap:.5rem;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:.5rem .75rem;">
        <span style="font-size:.9375rem;font-weight:500;flex:1;">${escapeHtml(d.name)}</span>
        <select class="select" data-cat-drink="${escapeHtml(d.id)}" style="width:auto;padding:.35rem .5rem;font-size:.875rem;">${categoryOptions(d.category)}</select>
        <button class="btn btn-icon btn-ghost btn-sm" data-delete-drink="${escapeHtml(d.id)}" title="Löschen"
          style="padding:.25rem .5rem;font-size:.9rem;color:var(--color-danger);min-width:auto;">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-cat-drink]').forEach(sel => {
      sel.addEventListener('change', async () => {
        await fetch(`/api/drinks/${sel.dataset.catDrink}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: sel.value }),
        });
      });
    });
    list.querySelectorAll('[data-delete-drink]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Drink "${btn.closest('div').querySelector('span').textContent}" löschen?`)) return;
        await fetch(`/api/drinks/${btn.dataset.deleteDrink}`, { method: 'DELETE' });
        await loadDrinks();
      });
    });
  }

  document.getElementById('drinks-toggle').addEventListener('click', () => {
    const body = document.getElementById('drinks-body');
    const arrow = document.getElementById('drinks-arrow');
    const isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden', !isHidden);
    arrow.textContent = isHidden ? '▲' : '▼';
    if (isHidden) loadDrinks();
  });

  // === Fetch all orders on load ===
  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) return;
      const { orders: allOrders } = await res.json();
      // We only care about recent/active orders
      orders = allOrders || [];
      renderAll();
    } catch (err) { console.error(err); }
  }

  // We'll GET orders from the server — need to add a GET /api/orders endpoint check
  // For now, initialize from socket events and use a local in-memory store
  async function init() {
    // Load bar state
    try {
      const res = await fetch('/api/bar-state');
      const state = await res.json();
      updateBarStateBadge(state);
    } catch { }

    // Load existing orders
    await loadOrders();
    startTimers();
  }

  // === Rendering ===
  function renderAll() {
    const pending = orders.filter(o => o.status === 'pending');
    const accepted = orders.filter(o => o.status === 'accepted');
    const completed = orders
      .filter(o => o.status === 'completed' || o.status === 'rejected')
      .sort((a, b) => new Date(b.completedAt || b.rejectedAt) - new Date(a.completedAt || a.rejectedAt))
      .slice(0, 3);

    document.getElementById('pending-count').textContent = pending.length;
    document.getElementById('pending-orders').innerHTML = pending.map(renderPendingCard).join('');
    document.getElementById('no-pending').style.display = pending.length ? 'none' : '';
    document.getElementById('accepted-orders').innerHTML = accepted.map(renderAcceptedCard).join('');
    document.getElementById('no-accepted').style.display = accepted.length ? 'none' : '';
    document.getElementById('completed-orders').innerHTML = completed.map(renderCompletedCard).join('');

    // Standby vs queue
    const active = pending.length + accepted.length;
    document.getElementById('bar-standby').classList.toggle('hidden', active > 0);
    document.getElementById('bar-queue').style.display = active === 0 && pending.length === 0 ? '' : '';

    // Update standby badge
    document.getElementById('standby-pending-count').classList.toggle('hidden', pending.length === 0);
    document.getElementById('standby-count-badge').textContent = pending.length;

    attachCardListeners();
  }

  function renderPendingCard(order) {
    return `
    <div class="order-card card-accent slide-down" id="order-${escapeHtml(order.id)}">
      <div class="order-card-header">
        <div class="flex items-center gap-1" style="min-width:0;">
          ${order.userAvatar ? `<img src="${escapeHtml(order.userAvatar)}" class="order-avatar" alt="">` : ''}
          <div>
            <div class="order-name">🎮 ${escapeHtml(order.userName)}</div>
            <div class="order-drink"><span class="qty">×${order.quantity}</span> ${escapeHtml(order.drink.name)}</div>
          </div>
        </div>
        <span class="badge badge-pending">Pending</span>
      </div>
      <div class="order-meta">${formatRelativeTime(order.createdAt)}</div>
      <div class="order-actions">
        <button class="btn btn-primary" data-action="accept" data-id="${escapeHtml(order.id)}">✓ Accept</button>
        <button class="btn btn-danger" data-action="reject" data-id="${escapeHtml(order.id)}">✗ Reject</button>
      </div>
    </div>`;
  }

  function renderAcceptedCard(order) {
    const elapsed = formatElapsed(order.acceptedAt);
    const secs = order.acceptedAt ? Math.floor((Date.now() - new Date(order.acceptedAt)) / 1000) : 0;
    const warnClass = secs > 300 ? 'warning blink' : '';
    return `
    <div class="order-card" id="order-${escapeHtml(order.id)}">
      <div class="order-card-header">
        <div class="flex items-center gap-1" style="min-width:0;">
          ${order.userAvatar ? `<img src="${escapeHtml(order.userAvatar)}" class="order-avatar" alt="">` : ''}
          <div>
            <div class="order-name">🎮 ${escapeHtml(order.userName)}</div>
            <div class="order-drink"><span class="qty">×${order.quantity}</span> ${escapeHtml(order.drink.name)}</div>
          </div>
        </div>
        <span class="badge badge-accepted">In Prep</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="order-timer ${warnClass}" id="timer-${escapeHtml(order.id)}">⏱ ${elapsed}</span>
        <div class="flex gap-1">
          <button class="btn btn-danger btn-sm" data-action="cancel-accepted" data-id="${escapeHtml(order.id)}">✕ Abbrechen</button>
          <button class="btn btn-success" data-action="complete" data-id="${escapeHtml(order.id)}">✓ Ready</button>
        </div>
      </div>
      ${order.barComment ? `<div class="order-meta mt-1">💬 ${escapeHtml(order.barComment)}</div>` : ''}
    </div>`;
  }

  function renderCompletedCard(order) {
    const isDone = order.status === 'completed';
    return `
    <div class="order-card" id="order-${escapeHtml(order.id)}" style="opacity:.6;">
      <div class="order-card-header">
        <div>
          <div class="order-name" style="font-size:.9rem;">🎮 ${escapeHtml(order.userName)}</div>
          <div class="order-drink" style="font-size:.85rem;"><span class="qty">×${order.quantity}</span> ${escapeHtml(order.drink.name)}</div>
        </div>
        <span class="badge ${isDone ? 'badge-completed' : 'badge-rejected'}">${isDone ? '✓ Done' : '✗ Rejected'}</span>
      </div>
    </div>`;
  }

  function attachCardListeners() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', handleCardAction);
    });
  }

  async function handleCardAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const orderId = btn.dataset.id;

    if (action === 'cancel-accepted') {
      await updateOrder(orderId, 'rejected', 'Bestellung wurde abgebrochen.');
    } else if (action === 'accept') {
      await updateOrder(orderId, 'accepted');
    } else if (action === 'reject') {
      await updateOrder(orderId, 'rejected');
    } else if (action === 'complete') {
      await updateOrder(orderId, 'completed');
    }
  }

  async function updateOrder(orderId, status, barComment) {
    try {
      const body = { status };
      if (barComment) body.barComment = barComment;
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) { console.error(err); }
  }

  // === Timers ===
  function startTimers() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      document.querySelectorAll('[id^="timer-"]').forEach(el => {
        const orderId = el.id.replace('timer-', '');
        const order = orders.find(o => o.id === orderId);
        if (order && order.acceptedAt) {
          const secs = Math.floor((Date.now() - new Date(order.acceptedAt)) / 1000);
          el.textContent = `⏱ ${formatElapsed(order.acceptedAt)}`;
          el.className = `order-timer${secs > 300 ? ' warning blink' : ''}`;
        }
      });
    }, 1000);
  }

  // === New order alert overlay ===
  let alertTimeout = null;

  function dismissAlert() {
    clearTimeout(alertTimeout);
    const overlay = document.getElementById('bar-alert-overlay');
    overlay.classList.add('hidden');
  }

  function showOrderAlert(order) {
    const overlay = document.getElementById('bar-alert-overlay');
    const avatarEl = document.getElementById('alert-avatar');
    if (order.userAvatar) {
      avatarEl.src = order.userAvatar;
      avatarEl.classList.remove('hidden');
    } else {
      avatarEl.classList.add('hidden');
    }
    document.getElementById('alert-drink').textContent = order.drink.name;
    document.getElementById('alert-qty').textContent = `× ${order.quantity}`;
    document.getElementById('alert-user').textContent = `von ${order.userName}`;
    overlay.classList.remove('hidden');
    overlay.style.animation = 'none';
    void overlay.offsetWidth;
    overlay.style.animation = 'overlayPulse 10s ease-in-out forwards';
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(dismissAlert, 10000);
    overlay.onclick = dismissAlert;
  }

  // === Bar controls ===
  document.getElementById('controls-toggle').addEventListener('click', () => {
    const body = document.getElementById('controls-body');
    const arrow = document.getElementById('controls-arrow');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    arrow.textContent = isHidden ? '▲' : '▼';
  });

  async function setBarState(status, extra = {}) {
    try {
      const res = await fetch('/api/bar-state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extra }),
      });
      const state = await res.json();
      updateBarStateBadge(state);
    } catch (err) { console.error(err); }
  }

  document.getElementById('btn-close-bar').addEventListener('click', () => setBarState('closed', { message: 'The bar is now closed.' }));
  document.getElementById('btn-pause-bar').addEventListener('click', () => setBarState('paused', { message: 'Orders are temporarily paused.' }));
  document.getElementById('btn-open-bar').addEventListener('click', () => setBarState('open', { message: '' }));

  document.getElementById('btn-set-closing-time').addEventListener('click', async () => {
    const time = document.getElementById('closing-time-input').value;
    if (!time) return;
    try {
      await fetch('/api/bar-state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingTime: time }),
      });
    } catch (err) { console.error(err); }
  });

  function updateBarStateBadge(state) {
    const badge = document.getElementById('bar-state-badge');
    badge.className = `badge badge-${state.status}`;
    const labels = { open: '● Open', paused: '⏸ Paused', closed: '🔒 Closed' };
    badge.textContent = labels[state.status] || state.status;
  }

  // === Socket events ===
  socket.on('bar:new_order', ({ order }) => {
    orders = orders.filter(o => o.id !== order.id);
    orders.push(order);
    showOrderAlert(order);
    renderAll();
  });

  socket.on('bar:order_updated', ({ order }) => {
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx !== -1) orders[idx] = order;
    else orders.push(order);
    renderAll();
  });

  socket.on('global:bar_state_changed', (state) => {
    updateBarStateBadge(state);
  });

  init();
})();
