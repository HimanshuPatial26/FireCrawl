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
const wrapIndex = (i) => (i + projects.length) % projects.length;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const sound = new Sound();
const view = $('#view');
const live = $('#live');
const frameHooks = [];
let stage = null;
let lenis = null;

const app = { route: null, index: 0, busy: false, queued: false, started: false, flipping: false, pending: null, cleanup: [] };

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
function buildHud() {
  $('#hud').innerHTML = `
    <a class="hud-brand" href="#work" aria-label="${esc(site.name)}, back to work">
      <span class="hud-name">${esc(site.name)}</span>
      <span class="hud-role">${esc(site.role)}</span>
    </a>
    <div class="hud-status">
      <span class="dot" aria-hidden="true"></span><span>${esc(site.availability)}</span>
      <span class="readout" aria-hidden="true"></span>
    </div>
    <nav class="hud-nav" aria-label="Main">
      <a href="#work" data-nav="work">Work</a>
      <a href="#about" data-nav="about">About</a>
      <button class="sound" type="button" aria-pressed="false">
        <canvas width="88" height="32" aria-hidden="true"></canvas><span class="sound-label">Sound off</span>
      </button>
    </nav>`;
}

function setNav(route) {
  const key = route.name === 'about' ? 'about' : 'work';
  $$('[data-nav]').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
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
    ctx.strokeStyle = fg;
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
  const el = $('.readout');
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
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest('.media');
    if (t && !t.contains(e.relatedTarget)) stage?.setMediaHover(t.querySelector('.media-box'), false);
  });
  frameHooks.push(() => {
    cx += (x - cx) * 0.22;
    cy += (y - cy) * 0.22;
    c.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    const onWork = app.route?.name === 'work' && !c.classList.contains('is-link');
    const text = drag.dir ? 'Release' : onWork ? 'Drag' : '';
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
    <div class="pre-head"><span>${esc(site.name)}</span><span>${esc(site.role)}</span></div>
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
  } catch (err) {
    console.warn('WebGL unavailable, running without the 3D stage.', err);
    root.classList.add('no-gl');
  }
  setupLoop();
  setupSoundButton();
  setupReadout();
  setupCursor();
  setupInput();
  root.style.setProperty('--accent', projects[0].colors.a);

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
  gsap.fromTo('.hud > *', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: D(1.2), stagger: 0.08, delay: D(0.6), ease: 'expo.out' });
  app.started = true;
  await wait(reduced ? 0 : 450);
  navigate();
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h || h === 'work') return { name: 'work' };
  if (h === 'about') return { name: 'about' };
  const i = projects.findIndex((p) => p.slug === h);
  if (i >= 0) return { name: 'project', index: i };
  return { name: 'lost' };
}

const sameRoute = (a, b) => a && b && a.name === b.name && a.index === b.index;

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
  if (route.name === 'work') return enterWork(prev);
  if (route.name === 'project') return enterProject(route.index, prev);
  if (route.name === 'about') return enterAbout();
  return enterLost();
}

/* ------------------------------------------------------------------ */
/* Work index                                                          */
/* ------------------------------------------------------------------ */
function renderWork() {
  const items = projects
    .map(
      (p, i) =>
        `<li><button type="button" class="wl-item" data-i="${i}"><span class="wl-n">${pad(i + 1)}</span><span class="wl-t">${esc(p.title)}</span></button></li>`
    )
    .join('');
  const ticks = projects.map((p, i) => `<button type="button" class="ws-tick" data-i="${i}" aria-label="Show ${esc(p.title)}"></button>`).join('');
  view.innerHTML = `
    <section class="work" aria-label="Selected work">
      <h1 class="sr-only">Selected work</h1>
      <ol class="work-list">${items}</ol>
      <div class="work-feature">
        <p class="wf-eyebrow"><span class="wf-client"></span><span class="wf-sep" aria-hidden="true"></span><span class="wf-year"></span></p>
        <h2 class="wf-title"><a class="wf-link" href="#"></a></h2>
        <p class="wf-summary"></p>
        <a class="btn wf-cta" href="#"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Open project</span><span class="btn-arrow" aria-hidden="true">→</span></a>
      </div>
      <div class="work-scrub">
        <p class="ws-count" aria-hidden="true"><span class="ws-cur">${pad(app.index + 1)}</span><span class="ws-tot">/ ${pad(projects.length)}</span></p>
        <div class="ws-track">${ticks}<span class="ws-ind" aria-hidden="true"></span></div>
        <p class="ws-hint">${finePointer ? 'Scroll, drag or use the arrow keys' : 'Swipe to browse'}</p>
      </div>
    </section>`;
  $$('.wl-item, .ws-tick').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.i))));
}

