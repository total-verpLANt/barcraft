'use strict';

async function registerPushSubscription(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) return false;
    const { publicKey } = await res.json();

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: sub }),
    });
    return true;
  } catch (err) {
    console.warn('Push registration failed:', err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

window.PushClient = { registerPushSubscription };
