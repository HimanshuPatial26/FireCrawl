import './style.css';
import gsap from 'gsap';
import Lenis from 'lenis';
import { site, projects } from './content.js';
import { Stage } from './gl/stage.js';
import { Sound } from './audio.js';
import { splitChars, splitWords, scramble } from './text.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobile = !finePointer || Math.min(innerWidth, innerHeight) < 600;
const D = (s) => (reduced ? 0.001 : s);
const pad = (n) => String(n).padStart(2, '0');
// Two collections share one gallery: past work and Master's projects. Navigation stays inside a collection.
const GROUPS = {
  work: { label: 'Work', hash: 'work', back: 'All work', next: 'Next case study', open: 'Open case study', chapters: 'What I shipped' },
  projects: { label: 'Projects', hash: 'projects', back: 'All projects', next: 'Next project', open: 'Open project', chapters: 'What I did' },
};
const groupOf = (i) => projects[i].group || 'work';
const members = (g) => projects.reduce((acc, p, i) => ((p.group || 'work') === g ? (acc.push(i), acc) : acc), []);
const neighbor = (i, dir) => {
  const m = members(groupOf(i));
  return m[(m.indexOf(i) + dir + m.length) % m.length];
};
const posIn = (i) => members(groupOf(i)).indexOf(i);
const firstOf = (g) => members(g)[0];
const fitChars = (text) => String(Math.max(4, text.length));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const sound = new Sound();
const view = $('#view');
const live = $('#live');
const frameHooks = [];
let stage = null;
let lenis = null;

const app = {
  route: null,
  index: firstOf('work'),
  group: 'work',
  last: { work: firstOf('work'), projects: firstOf('projects') },
  busy: false,
  queued: false,
  started: false,
  flipping: false,
  pending: null,
  cleanup: [],
};
const setIndex = (i) => {
  app.index = i;
  app.last[groupOf(i)] = i;
};

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
function buildHud() {
  $('#hud').innerHTML = `
    <a class="hud-brand" href="#home" aria-label="${esc(site.name)}, home">
      <span class="hud-name">${esc(site.name)}</span>
      <span class="hud-role">${esc(site.role)} · ${esc(site.focus)}</span>
    </a>
    <div class="hud-status">
      <span class="dot" aria-hidden="true"></span><span>${esc(site.availability)}</span>
      <span class="readout" aria-hidden="true"></span>
    </div>
    <nav class="hud-nav" aria-label="Main">
      <a href="#work" data-nav="work">Work</a>
      <a href="#projects" data-nav="projects">Projects</a>
      <a href="#about" data-nav="about">About</a>
      <a class="hud-cv" href="${esc(site.resume)}" download>Resume</a>
      <button class="sound" type="button" aria-pressed="false">
        <canvas width="88" height="32" aria-hidden="true"></canvas><span class="sound-label">Sound off</span>
      </button>
    </nav>`;
}

function setNav(route) {
  const key =
    route.name === 'work' ? route.group : route.name === 'project' ? groupOf(route.index) : route.name;
  $$('[data-nav]').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

// the pillar colour, plus a deeper shade of it that holds contrast on the light Home studio
function setAccent(hex) {
  root.style.setProperty('--accent', hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  root.style.setProperty('--accent-deep', `hsl(${Math.round(h * 60 + 360) % 360} ${Math.round(Math.min(0.85, sat) * 100)}% 42%)`);
}

function setupSoundButton() {
  const btn = $('.sound');
  const cv = btn.querySelector('canvas');
  const ctx = cv.getContext('2d');
  btn.addEventListener('click', () => {
    sound.init();
    sound.setEnabled(!sound.enabled);
    updateSoundButton();
    sound.click();
  });
  const fg = getComputedStyle(root).getPropertyValue('--fg').trim() || '#e4e7ee';
  frameHooks.push(() => {
    const d = sound.wave();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = root.classList.contains('is-home') ? '#111318' : fg;
    ctx.lineWidth = 2;
    ctx.globalAlpha = d ? 0.95 : 0.45;
    ctx.beginPath();
    if (d) {
      const step = d.length / cv.width;
      for (let x = 0; x < cv.width; x++) {
        const v = (d[Math.floor(x * step)] - 128) / 128;
        const y = cv.height / 2 + v * cv.height * 1.6;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    } else {
      ctx.setLineDash([2, 6]);
      ctx.moveTo(0, cv.height / 2);
      ctx.lineTo(cv.width, cv.height / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (stage) stage.level = sound.level();
  });
}

function updateSoundButton() {
  const btn = $('.sound');
  btn.setAttribute('aria-pressed', String(sound.enabled));
  $('.sound-label', btn).textContent = sound.enabled ? 'Sound on' : 'Sound off';
}

function setupReadout() {
  // darken the area behind the HUD once page content scrolls under it
  let scrolled = false;
  frameHooks.push(() => {
    const next = !root.classList.contains('is-locked') && window.scrollY > 40;
    if (next !== scrolled) root.classList.toggle('is-scrolled', (scrolled = next));
  });
  const el = $('.readout');
  if (!stage?.bench) {
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: site.timezone });
    const tick = () => el && (el.textContent = `${site.location.split(',')[0]} ${fmt.format(new Date())}`);
    tick();
    setInterval(tick, 15000);
    return;
  }
  let acc = 0;
  let frames = 0;
  frameHooks.push((dt) => {
    acc += dt;
    frames++;
    if (acc < 0.5) return;
    const fps = Math.round(frames / acc);
    acc = 0;
    frames = 0;
    if (!el || !stage) return;
    el.textContent = `${fps} fps · ${stage.renderer.info.render.calls} draws · ${stage.dpr.toFixed(2)}x`;
  });
}

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */
function setupCursor() {
  const c = $('.cursor');
  const label = $('.cursor-label', c);
  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let cx = x;
  let cy = y;
  let last = null;
  if (finePointer) root.classList.add('has-cursor');
  addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
    },
    { passive: true }
  );
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a, button, .media');
    c.classList.toggle('is-link', !!t && !t.classList.contains('media'));
    if (t && t !== last && !t.classList.contains('media')) {
      const i = t.dataset.i ? Number(t.dataset.i) : t.closest('.hud') ? 5 : 2;
      sound.hover(i);
    }
    last = t;
    if (t && t.classList.contains('media')) stage?.setMediaHover(t.querySelector('.media-box'), true);
  });
  // magnetic controls: buttons lean towards the cursor and spring back when it leaves
  if (finePointer && !reduced) {
    let mag = null;
    addEventListener(
      'pointermove',
      (e) => {
        const t = e.target.closest?.('.btn, .hud-nav a, .sound');
        if (mag && mag !== t) {
          gsap.to(mag, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
          mag = null;
        }
        if (!t || t.disabled) return;
        mag = t;
        const b = t.getBoundingClientRect();
        const cx0 = b.left - gsap.getProperty(t, 'x') + b.width / 2;
        const cy0 = b.top - gsap.getProperty(t, 'y') + b.height / 2;
        gsap.to(t, { x: (e.clientX - cx0) * 0.2, y: (e.clientY - cy0) * 0.28, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      },
      { passive: true }
    );
  }
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest('.media');
    if (t && !t.contains(e.relatedTarget)) stage?.setMediaHover(t.querySelector('.media-box'), false);
  });
  frameHooks.push((dt) => {
    const k = 1 - Math.exp(-dt * 16);
    cx += (x - cx) * k;
    cy += (y - cy) * k;
    c.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    const onWork = app.route?.name === 'work' && !c.classList.contains('is-link');
    const onHelix = app.route?.name === 'home' && finePointer && x > innerWidth * 0.5 && !c.classList.contains('is-link');
    const text = drag.dir ? 'Release' : onWork || onHelix ? 'Drag' : '';
    c.classList.toggle('is-spin', !!onHelix && !!spin.on);
    if (label.textContent !== text) label.textContent = text;
    c.classList.toggle('has-label', !!text);
    c.classList.toggle('is-drag', !!drag.on);
  });
}