function fillWork(i) {
  const p = projects[i];
  const link = $('.wf-link');
  link.href = `#${p.slug}`;
  $('.wf-cta').href = `#${p.slug}`;
  $('.wf-client').textContent = p.client;
  $('.wf-year').textContent = p.year;
  $('.wf-summary').textContent = p.summary;
  $('.ws-cur').textContent = pad(i + 1);
  $$('.wl-item').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.i) === i)));
  moveIndicator(i, true);
  root.style.setProperty('--accent', p.colors.a);
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
    const chars = splitChars(link, p.title);
    gsap.fromTo(chars, { yPercent: 110 * dir }, { yPercent: 0, duration: D(1.05), ease: 'expo.out', stagger: { each: 0.03, from } });
  });
  link.href = `#${p.slug}`;
  $('.wf-cta').href = `#${p.slug}`;
  scramble($('.wf-client'), p.client, { duration: 0.7 });
  scramble($('.wf-year'), p.year, { duration: 0.5 });
  scramble($('.ws-cur'), pad(i + 1), { duration: 0.45 });
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
  root.style.setProperty('--accent', p.colors.a);
  live.textContent = `${p.title}, project ${i + 1} of ${projects.length}`;
}

async function enterWork(prev) {
  lockScroll();
  renderWork();
  const chars = fillWork(app.index);
  document.title = `${site.name} · ${site.role}`;
  if (stage) {
    stage.heroEl = null;
    if (stage.current !== app.index) stage.setProject(app.index);
    stage.setMode('work', { duration: prev ? 1.8 : 2.8 });
  }
  const tl = gsap.timeline({ delay: D(prev ? 0.55 : 0.9) });
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: D(1.2), stagger: 0.035, ease: 'expo.out' }, 0)
    .fromTo('.wf-eyebrow, .wf-summary, .wf-cta', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D(1), stagger: 0.08, ease: 'expo.out' }, 0.2)
    .fromTo('.wl-item', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: D(0.9), stagger: 0.04, ease: 'expo.out' }, 0.1)
    .fromTo('.work-scrub > *', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D(0.9), stagger: 0.08, ease: 'expo.out' }, 0.3);
  await wait(reduced ? 0 : 300);
}

async function workOut() {
  const chars = $$('.wf-link .sci');
  await Promise.all([
    gsap.to(chars, { yPercent: -110, duration: D(0.45), stagger: 0.015, ease: 'power3.in' }),
    gsap.to('.wf-eyebrow, .wf-summary, .wf-cta, .wl-item, .work-scrub > *', { opacity: 0, y: -8, duration: D(0.4), stagger: 0.015, ease: 'power2.in' }),
  ]);
}

async function goTo(i, dir) {
  if (app.route?.name !== 'work' || app.busy || i === app.index) return;
  if (app.flipping) {
    app.pending = { i, dir };
    return;
  }
  app.flipping = true;
  dir = dir || (i > app.index ? 1 : -1);
  app.index = i;
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

const step = (dir) => goTo(wrapIndex(app.index + dir), dir);

/* ------------------------------------------------------------------ */
/* Project page                                                        */
/* ------------------------------------------------------------------ */
function renderProject(i) {
  const p = projects[i];
  const next = projects[wrapIndex(i + 1)];
  const meta = [['Client', p.client], p.agency ? ['Agency', p.agency] : null, ['Role', p.role], ['Year', p.year]].filter(Boolean);
  const cap = (k) => esc((p.captions && p.captions[k]) || `${p.title}, view ${k + 1}`);
  view.innerHTML = `
    <article class="project">
      <div class="p-hero" aria-hidden="true"></div>
      <header class="p-head">
        <a class="p-back" href="#work"><span aria-hidden="true">←</span> All work</a>
        <p class="p-count">${pad(i + 1)} / ${pad(projects.length)}</p>
        <h1 class="p-title">${esc(p.title)}</h1>
        <p class="p-summary">${esc(p.summary)}</p>
        <dl class="p-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${
          p.url
            ? `<a class="btn p-live" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Visit the live site</span><span class="btn-arrow" aria-hidden="true">↗</span></a>`
            : ''
        }
      </header>
      <section class="p-body" aria-label="Project details">
        <p class="p-para">${esc(p.body[0])}</p>
        <figure class="media m-wide"><div class="media-box" data-variant="0"></div><figcaption><span>01</span>${cap(0)}</figcaption></figure>
        <p class="p-para p-para--right">${esc(p.body[1] || '')}</p>
        <figure class="media m-right"><div class="media-box" data-variant="1"></div><figcaption><span>02</span>${cap(1)}</figcaption></figure>
        <figure class="media m-left"><div class="media-box" data-variant="2"></div><figcaption><span>03</span>${cap(2)}</figcaption></figure>
      </section>
      <a class="p-next" href="#${next.slug}" aria-label="Next project: ${esc(next.title)}">
        <span class="pn-label">Next project</span>
        <span class="pn-media" aria-hidden="true"><span class="media-box" data-next></span></span>
        <span class="pn-title" aria-hidden="true">${esc(next.title)}</span>
        <span class="pn-bar" aria-hidden="true"><span class="pn-fill"></span></span>
        <span class="pn-hint" aria-hidden="true">Keep scrolling or select to continue</span>
      </a>
    </article>`;
}

async function enterProject(i, prev) {
  const fromProject = prev?.name === 'project';
  const p = projects[i];
  app.index = i;
  root.style.setProperty('--accent', p.colors.a);
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
    items.push({ el: $('.pn-media .media-box'), index: wrapIndex(i + 1), variant: 0, kind: 'next' });
    stage.setMedia(items);
  }

  const title = $('.p-title');
  const chars = splitChars(title);
  const sumWords = splitWords($('.p-summary'));
  const tl = gsap.timeline({ delay: D(fromProject ? 0.4 : 0.9) });
  tl.fromTo(chars, { yPercent: 110 }, { yPercent: 0, duration: D(1.3), stagger: 0.04, ease: 'expo.out' }, 0)
    .fromTo(sumWords, { yPercent: 100 }, { yPercent: 0, duration: D(1), stagger: 0.012, ease: 'expo.out' }, 0.15)
    .fromTo('.p-back, .p-count, .p-meta > div, .p-live', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: D(0.9), stagger: 0.06, ease: 'expo.out' }, 0.25);

  setupProjectScroll(i);
  await wait(reduced ? 0 : 400);
}

