const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Wrap each character in a masked span so it can slide in from below.
// The element keeps an aria-label with the plain text for screen readers.
export function splitChars(el, text) {
  if (text != null) el.textContent = text;
  const value = el.textContent.trim();
  el.textContent = '';
  el.setAttribute('aria-label', value);
  const chars = [];
  value.split(' ').forEach((word, wi, arr) => {
    const w = document.createElement('span');
    w.className = 'sw';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const mask = document.createElement('span');
      mask.className = 'sc';
      const inner = document.createElement('span');
      inner.className = 'sci';
      inner.textContent = ch;
      mask.appendChild(inner);
      w.appendChild(mask);
      chars.push(inner);
    }
    el.appendChild(w);
    if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return chars;
}

// Wrap each word in a masked span; returns the inner spans.
export function splitWords(el) {
  const value = el.textContent.trim();
  el.textContent = '';
  const words = [];
  value.split(/\s+/).forEach((word, i, arr) => {
    const mask = document.createElement('span');
    mask.className = 'swm';
    const inner = document.createElement('span');
    inner.className = 'swi';
    inner.textContent = word;
    mask.appendChild(inner);
    el.appendChild(mask);
    if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    words.push(inner);
  });
  return words;
}

const GLYPHS = '░▒▓/\\|-_=+<>*#01';

// Decode-style text change used on labels and counters.
export function scramble(el, text, { duration = 0.6 } = {}) {
  if (!el) return;
  const target = String(text);
  if (reduced) {
    el.textContent = target;
    return;
  }
  const from = el.textContent;
  const len = Math.max(from.length, target.length);
  const start = performance.now();
  cancelAnimationFrame(el._scramble);
  const frame = (now) => {
    const p = Math.min(1, (now - start) / (duration * 1000));
    let out = '';
    for (let i = 0; i < len; i++) {
      const th = (i / len) * 0.7;
      if (p >= th + 0.3) out += target[i] ?? '';
      else if (p >= th) out += target[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      else out += from[i] ?? '';
    }
    el.textContent = out;
    if (p < 1) el._scramble = requestAnimationFrame(frame);
    else el.textContent = target;
  };
  el._scramble = requestAnimationFrame(frame);
}
