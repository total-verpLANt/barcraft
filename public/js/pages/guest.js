'use strict';

(async function () {
  const { escapeHtml, groupBy, triggerFlash, getOrderLines } = Utils;
  const socket = SocketClient.getSocket();

  const CATEGORY_LABELS = {
    soft: 'Soft Drinks',
    energy: 'Energy Drinks',
    beer: 'Beer',
    cocktail: 'Cocktails',
    other: 'Other',
  };

  let currentUser = null;
  let selectedDrink = null; // aktuelle Auswahl für „In den Warenkorb“
  let lineQty = 1;
  /** Warenkorb-Positionen vor dem Absenden */
  let cart = []; // { drink, quantity }[]
  let activeOrders = []; // { orderId, drinkName, status, barComment }
  let waitingOrderId = null; // Bestellung die in der Waiting-View angezeigt wird

  let barState = { status: 'open' };

  const USER_KEY = 'barcraft_user';
  const ORDER_KEY = 'barcraft_active_orders';
  const CART_KEY = 'barcraft_cart';
  const FREETEXT_BLOCKED_MSG =
    'Freie Bestellung enthält unzulässige Wörter. Bitte neutral formulieren.';

  async function assertFreeTextAllowed(text) {
    if (typeof ProfanityCheck === 'undefined') return true;
    const bad = await ProfanityCheck.checkText(text);
    return !bad;
  }

  function orderSummaryForWidget(order) {
    const lines = getOrderLines(order);
    if (lines.length === 0) return 'Bestellung';
    if (lines.length === 1) {
      const l = lines[0];
      return l.quantity > 1 ? `${l.quantity}× ${l.drink.name}` : l.drink.name;
    }
    return `${lines.length} Artikel`;
  }

  function orderHasFreeText(order) {
    return getOrderLines(order).some((l) => l.drink && l.drink.isFreeText);
  }

  function loadCart() {
    try {
      const s = sessionStorage.getItem(CART_KEY);
      const data = s ? JSON.parse(s) : null;
      cart = Array.isArray(data) ? data : [];
    } catch {
      cart = [];
    }
  }

  function saveCart() {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch { /* ignore */ }
  }

  function clearCart() {
    cart = [];
    sessionStorage.removeItem(CART_KEY);
    renderCart();
  }

  function cartLineKey(drink) {
    if (drink.drinkId) return `m:${drink.drinkId}`;
    return `f:${(drink.name || '').trim().toLowerCase()}`;
  }

  function addLineToCart() {
    if (!selectedDrink) return;
    const key = cartLineKey(selectedDrink);
    const existing = cart.find((c) => cartLineKey(c.drink) === key);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + lineQty);
    } else {
      cart.push({ drink: { ...selectedDrink }, quantity: lineQty });
    }
    lineQty = 1;
    updateLineQtyDisplay();
    document.getElementById('free-text-input').value = '';
    selectedDrink = null;
    document.querySelectorAll('.drink-option.selected').forEach((o) => o.classList.remove('selected'));
    updateSelectionHint();
    updateAddToCartButton();
    renderCart();
  }

  function renderCart() {
    const ul = document.getElementById('cart-lines');
    const empty = document.getElementById('cart-empty');
    const badge = document.getElementById('cart-badge');
    const total = cart.reduce((s, l) => s + l.quantity, 0);
    if (!ul || !empty || !badge) return;
    if (cart.length === 0) {
      ul.innerHTML = '';
      empty.classList.remove('hidden');
      badge.classList.add('hidden');
    } else {
      empty.classList.add('hidden');
      badge.classList.remove('hidden');
      badge.textContent = String(total);
      ul.innerHTML = cart
        .map(
          (line, idx) => `
      <li class="cart-line">
        <div class="cart-line-main">
          <span class="cart-line-name">${escapeHtml(line.drink.name)}</span>
          <div class="cart-line-qty">
            <button type="button" class="qty-btn qty-btn-sm cart-qty-minus" data-idx="${idx}" aria-label="Weniger">−</button>
            <span>${line.quantity}</span>
            <button type="button" class="qty-btn qty-btn-sm cart-qty-plus" data-idx="${idx}" aria-label="Mehr">+</button>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm cart-remove" data-idx="${idx}" aria-label="Entfernen">✕</button>
      </li>`
        )
        .join('');
    }
    const sub = document.getElementById('cart-subtotal');
    if (sub) sub.textContent = `${total} Artikel`;
    updateCheckoutButton();
    saveCart();
  }

  function updateLineQtyDisplay() {
    const el = document.getElementById('line-qty-display');
    const mn = document.getElementById('line-qty-minus');
    const pl = document.getElementById('line-qty-plus');
    if (el) el.textContent = lineQty;
    if (mn) mn.disabled = lineQty <= 1;
    if (pl) pl.disabled = lineQty >= 99;
  }

  function updateAddToCartButton() {
    const btn = document.getElementById('btn-add-to-cart');
    if (!btn) return;
    const barClosed = barState.status === 'closed' || barState.status === 'paused';
    btn.disabled = !selectedDrink || barClosed;
  }

  function updateCheckoutButton() {
    const btn = document.getElementById('btn-checkout');
    if (!btn) return;
    const total = cart.reduce((s, l) => s + l.quantity, 0);
    const barClosed = barState.status === 'closed' || barState.status === 'paused';
    btn.disabled = total === 0 || barClosed;
    btn.textContent =
      total > 0 ? `Jetzt bestellen (${total} Artikel)` : 'Jetzt bestellen';
  }

  function updateSelectionHint() {
    const el = document.getElementById('selection-hint');
    if (!el) return;
    if (selectedDrink) {
      el.textContent = `Ausgewählt: ${selectedDrink.name} – Menge einstellen und „In den Warenkorb“.`;
    } else {
      el.textContent = 'Wähle ein Getränk aus dem Menü oder „Freie Bestellung“.';
    }
  }

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
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
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
    lineQty = 1;
    selectedDrink = null;
    loadCart();
    document.querySelectorAll('#order-tabs .tab').forEach(t => t.classList.remove('active'));
    const menuTab = document.querySelector('#order-tabs .tab[data-tab="menu"]');
    if (menuTab) menuTab.classList.add('active');
    document.getElementById('tab-menu').classList.remove('hidden');
    document.getElementById('tab-free-text').classList.add('hidden');
    document.getElementById('free-text-input').value = '';
    updateLineQtyDisplay();
    renderCart();
    updateSelectionHint();
    updateAddToCartButton();
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
    updateAddToCartButton();
    updateCheckoutButton();
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
      container.innerHTML = '<p class="text-muted">Noch keine Getränke im Menü – die Bar kann sie im Bar-Modus eintragen.</p>';
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
        updateSelectionHint();
        updateAddToCartButton();
      });
    });
  }

  // Tab switching: nur Menü (Bar) oder freie Bestellung
  document.getElementById('order-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('#order-tabs .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-menu').classList.toggle('hidden', tab !== 'menu');
    document.getElementById('tab-free-text').classList.toggle('hidden', tab !== 'free-text');

    if (tab === 'menu') {
      document.getElementById('free-text-input').value = '';
      selectedDrink = null;
      document.querySelectorAll('.drink-option.selected').forEach(o => o.classList.remove('selected'));
      updateSelectionHint();
      updateAddToCartButton();
    } else if (tab === 'free-text') {
      document.querySelectorAll('.drink-option.selected').forEach(o => o.classList.remove('selected'));
      const input = document.getElementById('free-text-input');
      input.focus();
      const val = input.value.trim();
      selectedDrink = val ? { name: val, isFreeText: true } : null;
      updateSelectionHint();
      updateAddToCartButton();
    }
  });

  // Free text input
  document.getElementById('free-text-input').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      selectedDrink = { name: val, isFreeText: true };
    } else {
      selectedDrink = null;
    }
    updateSelectionHint();
    updateAddToCartButton();
  });

  document.getElementById('line-qty-minus').addEventListener('click', () => {
    if (lineQty > 1) { lineQty--; updateLineQtyDisplay(); }
  });
  document.getElementById('line-qty-plus').addEventListener('click', () => {
    if (lineQty < 99) { lineQty++; updateLineQtyDisplay(); }
  });

  document.getElementById('btn-add-to-cart').addEventListener('click', async () => {
    if (!selectedDrink) return;
    if (selectedDrink.isFreeText) {
      const ok = await assertFreeTextAllowed(selectedDrink.name);
      if (!ok) {
        alert(FREETEXT_BLOCKED_MSG);
        return;
      }
    }
    addLineToCart();
  });

  document.getElementById('cart-panel').addEventListener('click', (e) => {
    const minus = e.target.closest('.cart-qty-minus');
    const plus = e.target.closest('.cart-qty-plus');
    const rem = e.target.closest('.cart-remove');
    if (minus) {
      const idx = parseInt(minus.dataset.idx, 10);
      if (cart[idx] && cart[idx].quantity > 1) cart[idx].quantity--;
      else if (cart[idx]) cart.splice(idx, 1);
      renderCart();
    } else if (plus) {
      const idx = parseInt(plus.dataset.idx, 10);
      if (cart[idx]) cart[idx].quantity = Math.min(99, cart[idx].quantity + 1);
      renderCart();
    } else if (rem) {
      const idx = parseInt(rem.dataset.idx, 10);
      if (!Number.isNaN(idx)) cart.splice(idx, 1);
      renderCart();
    }
  });

  // Warenkorb abschicken (eine Bestellung, mehrere Positionen)
  document.getElementById('btn-checkout').addEventListener('click', async () => {
    if (!currentUser || cart.length === 0) return;
    const btn = document.getElementById('btn-checkout');
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Wird gesendet…';
    try {
      for (const line of cart) {
        if (line.drink.isFreeText) {
          const ok = await assertFreeTextAllowed(line.drink.name);
          if (!ok) {
            alert(FREETEXT_BLOCKED_MSG);
            btn.disabled = false;
            btn.textContent = prevText;
            updateCheckoutButton();
            return;
          }
        }
      }
      const items = cart.map((line) => ({
        drink: line.drink,
        quantity: line.quantity,
      }));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          items,
        }),
      });
      if (res.ok) {
        const { order } = await res.json();
        activeOrders.push({
          orderId: order.id,
          drinkName: orderSummaryForWidget(order),
          hasFreeText: orderHasFreeText(order),
          status: 'pending',
          barComment: null,
        });
        waitingOrderId = order.id;
        clearCart();
        saveActiveOrders();
        updateWidget();
        showWaiting('pending');
      } else {
        const err = await res.json();
        alert(err.error || 'Bestellung fehlgeschlagen');
        btn.disabled = false;
        btn.textContent = prevText;
        updateCheckoutButton();
      }
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = prevText;
      updateCheckoutButton();
    }
  });

  document.getElementById('btn-switch-user').addEventListener('click', () => {
    currentUser = null;
    waitingOrderId = null;
    clearActiveOrders();
    clearCart();
    localStorage.removeItem(USER_KEY);
    initUserSelect();
  });

  document.getElementById('btn-logo').addEventListener('click', () => {
    if (currentUser) initOrderForm();
    else initUserSelect();
  });

  document.getElementById('btn-order-again').addEventListener('click', () => {
    activeOrders = activeOrders.filter((o) => o.status === 'pending' || o.status === 'accepted');
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
      const ft = o.hasFreeText
        ? '<span class="badge-freetext badge-freetext--widget" title="Enthält Freitext">FT</span> '
        : '';
      return `<div class="widget-order-row widget-row-${o.status}">
        <span class="widget-row-icon">${cfg.icon}</span>
        <div class="widget-text">
          <span class="widget-drink-name">${ft}${escapeHtml(o.drinkName)}</span>
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
      title.textContent = 'Bestellung gesendet!';
      desc.textContent = 'Deine Bestellung ist in der Warteschlange.';
      commentBox.classList.add('hidden');
    } else if (type === 'accepted') {
      icon.textContent = '🍹';
      title.textContent = 'Bestellung angenommen!';
      desc.textContent = 'Dein Getränk wird gerade zubereitet.';
      triggerFlash(card, 'accepted');
      if (barComment) {
        commentBox.classList.remove('hidden');
        commentText.textContent = barComment;
      }
    } else if (type === 'rejected') {
      icon.textContent = '😢';
      title.textContent = 'Bestellung abgelehnt';
      desc.textContent = 'Deine Bestellung konnte nicht erfüllt werden.';
      triggerFlash(card, 'rejected');
      if (barComment) {
        commentBox.classList.remove('hidden');
        commentText.textContent = barComment;
      }
    } else if (type === 'completed') {
      icon.textContent = '🎉';
      title.textContent = 'Abholbereit!';
      desc.textContent = 'Dein Getränk ist fertig. Komm an die Bar.';
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
    const order = activeOrders.find((o) => o.orderId === orderId);
    if (!order) return;
    order.status = 'accepted';
    order.barComment = barComment || null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'accepted');
    notify('🍹 Bestellung angenommen', barComment || `${order.drinkName} wird zubereitet…`);
    showGuestAlert('accepted', order.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('accepted', barComment);
  });

  function scheduleOrderRemoval(orderId) {
    setTimeout(() => {
      activeOrders = activeOrders.filter((o) => o.orderId !== orderId);
      saveActiveOrders();
      updateWidget();
    }, 10000);
  }

  socket.on('guest:order_rejected', ({ orderId, barComment }) => {
    const order = activeOrders.find((o) => o.orderId === orderId);
    if (!order) return;
    order.status = 'rejected';
    order.barComment = barComment || null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'rejected');
    notify('❌ Bestellung abgelehnt', barComment || order.drinkName);
    showGuestAlert('rejected', order.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('rejected', barComment);
    scheduleOrderRemoval(orderId);
  });

  socket.on('guest:order_completed', ({ orderId }) => {
    const order = activeOrders.find((o) => o.orderId === orderId);
    if (!order) return;
    order.status = 'completed';
    order.barComment = null;
    saveActiveOrders();
    updateWidget();
    triggerFlash(document.getElementById('order-status-widget'), 'completed');
    notify('🎉 Abholbereit!', `${order.drinkName} – komm an die Bar!`);
    showGuestAlert('completed', order.drinkName);
    if (waitingOrderId === orderId && !views.waiting.classList.contains('hidden')) showWaiting('completed');
    scheduleOrderRemoval(orderId);
  });

  socket.on('global:bar_state_changed', (state) => {
    barState = state;
    if (views.orderForm && !views.orderForm.classList.contains('hidden')) {
      updateBarStatusMsg();
    }
  });

  try {
    if (typeof ProfanityCheck !== 'undefined') {
      await ProfanityCheck.loadWords();
    }
  } catch {
    /* Liste optional; Server prüft immer */
  }

  const savedUser = loadUser();
  if (savedUser) {
    currentUser = savedUser;
    socket.emit('client:guest_join', { userId: savedUser.id });
    await initOrderForm();
    activeOrders = loadActiveOrders().filter((o) => o.status === 'pending' || o.status === 'accepted');
    saveActiveOrders();
    updateWidget();
  } else {
    initUserSelect();
  }
})();
