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
  let currentOrderId = null;
  let barState = { status: 'open' };

  const USER_KEY = 'barcraft_user';
  const ORDER_KEY = 'barcraft_active_order';

  function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function loadUser() {
    try {
      const s = localStorage.getItem(USER_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function saveActiveOrder(orderId, drinkName, status = 'pending', barComment = null) {
    localStorage.setItem(ORDER_KEY, JSON.stringify({ orderId, drinkName, status, barComment }));
  }

  function updateSavedOrderStatus(status, barComment = null) {
    const saved = loadActiveOrder();
    if (saved) saveActiveOrder(saved.orderId, saved.drinkName, status, barComment);
  }

  function clearActiveOrder() {
    localStorage.removeItem(ORDER_KEY);
  }

  function loadActiveOrder() {
    try {
      const s = localStorage.getItem(ORDER_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
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
          <span>🎮</span>
          <span>${escapeHtml(u.name)}</span>
          <span class="user-orders">${u.orderCount} orders</span>
        </div>
      `).join('');

      list.querySelectorAll('.user-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          selectUser({ id: chip.dataset.id, name: chip.dataset.name });
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

  // === Order Form ===
  async function initOrderForm() {
    showView('orderForm');
    document.getElementById('display-username').textContent = currentUser.name;
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

  // Tab switching
  document.getElementById('order-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = tab;
    ['tab-menu', 'tab-add-drink', 'tab-free-text'].forEach(id => {
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
        currentOrderId = order.id;
        currentOrderDrinkName = selectedDrink.name;
        saveActiveOrder(order.id, selectedDrink.name);
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
    localStorage.removeItem(USER_KEY);
    initUserSelect();
  });

  document.getElementById('btn-logo').addEventListener('click', () => {
    if (currentUser) initOrderForm();
    else initUserSelect();
  });

  document.getElementById('btn-order-again').addEventListener('click', () => {
    currentOrderId = null;
    currentOrderStatus = null;
    currentOrderBarComment = null;
    clearActiveOrder();
    initOrderForm();
  });

  // === Order status widget ===
  let currentOrderStatus = null;
  let currentOrderDrinkName = null;
  let currentOrderBarComment = null;

  const WIDGET_CONFIG = {
    pending:   { icon: '⏳', label: 'In der Warteschlange', cls: '' },
    accepted:  { icon: '🍹', label: 'Wird zubereitet…',    cls: 'status-accepted' },
    rejected:  { icon: '❌', label: 'Abgelehnt',           cls: 'status-rejected' },
    completed: { icon: '🎉', label: 'Abholbereit!',        cls: 'status-completed' },
  };

  function updateWidget(status, drinkName) {
    const widget = document.getElementById('order-status-widget');
    if (!status) { widget.classList.add('hidden'); return; }
    const cfg = WIDGET_CONFIG[status];
    document.getElementById('widget-icon').textContent = cfg.icon;
    document.getElementById('widget-drink').textContent = drinkName || '';
    document.getElementById('widget-status').textContent = cfg.label;
    widget.className = cfg.cls;  // clears old status classes
    widget.classList.remove('hidden');
    triggerFlash(widget, status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : status === 'completed' ? 'completed' : 'amber');
  }

  document.getElementById('order-status-widget').addEventListener('click', () => {
    if (currentOrderStatus) showWaiting(currentOrderStatus, currentOrderBarComment);
  });

  // === Waiting View ===
  function showWaiting(type, barComment) {
    currentOrderStatus = type;
    updateWidget(type, currentOrderDrinkName);
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

  // Push banner
  async function setupPushBanner() {
    const banner = document.getElementById('push-banner');
    const pushSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (!pushSupported || Notification.permission === 'granted') {
      banner.classList.add('hidden');
      return;
    }
    // Check if VAPID is configured on the server
    try {
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) { banner.classList.add('hidden'); return; }
    } catch {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
  }

  document.getElementById('btn-enable-push').addEventListener('click', async () => {
    if (!currentUser) return;
    const btn = document.getElementById('btn-enable-push');
    btn.disabled = true;
    btn.textContent = '…';
    const ok = await PushClient.registerPushSubscription(currentUser.id);
    if (ok) {
      document.getElementById('push-banner').classList.add('hidden');
    } else {
      btn.textContent = 'Failed';
      btn.style.background = 'var(--color-danger)';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Enable';
        btn.style.background = '';
      }, 3000);
    }
  });

  // === Socket events ===
  socket.on('guest:order_accepted', ({ orderId, barComment }) => {
    if (orderId !== currentOrderId) return;
    currentOrderStatus = 'accepted';
    currentOrderBarComment = barComment || null;
    updateSavedOrderStatus('accepted', currentOrderBarComment);
    updateWidget('accepted', currentOrderDrinkName);
    if (!views.waiting.classList.contains('hidden')) showWaiting('accepted', barComment);
  });

  socket.on('guest:order_rejected', ({ orderId, barComment }) => {
    if (orderId !== currentOrderId) return;
    currentOrderStatus = 'rejected';
    currentOrderBarComment = barComment || null;
    updateSavedOrderStatus('rejected', currentOrderBarComment);
    updateWidget('rejected', currentOrderDrinkName);
    if (!views.waiting.classList.contains('hidden')) showWaiting('rejected', barComment);
  });

  socket.on('guest:order_completed', ({ orderId }) => {
    if (orderId !== currentOrderId) return;
    currentOrderStatus = 'completed';
    currentOrderBarComment = null;
    updateSavedOrderStatus('completed');
    updateWidget('completed', currentOrderDrinkName);
    if (!views.waiting.classList.contains('hidden')) showWaiting('completed');
  });

  socket.on('global:bar_state_changed', (state) => {
    barState = state;
    if (views.orderForm && !views.orderForm.classList.contains('hidden')) {
      updateBarStatusMsg();
    }
  });

  function restoreActiveOrder() {
    const saved = loadActiveOrder();
    if (!saved) return;
    currentOrderId = saved.orderId;
    currentOrderDrinkName = saved.drinkName;
    currentOrderStatus = saved.status || 'pending';
    currentOrderBarComment = saved.barComment || null;
    updateWidget(currentOrderStatus, currentOrderDrinkName);
  }

  const savedUser = loadUser();
  if (savedUser) {
    currentUser = savedUser;
    socket.emit('client:guest_join', { userId: savedUser.id });
    await initOrderForm();
    restoreActiveOrder();
  } else {
    initUserSelect();
  }
})();
