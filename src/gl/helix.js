import * as THREE from 'three';
import META from '../assets/helix/meta.json';
import GRADE from '../assets/helix/grade.json';

// Liquid glass-chrome DNA helix for the Home hero, rendered in Blender (scripts/make-helix.py) rather than shaded
// live: glass and mirror reflecting and refracting a studio and itself only look right path traced.
//
// Three kinds of frame sets, told apart by META.mode:
//
// "spin" (the default render): the close-up below, turning continuously. The model repeats every half turn
// (its two strands are copies and every rung is symmetric end to end), so META.frames frames cover 180 degrees
// and loop; drag spins it with momentum.
//
// "sway": a one-off molten sculpture shot close-up with perspective and shallow focus,
// rendered at META.frames angles across META.rangeDegrees. It turns slowly back and forth; dragging turns it
// further, and it eases back. Between two rendered frames the shader draws a true in-between image: a motion map
// (optical flow, scripts/flow-helix.py) slides both frames towards the in-between position before they are
// blended, so the motion runs at the display's frame rate instead of stepping. The frame's top and bottom fade out.
//
// Rotation (older symmetric renders): it turns like a DNA model. The helix is built with screw symmetry (identical rungs, a surface that repeats
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
// colour grade (matched to a reference by scripts/grade-helix.py) and the soft lens colour fringes. The renders are display-ready sRGB and the site tone maps
// the whole scene in its final pass (ACES + sRGB), so the shader undoes that curve first: what leaves the final
// pass is the Blender render.