/* ------------------------------------------------------------------ */
/* Preloader                                                           */
/* ------------------------------------------------------------------ */
function buildPreloader() {
  const n = 96;
  let ticks = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const major = i % 8 === 0;
    const r1 = major ? 80 : 84;
    const r2 = 92;
    const p = (r) => `${(100 + Math.cos(a) * r).toFixed(2)} ${(100 + Math.sin(a) * r).toFixed(2)}`;
    const [x1, y1] = p(r1).split(' ');
    const [x2, y2] = p(r2).split(' ');
    ticks += `<line class="tk${major ? ' tk-major' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  $('#pre').innerHTML = `
    <div class="pre-head"><span>${esc(site.name)}</span><span>${esc(site.role)} · ${esc(site.focus)}</span></div>
    <div class="pre-center">
      <div class="pre-dial">
        <svg viewBox="0 0 200 200" aria-hidden="true">${ticks}<circle class="pre-orbit" cx="100" cy="100" r="70"/></svg>
        <div class="pre-num"><span class="pre-pct">00</span><span class="pre-unit">%</span></div>
      </div>
      <div class="pre-actions">
        <button type="button" class="btn btn--solid pre-enter" disabled><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Enter with sound</span></button>
        <button type="button" class="btn pre-mute" disabled><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Enter muted</span></button>
      </div>
    </div>
    <div class="pre-foot"><span class="pre-status" role="status">Loading type</span><span>Best with headphones</span></div>`;
}

async function boot() {
  buildHud();
  buildPreloader();
  try {
    stage = new Stage($('#gl'), projects, { reduced, mobile });
    if (new URLSearchParams(location.search).has('bench')) {
      stage.bench = true;
      stage.dpr = 1;
      stage.resize();
      window.__louver = { stage, app, get lenis() { return lenis; } };
    }
  } catch (err) {
    console.warn('WebGL unavailable, running without the 3D stage.', err);
    root.classList.add('no-gl');
  }
  setupLoop();
  setupSoundButton();
  setupReadout();
  setupCursor();
  setupInput();
  setAccent(projects[0].colors.a);

  const prog = { v: 0, target: 0.1 };
  const pct = $('.pre-pct');
  const ticks = $$('.pre-dial .tk');
  const status = $('.pre-status');
  const onTick = () => {
    prog.v += (prog.target - prog.v) * (reduced ? 1 : 0.07);
    const p = Math.min(1, prog.v + 0.002);
    pct.textContent = pad(Math.round(p * 100));
    const lit = Math.round(p * ticks.length);
    ticks.forEach((t, i) => t.classList.toggle('on', i < lit));
  };
  gsap.ticker.add(onTick);

  await Promise.race([document.fonts.ready, wait(2500)]);
  prog.target = 0.45;
  status.textContent = 'Compiling shaders';
  await wait(60);
  if (stage) await stage.prepare();
  prog.target = 0.85;
  status.textContent = 'Rendering first frame';
  await wait(350);
  prog.target = 1;
  await new Promise((res) => {
    const check = () => (prog.v > 0.985 ? res() : requestAnimationFrame(check));
    check();
  });
  gsap.ticker.remove(onTick);
  pct.textContent = '100';
  ticks.forEach((t) => t.classList.add('on'));
  status.textContent = 'Ready';

  const enterBtn = $('.pre-enter');
  const muteBtn = $('.pre-mute');
  [enterBtn, muteBtn].forEach((b) => (b.disabled = false));
  gsap.fromTo('.pre-actions .btn', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: D(0.8), stagger: 0.08, ease: 'expo.out' });
  enterBtn.focus({ preventScroll: true });
  enterBtn.addEventListener('click', () => start(true), { once: true });
  muteBtn.addEventListener('click', () => start(false), { once: true });
}

async function start(withSound) {
  $$('#pre button').forEach((b) => (b.disabled = true));
  sound.init();
  sound.setEnabled(withSound);
  updateSoundButton();
  sound.swell();

  const tl = gsap.timeline();
  tl.to('.pre-dial .tk', { opacity: 0, duration: D(0.6), stagger: { each: 0.004, from: 'center' }, ease: 'power2.in' }, 0)
    .to('.pre-num, .pre-actions, .pre-head, .pre-foot', { opacity: 0, y: -10, duration: D(0.5), ease: 'power2.in' }, 0)
    .to('#pre', { opacity: 0, duration: D(0.6), ease: 'power2.out' }, D(0.45))
    .add(() => $('#pre').remove());
  stage?.intro();
  gsap.fromTo('.hud > *', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: D(1.2), stagger: 0.08, delay: D(0.6), ease: 'expo.out', clearProps: 'opacity,transform' });
  app.started = true;
  await wait(reduced ? 0 : 450);
  navigate();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h || h === 'home') return { name: 'home' };
  if (h === 'work') return { name: 'work', group: 'work' };
  if (h === 'projects') return { name: 'work', group: 'projects' };
  if (h === 'about') return { name: 'about' };
  const i = projects.findIndex((p) => p.slug === h);
  if (i >= 0) return { name: 'project', index: i };
  return { name: 'lost' };
}

const sameRoute = (a, b) => a && b && a.name === b.name && a.index === b.index && a.group === b.group;

async function navigate() {
  if (!app.started) return;
  if (app.busy) {
    app.queued = true;
    return;
  }
  const next = parseRoute();
  if (sameRoute(next, app.route)) return;
  app.busy = true;
  const prev = app.route;
  setNav(next);
  try {
    await leave(prev, next);
    await enter(next, prev);
  } catch (err) {
    console.error(err);
  }
  app.route = next;
  app.busy = false;
  if (app.queued) {
    app.queued = false;
    navigate();
  }
}

addEventListener('hashchange', navigate);

function lockScroll() {
  root.classList.add('is-locked');
  lenis?.stop();
  window.scrollTo(0, 0);
}

function unlockScroll() {
  root.classList.remove('is-locked');
  window.scrollTo(0, 0);
  if (lenis) {
    lenis.start();
    lenis.scrollTo(0, { immediate: true, force: true });
  }
}

async function leave(prev, next) {
  app.cleanup.forEach((f) => f());
  app.cleanup = [];
  if (!prev) return;
  const el = view.firstElementChild;
  if (prev.name === 'work') await workOut();
  else if (el) {
    const toNextProject = prev.name === 'project' && next.name === 'project';
    await Promise.all([
      gsap.to(el, { opacity: 0, y: -24, duration: D(0.45), ease: 'power2.in' }),
      toNextProject && stage ? stage.fadeTo(0.92, 0.45) : null,
    ]);
  }
  stage?.clearMedia();
}

async function enter(route, prev) {
  root.classList.toggle('is-work', route.name === 'work');
  root.classList.toggle('is-home', route.name === 'home');
  if (route.name === 'home') return enterHome(prev);
  if (route.name === 'work') return enterWork(prev, route);
  if (route.name === 'project') return enterProject(route.index, prev);
  if (route.name === 'about') return enterAbout();
  return enterLost();
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */
function renderHome() {
  const proof = site.proof
    .map(
      (p) =>
        `<li data-slug="${p.slug}"><a href="#${p.slug}"><span class="hp-v">${esc(p.value)}</span><span class="hp-l">${esc(p.label)}</span><span class="hp-src">${esc(p.pillar)} case study <span aria-hidden="true">→</span></span></a></li>`
    )
    .join('');
  view.innerHTML = `
    <section class="home" aria-labelledby="home-name">
      <p class="h-eyebrow">${esc(site.role)} · ${esc(site.focus)}</p>
      <h1 class="h-name" id="home-name">${esc(site.name)}</h1>
      <p class="h-intro">${esc(site.intro)}</p>
      <p class="h-status"><span class="dot" aria-hidden="true"></span>${esc(site.availability)} · ${esc(site.location)}</p>
      <ul class="h-proof" aria-label="Highlights">${proof}</ul>
      <div class="h-actions">
        <a class="btn btn--solid" href="#work"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">View work</span><span class="btn-arrow" aria-hidden="true">→</span></a>
        <a class="btn" href="${esc(site.resume)}" download><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Download resume</span><span class="btn-arrow" aria-hidden="true">↓</span></a>
        <a class="btn" href="${esc(site.linkedin)}" target="_blank" rel="noopener"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">LinkedIn</span><span class="btn-arrow" aria-hidden="true">↗</span></a>
      </div>
      <p class="h-foot">${esc(site.homeFoot)}</p>
    </section>`;
}

function markProof(i) {
  const slug = projects[i]?.slug;
  $$('.h-proof li').forEach((li) => li.classList.toggle('is-active', li.dataset.slug === slug));
}

async function enterHome(prev) {
  renderHome();
  unlockScroll();
  document.title = `${site.name} · ${site.role}`;
  live.textContent = `${site.name}, ${site.role}. ${site.availability}.`;

  // the hero cycles through the three pillars: scene colour, helix rim and the highlighted result move together
  const seq = site.proof.map((p) => projects.findIndex((x) => x.slug === p.slug)).filter((i) => i >= 0);
  let k = -1;
  let paused = false;
  let lastShow = 0;
  const show = (n) => {
    if (n === k) return;
    k = n;
    const idx = seq[k];
    markProof(idx);
    setIndex(idx);
    setAccent(projects[idx].colors.a);
    stage?.crossTo(idx, 1.4);
    lastShow = performance.now();
  };

  let current = stage && groupOf(stage.current) === 'work' ? stage.current : groupOf(app.index) === 'work' ? app.index : firstOf('work');
  setIndex(current);
  setAccent(projects[current].colors.a);
  markProof(-1);
  if (stage) {
    stage.heroEl = null;
    if (stage.current !== current) {
      if (prev) stage.crossTo(current, 0.9);
      else stage.setProject(current);
    }
    stage.setMode('home', { duration: prev ? 1.8 : 2.8 });
    const first = gsap.delayedCall(D(prev ? 1.2 : 2.2), () => show(Math.max(0, seq.indexOf(current))));
    const timer = setInterval(() => {
      if (app.route?.name !== 'home' || app.busy || document.hidden || paused || reduced) return;
      if (performance.now() - lastShow > 6000) show((k + 1) % seq.length);
    }, 400);
    // hovering or focusing a result switches the scene to that pillar
    const onEnter = (e) => {
      const li = e.target.closest('.h-proof li');
      if (!li) return;
      paused = true;
      show(seq.indexOf(projects.findIndex((x) => x.slug === li.dataset.slug)));
    };
    const onLeave = (e) => {
      const li = e.target.closest('.h-proof li');
      if (!li || li.contains(e.relatedTarget)) return;
      paused = false;
      lastShow = performance.now();
    };
    const list = $('.h-proof');
    list.addEventListener('pointerover', onEnter);
    list.addEventListener('focusin', onEnter);
    list.addEventListener('pointerout', onLeave);
    list.addEventListener('focusout', onLeave);
    app.cleanup.push(() => {
      first.kill();
      clearInterval(timer);
    });
  }

  const name = splitChars($('.h-name'));
  const intro = splitWords($('.h-intro'));
  const tl = gsap.timeline({ delay: D(prev ? 0.5 : 0.9) });
  tl.fromTo('.h-eyebrow', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D(0.9), ease: 'expo.out' }, 0)
    .fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: D(1.3), stagger: 0.035, ease: 'expo.out' }, 0.05)
    .fromTo(intro, { yPercent: 105 }, { yPercent: 0, duration: D(1.1), stagger: 0.02, ease: 'expo.out' }, 0.3)
    .fromTo('.h-status, .h-proof li, .h-actions .btn, .h-foot', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: D(1), stagger: 0.07, ease: 'expo.out' }, 0.5);
  await wait(reduced ? 0 : 300);
}

/* ------------------------------------------------------------------ */
/* Work index                                                          */
/* ------------------------------------------------------------------ */
function renderWork(g) {
  const m = members(g);
  const items = m
    .map(
      (i, k) =>
        `<li><button type="button" class="wl-item" data-i="${i}"><span class="wl-n">${pad(k + 1)}</span><span class="wl-t">${esc(projects[i].title)}</span></button></li>`
    )
    .join('');
  const ticks = m.map((i) => `<button type="button" class="ws-tick" data-i="${i}" aria-label="Show ${esc(projects[i].title)}"></button>`).join('');
  view.innerHTML = `
    <section class="work" aria-label="${GROUPS[g].label}">
      <h1 class="sr-only">${GROUPS[g].label}</h1>
      <div class="work-list"><p class="wl-head">${GROUPS[g].label}</p><ol>${items}</ol></div>
      <div class="work-feature">
        <p class="wf-eyebrow"><span class="wf-client"></span><span class="wf-sep" aria-hidden="true"></span><span class="wf-year"></span></p>
        <h2 class="wf-title"><a class="wf-link" href="#"></a></h2>
        <p class="wf-summary"></p>
        <a class="btn wf-cta" href="#"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">${GROUPS[g].open}</span><span class="btn-arrow" aria-hidden="true">→</span></a>
      </div>
      <div class="work-scrub">
        <p class="ws-stat"><span class="ws-stat-v"></span><span class="ws-stat-l"></span></p>
        <p class="ws-count" aria-hidden="true"><span class="ws-cur">${pad(posIn(app.index) + 1)}</span><span class="ws-tot">/ ${pad(m.length)}</span></p>
        <div class="ws-track">${ticks}<span class="ws-ind" aria-hidden="true"></span></div>
        <p class="ws-hint">${finePointer ? 'Scroll, drag or use the arrow keys' : 'Swipe to browse'}</p>
      </div>
    </section>`;
  $$('.wl-item, .ws-tick').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.i))));
}

function fillStat(p, animate) {
  const [v, l] = (p.metrics && p.metrics[0]) || ['', ''];
  const stat = $('.ws-stat');
  if (!stat) return;
  stat.hidden = !v;
  if (animate) {
    scramble($('.ws-stat-v'), v, { duration: 0.6 });
    scramble($('.ws-stat-l'), l, { duration: 0.8 });
  } else {
    $('.ws-stat-v').textContent = v;
    $('.ws-stat-l').textContent = l;
  }
}

function fillWork(i) {
  const p = projects[i];
  const link = $('.wf-link');
  link.href = `#${p.slug}`;
  $('.wf-cta').href = `#${p.slug}`;
  $('.wf-client').textContent = p.company;
  $('.wf-year').textContent = p.year;
  $('.wf-summary').textContent = p.summary;
  $('.ws-cur').textContent = pad(posIn(i) + 1);
  $('.wf-title').style.setProperty('--chars', fitChars(p.title));
  fillStat(p, false);
  $$('.wl-item').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
  moveIndicator(i, true);
  setAccent(p.colors.a);
  return splitChars(link, p.title);
}

