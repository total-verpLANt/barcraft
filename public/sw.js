// Service Worker for Barcraft push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Barcraft', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.orderId || 'barcraft',
    renotify: true,
    data: { url: '/guest.html' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Barcraft', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