const frameUrls = import.meta.glob('../assets/helix/frame-*.webp', { eager: true, query: '?url', import: 'default' });
const mobileUrls = import.meta.glob('../assets/helix/m-frame-*.webp', { eager: true, query: '?url', import: 'default' });
const flowUrls = import.meta.glob('../assets/helix/flow-*.webp', { eager: true, query: '?url', import: 'default' });
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
uniform sampler2D uGrade; uniform float uGradeAmt; uniform float uEdge;
uniform sampler2D uMotion; uniform float uMotionOn; uniform vec2 uMotionScale;
// motion from frame A to frame B at this point (texture units), when a motion map is in use
vec2 lvF = vec2(0.0);
// grey level -> graded colour (a 256-entry table)
vec3 lvGrade(float v){ return texture2D(uGrade, vec2((clamp(v, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).rgb; }
varying vec2 vUv; varying vec2 vNdc; varying float vViewZ;
${SHARED}
// one frame pair at a point and mip level: frame A at its own vertical shift, frame B at its own, cross-faded
// (with a motion map, A is sampled where the point was and B where it is going, so the blend moves rather than fades)
float lvAt(vec2 p, float lod){
  vec2 pa = p - uMix * lvF, pb = p + (1.0 - uMix) * lvF;
  return mix(textureLod(uA, vec2(pa.x, pa.y - uShiftA), lod).r, textureLod(uB, vec2(pb.x, pb.y - uShiftB), lod).r, uMix);
}
// the same at full detail, with the true texture gradients so the GPU's anisotropic filtering keeps the
// helix crisp where the card is foreshortened
float lvAtG(vec2 p, vec2 gx, vec2 gy){
  vec2 pa = p - uMix * lvF, pb = p + (1.0 - uMix) * lvF;
  return mix(textureGrad(uA, vec2(pa.x, pa.y - uShiftA), gx, gy).r, textureGrad(uB, vec2(pb.x, pb.y - uShiftB), gx, gy).r, uMix);
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
  if (uMotionOn > 0.5) lvF = (texture2D(uMotion, p).rg * 255.0 - 128.0) * uMotionScale;

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
  // key out the flat backdrop: anything close to it shows the page's own backdrop instead
  float a = smoothstep(0.01, 0.05, max(abs(g - uBg), max(abs(c.r - uBg), abs(c.b - uBg)))) * uOpacity;
  // colour grade: each grey level takes the tone and colour the reference has at the same rank
  c = mix(c, vec3(lvGrade(c.r).r, lvGrade(c.g).g, lvGrade(c.b).b), uGradeAmt);
  // where the out-of-focus near end passes in front of the text (uSafe: a screen rectangle), it turns
  // translucent, so it still reads as coming out of the screen while the words stay legible
  vec2 inX = smoothstep(uSafe.xy - 0.06, uSafe.xy + 0.06, vNdc) * smoothstep(uSafe.zw + 0.06, uSafe.zw - 0.06, vNdc);
  a *= 1.0 - 0.65 * k * inX.x * inX.y;
  // sway frames end at the top and bottom of the render: fade them out there
  if (uEdge > 0.0) a *= smoothstep(0.0, uEdge, vUv.y) * smoothstep(1.0, 1.0 - uEdge, vUv.y);
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

const SWAY = META.mode === 'sway';
const SPIN = META.mode === 'spin';
const CLOSEUP = SWAY || SPIN; // one picture with its own perspective and focus blur, shown flat

// the colour grade table as a 256x1 texture
function gradeTexture() {
  const data = new Uint8Array(256 * 4);
  GRADE.lut.forEach(([r, g, b], i) => data.set([r * 255, g * 255, b * 255, 255].map(Math.round), i * 4));
  const t = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// a greyscale WebP -> a one-channel texture (wrapping vertically for rotation frames, which tile)
// a motion map (red: x, green: y) -> a two-channel texture
async function loadFlow(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const { width: w, height: h } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const rg = new Uint8Array(w * h * 2);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    rg[i * 2] = rgba[j];
    rg[i * 2 + 1] = rgba[j + 1];
  }
  canvas.width = canvas.height = 0;
  const t = new THREE.DataTexture(rg, w, h, THREE.RGFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

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
  t.wrapT = CLOSEUP ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
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
    const flowList = CLOSEUP && META.flow ? sorted(flowUrls) : [];
    const flows = new Array(flowList.length).fill(null);
    const helix = new Helix(frames, opts, flows);
    (async () => {
      for (const i of order.slice(first)) frames[i] = await loadFrame(renderer, urls[i]);
      for (let i = 0; i < flowList.length; i++) flows[i] = await loadFlow(flowList[i]);
    })().catch((err) => console.warn('Some helix frames did not load; the turn uses the ones that did.', err));
    return helix;
  }

  // display: true when the helix draws on its own canvas (no scene tone curve to undo)
  constructor(frames, { mobile = false, reduced = false, display = false }, flows = []) {
    this.frames = frames;
    this.flows = flows;
    this.closeup = CLOSEUP;
    this.period = THREE.MathUtils.degToRad(META.periodDegrees || 180); // spin: the turn after which frames repeat
    this.mobile = mobile;
    this.reduced = reduced;
    this.angle = SWAY ? 0 : SPIN ? 0.6 : 0.35; // radians: where the turn starts (sway: the middle of the range)
    this.offset = 0; // sway: how far dragging has turned it from the idle motion
    this.half = THREE.MathUtils.degToRad((META.rangeDegrees || 0) / 2);
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.step = THREE.MathUtils.degToRad(META.stepDegrees || 1);

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
      uGrade: { value: gradeTexture() },
      uGradeAmt: { value: 1 },
      uEdge: { value: CLOSEUP ? 0.12 : 0 },
      uMotion: { value: null },
      uMotionOn: { value: 0 },
      // motion map units -> texture units: (value - 128) / scale pixels of the full-size frame
      uMotionScale: {
        value: META.flow
          ? new THREE.Vector2(1 / (META.flow.scale * META.pixels[0]), 1 / (META.flow.scale * META.pixels[1]))
          : new THREE.Vector2(),
      },
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
    if (CLOSEUP) {
      // one picture with its perspective and focus blur baked in: shown flat, at its own proportions
      this.strip.scale.set(META.tile[0] * s, META.tile[1] * s, 1);
      this.tilt.rotation.x = 0;
      const u = this.uniforms;
      u.uBend.value = 0;
      u.uRepeat.value = 1;
      u.uBlur.value = 0;
      u.uWidth.value = META.tile[0] * s;
      u.uFocus.value = focus;
      return;
    }
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
    if (SWAY) this.offset += v;
    else this.angle += v;
    this.spinVel = this.spinVel * 0.6 + v * 5;
  }

  // spin: blend the two loaded frames around the current angle, looping every half turn
  setSpin() {
    const frames = this.frames;
    const n = frames.length;
    let a = (this.angle / this.period) % 1;
    if (a < 0) a += 1;
    const f = a * n;
    let i0 = Math.floor(f) % n;
    let back = 0;
    while (!frames[i0] && back < n) { // frame 0 always loads first
      i0 = (i0 - 1 + n) % n;
      back++;
    }
    let i1 = (i0 + 1) % n;
    let ahead = 1;
    while (!frames[i1] && ahead < n) {
      i1 = (i1 + 1) % n;
      ahead++;
    }
    const pos = f - Math.floor(f) + back; // how far past frame i0 we are, in frame steps
    const u = this.uniforms;
    u.uA.value = frames[i0];
    u.uB.value = frames[i1];
    u.uMix.value = THREE.MathUtils.clamp(pos / ahead, 0, 1);
    u.uShiftA.value = u.uShiftB.value = 0;
    // neighbouring frames with a motion map between them: draw the true in-between image
    const flow = ahead === 1 ? this.flows[i0] : null;
    u.uMotion.value = flow;
    u.uMotionOn.value = flow ? 1 : 0;
  }

  // sway: blend the two loaded frames around the current angle
  setSway() {
    const frames = this.frames;
    const n = frames.length;
    const f = THREE.MathUtils.clamp((this.angle / this.half) * 0.5 + 0.5, 0, 1) * (n - 1);
    let i0 = Math.floor(f);
    while (i0 > 0 && !frames[i0]) i0--;
    let i1 = Math.min(n - 1, i0 + 1);
    while (i1 < n - 1 && !frames[i1]) i1++;
    if (!frames[i1]) i1 = i0;
    const u = this.uniforms;
    u.uA.value = frames[i0];
    u.uB.value = frames[i1];
    u.uMix.value = i1 > i0 ? THREE.MathUtils.clamp((f - i0) / (i1 - i0), 0, 1) : 0;
    u.uShiftA.value = u.uShiftB.value = 0;
    // neighbouring frames with a motion map between them: draw the true in-between image
    const flow = i1 === i0 + 1 ? this.flows[i0] : null;
    u.uMotion.value = flow;
    u.uMotionOn.value = flow ? 1 : 0;
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

    if (SPIN) {
      // a steady turn (a full turn in about 24 s) plus drag momentum
      this.spinVel *= Math.exp(-dt * 2.8);
      this.angle += ((this.reduced ? 0 : 0.26) + this.spinVel) * dt;
      this.angle %= this.period * 1000; // keep it from growing without bound (whole periods, so nothing jumps)
      this.setSpin();
      return;
    }
    if (SWAY) {
      // slow back-and-forth turn; dragging adds to it with momentum, then it eases back
      this.spinVel *= Math.exp(-dt * 2.8);
      this.offset += this.spinVel * dt;
      this.offset *= Math.exp(-dt * 0.35);
      const idle = this.reduced ? 0 : Math.sin(time * 0.42) * this.half * 0.82;
      this.offset = THREE.MathUtils.clamp(this.offset, -2 * this.half, 2 * this.half);
      this.angle = THREE.MathUtils.clamp(idle + this.offset, -this.half, this.half);
      this.setSway();
      return;
    }
    // slow idle turn plus drag inertia
    this.spinVel *= Math.exp(-dt * 2.8);
    this.angle += ((this.reduced ? 0 : 0.32) + this.spinVel) * dt;
    // keep it from growing without bound, wrapping on a whole number of frame heights so nothing jumps
    this.angle %= this.step * Math.round(1 / META.shiftPerStep) * 1000;
    this.setTurn();
  }
}
