'use strict';

(function () {
  const { escapeHtml, formatRelativeTime, formatElapsed, triggerFlash } = Utils;
  const socket = SocketClient.getSocket();

  let orders = [];
  let timerInterval = null;

  // Join bar room
  socket.emit('client:bar_join');

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
        <div>
          <div class="order-name">🎮 ${escapeHtml(order.userName)}</div>
          <div class="order-drink"><span class="qty">×${order.quantity}</span> ${escapeHtml(order.drink.name)}</div>
        </div>
        <span class="badge badge-pending">Pending</span>
      </div>
      <div class="order-meta">${formatRelativeTime(order.createdAt)}</div>
      <div class="order-actions">
        <button class="btn btn-primary btn-sm" data-action="accept" data-id="${escapeHtml(order.id)}">✓ Accept</button>
        <button class="btn btn-danger btn-sm" data-action="reject-expand" data-id="${escapeHtml(order.id)}">✗ Reject</button>
      </div>
      <div class="reject-expand hidden" id="reject-${escapeHtml(order.id)}">
        <div class="quick-replies">
          <button class="quick-reply-chip" data-msg="Sold out">Sold out</button>
          <button class="quick-reply-chip" data-msg="Bar is closed">Bar is closed</button>
          <button class="quick-reply-chip" data-msg="One moment">One moment</button>
        </div>
        <input class="input" type="text" placeholder="Custom comment (optional)" id="reject-comment-${escapeHtml(order.id)}" maxlength="100">
        <div class="flex gap-1 mt-1">
          <button class="btn btn-danger btn-sm flex-1" data-action="reject-confirm" data-id="${escapeHtml(order.id)}">Confirm Reject</button>
          <button class="btn btn-ghost btn-sm" data-action="reject-cancel" data-id="${escapeHtml(order.id)}">Cancel</button>
        </div>
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
        <div>
          <div class="order-name">🎮 ${escapeHtml(order.userName)}</div>
          <div class="order-drink"><span class="qty">×${order.quantity}</span> ${escapeHtml(order.drink.name)}</div>
        </div>
        <span class="badge badge-accepted">In Prep</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="order-timer ${warnClass}" id="timer-${escapeHtml(order.id)}">⏱ ${elapsed}</span>
        <button class="btn btn-success btn-sm" data-action="complete" data-id="${escapeHtml(order.id)}">✓ Ready</button>
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
    document.querySelectorAll('.quick-reply-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const orderId = chip.closest('.reject-expand')?.id?.replace('reject-', '');
        if (!orderId) return;
        const input = document.getElementById(`reject-comment-${orderId}`);
        if (input) input.value = chip.dataset.msg;
        chip.closest('.quick-replies').querySelectorAll('.quick-reply-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });
  }

  async function handleCardAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const orderId = btn.dataset.id;

    if (action === 'accept') {
      await updateOrder(orderId, 'accepted');
    } else if (action === 'reject-expand') {
      document.getElementById(`reject-${orderId}`)?.classList.toggle('hidden');
    } else if (action === 'reject-cancel') {
      document.getElementById(`reject-${orderId}`)?.classList.add('hidden');
    } else if (action === 'reject-confirm') {
      const comment = document.getElementById(`reject-comment-${orderId}`)?.value || '';
      await updateOrder(orderId, 'rejected', comment);
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
  function showOrderAlert(order) {
    const overlay = document.getElementById('bar-alert-overlay');
    document.getElementById('alert-drink').textContent = order.drink.name;
    document.getElementById('alert-qty').textContent = `× ${order.quantity}`;
    document.getElementById('alert-user').textContent = order.userName;
    overlay.classList.remove('hidden');
    overlay.style.animation = 'none';
    void overlay.offsetWidth;
    overlay.style.animation = 'overlayPulse 5s ease-in-out forwards';
    setTimeout(() => overlay.classList.add('hidden'), 5000);
    overlay.onclick = () => overlay.classList.add('hidden');
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
