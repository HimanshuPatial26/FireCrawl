import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Fluid } from './fluid.js';
import * as S from './shaders.js';
import { PORTRAIT } from './portrait-data.js';

// Louver wall size in world units (16:9)
const W = 9.6;
const H = 5.4;
const DEPTH = 0.08;

const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Scene states. Every value is tweened, so any state can blend into any other.
const MODES = {
  // home: the louver wall closes away and the glass helix in its light studio takes its place
  home: { home: 1, hero: 0, about: 0, dim: 0.08, open: 0, arc: 0.9, gap: 0.24, mouseAmt: 0, glow: 0.16, orb: 0 },
  work: { home: 0, hero: 0, about: 0, dim: 0, open: 1, arc: 1, gap: 0.24, mouseAmt: 1, glow: 1, orb: 0 },
  project: { home: 0, hero: 1, about: 0, dim: 0.78, open: 1, arc: 0, gap: 0.035, mouseAmt: 0, glow: 0.5, orb: 0 },
  about: { home: 0, hero: 0, about: 1, dim: 0.45, open: 0, arc: 0.55, gap: 0.3, mouseAmt: 0, glow: 0.45, orb: 1 },
  lost: { home: 0, hero: 0, about: 1, dim: 0.58, open: 0, arc: 0.3, gap: 0.4, mouseAmt: 0, glow: 0.35, orb: 0 },
};

export class Stage {
  constructor(canvas, projects, { reduced = false, mobile = false } = {}) {
    this.projects = projects;
    this.reduced = reduced;
    this.mobile = mobile;

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    if (!r.capabilities.isWebGL2) throw new Error('WebGL2 is not available');
    // Resolution starts inside a pixel budget; adapt() then moves it up or down with the frame rate.
    this.maxDpr = 2;
    this.minDpr = mobile ? 0.6 : 0.75;
    const native = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const fit = Math.sqrt((mobile ? 1.6e6 : 5.2e6) / (innerWidth * innerHeight));
    this.dpr = Math.max(this.minDpr, Math.min(native, Math.floor(fit * 8) / 8));
    this.dprCeil = native;
    this.vsync = 1 / 60;
    this.calm = 0;
    r.setPixelRatio(this.dpr);
    r.setSize(innerWidth, innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // tone mapping and sRGB are applied in the final pass
    r.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 120);
    this.camera.position.set(0, 0, 16);
    this.scene = new THREE.Scene();
    this.overlay = new THREE.Scene();
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

    this.colors = { bg: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color() };
    this.state = { home: 0, hero: 0, about: 0, dim: 0, fade: 1, open: 0, arc: 1, gap: 0.24, mouseAmt: 1, glow: 1, orb: 0, fluid: reduced ? 0 : 1, camZ: 16 };
    this.trans = { flip: 0, cross: 0, dir: 1, active: false, target: -1 };
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0, px: 0, py: 0, has: false };
    this.N = mobile ? 28 : 46;
    this.time = 0;
    this.level = 0;
    this.scrollVel = 0;
    this.heroEl = null;
    this.heroRect = null;
    this.media = [];
    this.frameTimes = [];
    this.frame = 0;
    this.ripple = 0;
    this.kick = 0;
    this.fluidIdle = 0;
    this.lastArtAspect = 0;
    this.tracked = new Map();
    this.mediaPool = [];
    this.needsMeasure = true;
    this.adaptive = false;
    this.texCache = new Map();

    this.current = 0;
    this.slotA = this.makeSlot(0);
    this.slotB = this.makeSlot(Math.min(1, projects.length - 1));

    this.initArt();
    this.initSlats();
    this.initSky();
    this.initFloor();
    this.initDust();
    this.initOrb();
    this.helix = null; // loaded in prepare() so its renders stay out of the first script download
    // Home helix placement (desktop / phone): size at its centre (fraction of the view height), lean on screen,
    // tilt towards the camera, centre position (fractions of the view), lens blur strength
    this.helixPose = mobile
      ? { size: 0.2, lean: -0.95, tilt: 0.7, x: 0.16, y: 0.335, blur: 0.04, focus: -0.2 }
      : { size: 0.42, lean: -0.48, tilt: 0.7, x: 0.27, y: 0, blur: 0.045, focus: -0.2 };
    this.initPost();
    this.fluid = new Fluid(r, { res: mobile ? 96 : 128, aspect: innerWidth / innerHeight });

