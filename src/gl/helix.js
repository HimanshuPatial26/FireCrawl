import * as THREE from 'three';
import { HELIX } from './helix-data.js';

// Liquid chrome DNA helix for the Home hero, with clear glass droplets around it.
// Geometry is modelled in Blender (scripts/make-helix.py) and shipped as a quantised mesh.
// Look: polished chrome in a procedural high-key studio (PMREM, see STUDIO_FRAG), on a light backdrop.
// The surface flows slowly and ripples around the cursor in the vertex shader; normals follow, so the
// reflections move with it.

const NOISE = /* glsl */ `
vec3 lvMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lvMod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lvPermute(vec4 x){ return lvMod289(((x * 34.0) + 10.0) * x); }
vec4 lvTaylor(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
float lvNoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = lvMod289(i);
  vec4 p = lvPermute(lvPermute(lvPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = lvTaylor(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const FIELD = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uRipple; uniform float uAspect; uniform vec2 uMouse;
${NOISE}
// displacement along the normal: slow pour + finer drift + a ring wave around the cursor (screen space)
float lvField(vec3 p){
  float n = lvNoise(p * 0.7 + vec3(0.0, uTime * 0.22, uTime * 0.05)) * uAmp;
  n += lvNoise(p * 1.9 - vec3(uTime * 0.14)) * uAmp * 0.3;
  vec4 c = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  vec2 d2 = (c.xy / c.w - uMouse) * vec2(uAspect, 1.0);
  float d = length(d2);
  n += sin(d * 34.0 - uTime * 7.5) * exp(-d * 8.5) * uRipple;
  return n;
}
`;

function buildGeometry() {
  const raw = Uint8Array.from(atob(HELIX.data), (c) => c.charCodeAt(0)).buffer;
  const n = HELIX.vertices;
  const q = new Int16Array(raw, 0, n * 3);
  const nq = new Int8Array(raw, n * 6, n * 3);
  let off = n * 9;
  off += (4 - (off % 4)) % 4;
  const idx = HELIX.index32 ? new Uint32Array(raw, off, HELIX.triangles * 3) : new Uint16Array(raw, off, HELIX.triangles * 3);
  const pos = new Float32Array(n * 3);
  const min = HELIX.min;
  const span = HELIX.max.map((v, k) => v - min[k]);
  // centre the helix on the origin so it spins around its own axis
  const centre = HELIX.max.map((v, k) => (v + min[k]) / 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = ((q[i * 3 + k] + 32768) / 65535) * span[k] + min[k] - centre[k];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nq), 3, true));
  g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  g.computeBoundingSphere();
  return { geometry: g, height: span[1], radius: Math.max(span[0], span[2]) / 2 };
}

// Glass for the droplets: the environment seen through the surface, with a slightly different index per
// channel (a hint of dispersion), mixed with the reflection by a Fresnel term.
const GLASS = /* glsl */ `
vec3 lvEnv(vec3 dirView, float rough){
  return textureCubeUV(envMap, envMapRotation * inverseTransformDirection(dirView, viewMatrix), rough).rgb;
}
vec3 lvRefract(vec3 n, vec3 v, float eta, float spread, float rough){
  vec3 i = -v;
  return vec3(
    lvEnv(refract(i, n, eta * (1.0 - spread)), rough).r,
    lvEnv(refract(i, n, eta), rough).g,
    lvEnv(refract(i, n, eta * (1.0 + spread)), rough).b);
}
`;

