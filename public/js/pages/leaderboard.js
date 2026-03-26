'use strict';

(function () {
  const { escapeHtml, formatRelativeTime } = Utils;
  const socket = SocketClient.getSocket();

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const { stats } = await res.json();
      renderStats(stats);
    } catch (err) { console.error(err); }
  }

  function renderStats(stats) {
    if (!stats) return;

    document.getElementById('stat-total').textContent = stats.totalOrders;
    document.getElementById('stat-served').textContent = stats.servedOrders;
    document.getElementById('stat-top-drink').textContent = stats.topDrink ? stats.topDrink.name : '–';
    document.getElementById('stat-top-user').textContent = stats.topUser ? stats.topUser.name : '–';

    // Bar chart
    const chartEl = document.getElementById('drinks-chart');
    const max = stats.topDrinks[0]?.count || 1;
    if (stats.topDrinks.length === 0) {
      chartEl.innerHTML = '<p class="text-muted">No data yet</p>';
    } else {
      chartEl.innerHTML = stats.topDrinks.map(d => `
        <div class="bar-chart-row">
          <span class="bar-chart-label" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width:${Math.round((d.count / max) * 100)}%"></div>
          </div>
          <span class="bar-chart-count">${d.count}</span>
        </div>
      `).join('');
    }

    // Users leaderboard
    const medals = ['🥇', '🥈', '🥉'];
    const usersEl = document.getElementById('users-list');
    if (stats.topUsers.length === 0) {
      usersEl.innerHTML = '<p class="text-muted">No data yet</p>';
    } else {
      usersEl.innerHTML = stats.topUsers.map((u, i) => `
        <li class="leaderboard-item">
          <span class="leaderboard-rank${i < 3 ? ' top3' : ''}">${medals[i] || (i + 1)}</span>
          <span class="leaderboard-name">${escapeHtml(u.name)}</span>
          <span class="leaderboard-count">${u.count} orders</span>
        </li>
      `).join('');
    }

    // Activity feed
    const feedEl = document.getElementById('activity-feed');
    if (stats.recentOrders.length === 0) {
      feedEl.innerHTML = '<p class="text-muted">No activity yet</p>';
    } else {
      feedEl.innerHTML = stats.recentOrders.map(o => `
        <li class="activity-item">
          <span class="activity-dot ${o.status}"></span>
          <span><strong>${escapeHtml(o.userName)}</strong> ordered <strong>${escapeHtml(o.drink)}</strong> ×${o.quantity}</span>
          <span class="activity-time">${formatRelativeTime(o.createdAt)}</span>
        </li>
      `).join('');
    }
  }

  socket.on('global:stats_updated', ({ stats }) => {
    renderStats(stats);
  });

  loadStats();
})();