    this.setColorsFrom(this.slotA);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => (this.needsMeasure = true)).observe(document.body);
  }

  /* ---------------------------------------------------------------- */
  /* Project artwork                                                   */
  /* ---------------------------------------------------------------- */
  makeSlot(i, variant = 0, media = null) {
    const p = this.projects[i];
    return {
      index: i,
      style: p.style,
      seed: p.seed + variant * 0.237,
      zoom: 1 + variant * 0.22,
      bg: new THREE.Color(p.colors.bg),
      a: new THREE.Color(p.colors.a),
      b: new THREE.Color(p.colors.b),
      tex: this.mediaTexture(media || p.cover),
    };
  }

  mediaTexture(m) {
    if (!m || !m.src) return null;
    if (this.texCache.has(m.src)) return this.texCache.get(m.src);
    const entry = { texture: null, aspect: m.aspect || 1.6, ready: false };
    if (m.type === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: m.src, muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: 'anonymous' });
      v.addEventListener('loadeddata', () => {
        entry.aspect = v.videoWidth / v.videoHeight || entry.aspect;
        entry.ready = true;
      });
      v.play().catch(() => {});
      entry.texture = new THREE.VideoTexture(v);
    } else {
      entry.texture = new THREE.TextureLoader().load(m.src, (t) => {
        entry.aspect = t.image.width / t.image.height || entry.aspect;
        entry.ready = true;
      });
    }
    entry.texture.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(m.src, entry);
    return entry;
  }

  makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
  }

  initArt() {
    const [w, h] = this.mobile ? [960, 540] : [1280, 720];
    this.rtA = this.makeRT(w, h);
    this.rtB = this.makeRT(w, h);
    this.artMat = new THREE.ShaderMaterial({
      vertexShader: S.QUAD_VERT,
      fragmentShader: S.ART_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uStyle: { value: 0 },
        uSeed: { value: 0 },
        uAspect: { value: 16 / 9 },
        uZoom: { value: 1 },
        uOffset: { value: new THREE.Vector2() },
        uBg: { value: new THREE.Color() },
        uA: { value: new THREE.Color() },
        uB: { value: new THREE.Color() },
        uTex: { value: null },
        uUseTex: { value: 0 },
        uTexAspect: { value: 1 },
      },
    });
    this.artScene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.artMat);
    q.frustumCulled = false;
    this.artScene.add(q);
    this.artCam = new THREE.Camera();
  }

  renderArt(slot, rt, aspect, offset) {
    const u = this.artMat.uniforms;
    u.uTime.value = this.time + slot.seed * 40;
    u.uStyle.value = slot.style;
    u.uSeed.value = slot.seed;
    u.uAspect.value = aspect;
    u.uZoom.value = slot.zoom;
    u.uOffset.value.set(offset ? offset.x : 0, offset ? offset.y : 0);
    u.uBg.value.copy(slot.bg);
    u.uA.value.copy(slot.a);
    u.uB.value.copy(slot.b);
    const t = slot.tex;
    u.uUseTex.value = t && t.ready ? 1 : 0;
    u.uTex.value = t ? t.texture : null;
    u.uTexAspect.value = t ? t.aspect : 1;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.artScene, this.artCam);
  }

  /* ---------------------------------------------------------------- */
  /* Scene objects                                                     */
  /* ---------------------------------------------------------------- */
  initSlats() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const idx = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) idx[i] = i;
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(idx, 1));
    this.slatMat = new THREE.ShaderMaterial({
      vertexShader: S.SLAT_VERT,
      fragmentShader: S.SLAT_FRAG,
      uniforms: {
        uTexA: { value: this.rtA.texture },
        uTexB: { value: this.rtB.texture },
        uCount: { value: this.N },
        uWidth: { value: W },
        uHeight: { value: H },
        uDepth: { value: DEPTH },
        uGap: { value: 0.24 },
        uArc: { value: 1 },
        uSpan: { value: 1.15 },
        uFlip: { value: 0 },
        uDir: { value: 1 },
        uSpread: { value: 1.6 },
        uOpen: { value: 0 },
        uTime: { value: 0 },
        uMouseX: { value: 0 },
        uMouseAmt: { value: 0 },
        uLift: { value: 0.55 },
        uCross: { value: 0 },
        uUvShift: { value: new THREE.Vector2() },
        uRipple: { value: 0 },
        uBg: { value: this.colors.bg },
        uA: { value: this.colors.a },
        uDim: { value: 0 },
      },
    });
    this.slats = new THREE.InstancedMesh(geo, this.slatMat, this.N);
    this.slats.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.slats);
    this.scene.add(this.group);
  }

  initSky() {
    const m = new THREE.ShaderMaterial({
      vertexShader: S.SKY_VERT,
      fragmentShader: S.SKY_FRAG,
      uniforms: {
        uBg: { value: this.colors.bg },
        uA: { value: this.colors.a },
        uB: { value: this.colors.b },
        uTime: { value: 0 },
        uDim: { value: 0 },
        uGlow: { value: 1 },
        uGlowC: { value: new THREE.Vector2() },
        uGlowR: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), m);
    this.sky.position.z = -6;
    this.scene.add(this.sky);
  }

  reflectSize() {
    return { w: Math.max(2, Math.round(innerWidth * this.dpr * 0.5)), h: Math.max(2, Math.round(innerHeight * this.dpr * 0.5)) };
  }

  initFloor() {
    const s = this.reflectSize();
    // floor runs from the backdrop (z = -6) to behind the camera
    this.floor = new Reflector(new THREE.PlaneGeometry(70, 22), {
      textureWidth: s.w,
      textureHeight: s.h,
      clipBias: 0.003,
      multisample: 0,
      shader: S.FloorShader,
    });
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, -2.8, 5);
    const u = this.floor.material.uniforms;
    u.uBg.value = this.colors.bg;
    u.uA.value = this.colors.a;
    this.scene.add(this.floor);
    // reflections refresh at half rate and pause while the floor is hidden behind page content
    const reflect = this.floor.onBeforeRender;
    this.reflectNow = true;
    this.floor.onBeforeRender = (...args) => {
      if (this.reflectNow) reflect.apply(this.floor, args);
    };
  }

  initDust() {
    const n = this.mobile ? 320 : 700;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = (Math.random() - 0.4) * 9;
      pos[i * 3 + 2] = -5 + Math.random() * 13;
      rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.dust = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: S.DUST_VERT,
        fragmentShader: S.DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uA: { value: this.colors.a }, uDim: { value: 0 } },
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // The About page portrait: particles sampled from the headshot, with depth for parallax.
  initOrb() {
    const PH = 3.4; // portrait height in world units before scaling
    const raw = Uint8Array.from(atob(PORTRAIT.data), (c) => c.charCodeAt(0));
    const n = this.mobile ? Math.min(8000, PORTRAIT.count) : PORTRAIT.count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const jx = (Math.random() - 0.5) / 255;
      const jy = (Math.random() - 0.5) / 255;
      pos[i * 3] = (raw[o] / 255 - 0.5 + jx) * PORTRAIT.aspect * PH;
      pos[i * 3 + 1] = (0.5 - raw[o + 1] / 255 + jy) * PH;
      pos[i * 3 + 2] = (raw[o + 2] / 255 - 0.5) * 0.9;
      col[i * 3] = raw[o + 3] / 255;
      col[i * 3 + 1] = raw[o + 4] / 255;
      col[i * 3 + 2] = raw[o + 5] / 255;
      rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.portraitH = PH;
    this.orb = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: S.PORTRAIT_VERT,
        fragmentShader: S.PORTRAIT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uShow: { value: 0 },
          uLevel: { value: 0 },
          uPR: { value: 1 },
          uAspect: { value: 1 },
          uMouse: { value: new THREE.Vector2(9, 9) },
          uA: { value: this.colors.a },
          uScanH: { value: PH },
        },
      })
    );
    this.orb.frustumCulled = false;
    this.orb.visible = false;
    this.scene.add(this.orb);
  }

  initPost() {
    const c = (this.composer = new EffectComposer(this.renderer));
    c.addPass(new RenderPass(this.scene, this.camera));
    const ov = new RenderPass(this.overlay, this.ortho);
    ov.clear = false;
    ov.clearDepth = true;
    c.addPass(ov);
    this.distort = new ShaderPass(S.DistortShader);
    c.addPass(this.distort);
    this.bloomBase = this.mobile ? 0.6 : 0.7;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), this.bloomBase, 0.6, 0.78);
    c.addPass(this.bloom);
    // tone mapping, sRGB, vignette, grain and fades in a single full-screen pass
    this.finalPass = new ShaderPass(S.FinalShader);
    this.finalPass.material.toneMapped = false;
    c.addPass(this.finalPass);
  }

  /* ---------------------------------------------------------------- */
  /* Transitions                                                       */
  /* ---------------------------------------------------------------- */
  setColorsFrom(slot) {
    this.colors.bg.copy(slot.bg);
    this.colors.a.copy(slot.a);
    this.colors.b.copy(slot.b);
  }

  setMode(name, { duration = 1.8, delay = 0 } = {}) {
    const t = MODES[name];
    gsap.killTweensOf(this.state, Object.keys(t).join(','));
    return new Promise((res) =>
      gsap.to(this.state, { ...t, duration: this.reduced ? 0.01 : duration, delay, ease: 'expo.inOut', onComplete: res })
    );
  }

  intro() {
    this.adaptive = true;
    gsap.to(this.state, { fade: 0, duration: this.reduced ? 0.3 : 2.2, ease: 'power2.inOut' });
    gsap.fromTo(this.state, { camZ: 16 }, { camZ: 12, duration: this.reduced ? 0.01 : 3.4, ease: 'expo.out' });
  }

  fadeTo(v, duration = 0.4) {
    return new Promise((res) => gsap.to(this.state, { fade: v, duration: this.reduced ? 0.01 : duration, ease: 'power2.inOut', onComplete: res }));
  }

  prepB(i) {
    this.slotB = this.makeSlot(i);
    this.trans.target = i;
    this.renderArt(this.slotB, this.rtB, this.lastArtAspect || 16 / 9);
    this.renderer.setRenderTarget(null);
  }

  commit() {
    const tr = this.trans;
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
    this.slotA = this.slotB;
    this.current = tr.target;
    tr.flip = 0;
    tr.cross = 0;
    tr.active = false;
    const u = this.slatMat.uniforms;
    u.uTexA.value = this.rtA.texture;
    u.uTexB.value = this.rtB.texture;
    this.setColorsFrom(this.slotA);
  }

  cancel() {
    Object.assign(this.trans, { flip: 0, cross: 0, active: false });
    this.setColorsFrom(this.slotA);
  }

  settle() {
    const tr = this.trans;
    if (!tr.active) return;
    gsap.killTweensOf(tr);
    if (tr.flip >= 0.5 || tr.cross >= 0.5) this.commit();
    else this.cancel();
  }

  tweenTrans(vars, duration, ease = 'none') {
    return new Promise((res) =>
      gsap.to(this.trans, {
        ...vars,
        duration,
        ease,
        onComplete: () => {
          this.commit();
          res();
        },
      })
    );
  }

  flipTo(i, dir = 1, { duration = 1.8 } = {}) {
    this.settle();
    if (i === this.current) return Promise.resolve();
    this.prepB(i);
    Object.assign(this.trans, { active: true, flip: 0, cross: 0, dir });
    if (this.reduced) return this.tweenTrans({ cross: 1 }, 0.5, 'power2.inOut');
    return this.tweenTrans({ flip: 1 }, duration, 'power1.inOut');
  }

  crossTo(i, duration = 0.9) {
    this.settle();
    if (i === this.current) return Promise.resolve();
    this.prepB(i);
    Object.assign(this.trans, { active: true, flip: 0, cross: 0, dir: 1 });
    return this.tweenTrans({ cross: 1 }, this.reduced ? 0.01 : duration, 'power2.inOut');
  }

  setProject(i) {
    this.settle();
    if (i === this.current) return;
    this.slotA = this.makeSlot(i);
    this.current = i;
    this.setColorsFrom(this.slotA);
  }

  scrubStart(i, dir) {
    gsap.killTweensOf(this.trans);
    if (this.trans.active && this.trans.target !== i) this.cancel();
    if (i === this.current) return;
    this.prepB(i);
    Object.assign(this.trans, { active: true, flip: 0, cross: 0, dir });
  }

  scrubSet(p) {
    if (!this.trans.active) return;
    this.trans[this.reduced ? 'cross' : 'flip'] = p;
  }

  scrubEnd(commit) {
    const tr = this.trans;
    if (!tr.active) return Promise.resolve();
    const key = this.reduced ? 'cross' : 'flip';
    const to = commit ? 1 : 0;
    const d = Math.max(0.35, Math.abs(to - tr[key]) * 1.7);
    return new Promise((res) =>
      gsap.to(tr, {
        [key]: to,
        duration: d,
        ease: 'power2.out',
        onComplete: () => {
          if (commit) this.commit();
          else this.cancel();
          res();
        },
      })
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOM-synced media planes                                           */
  /* ---------------------------------------------------------------- */
  setMedia(items) {
    this.clearMedia();
    const [w, h] = this.mobile ? [640, 400] : [896, 560];
    for (const it of items) {
      const p = this.projects[it.index];
      // variant 0 is the cover; chapter illustrations are variants 1..n and map to media[0..n-1]
      const slot = this.makeSlot(it.index, it.variant, it.variant > 0 && p.media ? p.media[it.variant - 1] : null);
      const rt = this.mediaPool.pop() || this.makeRT(w, h);
      const mat = new THREE.ShaderMaterial({
        vertexShader: S.MEDIA_VERT,
        fragmentShader: S.MEDIA_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTex: { value: rt.texture },
          uReveal: { value: this.reduced ? 1 : 0 },
          uVel: { value: 0 },
          uA: { value: slot.a },
          uSeed: { value: slot.seed },
          uHover: { value: 0 },
          uPar: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 24), mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.overlay.add(mesh);
      this.media.push({ el: it.el, kind: it.kind || 'media', slot, rt, mesh, mat, revealed: this.reduced, seen: false });
    }
  }

  setMediaHover(el, on) {
    const m = this.media.find((x) => x.el === el);
    if (m) gsap.to(m.mat.uniforms.uHover, { value: on ? 1 : 0, duration: 0.9, ease: 'expo.out' });
  }

  setNextProgress(p) {
    const m = this.media.find((x) => x.kind === 'next');
    if (m) m.mat.uniforms.uReveal.value = p;
  }

  clearMedia() {
    for (const m of this.media) {
      this.overlay.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mat.dispose();
      this.mediaPool.push(m.rt);
      this.tracked.delete(m.el);
    }
    this.media = [];
  }

  updateMedia(dt) {
    const vel = Math.max(-1, Math.min(1, this.scrollVel * 0.02));
    const k = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < this.media.length; i++) {
      const m = this.media[i];
      if (!m.el.isConnected) {
        m.mesh.visible = false;
        continue;
      }
      const b = this.rect(m.el);
      const vis = b.w > 0 && b.t + b.h > -40 && b.t < innerHeight + 40;
      m.mesh.visible = vis;
      if (!vis) continue;
      m.mesh.position.set(b.l + b.w / 2 - innerWidth / 2, -(b.t + b.h / 2 - innerHeight / 2), 0);
      m.mesh.scale.set(b.w, b.h, 1);
      const u = m.mat.uniforms;
      u.uVel.value += (-vel * 0.06 - u.uVel.value) * k;
      u.uPar.value = Math.max(-1, Math.min(1, (b.t + b.h / 2 - innerHeight / 2) / innerHeight));
      // the artwork moves slowly, so planes refresh at half rate, staggered so only one renders per frame
      if (!m.seen || (this.frame + i) % 2 === 0) {
        this.renderArt(m.slot, m.rt, b.w / b.h);
        m.seen = true;
      }
      if (!m.revealed && m.kind !== 'next' && b.t < innerHeight * 0.88) {
        m.revealed = true;
        gsap.to(u.uReveal, { value: 1, duration: 1.8, ease: 'power3.inOut' });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Cached DOM geometry: measured on layout changes, offset by scrollY */
  /* each frame, so syncing WebGL to the page never forces a layout.    */
  /* ---------------------------------------------------------------- */
  measureEl(el, t) {
    const b = el.getBoundingClientRect();
    t.l = b.left;
    t.top = b.top + window.scrollY;
    t.w = b.width;
    t.h = b.height;
  }

  measureAll() {
    for (const [el, t] of this.tracked) {
      if (el.isConnected) this.measureEl(el, t);
      else this.tracked.delete(el);
    }
  }

  rect(el) {
    let t = this.tracked.get(el);
    if (!t) {
      t = {};
      this.measureEl(el, t);
      this.tracked.set(el, t);
    }
    return { l: t.l, t: t.top - window.scrollY, w: t.w, h: t.h };
  }

  /* ---------------------------------------------------------------- */
  /* Input / sizing / frame                                            */
  /* ---------------------------------------------------------------- */
  pointerMove(x, y) {
    const p = this.pointer;
    if (p.has && this.state.fluid > 0.01) {
      const dx = (x - p.px) / innerWidth;
      const dy = -(y - p.py) / innerHeight;
      if (dx || dy) {
        const f = 3800 * this.state.fluid;
        this.fluid.splat(x / innerWidth, 1 - y / innerHeight, dx * f, dy * f);
      }
    }
    p.px = x;
    p.py = y;
    p.x = (x / innerWidth) * 2 - 1;
    p.y = -((y / innerHeight) * 2 - 1);
    p.has = true;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const r = this.renderer;
    r.setPixelRatio(this.dpr);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    Object.assign(this.ortho, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    this.ortho.updateProjectionMatrix();
    const rs = this.reflectSize();
    this.floor.getRenderTarget().setSize(rs.w, rs.h);
    this.fluid.resize(w / h);
    this.finalPass.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    this.dust.material.uniforms.uPR.value = this.dpr;
    this.orb.material.uniforms.uPR.value = this.dpr;
    this.orb.material.uniforms.uAspect.value = w / h;
    this.needsMeasure = true;
  }

  // Dynamic resolution: drop when frames are missed, creep back up after sustained headroom.
  // Each downgrade lowers the ceiling a little so the scale settles instead of oscillating.
  adapt(dt) {
    if (!this.adaptive || this.bench || document.hidden) return;
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length < 90) return;
    const sorted = ft.slice().sort((a, b) => a - b);
    ft.length = 0;
    const med = sorted[45];
    this.vsync = Math.min(this.vsync, Math.max(1 / 165, sorted[6]));
    const slow = med > Math.max(this.vsync * 1.3, 1 / 55);
    const fast = med < this.vsync * 1.1;
    if (slow && this.dpr > this.minDpr) {
      this.dpr = Math.max(this.minDpr, this.dpr - 0.25);
      this.dprCeil = Math.max(this.minDpr, Math.min(this.dprCeil, this.dpr + 0.125));
      this.calm = 0;
      this.resize();
    } else if (fast && this.dpr < this.dprCeil) {
      if (++this.calm >= 3) {
        this.dpr = Math.min(this.dprCeil, this.dpr + 0.125);
        this.calm = 0;
        this.resize();
      }
    } else this.calm = 0;
  }

  // Compile every program during the preloader so no page pays a first-use shader stall.
  async loadHelix() {
    if (this.helix) return;
    try {
      const { Helix } = await import('./helix.js');
      this.helix = await Helix.create(this.renderer, { mobile: this.mobile, reduced: this.reduced });
      this.scene.add(this.helix.group, this.helix.backdrop);
    } catch (err) {
      console.warn('Helix could not be loaded; Home shows the scene without it.', err);
    }
  }

  async prepare() {
    await this.loadHelix();
    this.update(1 / 60);
    const warm = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: S.MEDIA_VERT,
        fragmentShader: S.MEDIA_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTex: { value: this.rtA.texture },
          uReveal: { value: 1 },
          uVel: { value: 0 },
          uA: { value: this.colors.a },
          uSeed: { value: 0 },
          uHover: { value: 0 },
          uPar: { value: 0 },
        },
      })
    );
    this.overlay.add(warm);
    this.orb.visible = true;
    if (this.helix) this.helix.group.visible = true;
    const r = this.renderer;
    const compile = (scene, cam) => (r.compileAsync ? r.compileAsync(scene, cam) : Promise.resolve(r.compile(scene, cam)));
    return Promise.all([compile(this.scene, this.camera), compile(this.overlay, this.ortho)])
      .catch(() => {})
      .then(() => {
        this.state.orb = 0.0011; // render the orb, helix and media programs once while the screen is still black
        this.state.home = 0.02;
        this.update(1 / 60);
        this.state.orb = 0;
        this.state.home = 0;
        this.overlay.remove(warm);
        warm.geometry.dispose();
        warm.material.dispose();
        return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      });
  }

  update(dt) {
    const t0 = this.bench ? performance.now() : 0;
    const st = this.state;
    const tr = this.trans;
    const r = this.renderer;
    r.info.reset();
    this.time += dt;
    this.frame++;
    this.adapt(dt);
    if (this.needsMeasure) {
      this.needsMeasure = false;
      this.measureAll();
    }

    const p = this.pointer;
    const k = 1 - Math.exp(-dt * 5);
    p.sx += (p.x - p.sx) * k;
    p.sy += (p.y - p.sy) * k;

    if (tr.active) {
      const t = Math.max(easeIO(Math.min(1, tr.flip)), tr.cross);
      this.colors.bg.lerpColors(this.slotA.bg, this.slotB.bg, t);
      this.colors.a.lerpColors(this.slotA.a, this.slotB.a, t);
      this.colors.b.lerpColors(this.slotA.b, this.slotB.b, t);
    }

    // layout: blend between work / hero / about placements
    const cam = this.camera;
    const visH = 2 * st.camZ * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const visW = visH * cam.aspect;
    const upp = visH / innerHeight;
    const ws = Math.min((visH * 0.6) / H, (visW * (this.mobile ? 0.94 : 0.68)) / W);
    // on desktop the wall sits slightly right so the project list on the left stays clear
    const work = { x: this.mobile ? 0 : visW * 0.055, y: visH * (this.mobile ? 0.1 : 0.07), z: 0, sx: ws, sy: ws };
    if (this.heroEl && this.heroEl.isConnected) this.heroRect = this.rect(this.heroEl);
    let hero = work;
    if (this.heroRect) {
      const b = this.heroRect;
      hero = {
        x: (b.l + b.w / 2 - innerWidth / 2) * upp,
        y: -(b.t + b.h / 2 - innerHeight / 2) * upp,
        z: 0,
        sx: (b.w * upp) / W,
        sy: (b.h * upp) / H,
      };
    }
    const about = this.mobile
      ? { x: 0, y: visH * 0.18, z: -4, sx: ws * 1.1, sy: ws * 1.1 }
      : { x: -visW * 0.08, y: visH * 0.05, z: -4.5, sx: ws * 1.25, sy: ws * 1.25 };
    const home = this.mobile
      ? { x: 0, y: visH * 0.2, z: -1.5, sx: ws * 0.85, sy: ws * 0.85 }
      : { x: visW * 0.25, y: visH * 0.03, z: -1.2, sx: ws * 0.9, sy: ws * 0.9 };
    const blend = (key) => lerp(lerp(lerp(work[key], hero[key], st.hero), about[key], st.about), home[key], st.home);
    const g = this.group;
    g.position.set(blend('x'), blend('y'), blend('z'));
    g.scale.set(blend('sx'), blend('sy'), 1);
    const artAspect = (W * g.scale.x) / (H * g.scale.y);

    // camera: pointer parallax plus a small push in the direction of a flip
    const par = (1 - st.hero) * (this.reduced ? 0 : 1);
    const kickTarget = tr.active && !this.reduced ? Math.sin(Math.PI * Math.min(1, tr.flip)) * tr.dir : 0;
    this.kick += (kickTarget - this.kick) * (1 - Math.exp(-dt * 5));
    cam.position.set((p.sx * 0.5 + this.kick * 0.4) * par, p.sy * 0.28 * par, st.camZ + Math.abs(this.kick) * 0.5 * par);
    cam.lookAt(this.kick * 0.12 * par, 0, 0);

    this.floor.position.y = work.y - (H * ws) / 2 - 0.25;

    // hero louvers ripple with scroll speed
    const rippleTarget = this.reduced ? 0 : Math.max(-0.35, Math.min(0.35, this.scrollVel * 0.01)) * st.hero;
    this.ripple += (rippleTarget - this.ripple) * (1 - Math.exp(-dt * 6));

    const u = this.slatMat.uniforms;
    u.uTime.value = this.time;
    u.uFlip.value = tr.flip;
    u.uDir.value = tr.dir;
    u.uCross.value = tr.cross;
    u.uOpen.value = st.open;
    u.uArc.value = st.arc;
    u.uGap.value = st.gap;
    u.uDim.value = Math.max(st.dim * (1 - st.hero), st.home);
    u.uMouseX.value = ((p.sx * visW) / 2 - g.position.x) / g.scale.x;
    u.uMouseAmt.value = st.mouseAmt * (p.has ? 1 : 0) * (this.reduced ? 0 : 1);
    u.uRipple.value = this.ripple;
    u.uUvShift.value.set(-p.sx * 0.012 * (1 - st.hero), -p.sy * 0.01 * (1 - st.hero));

    const depth = st.camZ - g.position.z;
    const skyDist = st.camZ + 6;
    const su = this.sky.material.uniforms;
    su.uTime.value = this.time;
    su.uDim.value = st.dim;
    su.uGlow.value = st.glow;
    const proj = skyDist / depth;
    su.uGlowC.value.set(g.position.x * proj, g.position.y * proj);
    su.uGlowR.value.set(Math.max(0.5, W * g.scale.x * 0.5 * proj), Math.max(0.5, H * g.scale.y * 0.5 * proj));

    // skip work nobody can see: an off-screen hero, and reflections under a black floor
    const heroHidden = st.hero > 0.999 && !tr.active && !!this.heroRect && this.heroRect.t + this.heroRect.h < -24;
    const slatsGone = st.home > 0.985;
    this.slats.visible = !heroHidden && !slatsGone;
    // once the light studio backdrop covers the screen, the dark sky, floor and dust behind it are skipped
    const studioOnly = !!this.helix && st.home > 0.985;
    this.sky.visible = !studioOnly;
    this.floor.visible = !studioOnly;
    this.dust.visible = !studioOnly;
    // on phones the floor sits behind the hero text, so its reflection stays faint there
    const floorDim = Math.max(st.dim, st.hero * 0.92, st.about * 0.7, this.mobile ? st.home * 0.95 : 0);
    const fu = this.floor.material.uniforms;
    fu.uTime.value = this.time;
    fu.uDim.value = floorDim;
    // reflections on odd frames, artwork on even frames, so the load is spread evenly
    this.reflectNow = this.frame % 2 === 1 && !(heroHidden && floorDim > 0.9);
    this.dust.material.uniforms.uTime.value = this.time;
    this.dust.material.uniforms.uDim.value = st.dim;

    const ou = this.orb.material.uniforms;
    this.orb.visible = st.orb > 0.001;
    ou.uTime.value = this.time;
    ou.uShow.value = st.orb;
    ou.uLevel.value += (this.level - ou.uLevel.value) * (1 - Math.exp(-dt * 12));
    ou.uMouse.value.set(p.has ? p.sx : 9, p.has ? p.sy : 9);
    // portrait: right of the text on desktop, above it on phones; it turns gently towards the pointer
    const ph = this.mobile ? visH * 0.36 : Math.min(visH * 0.7, visW * 0.42);
    this.orb.scale.setScalar(ph / this.portraitH);
    if (this.mobile) this.orb.position.set(0, visH * 0.24, 0);
    else this.orb.position.set(visW * 0.265, -visH * 0.02, 0);
    this.orb.rotation.y = p.sx * 0.28;
    this.orb.rotation.x = -p.sy * 0.12;

    // mercury helix (Home hero) in its light studio: on the right of the text (top band on phones), running
    // diagonally and leaning towards the camera, so the far end recedes and the near end comes out at the viewer
    const hx = this.helix;
    if (hx) {
      hx.group.visible = st.home > 0.01;
      hx.backdrop.visible = st.home > 0.002;
    }
    if (hx && hx.group.visible) {
      const k = st.home;
      const pose = this.helixPose;
      const diameter = visH * pose.size * (0.94 + 0.06 * k);
      const length = (this.mobile ? Math.hypot(visW, visH) : visH) * 3;
      hx.group.position.set(visW * pose.x + p.sx * visW * 0.008, visH * pose.y - (1 - k) * visH * 0.05, 0);
      // the pointer turns it a little in depth, for parallax
      hx.group.rotation.set(-p.sy * 0.04, p.sx * 0.07, pose.lean + p.sx * 0.02);
      hx.uniforms.uBlur.value = pose.blur;
      // focus near the centre (pose.focus moves it along the depth, in helix diameters; + is further away)
      hx.layout(diameter, length, pose.tilt, cam.position.z - hx.group.position.z + diameter * pose.focus);
      hx.update(dt, this.time, p, cam.aspect, k);
    }
    if (hx && hx.backdrop.visible) {
      const bu = hx.backdrop.material.uniforms;
      bu.uOpacity.value = Math.min(1, st.home * 1.02);
      bu.uAspect.value = cam.aspect;
      bu.uCenter.value.set(this.mobile ? 0.63 : 0.77, this.mobile ? 0.8 : 0.5);
    }
    // bloom turns chrome into milk: fade it out as the helix takes over, and skip the pass once it is gone
    this.bloom.strength = this.bloomBase * (1 - st.home);
    this.bloom.enabled = st.home < 0.985;

    // fluid: simulate while the pointer moves, then rest once the field has settled
    if (st.fluid > 0.01 && !this.reduced) {
      if (this.fluid.splats.length) this.fluidIdle = 0;
      else this.fluidIdle += dt;
      if (this.fluidIdle < 3) this.fluid.update(Math.min(dt, 1 / 30));
      else if (!this.fluid.cleared) this.fluid.clear();
    }
    this.distort.uniforms.tFluid.value = this.fluid.texture;
    this.distort.uniforms.uStrength.value = this.reduced ? 0 : st.fluid;
    const fp = this.finalPass.uniforms;
    fp.uVignette.value = 0.4 - 0.27 * st.home;
    fp.uGrain.value = 0.05 - 0.034 * st.home; // a cleaner, sharper picture on Home
    fp.uTime.value = this.time;
    fp.uFade.value = st.fade;

    // artwork animates slowly: refresh at half rate, alternating A and B during transitions,
    // and every frame only while the wall is changing shape
    if (!heroHidden && !slatsGone) {
      const reshaped = Math.abs(artAspect - this.lastArtAspect) > 0.002;
      const even = this.frame % 2 === 0;
      if (reshaped || even) this.renderArt(this.slotA, this.rtA, artAspect);
      if (tr.active && (reshaped || !even)) this.renderArt(this.slotB, this.rtB, artAspect);
      this.lastArtAspect = artAspect;
    }
    this.updateMedia(dt);

    r.setRenderTarget(null);
    this.composer.render(dt);
    if (this.bench) {
      const gl = r.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, (this.benchPx ||= new Uint8Array(4)));
      (this.benchTimes ||= []).push(performance.now() - t0);
    }
  }
}
