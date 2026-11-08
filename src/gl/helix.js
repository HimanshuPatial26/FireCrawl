import * as THREE from 'three';
import META from '../assets/helix/meta.json';
import dropUrl from '../assets/helix/drop.webp';

// Glass DNA helix for the Home hero, rendered in Blender (scripts/make-helix.py) rather than shaded live:
// clear smoky glass refracting a studio and itself only looks right path traced.
//
// It turns like a DNA model. The helix is built with screw symmetry (identical rungs, a surface that repeats
// every rung step), so turning it by one rung step looks exactly like sliding it by one rung spacing. Blender
// renders META.frames frames across that one step; this plays them in order, cross-fading between neighbours,
// and each time it wraps around it shifts the picture by one rung spacing. The rungs stay at their height and
// swing round. Each frame is exactly one turn and seamless top to bottom, so it tiles as tall as needed.
//
// Frames are greyscale (one byte per pixel on the GPU) on a flat backdrop that the shader keys out; it adds the
// cool tint and the colour fringes of the glass back. The renders are display-ready sRGB and the site tone maps
// the whole scene in its final pass (ACES + sRGB), so the shader undoes that curve first: what leaves the final
// pass is the Blender render.

const frameUrls = import.meta.glob('../assets/helix/frame-*.webp', { eager: true, query: '?url', import: 'default' });
const mobileUrls = import.meta.glob('../assets/helix/m-frame-*.webp', { eager: true, query: '?url', import: 'default' });
const sorted = (urls) => Object.keys(urls).sort().map((k) => urls[k]);

const SHARED = /* glsl */ `
uniform mat3 uInvOut; uniform mat3 uInvIn;
// sRGB -> linear (the textures are sampled raw)
vec3 lvDecode(vec3 c){ return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045)))); }
// inverse of the ACES fit in FinalShader: the scene value that the final pass turns into lin
vec3 lvToScene(vec3 lin){
  vec3 y = clamp(uInvOut * lin, 0.0, 0.995);
  vec3 A = 1.0 - 0.983729 * y;
  vec3 B = 0.0245786 - 0.4329510 * y;
  vec3 C = -(0.000090537 + 0.238081 * y);
  vec3 v = (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  return max(uInvIn * v * 0.6, 0.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vNdc;
void main(){
  vUv = uv;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vNdc = c.xy / c.w;
  gl_Position = c;
}`;

const HELIX_FRAG = /* glsl */ `
uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; uniform float uShiftA; uniform float uShiftB;
uniform float uRepeat; uniform float uOpacity; uniform float uBg;
uniform float uTime; uniform float uRipple; uniform vec2 uMouse; uniform float uAspect; uniform float uFlow;
varying vec2 vUv; varying vec2 vNdc;
${SHARED}
// one frame pair at a point: frame A at its own vertical shift, frame B at its own, cross-faded
float lvAt(vec2 p){
  return mix(texture2D(uA, vec2(p.x, p.y - uShiftA)).r, texture2D(uB, vec2(p.x, p.y - uShiftB)).r, uMix);
}
void main(){
  // x across the helix, y down from the top of a turn (texture row 0 is the top of the render)
  vec2 p = vec2(vUv.x, (1.0 - vUv.y) * uRepeat);
  // the glass keeps moving a little, like poured liquid that has not quite set
  p.x += (sin(p.y * 37.0 + uTime * 1.1) * 0.0009 + sin(p.y * 15.0 - uTime * 0.7) * 0.0007) * uFlow;
  // ring ripples around the cursor, in screen space
  vec2 d2 = (vNdc - uMouse) * vec2(uAspect, 1.0);
  float d = length(d2);
  float w = sin(d * 38.0 - uTime * 7.5) * exp(-d * 7.0) * uRipple;
  p += normalize(d2 + 1e-5) * w * vec2(0.03, -0.012);
  // colour fringes of glass: red and blue land a touch apart, more towards the outside of the helix
  float ca = (vUv.x - 0.5) * 0.007;
  float g = lvAt(p);
  vec3 c = vec3(lvAt(p + vec2(ca, 0.0)), g, lvAt(p - vec2(ca, 0.0)));
  // a cool tint in the darks, neutral in the lights
  c *= mix(vec3(0.93, 0.955, 0.99), vec3(1.0), smoothstep(0.15, 0.85, g));
  // key out the flat backdrop: anything close to it shows the page's own backdrop instead
  float a = smoothstep(0.01, 0.05, max(abs(g - uBg), max(abs(c.r - uBg), abs(c.b - uBg)))) * uOpacity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(lvToScene(lvDecode(c)) * a, a);
}`;