function moveIndicator(i, immediate) {
  const tick = $(`.ws-tick[data-i="${i}"]`);
  const ind = $('.ws-ind');
  if (!tick || !ind) return;
  gsap.to(ind, { x: tick.offsetLeft, duration: immediate ? 0 : D(1.1), ease: 'expo.out' });
}

function workText(i, dir) {
  const p = projects[i];
  const link = $('.wf-link');
  if (!link) return;
  const old = $$('.sci', link);
  const from = dir > 0 ? 'start' : 'end';
  gsap.killTweensOf(old);
  gsap.to(old, { yPercent: -110 * dir, duration: D(0.36), ease: 'power3.in', stagger: { each: 0.012, from } });
  gsap.delayedCall(D(0.38), () => {
    $('.wf-title')?.style.setProperty('--chars', fitChars(p.title));
    const chars = splitChars(link, p.title);
    gsap.fromTo(chars, { yPercent: 110 * dir }, { yPercent: 0, duration: D(1.05), ease: 'expo.out', stagger: { each: 0.03, from } });
  });
  link.href = `#${p.slug}`;
  $('.wf-cta').href = `#${p.slug}`;
  scramble($('.wf-client'), p.company, { duration: 0.7 });
  scramble($('.wf-year'), p.year, { duration: 0.5 });
  scramble($('.ws-cur'), pad(posIn(i) + 1), { duration: 0.45 });
  fillStat(p, true);
  const sum = $('.wf-summary');
  gsap.to(sum, {
    opacity: 0,
    y: -6,
    duration: D(0.3),
    ease: 'power2.in',
    onComplete: () => {
      sum.textContent = p.summary;
      const words = splitWords(sum);
      gsap.set(sum, { opacity: 1, y: 0 });
      gsap.fromTo(words, { yPercent: 100 }, { yPercent: 0, duration: D(0.9), stagger: 0.012, ease: 'expo.out' });
    },
  });
  $$('.wl-item').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
  moveIndicator(i);
  setAccent(p.colors.a);
  live.textContent = `${p.title}, ${posIn(i) + 1} of ${members(groupOf(i)).length} in ${GROUPS[groupOf(i)].label}`;
}

