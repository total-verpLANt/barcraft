'use strict';

(function (global) {
  let wordsPromise = null;

  function loadWords() {
    if (!wordsPromise) {
      wordsPromise = fetch('/config/profanity-blacklist.json')
        .then((r) => {
          if (!r.ok) throw new Error('Profanity list load failed');
          return r.json();
        })
        .then((d) => d.words || []);
    }
    return wordsPromise;
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

  function containsProfanity(text, words) {
    if (!text || !words || !words.length) return false;
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

  async function checkText(text) {
    const words = await loadWords();
    return containsProfanity(text, words);
  }

  global.ProfanityCheck = { loadWords, checkText, containsProfanity };
})(typeof window !== 'undefined' ? window : global);