function setupProjectScroll(i) {
  const next = projects[wrapIndex(i + 1)];
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
  $$('.p-para, .media figcaption, .pn-label').forEach((el) => {
    if (!reduced) el.style.opacity = '0';
    io.observe(el);
  });

  const hook = () => {
    if (fired || !footer.isConnected) return;
    const b = footer.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight - b.top) / b.height));
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
  view.innerHTML = `
    <article class="about">
      <p class="a-eyebrow">About</p>
      <h1 class="a-lede">${esc(site.intro)}</h1>
      <div class="a-grid">
        <section class="a-col a-bio"><h2>Profile</h2>${site.about.map((t) => `<p>${esc(t)}</p>`).join('')}</section>
        <section class="a-col"><h2>Services</h2><ul>${site.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
        <section class="a-col"><h2>Toolkit</h2><ul>${site.toolkit.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
        <section class="a-col a-contact">
          <h2>Contact</h2>
          <p class="a-email"><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
          <button type="button" class="btn a-copy"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Copy email</span></button>
          <ul class="a-social">${site.socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
        </section>
      </div>
      <p class="a-note">The particle field reacts to your cursor${sound.enabled ? ' and to the soundtrack' : ''}.</p>
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
    .fromTo('.a-col, .a-note', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: D(1.1), stagger: 0.08, ease: 'expo.out' }, 0.4);
  await wait(reduced ? 0 : 300);
}

async function enterLost() {
  view.innerHTML = `
    <section class="lost">
      <p class="lost-code">404</p>
      <h1>Nothing at this address</h1>
      <p>The link may be mistyped, or the project has moved.</p>
      <a class="btn" href="#work"><span class="btn-fill" aria-hidden="true"></span><span class="btn-text">Back to the work</span></a>
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

function setupInput() {
  let wheelT = 0;
  addEventListener(
    'wheel',
    (e) => {
      if (app.route?.name !== 'work' || app.busy) return;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const now = performance.now();
      if (Math.abs(d) < 8 || now - wheelT < 900 || app.flipping) return;
      wheelT = now;
      step(Math.sign(d));
    },
    { passive: true }
  );

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
        drag.target = wrapIndex(app.index + dir);
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
      app.index = target;
      sound.woosh(dir, 0.8);
      workText(target, dir);
    }
    await (stage ? stage.scrubEnd(commit) : wait(10));
    app.flipping = false;
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);

  addEventListener('keydown', (e) => {
    if (!app.started) return;
    const r = app.route?.name;
    if (r === 'work') {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Enter' && (document.activeElement === document.body || document.activeElement === view)) {
        location.hash = projects[app.index].slug;
      }
    } else if (e.key === 'Escape') {
      location.hash = 'work';
    }
  });
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */
function setupLoop() {
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
    lenis.stop();
  }
  root.classList.add('is-locked');
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    lenis?.raf(now);
    if (stage) {
      stage.scrollVel = lenis ? lenis.velocity : 0;
      stage.update(dt);
    }
    for (const f of frameHooks.slice()) f(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
