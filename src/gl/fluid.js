import * as THREE from 'three';

// Small stable-fluids solver (advect -> splat -> divergence -> pressure -> project).
// Only velocity is simulated; the post pass uses it to warp and split the image.

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ADVECT = /* glsl */ `
uniform sampler2D uVelocity; uniform vec2 uTexel; uniform float uDt; uniform float uDiss;
varying vec2 vUv;
void main(){
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
  gl_FragColor = vec4(texture2D(uVelocity, coord).xy * uDiss, 0.0, 1.0);
}
`;

const SPLAT = /* glsl */ `
uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec2 uForce; uniform float uRadius; uniform float uAspect;
varying vec2 vUv;
void main(){
  vec2 p = vUv - uPoint; p.x *= uAspect;
  vec2 add = exp(-dot(p, p) / uRadius) * uForce;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xy + add, 0.0, 1.0);
}
`;

const DIVERGENCE = /* glsl */ `
uniform sampler2D uVelocity; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

const CLEAR = /* glsl */ `
uniform sampler2D uTex; uniform float uValue;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).x * uValue, 0.0, 0.0, 1.0); }
`;

const PRESSURE = /* glsl */ `
uniform sampler2D uPressure; uniform sampler2D uDivergence; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = /* glsl */ `
uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B) * 0.5;
  gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

export class Fluid {
  constructor(renderer, { res = 128, aspect = 1.6, iterations = 12 } = {}) {
    this.r = renderer;
    this.res = res;
    this.iterations = iterations;
    this.aspect = aspect;
    this.splats = [];
    this.texel = new THREE.Vector2();

    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const [w, h] = this.dims(aspect);
    const rt = () => new THREE.WebGLRenderTarget(w, h, opts);
    this.vel = [rt(), rt()];
    this.pres = [rt(), rt()];
    this.div = rt();
    this.texel.set(1 / w, 1 / h);

    const mat = (fragmentShader, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    const tex = () => ({ value: null });
    this.mAdvect = mat(ADVECT, { uVelocity: tex(), uTexel: { value: this.texel }, uDt: { value: 0.016 }, uDiss: { value: 0.975 } });
    this.mSplat = mat(SPLAT, {
      uTarget: tex(),
      uPoint: { value: new THREE.Vector2() },
      uForce: { value: new THREE.Vector2() },
      uRadius: { value: 0.0016 },
      uAspect: { value: aspect },
    });
    this.mDiv = mat(DIVERGENCE, { uVelocity: tex(), uTexel: { value: this.texel } });
    this.mClear = mat(CLEAR, { uTex: tex(), uValue: { value: 0.8 } });
    this.mPressure = mat(PRESSURE, { uPressure: tex(), uDivergence: tex(), uTexel: { value: this.texel } });
    this.mGradient = mat(GRADIENT, { uPressure: tex(), uVelocity: tex(), uTexel: { value: this.texel } });

    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mAdvect);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  dims(aspect) {
    return aspect >= 1 ? [this.res, Math.max(32, Math.round(this.res / aspect))] : [Math.max(32, Math.round(this.res * aspect)), this.res];
  }

  resize(aspect) {
    this.aspect = aspect;
    const [w, h] = this.dims(aspect);
    [...this.vel, ...this.pres, this.div].forEach((t) => t.setSize(w, h));
    this.texel.set(1 / w, 1 / h);
    this.mSplat.uniforms.uAspect.value = aspect;
  }

  splat(x, y, fx, fy) {
    if (this.splats.length < 8) this.splats.push([x, y, fx, fy]);
  }

  pass(material, target) {
    this.quad.material = material;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  swap(pair) {
    const t = pair[0];
    pair[0] = pair[1];
    pair[1] = t;
  }

  // zero the field once motion has died out so the simulation can rest
  clear() {
    const r = this.r;
    const prev = r.getRenderTarget();
    const color = r.getClearColor(new THREE.Color());
    const alpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    [...this.vel, ...this.pres].forEach((t) => {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    });
    r.setClearColor(color, alpha);
    r.setRenderTarget(prev);
    this.cleared = true;
  }

  update(dt) {
    this.cleared = false;
    const prev = this.r.getRenderTarget();
    const a = this.mAdvect.uniforms;
    a.uVelocity.value = this.vel[0].texture;
    a.uDt.value = dt;
    this.pass(this.mAdvect, this.vel[1]);
    this.swap(this.vel);

    for (const [x, y, fx, fy] of this.splats) {
      const s = this.mSplat.uniforms;
      s.uTarget.value = this.vel[0].texture;
      s.uPoint.value.set(x, y);
      s.uForce.value.set(fx, fy);
      this.pass(this.mSplat, this.vel[1]);
      this.swap(this.vel);
    }
    this.splats.length = 0;

    this.mDiv.uniforms.uVelocity.value = this.vel[0].texture;
    this.pass(this.mDiv, this.div);

    this.mClear.uniforms.uTex.value = this.pres[0].texture;
    this.pass(this.mClear, this.pres[1]);
    this.swap(this.pres);

    const p = this.mPressure.uniforms;
    p.uDivergence.value = this.div.texture;
    for (let i = 0; i < this.iterations; i++) {
      p.uPressure.value = this.pres[0].texture;
      this.pass(this.mPressure, this.pres[1]);
      this.swap(this.pres);
    }

    const g = this.mGradient.uniforms;
    g.uPressure.value = this.pres[0].texture;
    g.uVelocity.value = this.vel[0].texture;
    this.pass(this.mGradient, this.vel[1]);
    this.swap(this.vel);

    this.r.setRenderTarget(prev);
  }

  get texture() {
    return this.vel[0].texture;
  }
}
