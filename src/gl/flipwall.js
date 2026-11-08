import * as THREE from 'three';
import gsap from 'gsap';

// Kinetic flip-panel wall for the Home hero.
// A grid of small 3D flaps, each hinged on a horizontal axis: the glowing face shows when a flap
// is "on", the dark metal back when it is "off". Text (initials and headline metrics) is rasterised
// into a tiny canvas, sampled per flap, and the wall flips to it in a diagonal wave.
// Everything is one instanced draw; motion runs in the vertex shader.

const VERT = /* glsl */ `
attribute vec2 aCell;
attribute float aFrom;
attribute float aTo;
attribute float aRand;
uniform float uCols; uniform float uRows; uniform float uCell; uniform float uDepth;
uniform float uMorph; uniform float uSpread; uniform float uTime;
uniform vec2 uMouse; uniform float uHover; uniform float uCalm;
varying vec3 vN; varying vec3 vW; varying float vFace; varying vec2 vGrid; varying float vLift;

mat3 rotX(float a){ float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

void main(){
  vec2 centre = vec2((aCell.x - (uCols - 1.0) * 0.5) * uCell, ((uRows - 1.0) * 0.5 - aCell.y) * uCell);

  // diagonal wave, left to right with a little jitter, eased with a slight overshoot
  float order = ((aCell.x / (uCols - 1.0)) * 0.8 + (aCell.y / (uRows - 1.0)) * 0.2 + aRand * 0.15) / 1.15;
  float t = clamp(uMorph * (1.0 + uSpread) - order * uSpread, 0.0, 1.0);
  float c2 = 1.3725;
  float a2 = 2.0 * t;
  float b2 = 2.0 * t - 2.0;
  float e = t < 0.5 ? a2 * a2 * ((c2 + 1.0) * a2 - c2) * 0.5 : (b2 * b2 * ((c2 + 1.0) * b2 + c2) + 2.0) * 0.5;
  float v = mix(aFrom, aTo, e);
  float ang = (1.0 - v) * 3.14159265;

  // idle shimmer and the cursor: a travelling ripple plus a lift right under the pointer
  ang += sin(uTime * 1.3 + aRand * 40.0) * 0.05 * uCalm;
  float d = length(centre - uMouse) / uCell;
  float lift = exp(-d * d * 0.03) * uHover;
  ang += sin(d * 0.85 - uTime * 5.0) * exp(-d * 0.11) * 0.55 * uHover * uCalm;
  ang -= lift * 0.85 * uCalm;

  mat3 R = rotX(ang);
  vec3 p = position * vec3(uCell * 0.86, uCell * 0.86, uDepth);
  vec3 rp = R * p;
  rp.z += sin(3.14159265 * t) * uCell * 0.6 + lift * uCell * 0.9;

  vec4 world = modelMatrix * vec4(vec3(centre, 0.0) + rp, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * (R * normal));
  vFace = normal.z;
  vGrid = aCell / vec2(uCols - 1.0, uRows - 1.0);
  vLift = lift;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uA; uniform vec3 uBg; uniform float uFade; uniform float uDim;
varying vec3 vN; varying vec3 vW; varying float vFace; varying vec2 vGrid; varying float vLift;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(vec3(-0.45, 0.65, 0.7));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  float vig = 0.82 + 0.18 * (1.0 - length(vGrid - 0.5) * 1.2);
  vec3 col;
  if (vFace > 0.5) {
    col = uA * (0.88 + 0.42 * diff) * vig + vec3(spec * 0.7) + vec3(vLift * 0.2);
  } else if (vFace < -0.5) {
    col = uBg * 0.8 + vec3(0.012) + uA * 0.04 + vec3(spec * 0.22);
  } else {
    col = uBg * 0.6 + uA * 0.3;
  }
  col += uA * fres * 0.2;
  col *= (1.0 - uDim) * (1.0 - uFade);
  gl_FragColor = vec4(col, 1.0);
}
`;

const ease = (t) => {
  const c2 = 1.3725;
  const a = 2 * t;
  const b = 2 * t - 2;
  return t < 0.5 ? a * a * ((c2 + 1) * a - c2) * 0.5 : (b * b * ((c2 + 1) * b + c2) + 2) * 0.5;
};

