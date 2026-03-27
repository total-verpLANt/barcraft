'use strict';

(async function () {
  const { escapeHtml, groupBy, triggerFlash } = Utils;
  const socket = SocketClient.getSocket();

  const CATEGORY_LABELS = {
    soft: 'Soft Drinks',
    energy: 'Energy Drinks',
    beer: 'Beer',
    cocktail: 'Cocktails',
    other: 'Other',
  };

  let currentUser = null;
  let selectedDrink = null;
  let quantity = 1;
  let activeTab = 'menu';
  let activeOrders = []; // { orderId, drinkName, status, barComment }
  let waitingOrderId = null; // Bestellung die in der Waiting-View angezeigt wird
  let barState = { status: 'open' };

  const USER_KEY = 'barcraft_user';
  const ORDER_KEY = 'barcraft_active_orders';

  function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function loadUser() {
    try {
      const s = localStorage.getItem(USER_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function saveActiveOrders() {
    localStorage.setItem(ORDER_KEY, JSON.stringify(activeOrders));
  }

  function clearActiveOrders() {
    activeOrders = [];
    localStorage.removeItem(ORDER_KEY);
  }

  function loadActiveOrders() {
    try {
      const s = localStorage.getItem(ORDER_KEY);
      const data = s ? JSON.parse(s) : null;
      if (Array.isArray(data)) return data;
      return [];
    } catch { return []; }
  }

  // Views
  const views = {
    userSelect: document.getElementById('view-user-select'),
    orderForm: document.getElementById('view-order-form'),
    waiting: document.getElementById('view-waiting'),
  };

  function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[name].classList.remove('hidden');
  }

  // === User Select ===
  async function initUserSelect() {
    showView('userSelect');
    const users = await fetchUsers();
    const list = document.getElementById('user-list');
    const section = document.getElementById('existing-users-section');

    if (users.length > 0) {
      section.classList.remove('hidden');
      list.innerHTML = users.map(u => `
        <div class="user-chip" data-id="${escapeHtml(u.id)}" data-name="${escapeHtml(u.name)}">
          ${u.avatarDataUrl
            ? `<img src="${escapeHtml(u.avatarDataUrl)}" class="order-avatar" style="width:1.75rem;height:1.75rem;" alt="">`
            : '<span>🎮</span>'}
          <span>${escapeHtml(u.name)}</span>
          <span class="user-orders">${u.orderCount} orders</span>
        </div>
      `).join('');

      list.querySelectorAll('.user-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          selectUser(users.find(u => u.id === chip.dataset.id));
        });
      });
    } else {
      section.classList.add('hidden');
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users');
      const { users } = await res.json();
      return users || [];
    } catch { return []; }
  }

  document.getElementById('btn-create-user').addEventListener('click', async () => {
    const input = document.getElementById('new-user-name');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const { user } = await res.json();
      if (user) selectUser(user);
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('new-user-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-create-user').click();
  });

  function selectUser(user) {
    currentUser = user;
    saveUser(user);
    socket.emit('client:guest_join', { userId: user.id });
    initOrderForm();
  }

  // === Avatar ===
  function showAvatarPreview(dataUrl) {
    const img = document.getElementById('avatar-preview');
    const placeholder = document.getElementById('avatar-placeholder');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }

  function resizeImageToDataUrl(file, size = 100) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = url;
    });
  }

  document.getElementById('btn-avatar-upload').addEventListener('click', () => {
    document.getElementById('avatar-file-input').click();
  });

  document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    const dataUrl = await resizeImageToDataUrl(file);
    showAvatarPreview(dataUrl);
    await fetch(`/api/users/${currentUser.id}/avatar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarDataUrl: dataUrl }),
    });
    currentUser.avatarDataUrl = dataUrl;
    e.target.value = '';
  });

  // === Order Form ===
  async function initOrderForm() {
    showView('orderForm');
    document.getElementById('display-username').textContent = currentUser.name;
    showAvatarPreview(currentUser.avatarDataUrl || null);
    quantity = 1;
    selectedDrink = null;
    updateQtyDisplay();
    updateSubmitButton();
    await loadMenu();
    await loadBarState();
    setupPushBanner();
  }

  async function loadBarState() {
    try {
      const res = await fetch('/api/bar-state');
      barState = await res.json();
      updateBarStatusMsg();
    } catch { }
  }

  function updateBarStatusMsg() {
    const msg = document.getElementById('bar-status-msg');
    const txt = document.getElementById('bar-status-text');
    if (barState.status === 'closed') {
      msg.classList.remove('hidden');
      txt.textContent = barState.message || 'The bar is currently closed.';
    } else if (barState.status === 'paused') {
      msg.classList.remove('hidden');
      msg.style.borderColor = 'var(--color-accent)';
      txt.className = '';
      txt.style.color = 'var(--color-accent-dark)';
      txt.textContent = barState.message || 'Orders are paused. You can still see the menu.';
    } else {
      msg.classList.add('hidden');
    }
    // Disable submit when closed/paused
    updateSubmitButton();
  }

  async function loadMenu() {
    try {
      const res = await fetch('/api/drinks');
      const { drinks } = await res.json();
      renderMenu(drinks || []);
    } catch { }
  }

  function renderMenu(drinks) {
    const container = document.getElementById('drink-menu');
    const available = drinks.filter(d => d.available);
    if (available.length === 0) {
      container.innerHTML = '<p class="text-muted">No drinks available right now.</p>';
      return;
    }

    const grouped = groupBy(available, d => d.category);
    const categoryOrder = ['soft', 'energy', 'beer', 'cocktail', 'other'];
    const sortedGroups = Object.entries(grouped).sort((a, b) => {
      return categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]);
    });

    container.innerHTML = sortedGroups.map(([cat, items]) => `
      <p class="category-label">${escapeHtml(CATEGORY_LABELS[cat] || cat)}</p>
      <div class="drink-grid">
        ${items.map(d => `
          <div class="drink-option${selectedDrink && selectedDrink.drinkId === d.id ? ' selected' : ''}"
               data-id="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}">
            ${escapeHtml(d.name)}
          </div>
        `).join('')}
      </div>
    `).join('');

    container.querySelectorAll('.drink-option').forEach(el => {
      el.addEventListener('click', () => {
        selectedDrink = { drinkId: el.dataset.id, name: el.dataset.name, isFreeText: false };
        container.querySelectorAll('.drink-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        updateSelectedPreview();
        updateSubmitButton();
      });
    });
  }

  async function loadEditDrinks() {
    try {
      const res = await fetch('/api/drinks');
      const { drinks } = await res.json();
      renderEditDrinks(drinks || []);
    } catch { }
  }

  function renderEditDrinks(drinks) {
    const container = document.getElementById('edit-drink-list');
    if (drinks.length === 0) {
      container.innerHTML = '<p class="text-muted">Noch keine Getränke im Menü.</p>';
      return;
    }
    const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([v, l]) =>
      `<option value="${v}">${l}</option>`
    ).join('');
    container.innerHTML = drinks.map(d => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.625rem 0;border-bottom:1px solid var(--color-border);">
        <span style="flex:1;font-weight:500;">${escapeHtml(d.name)}</span>
        <select class="select drink-cat-edit" data-id="${escapeHtml(d.id)}" style="width:auto;">
          ${CATEGORY_OPTIONS.replace(`value="${escapeHtml(d.category)}"`, `value="${escapeHtml(d.category)}" selected`)}
        </select>
      </div>
    `).join('');
    container.querySelectorAll('.drink-cat-edit').forEach(sel => {
      sel.addEventListener('change', async () => {
        await fetch(`/api/drinks/${sel.dataset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: sel.value }),
        });
      });
    });
  }

  // Tab switching
  document.getElementById('order-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = tab;
    ['tab-menu', 'tab-add-drink', 'tab-free-text', 'tab-edit-drink'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`tab-${tab}`).classList.remove('hidden');

    if (tab !== 'menu') {
      selectedDrink = null;
      updateSelectedPreview();
      updateSubmitButton();
    }
    if (tab === 'free-text') {
      document.getElementById('free-text-input').focus();
    }
    if (tab === 'edit-drink') {
      loadEditDrinks();
    }
  });

  // Add drink to menu
  document.getElementById('btn-add-drink').addEventListener('click', async () => {
    const name = document.getElementById('new-drink-name').value.trim();
    const category = document.getElementById('new-drink-category').value;
    if (!name) { document.getElementById('new-drink-name').focus(); return; }
    try {
      const res = await fetch('/api/drinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category }),
      });
      const { drink } = await res.json();
      if (drink) {
        selectedDrink = { drinkId: drink.id, name: drink.name, isFreeText: false };
        document.getElementById('new-drink-name').value = '';
        // Switch to menu tab and reload
        document.querySelector('.tab[data-tab="menu"]').click();
        await loadMenu();
        updateSelectedPreview();
        updateSubmitButton();
      }
    } catch (err) { console.error(err); }
  });

  // Free text input
  document.getElementById('free-text-input').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      selectedDrink = { name: val, isFreeText: true };
    } else {
      selectedDrink = null;
    }
    updateSelectedPreview();
    updateSubmitButton();
  });

  // Quantity
  document.getElementById('qty-minus').addEventListener('click', () => {
    if (quantity > 1) { quantity--; updateQtyDisplay(); }
  });
  document.getElementById('qty-plus').addEventListener('click', () => {
    if (quantity < 9) { quantity++; updateQtyDisplay(); }
  });

  function updateQtyDisplay() {
    document.getElementById('qty-display').textContent = quantity;
    document.getElementById('qty-minus').disabled = quantity <= 1;
    document.getElementById('qty-plus').disabled = quantity >= 9;
  }

  function updateSelectedPreview() {
    const el = document.getElementById('selected-drink-preview');
    if (selectedDrink) {
      el.textContent = `Selected: ${selectedDrink.name}`;
    } else {
      el.textContent = 'No drink selected';
    }
  }

  function updateSubmitButton() {
    const btn = document.getElementById('btn-submit-order');
    const barClosed = barState.status === 'closed' || barState.status === 'paused';
    btn.disabled = !selectedDrink || barClosed;
  }

  // Submit order
  document.getElementById('btn-submit-order').addEventListener('click', async () => {
    if (!selectedDrink || !currentUser) return;
    const btn = document.getElementById('btn-submit-order');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          drink: selectedDrink,
          quantity,
        }),
      });
      if (res.ok) {
        const { order } = await res.json();
        activeOrders.push({ orderId: order.id, drinkName: selectedDrink.name, status: 'pending', barComment: null });
        waitingOrderId = order.id;
        saveActiveOrders();
        updateWidget();
        showWaiting('pending');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit order');
        btn.disabled = false;
        btn.textContent = 'Order Now';
      }
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Order Now';
    }
  });

  document.getElementById('btn-switch-user').addEventListener('click', () => {
    currentUser = null;
    waitingOrderId = null;
    clearActiveOrders();
    localStorage.removeItem(USER_KEY);
    initUserSelect();
  });

  document.getElementById('btn-logo').addEventListener('click', () => {
    if (currentUser) initOrderForm();
    else initUserSelect();
  });

  document.getElementById('btn-order-again').addEventListener('click', () => {
    // Abgeschlossene/abgelehnte Bestellungen aus dem Widget entfernen
    activeOrders = activeOrders.filter(o => o.status === 'pending' || o.status === 'accepted');
    waitingOrderId = null;
    saveActiveOrders();
    updateWidget();
    initOrderForm();
  });

  // === Order status widget ===
  const WIDGET_CONFIG = {
    pending:   { icon: '⏳', label: 'In der Warteschlange' },
    accepted:  { icon: '🍹', label: 'Wird zubereitet…' },
    rejected:  { icon: '❌', label: 'Abgelehnt' },
    completed: { icon: '🎉', label: 'Abholbereit!' },
  };

  function updateWidget() {
    const widget = document.getElementById('order-status-widget');
    if (activeOrders.length === 0) { widget.classList.add('hidden'); return; }
    document.getElementById('widget-orders').innerHTML = activeOrders.map(o => {
      const cfg = WIDGET_CONFIG[o.status] || WIDGET_CONFIG.pending;
      return `<div class="widget-order-row widget-row-${o.status}">
        <span class="widget-row-icon">${cfg.icon}</span>
        <div class="widget-text">
          <span class="widget-drink-name">${escapeHtml(o.drinkName)}</span>
          <span class="widget-status-label">${cfg.label}</span>
        </div>
      </div>`;
    }).join('');
    widget.classList.remove('hidden');
  }

  document.getElementById('order-status-widget').addEventListener('click', () => {
    if (waitingOrderId) {
      const o = activeOrders.find(o => o.orderId === waitingOrderId);
      if (o) showWaiting(o.status, o.barComment);
    }
  });

  // === Waiting View ===
  function showWaiting(type, barComment) {
    updateWidget();
    showView('waiting');
    const card = document.getElementById('waiting-status-card');
    const icon = document.getElementById('status-icon');
    const title = document.getElementById('status-title');
    const desc = document.getElementById('status-description');
    const commentBox = document.getElementById('status-comment');
    const commentText = document.getElementById('comment-text');

    if (type === 'pending') {
      icon.textContent = '⏳';
      title.textContent = 'Order Sent!';
      desc.textContent = 'Your order is in the queue. The bartender will get to it shortly.';
      commentBox.classList.add('hidden');
    } else if (type === 'accepted') {
      icon.textContent = '🍹';
      title.textContent = 'Order Accepted!';
      desc.textContent = "Hang tight! Your drink is being prepared.";
      triggerFlash(card, 'accepted');
      if (barComment) {
        commentBox.classList.remove('hidden');
        commentText.textContent = barComment;
      }
    } else if (type === 'rejected') {
      icon.textContent = '😢';
      title.textContent = 'Order Rejected';
      desc.textContent = "Your order couldn't be fulfilled.";
      triggerFlash(card, 'rejected');
      if (barComment) {
        commentBox.classList.remove('hidden');
        commentText.textContent = barComment;
      }
    } else if (type === 'completed') {
      icon.textContent = '🎉';
      title.textContent = 'Ready to Collect!';
      desc.textContent = 'Your drink is ready! Come pick it up at the bar.';
      card.classList.add('celebrate');
      setTimeout(() => card.classList.remove('celebrate'), 600);
      triggerFlash(card, 'completed');
      commentBox.classList.add('hidden');
    }
  }

  // Guest alert overlay
  let guestAlertTimeout = null;

  function showGuestAlert(type, drinkName) {
    const overlay = document.getElementById('guest-alert-overlay');
    const titles = { completed: '🎉 Abholbereit!', accepted: '🍹 Wird zubereitet…', rejected: '❌ Abgelehnt' };
    overlay.className = `overlay-${type}`;
    document.getElementById('guest-alert-title').textContent = titles[type] || '';
    document.getElementById('guest-alert-drink').textContent = drinkName || '';
    overlay.style.animation = 'none';
    void overlay.offsetWidth;
    overlay.style.animation = 'overlayPulse 6s ease-in-out forwards';
    clearTimeout(guestAlertTimeout);
    guestAlertTimeout = setTimeout(() => overlay.classList.add('hidden'), 6000);
    overlay.onclick = () => { clearTimeout(guestAlertTimeout); overlay.classList.add('hidden'); };
  }

  // Browser notifications (simple, no service worker needed)
  function notify(title, body) {
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/favicon.ico' });
  }

  function setupPushBanner() {
    const banner = document.getElementById('push-banner');
    if (!('Notification' in window) || Notification.permission === 'granted') {
      banner.classList.add('hidden');
      return;
    }
    if (Notification.permission === 'denied') {
      document.getElementById('push-banner-text').textContent = 'Notifications blockiert – in den Browser-Einstellungen erlauben.';
      document.getElementById('btn-enable-push').classList.add('hidden');
    }
    banner.classList.remove('hidden');
  }

  document.getElementById('btn-enable-push').addEventListener('click', async () => {
    const btn = document.getElementById('btn-enable-push');
    btn.disabled = true;
    btn.textContent = '…';
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      document.getElementById('push-banner').classList.add('hidden');
    } else if (permission === 'denied') {
      document.getElementById('push-banner-text').textContent = 'Notifications blockiert – in den Browser-Einstellungen erlauben.';
      btn.classList.add('hidden');
    } else {
      btn.disabled = false;
      btn.textContent = 'Enable';
    }
  });

  // === Socket events ===
  socket.on('guest:order_accepted', ({ orderId, barComment }) => {
    const o = activeOrders.find(o => o.orderId === orderId);
    if (!o) return;
    o.status = 'accepted';
    o.barComment = barComment || null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'accepted');
    notify('🍹 Bestellung angenommen', barComment || `${o.drinkName} wird zubereitet…`);
    showGuestAlert('accepted', o.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('accepted', barComment);
  });

  function scheduleOrderRemoval(orderId) {
    setTimeout(() => {
      activeOrders = activeOrders.filter(o => o.orderId !== orderId);
      saveActiveOrders();
      updateWidget();
    }, 10000);
  }

  socket.on('guest:order_rejected', ({ orderId, barComment }) => {
    const o = activeOrders.find(o => o.orderId === orderId);
    if (!o) return;
    o.status = 'rejected';
    o.barComment = barComment || null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'rejected');
    notify('❌ Bestellung abgelehnt', barComment || o.drinkName);
    showGuestAlert('rejected', o.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('rejected', barComment);
    scheduleOrderRemoval(orderId);
  });

  socket.on('guest:order_completed', ({ orderId }) => {
    const o = activeOrders.find(o => o.orderId === orderId);
    if (!o) return;
    o.status = 'completed';
    o.barComment = null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'completed');
    notify('🎉 Abholbereit!', `${o.drinkName} – komm an die Bar!`);
    showGuestAlert('completed', o.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('completed');
    scheduleOrderRemoval(orderId);
  });

  socket.on('global:bar_state_changed', (state) => {
    barState = state;
    if (views.orderForm && !views.orderForm.classList.contains('hidden')) {
      updateBarStatusMsg();
    }
  });

  function restoreActiveOrders() {
    activeOrders = loadActiveOrders().filter(o => o.status === 'pending' || o.status === 'accepted');
    saveActiveOrders();
    updateWidget();
  }

  const savedUser = loadUser();
  if (savedUser) {
    currentUser = savedUser;
    socket.emit('client:guest_join', { userId: savedUser.id });
    await initOrderForm();
    restoreActiveOrders();
  } else {
    initUserSelect();
  }
})();