async function enterWork(prev, route) {
  const g = route.group;
  if (groupOf(app.index) !== g) app.index = app.last[g] ?? firstOf(g);
  app.group = g;
  lockScroll();
  renderWork(g);
  const chars = fillWork(app.index);
  document.title = g === 'work' ? `${site.name} · ${site.role}` : `${GROUPS[g].label} · ${site.name}`;
  if (stage) {
    stage.heroEl = null;
    if (stage.current !== app.index) {
      // switching between the two collections plays the slat wave; other entries crossfade
      if (prev?.name === 'work') {
        sound.louvers(1.8, 26, 1);
        stage.flipTo(app.index, 1);
      } else if (prev) stage.crossTo(app.index, 0.9);
      else stage.setProject(app.index);
    }
    stage.setMode('work', { duration: prev ? 1.8 : 2.8 });
  }
  const tl = gsap.timeline({ delay: D(prev ? 0.55 : 0.9) });
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: D(1.2), stagger: 0.035, ease: 'expo.out' }, 0)
    .fromTo('.wf-eyebrow, .wf-summary, .wf-cta', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D(1), stagger: 0.08, ease: 'expo.out' }, 0.2)
    .fromTo('.wl-head, .wl-item', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: D(0.9), stagger: 0.04, ease: 'expo.out' }, 0.1)
    .fromTo('.work-scrub > *', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D(0.9), stagger: 0.08, ease: 'expo.out' }, 0.3);
  await wait(reduced ? 0 : 300);
}

