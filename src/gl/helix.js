import * as THREE from 'three';
import { HELIX } from './helix-data.js';

// Liquid-metal DNA helix for the Home hero.
// Geometry is modelled in Blender (scripts/make-helix.py) and shipped as a quantised mesh.
// Look: physically based chrome lit by a procedural softbox studio (PMREM), with a slow flowing surface
// and cursor ripples computed in the vertex shader. Normals follow the motion, so reflections move too.

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
  float n = lvNoise(p * 0.85 + vec3(0.0, uTime * 0.22, uTime * 0.05)) * uAmp;
  n += lvNoise(p * 2.3 - vec3(uTime * 0.14)) * uAmp * 0.32;
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

// Procedural softbox studio, mirroring the Blender preview: black space, bright strips behind the camera,
// a key panel top-left, a rim strip on the right. Everything chrome looks real because of this.
function buildEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const panel = (w, h, x, y, z, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(1.6, 30, -4.2, 0, 16, 5); // strips behind the camera
  panel(0.8, 30, 5.0, 1, 16, 7);
  panel(18, 2.0, 0, 10, 14, 4);
  panel(7, 11, -10, 6, 5, 2.6); // key, upper left
  panel(2.6, 22, 10, 1, -2, 5); // rim, right
  panel(11, 7, 0, 14, 0, 1.2); // soft top
  panel(4, 4, 6, -8, 8, 0.6); // faint fill from below right
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.015);
  pm.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return rt.texture;
}

export class Helix {
  constructor(renderer, { mobile = false, reduced = false, colors }) {
    this.mobile = mobile;
    this.reduced = reduced;
    this.spin = 0;
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.env = buildEnvironment(renderer);

    const { geometry, height, radius } = buildGeometry();
    this.height = height;
    this.radius = radius;

    this.uniforms = {
      uTime: { value: 0 },
      uAmp: { value: reduced ? 0.012 : 0.034 },
      uRipple: { value: 0 },
      uAspect: { value: 1 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uAccent: { value: colors.a },
      uRim: { value: 0.1 },
    };

    this.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.93, 0.94, 0.96),
      metalness: 1,
      roughness: 0.045,
      envMap: this.env,
      envMapIntensity: 1.0,
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
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uAccent; uniform float uRim;')
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          float lvFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uAccent * lvFr * uRim;`
        );
    };
    this.material.customProgramCacheKey = () => 'lv-helix';

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.inner = new THREE.Group();
    this.inner.add(this.mesh);
    this.group = new THREE.Group();
    this.group.add(this.inner);
    this.group.visible = false;

    // glass droplets: reflection-only glass (bright rims, clear centres), drifting around the helix
    this.drops = [];
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 0.0,
      envMap: this.env,
      envMapIntensity: 1.4,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    glass.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `float lvGF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        outgoingLight *= 0.012 + 0.988 * lvGF;
        #include <opaque_fragment>`
      );
    };
    glass.customProgramCacheKey = () => 'lv-glass';
    const sphere = new THREE.SphereGeometry(1, 48, 32);
    const layout = mobile
      ? [[1.9, 0.9, 0.6, 0.22], [-1.7, -1.4, 0.9, 0.16]]
      : [[2.3, 2.6, 0.8, 0.3], [-2.2, -2.2, 1.1, 0.22], [1.8, -3.6, -0.6, 0.15]];
    for (const [x, y, z, r] of layout) {
      const d = new THREE.Mesh(sphere, glass);
      d.scale.setScalar(r);
      d.position.set(x, y, z);
      d.userData.base = new THREE.Vector3(x, y, z);
      d.userData.phase = Math.random() * 6.28;
      d.frustumCulled = false;
      this.group.add(d);
      this.drops.push(d);
    }
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