const DROP_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform float uOpacity;
varying vec2 vUv; varying vec2 vNdc;
${SHARED}
void main(){
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.002) discard;
  float a = t.a * uOpacity;
  gl_FragColor = vec4(lvToScene(lvDecode(t.rgb / t.a)) * a, a);
}`;

// rows of the matrices in FinalShader (it lists them by column), inverted once here
const OUT_INV = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602).invert();
const IN_INV = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777).invert();

// a greyscale WebP -> a one-channel texture that wraps vertically
async function loadFrame(renderer, url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const { width: w, height: h } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.(); // (its width and height read 0 after this)
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const r = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < r.length; i++, j += 4) r[i] = rgba[j];
  canvas.width = canvas.height = 0; // release the canvas memory now
  const t = new THREE.DataTexture(r, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.unpackAlignment = 1;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

function loadSprite(renderer, url) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace; // sampled as stored; the shader decodes
    t.premultiplyAlpha = true; // clean filtering at the transparent edges
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  });
}

function material(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
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
  static async create(renderer, opts) {
    const urls = sorted(opts.mobile ? mobileUrls : frameUrls);
    const frames = [];
    for (const url of urls) frames.push(await loadFrame(renderer, url)); // one at a time keeps memory peaks low
    const drop = await loadSprite(renderer, dropUrl);
    return new Helix(frames, drop, opts);
  }

  constructor(frames, drop, { mobile = false, reduced = false }) {
    this.frames = frames;
    this.mobile = mobile;
    this.reduced = reduced;
    this.angle = 0.35; // radians, where the turn starts
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.unit = 1;
    this.step = THREE.MathUtils.degToRad(META.stepDegrees);

    const shared = () => ({ uInvOut: { value: OUT_INV }, uInvIn: { value: IN_INV } });
    this.uniforms = {
      ...shared(),
      uA: { value: frames[0] },
      uB: { value: frames[1 % frames.length] },
      uMix: { value: 0 },
      uShiftA: { value: 0 },
      uShiftB: { value: 0 },
      uRepeat: { value: 1 },
      uOpacity: { value: 0 },
      uBg: { value: META.background },
      uTime: { value: 0 },
      uRipple: { value: 0 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uAspect: { value: 1 },
      uFlow: { value: reduced ? 0 : 1 },
    };
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(HELIX_FRAG, this.uniforms));
    this.strip.frustumCulled = false;
    this.strip.renderOrder = 11;
    this.group = new THREE.Group();
    this.group.add(this.strip);
    this.group.visible = false;
    this.backdrop = buildBackdrop();

    // droplets, placed in helix diameters from its centre: [x, y, size]
    this.drops = [];
    const layout = mobile
      ? [[-1.05, 0.16, 0.17], [0.44, -0.62, 0.13]]
      : [[-0.6, 0.85, 0.19], [0.6, 0.3, 0.14], [-0.75, -0.8, 0.16]];
    this.dropGroup = new THREE.Group();
    for (const [x, y, size] of layout) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(DROP_FRAG, { ...shared(), uTex: { value: drop }, uOpacity: { value: 0 } }));
      d.frustumCulled = false;
      d.renderOrder = 12;
      d.userData = { x, y, size, phase: Math.random() * 6.28 };
      this.drops.push(d);
      this.dropGroup.add(d);
    }
    this.group.add(this.dropGroup);
  }

  // diameter: outer helix diameter in world units; length: how much of it to show along its axis
  layout(diameter, length) {
    const s = diameter / META.outer;
    this.strip.scale.set(META.tile[0] * s, length, 1);
    this.uniforms.uRepeat.value = length / (META.tile[1] * s);
    this.unit = diameter;
  }

  dragBy(dxPixels) {
    const v = dxPixels * 0.006; // radians; dragging right turns the front to the right
    this.angle += v;
    this.spinVel = this.spinVel * 0.6 + v * 5;
  }

  // pick the two frames around the current angle, and the rung-spacing shift of each
  setTurn() {
    const n = this.frames.length;
    const steps = this.angle / this.step;
    const k = Math.floor(steps);
    const f = (steps - k) * n;
    const i0 = Math.min(n - 1, Math.floor(f));
    let i1 = i0 + 1;
    let k1 = k;
    if (i1 === n) {
      i1 = 0;
      k1 = k + 1;
    }
    const per = META.rungsPerTurn;
    const u = this.uniforms;
    u.uA.value = this.frames[i0];
    u.uB.value = this.frames[i1];
    u.uMix.value = f - i0;
    u.uShiftA.value = (((k % per) + per) % per) / per;
    u.uShiftB.value = (((k1 % per) + per) % per) / per;
  }

  // show: 0..1 fade; tilt: the group's lean, so droplets can stay upright
  update(dt, time, pointer, aspect, show, tilt) {
    const u = this.uniforms;
    u.uTime.value = this.reduced ? 0 : time;
    u.uAspect.value = aspect;
    u.uOpacity.value = show;
    let speed = 0;
    if (pointer.has) {
      if (this.lastPointer) speed = Math.hypot(pointer.x - this.lastPointer.x, pointer.y - this.lastPointer.y) / Math.max(dt, 1e-3);
      this.lastPointer = { x: pointer.x, y: pointer.y };
      u.uMouse.value.set(pointer.x, pointer.y);
    }
    const target = this.reduced ? 0 : Math.min(0.06, speed * 0.022);
    this.ripple += (target - this.ripple) * (1 - Math.exp(-dt * (target > this.ripple ? 6 : 1.3)));
    u.uRipple.value = this.ripple;

    // slow idle turn plus drag inertia
    this.spinVel *= Math.exp(-dt * 2.8);
    this.angle += ((this.reduced ? 0 : 0.32) + this.spinVel) * dt;
    this.angle %= this.step * META.rungsPerTurn * 1000; // keep it from growing without bound
    this.setTurn();

    // droplets stay upright while the helix leans, and bob gently
    this.dropGroup.rotation.z = -tilt;
    const D = this.unit;
    const bob = this.reduced ? 0 : 1;
    for (const d of this.drops) {
      const { x, y, size, phase } = d.userData;
      d.position.set((x + Math.sin(time * 0.3 + phase) * 0.03 * bob) * D, (y + Math.sin(time * 0.45 + phase) * 0.05 * bob) * D, 0);
      d.scale.setScalar(size * D);
      d.material.uniforms.uOpacity.value = show;
    }
  }
}