async function workOut() {
  const chars = $$('.wf-link .sci');
  await Promise.all([
    gsap.to(chars, { yPercent: -110, duration: D(0.45), stagger: 0.015, ease: 'power3.in' }),
    gsap.to('.wf-eyebrow, .wf-summary, .wf-cta, .wl-head, .wl-item, .work-scrub > *', { opacity: 0, y: -8, duration: D(0.4), stagger: 0.015, ease: 'power2.in' }),
  ]);
}

async function goTo(i, dir) {
  if (app.route?.name !== 'work' || app.busy || i === app.index || groupOf(i) !== app.group) return;
  if (app.flipping) {
    app.pending = { i, dir };
    return;
  }
  app.flipping = true;
  dir = dir || (i > app.index ? 1 : -1);
  setIndex(i);
  sound.woosh(dir);
  sound.louvers(1.8, 26, dir);
  workText(i, dir);
  await (stage ? stage.flipTo(i, dir) : wait(400));
  app.flipping = false;
  if (app.pending) {
    const p = app.pending;
    app.pending = null;
    if (p.i !== app.index) goTo(p.i, p.dir);
  }
}

const step = (dir) => goTo(neighbor(app.index, dir), dir);

/* ------------------------------------------------------------------ */
/* Project page                                                        */
/* ------------------------------------------------------------------ */
function renderProject(i) {
  const p = projects[i];
  const g = groupOf(i);
  const next = projects[neighbor(i, 1)];
  const meta = [['Company', p.company], ['Role', p.role], ['Period', p.period], ['Focus', p.area]].filter(([, v]) => v);
  const chips = (list) =>
    list && list.length ? `<ul class="ch-metrics">${list.map(([v, l]) => `<li><b>${esc(v)}</b><span>${esc(l)}</span></li>`).join('')}</ul>` : '';
  const metrics = (p.metrics || []).map(([v, l]) => `<li><span class="pm-v">${esc(v)}</span><span class="pm-l">${esc(l)}</span></li>`).join('');
  // optional story sections only render once they have been written in content.js
  const story = (key, label) =>
    p[key] && [].concat(p[key]).join('').trim()
      ? `<section class="p-section"><h2 class="p-sec-title">${label}</h2>${[].concat(p[key]).map((t) => `<p>${esc(t)}</p>`).join('')}</section>`
      : '';
  const chapters = (p.chapters || [])
    .map(
      (c, k) => `
        <section class="chapter${k % 2 ? ' chapter--flip' : ''}">
          <div class="ch-text">
            <p class="ch-n">${pad(k + 1)}</p>
            <h3 class="ch-title">${esc(c.title)}</h3>
            <p class="ch-copy">${esc(c.text)}</p>
            ${chips(c.metrics)}
          </div>
          <figure class="media ch-media" aria-hidden="true"><div class="media-box" data-variant="${k}"></div></figure>
        </section>`
    )
    .join('');
  view.innerHTML = `
    <article class="project">
      <div class="p-hero" aria-hidden="true"></div>
      <header class="p-head">
        <a class="p-back" href="#${GROUPS[g].hash}"><span aria-hidden="true">←</span> ${GROUPS[g].back}</a>
        <p class="p-count">${GROUPS[g].label} · ${pad(posIn(i) + 1)} / ${pad(members(g).length)}</p>
        ${p.pillar ? `<p class="p-pillar">${esc(p.pillar)}</p>` : ''}
        <h1 class="p-title" style="--chars:${fitChars(p.title)}">${esc(p.title)}</h1>
        <p class="p-summary">${esc(p.summary)}</p>
        <dl class="p-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${metrics ? `<ul class="p-metrics" aria-label="Key results">${metrics}</ul>` : ''}
      </header>
      <div class="p-body">
        ${story('problem', 'Problem')}
        ${story('insight', 'Insight')}
        <h2 class="p-sec-title p-sec-title--chapters">${GROUPS[g].chapters}</h2>
        ${chapters}
        ${story('decisions', 'Decisions and trade-offs')}
        ${story('learnings', 'What I learned')}
      </div>
      <a class="p-next" href="#${next.slug}" aria-label="${GROUPS[g].next}: ${esc(next.title)}">
        <span class="pn-label">${GROUPS[g].next}</span>
        <span class="pn-media" aria-hidden="true"><span class="media-box" data-next></span></span>
        <span class="pn-title" style="--chars:${fitChars(next.title)}" aria-hidden="true">${esc(next.title)}</span>
        <span class="pn-bar" aria-hidden="true"><span class="pn-fill"></span></span>
        <span class="pn-hint" aria-hidden="true">Keep scrolling or select to continue</span>
      </a>
    </article>`;
}

