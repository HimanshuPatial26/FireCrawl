import * as THREE from 'three';
import META from '../assets/helix/meta.json';

// Liquid-mercury DNA helix for the Home hero, rendered in Blender (scripts/make-helix.py) rather than shaded
// live: a mirror that reflects the studio and itself only looks right path traced.
//
// It turns like a DNA model. The helix is built with screw symmetry (identical rungs, a surface that repeats
// every rung step), so turning it by one rung step looks exactly like sliding it by one rung spacing. Blender
// renders META.frames frames across that one step; this plays them in order, cross-fading between neighbours,
// and each time it wraps around it shifts the picture by one rung spacing. The rungs stay at their height and
// swing round. The two strands are copies, so the shape repeats every half turn: each frame is half a turn,
// seamless top to bottom, and tiles as tall as needed.
//
// Frames stream in: a coarse set first (so the page can open), then the in-between ones; playback always
// blends the nearest frames that have arrived.
//
// Frames are greyscale (one byte per pixel on the GPU) on a flat backdrop that the shader keys out; it adds the
// cool tint and the soft lens colour fringes back. The renders are display-ready sRGB and the site tone maps
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
uniform float uBend; uniform float uLen;
varying vec2 vUv; varying vec2 vNdc; varying float vViewZ;
void main(){
  vUv = uv;
  // the near half curls towards the camera, so the helix sweeps out of the screen rather than standing straight
  vec3 pos = position;
  float below = min(pos.y, 0.0) * uLen;
  pos.z += uBend * below * below;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewZ = -mv.z;
  vec4 c = projectionMatrix * mv;
  vNdc = c.xy / c.w;
  gl_Position = c;
}`;

const HELIX_FRAG = /* glsl */ `
uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; uniform float uShiftA; uniform float uShiftB;
uniform float uRepeat; uniform float uOpacity; uniform float uBg;
uniform float uTime; uniform float uRipple; uniform vec2 uMouse; uniform float uAspect; uniform float uFlow;
uniform float uFocus; uniform float uBlur; uniform float uWidth; uniform vec4 uSafe; uniform float uDead;
varying vec2 vUv; varying vec2 vNdc; varying float vViewZ;
${SHARED}
// one frame pair at a point and mip level: frame A at its own vertical shift, frame B at its own, cross-faded
float lvAt(vec2 p, float lod){
  return mix(textureLod(uA, vec2(p.x, p.y - uShiftA), lod).r, textureLod(uB, vec2(p.x, p.y - uShiftB), lod).r, uMix);
}
// the same at full detail, with the true texture gradients so the GPU's anisotropic filtering keeps the
// helix crisp where the card is foreshortened
float lvAtG(vec2 p, vec2 gx, vec2 gy){
  return mix(textureGrad(uA, vec2(p.x, p.y - uShiftA), gx, gy).r, textureGrad(uB, vec2(p.x, p.y - uShiftB), gx, gy).r, uMix);
}
float lvNoise(vec2 px){ return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
void main(){
  // x across the helix, y down from the top of a frame (texture row 0 is the top of the render)
  vec2 p = vec2(vUv.x, (1.0 - vUv.y) * uRepeat);
  // the metal keeps moving a little, like poured liquid that has not quite set
  p.x += (sin(p.y * 37.0 + uTime * 1.1) * 0.00045 + sin(p.y * 15.0 - uTime * 0.7) * 0.00035) * uFlow;
  // ring ripples around the cursor, in screen space
  vec2 d2 = (vNdc - uMouse) * vec2(uAspect, 1.0);
  float d = length(d2);
  float w = sin(d * 38.0 - uTime * 7.5) * exp(-d * 7.0) * uRipple;
  p += normalize(d2 + 1e-5) * w * vec2(0.03, -0.012);

  // depth of field, as through a real lens: the blur grows with distance from the focus plane, so the end that
  // comes towards the viewer goes soft and large. Radius in texture units (the frames are square tiles).
  // Everything within uDead of the focus stays crisp; beyond it the blur grows, more gently behind the focus.
  float dz = vViewZ - uFocus;
  float dzA = max(abs(dz) - uDead, 0.0);
  float r = uBlur * (dz > 0.0 ? dzA * 0.5 : dzA) / uWidth;
  vec2 size = vec2(textureSize(uA, 0));
  vec2 gpx = dFdx(p), gpy = dFdy(p);
  float lod = log2(max(r * size.x * 0.6, 1.0));

  // lens colour fringes, as in a photograph: red and blue land a touch apart, more towards the outside and
  // more where the picture is out of focus
  float ca = (vUv.x - 0.5) * 0.007 + r * 0.04 * sign(vUv.x - 0.5);
  float g = lvAtG(p, gpx, gpy);
  vec3 c = vec3(lvAtG(p + vec2(ca, 0.0), gpx, gpy), g, lvAtG(p - vec2(ca, 0.0), gpx, gpy));
  float k = smoothstep(0.0006, 0.004, r);
  if (k > 0.0) {
    // a rotated ring of taps on the pre-blurred mip level smooths it into a lens blur
    float a0 = lvNoise(gl_FragCoord.xy) * 6.2831853;
    float sum = g;
    for (int i = 0; i < 6; i++) {
      float a = a0 + float(i) * 1.0471976;
      sum += lvAt(p + vec2(cos(a), sin(a)) * r, lod);
    }
    float b = sum / 7.0;
    c = mix(c, c - g + b, k);
    g = mix(g, b, k);
  }
  // a cool tint in the darks, neutral in the lights
  c *= mix(vec3(0.93, 0.955, 0.99), vec3(1.0), smoothstep(0.15, 0.85, g));
  // key out the flat backdrop: anything close to it shows the page's own backdrop instead
  float a = smoothstep(0.01, 0.05, max(abs(g - uBg), max(abs(c.r - uBg), abs(c.b - uBg)))) * uOpacity;
  // where the out-of-focus near end passes in front of the text (uSafe: a screen rectangle), it turns
  // translucent, so it still reads as coming out of the screen while the words stay legible
  vec2 inX = smoothstep(uSafe.xy - 0.06, uSafe.xy + 0.06, vNdc) * smoothstep(uSafe.zw + 0.06, uSafe.zw - 0.06, vNdc);
  a *= 1.0 - 0.65 * k * inX.x * inX.y;
  if (a < 0.002) discard;
#ifdef DISPLAY_OUT
  // drawn on its own layer above the page: straight to display values, with grain to match the page's
  c += (fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
#else
  gl_FragColor = vec4(lvToScene(lvDecode(clamp(c, 0.0, 1.0))) * a, a);
#endif
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

function material(fragmentShader, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    defines,
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

// load order: every sixth frame first, then every third, then the rest
function loadOrder(n) {
  const order = [];
  for (const stride of [6, 3, 1]) for (let i = 0; i < n; i += stride) if (!order.includes(i)) order.push(i);
  return order;
}

export class Helix {
  static async create(renderer, opts) {
    const urls = sorted(opts.mobile ? mobileUrls : frameUrls);
    const frames = new Array(urls.length).fill(null);
    const order = loadOrder(urls.length);
    const first = Math.min(6, order.length);
    // one at a time keeps memory peaks low; the page opens once the coarse set is in
    for (const i of order.slice(0, first)) frames[i] = await loadFrame(renderer, urls[i]);
    const helix = new Helix(frames, opts);
    (async () => {
      for (const i of order.slice(first)) frames[i] = await loadFrame(renderer, urls[i]);
    })().catch((err) => console.warn('Some helix frames did not load; the turn uses the ones that did.', err));
    return helix;
  }

  // display: true when the helix draws on its own canvas (no scene tone curve to undo)
  constructor(frames, { mobile = false, reduced = false, display = false }) {
    this.frames = frames;
    this.mobile = mobile;
    this.reduced = reduced;
    this.angle = 0.35; // radians, where the turn starts
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.step = THREE.MathUtils.degToRad(META.stepDegrees);

    this.uniforms = {
      uInvOut: { value: OUT_INV },
      uInvIn: { value: IN_INV },
      uA: { value: frames[0] },
      uB: { value: frames[0] },
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
      uFocus: { value: 12 },
      uBlur: { value: 0.06 },
      uWidth: { value: 1 },
      uBend: { value: 0 },
      uLen: { value: 1 },
      uSafe: { value: new THREE.Vector4(9, 9, 9, 9) }, // off until the stage sets it
      uDead: { value: 0 },
    };
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 160), material(HELIX_FRAG, this.uniforms, display ? { DISPLAY_OUT: '' } : {}));
    this.strip.frustumCulled = false;
    this.strip.renderOrder = 11;
    // group: position and lean on screen; tilt: leans the helix towards the camera, so one end comes out at you
    this.tilt = new THREE.Group();
    this.tilt.add(this.strip);
    this.group = new THREE.Group();
    this.group.add(this.tilt);
    this.group.visible = false;
    this.backdrop = buildBackdrop();
  }

  // diameter: outer helix diameter in world units at its centre; length: how much of it to show along its axis;
  // tilt: how far it leans towards the camera (radians, lower end forward); focus: camera distance to the centre
  layout(diameter, length, tilt, focus, bend = 0) {
    const s = diameter / META.outer;
    this.strip.scale.set(META.tile[0] * s, length, 1);
    this.tilt.rotation.x = -tilt;
    const u = this.uniforms;
    u.uBend.value = bend;
    u.uLen.value = length;
    u.uDead.value = diameter * 0.7; // the whole visible body stays in focus; only the far reaches soften
    u.uRepeat.value = length / (META.tile[1] * s);
    u.uWidth.value = META.tile[0] * s;
    u.uFocus.value = focus;
  }

  dragBy(dxPixels) {
    const v = dxPixels * 0.006; // radians; dragging right turns the front to the right
    this.angle += v;
    this.spinVel = this.spinVel * 0.6 + v * 5;
  }

  // pick the two loaded frames around the current angle, and the rung-spacing shift of each
  setTurn() {
    const frames = this.frames;
    const n = frames.length;
    const steps = this.angle / this.step;
    const k = Math.floor(steps);
    const f = (steps - k) * n;
    let i0 = Math.min(n - 1, Math.floor(f));
    while (!frames[i0]) i0--; // frame 0 always loads first
    let i1 = i0 + 1;
    let k1 = k;
    for (;;) {
      if (i1 === n) {
        i1 = 0;
        k1 = k + 1;
        break;
      }
      if (frames[i1]) break;
      i1++;
    }
    const span = (k1 > k ? n : 0) + i1 - i0;
    const per = Math.round(1 / META.shiftPerStep); // rung steps per frame height
    const u = this.uniforms;
    u.uA.value = frames[i0];
    u.uB.value = frames[i1];
    u.uMix.value = (f - i0) / span;
    u.uShiftA.value = (((k % per) + per) % per) / per;
    u.uShiftB.value = (((k1 % per) + per) % per) / per;
  }

  // show: 0..1 fade
  update(dt, time, pointer, aspect, show) {
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
    // keep it from growing without bound, wrapping on a whole number of frame heights so nothing jumps
    this.angle %= this.step * Math.round(1 / META.shiftPerStep) * 1000;
    this.setTurn();
  }
}
