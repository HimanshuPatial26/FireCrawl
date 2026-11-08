import * as THREE from 'three';
import stripUrl from '../assets/helix-strip.webp';
import dropUrl from '../assets/helix-drop.webp';
import META from '../assets/helix-meta.json';

// Glass DNA helix for the Home hero, rendered in Blender (scripts/make-helix.py) rather than shaded live:
// clear smoky glass refracting a studio and itself only looks right path traced.
//
// It still spins. A helix turning about its axis looks exactly like a helix sliding along that axis, and the
// render is one seamless period of it (META.turns turns, transparent background), so the strip just scrolls:
// turning by an angle a moves it by pitch * a / 2pi along the axis. Drag, idle spin and the cursor ripple
// work on that scroll. The glass droplets are a second Blender render, used as sprites.
//
// The renders are display-ready sRGB. The site tone maps the whole scene in its final pass (ACES + sRGB),
// so the shader undoes that curve first: what leaves the final pass is the Blender render, pixel for pixel.

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

const STRIP_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform float uRepeat; uniform float uOffset; uniform float uOpacity;
uniform float uTime; uniform float uRipple; uniform vec2 uMouse; uniform float uAspect; uniform float uFlow;
varying vec2 vUv; varying vec2 vNdc;
${SHARED}
void main(){
  vec2 uv = vec2(vUv.x, vUv.y * uRepeat + uOffset);
  // the glass keeps moving a little, like poured liquid that has not quite set
  uv.x += (sin(uv.y * 31.0 + uTime * 1.1) * 0.0016 + sin(uv.y * 13.0 - uTime * 0.7) * 0.0012) * uFlow;
  // ring ripples around the cursor, in screen space
  vec2 d2 = (vNdc - uMouse) * vec2(uAspect, 1.0);
  float d = length(d2);
  float w = sin(d * 38.0 - uTime * 7.5) * exp(-d * 7.0) * uRipple;
  uv += normalize(d2 + 1e-5) * w * vec2(0.035, 0.012);
  vec4 t = texture2D(uTex, uv);
  if (t.a < 0.002) discard;
  float a = t.a * uOpacity;
  gl_FragColor = vec4(lvToScene(lvDecode(t.rgb / t.a)) * a, a);
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

function loadTexture(renderer, url, repeatY) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace; // sampled as stored; the shader decodes
    t.premultiplyAlpha = true; // clean filtering at the transparent edges
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
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
    const [strip, drop] = await Promise.all([loadTexture(renderer, stripUrl, true), loadTexture(renderer, dropUrl, false)]);
    return new Helix(strip, drop, opts);
  }

  constructor(strip, drop, { mobile = false, reduced = false }) {
    this.mobile = mobile;
    this.reduced = reduced;
    this.offset = 0.37; // where in the period the strip starts
    this.spinVel = 0;
    this.ripple = 0;
    this.lastPointer = null;
    this.unit = 1;
    // turning by one radian scrolls this fraction of the strip
    this.perRadian = 1 / (2 * Math.PI * META.turns);

    const shared = () => ({ uInvOut: { value: OUT_INV }, uInvIn: { value: IN_INV } });
    this.uniforms = {
      ...shared(),
      uTex: { value: strip },
      uRepeat: { value: 1 },
      uOffset: { value: this.offset },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uRipple: { value: 0 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uAspect: { value: 1 },
      uFlow: { value: reduced ? 0 : 1 },
    };
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(STRIP_FRAG, this.uniforms));
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
    const v = dxPixels * 0.006; // radians
    this.offset += v * this.perRadian;
    this.spinVel = this.spinVel * 0.6 + v * 5;
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

    // slow idle spin plus drag inertia, as scroll along the strip
    this.spinVel *= Math.exp(-dt * 2.8);
    this.offset += ((this.reduced ? 0 : 0.3) + this.spinVel) * dt * this.perRadian;
    this.offset -= Math.floor(this.offset);
    u.uOffset.value = this.offset;

    // droplets stay upright while the strip leans, and bob gently
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