async function enterProject(i, prev) {
  const fromProject = prev?.name === 'project';
  const p = projects[i];
  setIndex(i);
  app.group = groupOf(i);
  setAccent(p.colors.a);
  renderProject(i);
  unlockScroll();
  document.title = `${p.title} · ${site.name}`;
  live.textContent = `${p.title}. ${p.summary}`;

  if (stage) {
    stage.heroEl = $('.p-hero');
    if (fromProject) {
      stage.setMode('project', { duration: 0.01 });
      stage.fadeTo(0, 0.7);
      sound.woosh(1);
      sound.louvers(1.8, 26, 1);
      stage.flipTo(i, 1);
    } else {
      if (stage.current !== i) {
        if (prev?.name === 'work') stage.flipTo(i, 1);
        else stage.crossTo(i, 0.8);
      }
      sound.woosh(1, 0.8);
      stage.setMode('project', { duration: 1.9 });
    }
    const items = $$('.p-body .media-box').map((el) => ({ el, index: i, variant: Number(el.dataset.variant) + 1 }));
    items.push({ el: $('.pn-media .media-box'), index: neighbor(i, 1), variant: 0, kind: 'next' });
    stage.setMedia(items);
  }

  const title = $('.p-title');
  const chars = splitChars(title);
  const sumWords = splitWords($('.p-summary'));
  const tl = gsap.timeline({ delay: D(fromProject ? 0.4 : 0.9) });
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: D(1.3), stagger: 0.04, ease: 'expo.out' }, 0)
    .fromTo(sumWords, { yPercent: 100 }, { yPercent: 0, duration: D(1), stagger: 0.012, ease: 'expo.out' }, 0.15)
    .fromTo('.p-back, .p-count, .p-pillar, .p-meta > div, .p-metrics li', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: D(0.9), stagger: 0.06, ease: 'expo.out' }, 0.25);

  setupProjectScroll(i);
  await wait(reduced ? 0 : 400);
}

function setupProjectScroll(i) {
  const next = projects[neighbor(i, 1)];
  const footer = $('.p-next');
  const fill = $('.pn-fill');
  const ttl = $('.pn-title');
  let holdSince = 0;
  let fired = false;

  // paragraphs and captions fade up as they enter the viewport
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        gsap.fromTo(e.target, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: D(1.2), ease: 'expo.out' });
      }),
    { rootMargin: '0px 0px -12% 0px' }
  );
  $$('.p-section, .p-sec-title--chapters, .ch-text, .pn-label').forEach((el) => {
    if (!reduced) el.style.opacity = '0';
    io.observe(el);
  });

  const hook = () => {
    if (fired || !footer.isConnected) return;
    const b = stage ? stage.rect(footer) : footer.getBoundingClientRect();
    const top = stage ? b.t : b.top;
    const height = stage ? b.h : b.height;
    const p = Math.max(0, Math.min(1, (innerHeight - top) / height));
    fill.style.transform = `scaleX(${p})`;
    ttl.style.transform = `scale(${0.82 + p * 0.18})`;
    stage?.setNextProgress(p);
    if (p > 0.985) {
      if (!holdSince) holdSince = performance.now();
      else if (performance.now() - holdSince > 450) {
        fired = true;
        location.hash = next.slug;
      }
    } else holdSince = 0;
  };
  frameHooks.push(hook);
  app.cleanup.push(() => {
    io.disconnect();
    const k = frameHooks.indexOf(hook);
    if (k >= 0) frameHooks.splice(k, 1);
  });
}