// Studio as a direction -> radiance function, rendered once into a PMREM.
// +z points behind the camera, -z behind the helix, +y up. The room is dark; the light comes from a white cyc
// behind the helix, a big overhead softbox and two tall strips behind the camera. So faces turned to the lens
// mirror the dark room, grazing edges pick up the white cyc, rung tops catch the overhead light, and the glass
// layer lets the white cyc show through, as in a high-key glass shot.
const STUDIO_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uRoom; uniform float uWall; uniform float uCyc; uniform float uTop; uniform float uStrip;
void main(){
  vec3 d = normalize(vDir);
  // dark room, a little lighter higher up, with grey side walls for the midtones
  vec3 c = vec3(uRoom * (0.6 + 0.8 * clamp(d.y * 0.5 + 0.5, 0.0, 1.0)));
  c = mix(c, vec3(uWall), smoothstep(0.55, 0.85, abs(d.x)) * smoothstep(0.6, 0.3, abs(d.y)));
  c = mix(c, vec3(uCyc), smoothstep(-0.15, -0.6, d.z));
  c += uTop * smoothstep(0.45, 0.85, d.y);
  float band = step(0.35, d.z) * smoothstep(0.75, 0.6, abs(d.y));
  c += uStrip * smoothstep(0.07, 0.04, abs(d.x - 0.36)) * band;
  c += uStrip * 0.7 * smoothstep(0.035, 0.015, abs(d.x + 0.46)) * band;
  c = mix(c, vec3(0.02), smoothstep(-0.06, -0.32, d.y));
  gl_FragColor = vec4(c * vec3(0.985, 0.99, 1.0), 1.0);
}`;

export const STUDIO = { room: 0.09, wall: 0.55, cyc: 1.8, top: 3.2, strip: 3.5 };

function buildEnvironment(renderer, o = STUDIO) {
  const scene = new THREE.Scene();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uRoom: { value: o.room }, uWall: { value: o.wall }, uCyc: { value: o.cyc }, uTop: { value: o.top }, uStrip: { value: o.strip } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: STUDIO_FRAG,
    })
  );
  scene.add(m);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.0);
  pm.dispose();
  m.geometry.dispose();
  m.material.dispose();
  return rt.texture;
}

// Light studio backdrop for Home: a screen-filling cyc, brightest behind the helix and falling off to soft grey.
// Values are linear, before the site's ACES tone curve (1.7 -> about #eff0f2, 1.1 -> about #e5e7ea).
function buildBackdrop() {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uOpacity: { value: 0 }, uCenter: { value: new THREE.Vector2(0.7, 0.5) }, uAspect: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec2 uCenter; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
        float r = length(p * vec2(0.8, 1.0));
        vec3 c = mix(vec3(1.75), vec3(1.05), smoothstep(0.05, 1.25, r));
        c *= vec3(0.985, 0.99, 1.0);
        gl_FragColor = vec4(c, uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.visible = false;
  return mesh;
}

export class Helix {
  constructor(renderer, { mobile = false, reduced = false }) {
    this.mobile = mobile;
    this.reduced = reduced;
    this.spin = 0;
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.renderer = renderer;
    this.env = buildEnvironment(renderer);

    const { geometry, height, radius } = buildGeometry();
    this.height = height;
    this.radius = radius;

    this.uniforms = {
      uTime: { value: 0 },
      uAmp: { value: reduced ? 0.008 : 0.016 },
      uRipple: { value: 0 },
      uAspect: { value: 1 },
      uMouse: { value: new THREE.Vector2(9, 9) },
    };

    this.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.95, 0.96, 0.97),
      metalness: 1,
      roughness: 0.05,
      envMap: this.env,
      envMapIntensity: 1.0,
      transparent: true, // drawn after the backdrop
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FIELD}`)
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `#include <beginnormal_vertex>
          float lvE = 0.05;
          float lvF = lvField(position);
          vec3 lvG = vec3(
            lvField(position + vec3(lvE, 0.0, 0.0)) - lvF,
            lvField(position + vec3(0.0, lvE, 0.0)) - lvF,
            lvField(position + vec3(0.0, 0.0, lvE)) - lvF) / lvE;
          objectNormal = normalize(objectNormal - (lvG - dot(lvG, objectNormal) * objectNormal));`
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * lvF;');
    };
    this.material.customProgramCacheKey = () => 'lv-helix';

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.backdrop = buildBackdrop();
    this.inner = new THREE.Group();
    this.inner.add(this.mesh);
    this.group = new THREE.Group();
    this.group.add(this.inner);
    this.group.visible = false;

    // clear glass droplets: the studio seen through them (upside down, as through a lens), a bright rim
    this.drops = [];
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 0.0,
      envMap: this.env,
      envMapIntensity: 1.0,
      transparent: true,
      depthWrite: false,
    });
    glass.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <envmap_physical_pars_fragment>', `#include <envmap_physical_pars_fragment>\n${GLASS}`)
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `{
            vec3 lvV = normalize(vViewPosition);
            float lvC = clamp(dot(normal, lvV), 0.0, 1.0);
            vec3 lvT = lvRefract(normal, lvV, 1.0 / 1.5, 0.03, 0.02) * vec3(0.96, 0.975, 0.99);
            float lvF = 0.05 + 0.95 * pow(1.0 - lvC, 4.0);
            outgoingLight = mix(lvT, outgoingLight, lvF);
          }
          #include <opaque_fragment>`
        );
    };
    glass.customProgramCacheKey = () => 'lv-glass';
    const sphere = new THREE.SphereGeometry(1, 48, 32);
    const layout = mobile
      ? [[1.9, 0.9, 0.6, 0.22], [-1.7, -1.4, 0.9, 0.16]]
      : [[1.55, 2.3, 0.9, 0.28], [-1.45, -0.9, 1.1, 0.2], [1.6, -3.2, -0.4, 0.15]];
    for (const [x, y, z, r] of layout) {
      const d = new THREE.Mesh(sphere, glass);
      d.scale.setScalar(r);
      d.position.set(x, y, z);
      d.userData.base = new THREE.Vector3(x, y, z);
      d.userData.phase = Math.random() * 6.28;
      d.frustumCulled = false;
      d.renderOrder = 12;
      this.group.add(d);
      this.drops.push(d);
    }
  }

  // for tuning in the console: __louver.stage.helix.relight({ cyc: 2 }) (with ?bench)
  relight(o) {
    const old = this.env;
    this.env = buildEnvironment(this.renderer, { ...STUDIO, ...o });
    this.material.envMap = this.env;
    for (const d of this.drops) d.material.envMap = this.env;
    old.dispose();
  }

  dragBy(dxPixels) {
    const v = dxPixels * 0.0065;
    this.spin += v;
    this.spinVel = this.spinVel * 0.6 + v * 5;
  }

  update(dt, time, pointer, aspect) {
    const u = this.uniforms;
    u.uTime.value = this.reduced ? 0 : time;
    u.uAspect.value = aspect;
    // ripples follow pointer speed, linger, then settle
    let speed = 0;
    if (pointer.has) {
      if (this.lastPointer) speed = Math.hypot(pointer.x - this.lastPointer.x, pointer.y - this.lastPointer.y) / Math.max(dt, 1e-3);
      this.lastPointer = { x: pointer.x, y: pointer.y };
      u.uMouse.value.set(pointer.x, pointer.y);
    }
    const target = this.reduced ? 0 : Math.min(0.055, speed * 0.02);
    const rate = target > this.ripple ? 6 : 1.4;
    this.ripple += (target - this.ripple) * (1 - Math.exp(-dt * rate));
    u.uRipple.value = this.ripple;

    // slow idle spin plus drag inertia
    this.spinVel *= Math.exp(-dt * 2.8);
    this.spin += ((this.reduced ? 0 : 0.14) + this.spinVel) * dt;
    this.inner.rotation.y = this.spin;

    for (const d of this.drops) {
      const b = d.userData.base;
      const ph = d.userData.phase;
      d.position.set(b.x + Math.sin(time * 0.3 + ph) * 0.15, b.y + Math.sin(time * 0.45 + ph) * 0.25, b.z + Math.cos(time * 0.35 + ph) * 0.15);
    }
  }
}
