'use strict';

const fs = require('fs');
const path = require('path');

const LIST_PATH = path.join(__dirname, '../../public/config/profanity-blacklist.json');
let cachedWords = null;

function loadWords() {
  if (cachedWords) return cachedWords;
  const raw = fs.readFileSync(LIST_PATH, 'utf8');
  cachedWords = JSON.parse(raw).words || [];
  return cachedWords;
}

function normalizeText(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Kurze Tokens nur exakt (weniger False Positives in normalen Wörtern).
 * Längere Einträge auch als Teilstring (z. B. zusammengesetzte Schimpfwörter).
 */
function containsProfanity(text, words = loadWords()) {
  if (!text || typeof text !== 'string') return false;
  const n = normalizeText(text);
  if (!n.trim()) return false;
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);

  for (const w of words) {
    const bw = normalizeText(w);
    if (!bw) continue;
    if (bw.length <= 4) {
      if (tokens.includes(bw)) return true;
    } else if (n.includes(bw)) {
      return true;
    }
  }
  return false;
}

module.exports = { containsProfanity, loadWords, normalizeText };