/* ------------------------------------------------------------------ */
/* About and 404                                                       */
/* ------------------------------------------------------------------ */
function renderAbout() {
  const list = (rows) =>
    rows
      .map(
        (r) =>
          `<li><span class="al-role">${esc(r.role)}</span><span class="al-org">${esc(r.org)}</span><span class="al-period">${esc(r.period)}</span>${
            r.points
              ? `<ul class="ae-points">${r.points.map((pt) => `<li>${pt.slug ? `<a href="#${pt.slug}">${esc(pt.text)}</a>` : esc(pt.text)}</li>`).join('')}</ul>`
              : ''
          }</li>`
      )
      .join('');
  view.innerHTML = `
    <article class="about">
      <p class="a-eyebrow">About · ${esc(site.location)}</p>
      <h1 class="a-lede">${esc(site.aboutLede)}</h1>
      <div class="a-actions">
        <a class="btn btn--solid" href="${esc(site.resume)}" download><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Download resume</span><span class="btn-arrow" aria-hidden="true">↓</span></a>
        <a class="btn" href="${esc(site.linkedin)}" target="_blank" rel="noopener"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">LinkedIn</span><span class="btn-arrow" aria-hidden="true">↗</span></a>
      </div>
      <div class="a-grid">
        <section class="a-col a-bio"><h2>Profile</h2>${site.about.map((t) => `<p>${esc(t)}</p>`).join('')}</section>
        <section class="a-col"><h2>How I work</h2><ul class="a-how">${site.howIWork.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
        <section class="a-col a-col--wide"><h2>Experience</h2><ul class="a-exp">${list(site.experience)}</ul></section>
        <section class="a-col"><h2>Education</h2><ul class="a-list">${list(site.education)}</ul></section>
        <section class="a-col"><h2>Skills</h2><dl class="a-skills">${site.skills
          .map((k) => `<div><dt>${esc(k.label)}</dt><dd>${k.items.map(esc).join(' · ')}</dd></div>`)
          .join('')}</dl></section>
        <section class="a-col a-contact">
          <h2>Contact</h2>
          <p class="a-email"><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
          <button type="button" class="btn a-copy"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Copy email</span></button>
          <ul class="a-social">
            <li><a href="${esc(site.linkedin)}" target="_blank" rel="noopener">LinkedIn <span aria-hidden="true">↗</span></a></li>
            <li><a href="${esc(site.resume)}" download>Resume (PDF) <span aria-hidden="true">↓</span></a></li>
          </ul>
        </section>
      </div>
      <p class="a-note">The portrait is drawn in particles and moves away from your cursor${sound.enabled ? '; it also pulses with the soundtrack' : ''}.</p>
    </article>`;
  const copy = $('.a-copy');
  copy.addEventListener('click', async () => {
    const label = $('.btn-text', copy);
    try {
      await navigator.clipboard.writeText(site.email);
      label.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('.a-email a'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      label.textContent = 'Selected, press copy';
    }
    setTimeout(() => (label.textContent = 'Copy email'), 2200);
  });
}

async function enterAbout() {
  renderAbout();
  unlockScroll();
  document.title = `About · ${site.name}`;
  stage && (stage.heroEl = null);
  stage?.setMode('about', { duration: 2.2 });
  sound.woosh(-1, 0.7);
  const words = splitWords($('.a-lede'));
  const tl = gsap.timeline({ delay: D(0.6) });
  tl.fromTo('.a-eyebrow', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D(0.9), ease: 'expo.out' }, 0)
    .fromTo(words, { yPercent: 105 }, { yPercent: 0, duration: D(1.2), stagger: 0.025, ease: 'expo.out' }, 0.05)
    .fromTo('.a-actions .btn, .a-col, .a-note', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: D(1.1), stagger: 0.08, ease: 'expo.out' }, 0.4);
  await wait(reduced ? 0 : 300);
}

async function enterLost() {
  view.innerHTML = `
    <section class="lost">
      <p class="lost-code">404</p>
      <h1>Nothing at this address</h1>
      <p>The link may be mistyped, or the page has moved.</p>
      <a class="btn" href="#home"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Back to home</span></a>
    </section>`;
  lockScroll();
  document.title = `Not found · ${site.name}`;
  stage && (stage.heroEl = null);
  stage?.setMode('lost', { duration: 1.8 });
  gsap.fromTo('.lost > *', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: D(1.1), stagger: 0.08, delay: D(0.4), ease: 'expo.out' });
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const drag = { on: false, x0: 0, dir: 0, p: 0, target: -1, lastX: 0, lastT: 0, v: 0, ticks: 0 };
const spin = { on: false, x: 0 };