export class FlipWall {
  constructor({ mobile = false, reduced = false, colors } = {}) {
    this.cols = mobile ? 44 : 56;
    this.rows = mobile ? 24 : 30;
    this.cell = 0.1;
    this.spread = 1.4;
    this.reduced = reduced;
    this.width = this.cols * this.cell;
    this.height = this.rows * this.cell;
    this.morph = { v: 1 };
    this.cache = new Map();
    this.hover = 0;
    this.hit = false;
    this.text = '';

    const n = this.cols * this.rows;
    const cell = new Float32Array(n * 2);
    this.rand = new Float32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        cell[i * 2] = c;
        cell[i * 2 + 1] = r;
        this.rand[i] = Math.random();
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    this.aFrom = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    this.aTo = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFrom', this.aFrom);
    geo.setAttribute('aTo', this.aTo);
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(this.rand, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCols: { value: this.cols },
        uRows: { value: this.rows },
        uCell: { value: this.cell },
        uDepth: { value: this.cell * 0.12 },
        uMorph: { value: 1 },
        uSpread: { value: this.spread },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(99, 99) },
        uHover: { value: 0 },
        uCalm: { value: reduced ? 0 : 1 },
        uA: { value: colors.a },
        uBg: { value: colors.bg },
        uFade: { value: 1 },
        uDim: { value: 0 },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.visible = false;

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane();
    this.hitPoint = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.inv = new THREE.Matrix4();
    this.ndc = new THREE.Vector2();
  }

  // text -> per-flap coverage (0 = off, 1 = on), cached per string
  raster(text) {
    if (this.cache.has(text)) return this.cache.get(text);
    const S = 8;
    const W = this.cols * S;
    const H = this.rows * S;
    const out = new Float32Array(this.cols * this.rows);
    if (text) {
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const font = (s) => `800 ${s}px "Big Shoulders Display", "Segoe UI", Roboto, Arial, sans-serif`;
      let size = H * 0.98;
      ctx.font = font(size);
      let m = ctx.measureText(text);
      const maxW = W * 0.86;
      if (m.width > maxW) {
        size *= maxW / m.width;
        ctx.font = font(size);
        m = ctx.measureText(text);
      }
      const asc = m.actualBoundingBoxAscent || size * 0.72;
      const desc = m.actualBoundingBoxDescent || 0;
      ctx.fillText(text, W / 2, H / 2 + (asc - desc) / 2);
      const px = ctx.getImageData(0, 0, W, H).data;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          let sum = 0;
          for (let y = 0; y < S; y++) {
            const row = (r * S + y) * W;
            for (let x = 0; x < S; x++) sum += px[(row + c * S + x) * 4];
          }
          const v = sum / (S * S * 255);
          out[r * this.cols + c] = Math.min(1, Math.max(0, (v - 0.12) / 0.7));
        }
      }
    }
    this.cache.set(text, out);
    return out;
  }

  valueAt(i, m) {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    const order = ((c / (this.cols - 1)) * 0.8 + (r / (this.rows - 1)) * 0.2 + this.rand[i] * 0.15) / 1.15;
    const t = Math.min(1, Math.max(0, m * (1 + this.spread) - order * this.spread));
    const from = this.aFrom.array[i];
    const to = this.aTo.array[i];
    return Math.min(1, Math.max(0, from + (to - from) * ease(t)));
  }

  show(text, { duration = 1.7 } = {}) {
    if (text === this.text && this.morph.v >= 1) return Promise.resolve();
    this.text = text;
    const target = this.raster(text);
    const m = this.morph.v;
    const from = this.aFrom.array;
    for (let i = 0; i < from.length; i++) from[i] = this.valueAt(i, m);
    this.aTo.array.set(target);
    this.aFrom.needsUpdate = true;
    this.aTo.needsUpdate = true;
    gsap.killTweensOf(this.morph);
    if (this.reduced) {
      this.morph.v = 1;
      return Promise.resolve();
    }
    this.morph.v = 0;
    return new Promise((res) => gsap.to(this.morph, { v: 1, duration, ease: 'none', onComplete: res }));
  }

  // pointer is in normalised device coordinates; returns whether it is over the wall
  update(dt, time, camera, pointer, visibility, dim) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uMorph.value = this.morph.v;
    u.uFade.value = 1 - visibility;
    u.uDim.value = dim;
    let over = false;
    if (pointer.has && visibility > 0.5) {
      camera.updateMatrixWorld();
      this.group.updateMatrixWorld();
      this.ndc.set(pointer.x, pointer.y);
      this.raycaster.setFromCamera(this.ndc, camera);
      this.normal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
      this.plane.setFromNormalAndCoplanarPoint(this.normal, this.hitPoint.setFromMatrixPosition(this.mesh.matrixWorld));
      if (this.raycaster.ray.intersectPlane(this.plane, this.hitPoint)) {
        this.inv.copy(this.mesh.matrixWorld).invert();
        this.hitPoint.applyMatrix4(this.inv);
        u.uMouse.value.set(this.hitPoint.x, this.hitPoint.y);
        const m = this.cell * 2;
        over = Math.abs(this.hitPoint.x) < this.width / 2 + m && Math.abs(this.hitPoint.y) < this.height / 2 + m;
      }
    }
    this.hit = over && visibility > 0.9;
    this.hover += ((this.hit ? 1 : 0) - this.hover) * (1 - Math.exp(-dt * 6));
    u.uHover.value = this.hover;
  }
}
