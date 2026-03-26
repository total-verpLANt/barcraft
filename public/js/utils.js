'use strict';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatElapsed(isoString) {
  if (!isoString) return '0:00';
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function triggerFlash(element, type) {
  if (!element) return;
  element.classList.remove('flash-accepted', 'flash-rejected', 'flash-completed', 'flash-amber');
  void element.offsetWidth; // force reflow
  element.classList.add(`flash-${type}`);
  element.addEventListener('animationend', () => {
    element.classList.remove(`flash-${type}`);
  }, { once: true });
}

function groupBy(arr, keyFn) {
  const result = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

window.Utils = { escapeHtml, formatRelativeTime, formatElapsed, triggerFlash, groupBy };