function setupInput() {
  // Wheel and trackpad scrub the flip continuously. A short flick or one mouse notch completes it;
  // a tiny nudge springs back. Momentum after a completed flip is swallowed so one gesture = one project.
  const wheel = { active: false, p: 0, target: 0, dir: 0, idx: -1, last: 0, lockUntil: 0, ticks: 0 };
  addEventListener(
    'wheel',
    (e) => {
      if (app.route?.name !== 'work' || app.busy || drag.on) return;
      const now = performance.now();
      if (now < wheel.lockUntil) {
        wheel.lockUntil = now + 220;
        return;
      }
      if (app.flipping && !wheel.active) return;
      let d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (e.deltaMode === 1) d *= 33;
      if (!d) return;
      wheel.last = now;
      if (!wheel.active) {
        Object.assign(wheel, { active: true, dir: Math.sign(d), p: 0, target: 0, ticks: 0 });
        wheel.idx = neighbor(app.index, wheel.dir);
        app.flipping = true;
        stage?.scrubStart(wheel.idx, wheel.dir);
      }
      wheel.target = Math.min(1, wheel.target + (d * wheel.dir) / 520);
      if (wheel.target < -0.04) {
        // reversed before committing: scrub towards the other neighbour instead
        wheel.dir *= -1;
        wheel.idx = neighbor(app.index, wheel.dir);
        wheel.target = -wheel.target;
        wheel.p = 0;
        stage?.scrubStart(wheel.idx, wheel.dir);
      }
    },
    { passive: true }
  );
  const finishWheel = async (commit) => {
    const { idx, dir, p } = wheel;
    wheel.active = false;
    if (commit) {
      setIndex(idx);
      sound.woosh(dir, 0.8);
      sound.louvers(Math.max(0.4, (1 - p) * 1.6), Math.max(4, Math.round(26 * (1 - p))), dir);
      workText(idx, dir);
      wheel.lockUntil = performance.now() + 260;
    }
    await (stage ? stage.scrubEnd(commit) : wait(10));
    app.flipping = false;
    if (app.pending) {
      const q = app.pending;
      app.pending = null;
      if (q.i !== app.index) goTo(q.i, q.dir);
    }
  };
  frameHooks.push((dt) => {
    if (!wheel.active) return;
    if (app.route?.name !== 'work') {
      finishWheel(false);
      return;
    }
    wheel.p += (Math.max(0, wheel.target) - wheel.p) * (1 - Math.exp(-dt * 14));
    stage?.scrubSet(wheel.p);
    const t = Math.floor(wheel.p * 14);
    if (t !== wheel.ticks) {
      wheel.ticks = t;
      sound.tick(wheel.p);
    }
    if (wheel.p > 0.97) finishWheel(true);
    else if (performance.now() - wheel.last > 150) finishWheel(wheel.target > 0.12);
  });

  // Home: drag on the right half to spin the helix, with inertia
  addEventListener('pointerdown', (e) => {
    if (app.route?.name !== 'home' || !finePointer || e.button > 0 || e.clientX < innerWidth * 0.5) return;
    if (e.target.closest('a, button')) return;
    Object.assign(spin, { on: true, x: e.clientX });
    root.classList.add('is-dragging');
  });
  addEventListener('pointermove', (e) => {
    if (!spin.on) return;
    stage?.helix?.dragBy(e.clientX - spin.x);
    spin.x = e.clientX;
  }, { passive: true });
  const spinEnd = () => {
    if (!spin.on) return;
    spin.on = false;
    root.classList.remove('is-dragging');
  };
  addEventListener('pointerup', spinEnd);
  addEventListener('pointercancel', spinEnd);

  addEventListener('pointerdown', (e) => {
    if (app.route?.name !== 'work' || app.busy || app.flipping || e.button > 0) return;
    if (e.target.closest('a, button')) return;
    Object.assign(drag, { on: true, x0: e.clientX, lastX: e.clientX, lastT: performance.now(), dir: 0, p: 0, v: 0, ticks: 0 });
    root.classList.add('is-dragging');
  });

  addEventListener(
    'pointermove',
    (e) => {
      stage?.pointerMove(e.clientX, e.clientY);
      if (!drag.on) return;
      const now = performance.now();
      const dx = e.clientX - drag.x0;
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
      drag.lastX = e.clientX;
      drag.lastT = now;
      const dir = dx < 0 ? 1 : -1;
      if (Math.abs(dx) > 8 && dir !== drag.dir) {
        drag.dir = dir;
        drag.target = neighbor(app.index, dir);
        stage?.scrubStart(drag.target, dir);
      }
      if (drag.dir) {
        drag.p = Math.min(1, Math.abs(dx) / (innerWidth * 0.5));
        stage?.scrubSet(drag.p);
        const t = Math.floor(drag.p * 14);
        if (t !== drag.ticks) {
          drag.ticks = t;
          sound.tick(drag.p);
        }
      }
    },
    { passive: true }
  );

  const end = async () => {
    if (!drag.on) return;
    drag.on = false;
    root.classList.remove('is-dragging');
    if (!drag.dir) return;
    const fling = Math.abs(drag.v) > 0.6 && Math.sign(-drag.v) === drag.dir;
    const commit = drag.p > 0.22 || fling;
    const { target, dir } = drag;
    drag.dir = 0;
    app.flipping = true;
    if (commit) {
      setIndex(target);
      sound.woosh(dir, 0.8);
      sound.louvers(Math.max(0.4, (1 - drag.p) * 1.6), Math.max(4, Math.round(26 * (1 - drag.p))), dir);
      workText(target, dir);
    }
    await (stage ? stage.scrubEnd(commit) : wait(10));
    app.flipping = false;
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);

  addEventListener('keydown', (e) => {
    if (!app.started) return;
    // Escape goes one level up from where the visitor is heading, even mid-transition:
    // case study -> its gallery, everything else -> home
    if (e.key === 'Escape') {
      const cur = parseRoute();
      location.hash = cur.name === 'project' ? GROUPS[groupOf(cur.index)].hash : 'home';
      return;
    }
    if (app.route?.name !== 'work') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter' && (document.activeElement === document.body || document.activeElement === view)) {
      location.hash = projects[app.index].slug;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */
// One clock for everything: GSAP tweens, Lenis scroll, the WebGL frame and UI hooks advance
// in the same tick, so the page and the 3D scene never drift a frame apart.
function setupLoop() {
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, touchMultiplier: 1.3 });
    lenis.stop();
  }
  root.classList.add('is-locked');
  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(0.05, deltaMs / 1000);
    lenis?.raf(time * 1000);
    if (stage) {
      stage.scrollVel = lenis ? lenis.velocity : 0;
      stage.update(dt);
    }
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i](dt);
  });
}

boot();
