import { Color, Vector2 } from 'three';

/* ------------------------------------------------------------------ */
/* Shared noise                                                         */
/* ------------------------------------------------------------------ */
export const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n)); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(i); float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)); float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float amp = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += amp * vnoise(p); p = m * p; amp *= 0.5; }
  return v;
}
float fbm3(vec2 p){
  float v = 0.0; float amp = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++){ v += amp * vnoise(p); p = m * p; amp *= 0.5; }
  return v;
}
`;

/* ------------------------------------------------------------------ */
/* Generative project artwork (six styles)                              */
/* ------------------------------------------------------------------ */
const ART = /* glsl */ `
vec3 sDunes(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec2 p = vec2(uv.x * asp, uv.y);
  vec3 col = mix(a * 0.7 + b * 0.25, bg * 0.9, smoothstep(0.3, 1.0, uv.y));
  vec2 sun = vec2(asp * (0.5 + 0.2 * sin(s * 6.28)), 0.5);
  float sd = length(p - sun);
  col += a * (1.6 * smoothstep(0.064, 0.058, sd) + 0.55 * exp(-sd * 7.0) + 0.18 * exp(-sd * 1.6));
  col += a * 0.08 * fbm3(vec2(p.x * 1.2 - t * 0.015, uv.y * 10.0 + s * 3.0));
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float depth = fi / 3.0;
    float x = p.x * (1.0 + fi * 0.6) + s * 17.0 + fi * 7.3 + t * 0.005 * (fi + 1.0);
    float n = fbm3(vec2(x * 0.9, fi * 3.1 + s));
    float crest = 0.52 - fi * 0.1 + 0.13 * n - 0.05 * abs(sin(x * 0.9 + n * 2.0));
    float m = smoothstep(crest + 0.003, crest - 0.003, uv.y);
    float n2 = fbm3(vec2((x + 0.03) * 0.9, fi * 3.1 + s));
    float lit = clamp((n2 - n) * 36.0 * sign(sun.x - p.x) + 0.5, 0.0, 1.0);
    vec3 dc = mix(bg * 0.6 + b * 0.25, b * 0.9 + a * 0.1, lit * (0.3 + 0.7 * depth));
    dc += a * 0.7 * smoothstep(0.014, 0.0, crest - uv.y) * lit * (0.4 + 0.6 * depth);
    dc *= 0.93 + 0.07 * sin(uv.y * 240.0 + n * 30.0 + x * 4.0);
    dc = mix(dc, a * 0.5 + bg * 0.25, (1.0 - depth) * 0.45);
    col = mix(col, dc, m);
  }
  return col;
}

vec3 sOrbit(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec2 p = (uv - vec2(0.5 + 0.08 * sin(s * 9.0), 0.5)) * vec2(asp, 1.0);
  float ca = cos(-0.32); float sa = sin(-0.32);
  p = mat2(ca, -sa, sa, ca) * p;
  vec2 q = p * vec2(1.0, 3.2);
  float r = length(q);
  float ang = atan(q.y, q.x);
  vec3 col = bg + b * 0.35 * exp(-length(p) * 2.2);
  vec2 g = floor(uv * vec2(asp, 1.0) * 120.0);
  col += vec3(step(0.994, h21(g + s)) * (0.5 + 0.5 * sin(t * 1.7 + h21(g) * 40.0))) * 0.6;
  vec3 rings = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float R = 0.27 + fi * 0.05 + 0.012 * sin(s * 5.0 + fi);
    float wdt = 0.004 + 0.006 * h21(vec2(fi, s));
    float ring = smoothstep(wdt, 0.0, abs(r - R));
    float dirn = mod(fi, 2.0) * 2.0 - 1.0;
    float gaps = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(ang * (2.0 + fi) + t * (0.12 + 0.04 * fi) * dirn + s * 11.0));
    rings += mix(b * 1.4, a, fi / 6.0) * ring * (0.35 + 1.3 * gaps);
  }
  float pr = length(p);
  float planet = smoothstep(0.205, 0.198, pr);
  vec3 pc = bg * 0.4 + b * 0.5 * smoothstep(0.26, 0.0, length(p - vec2(-0.07, 0.07)));
  pc += a * 0.9 * smoothstep(0.17, 0.205, pr) * smoothstep(0.0, 0.12, p.x + p.y + 0.12);
  float front = step(q.y, 0.0);
  col = mix(col, pc, planet);
  col += rings * mix(1.0, front, planet);
  return col;
}

vec3 sMarble(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec2 p = vec2(uv.x * asp, uv.y) * 1.7 + s * 10.0;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.03)), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 0.02), fbm(p + 3.5 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 3.5 * r);
  vec3 col = mix(bg, b * 1.1, smoothstep(0.2, 0.75, f));
  col = mix(col, a, smoothstep(0.55, 0.95, f * f * 1.6 + 0.3 * length(q)));
  col += a * 0.3 * pow(smoothstep(0.45, 1.05, length(r)), 3.0);
  return col;
}

vec3 sGrid(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  float hz = 0.44;
  float z = 0.22 / max(hz - uv.y, 0.002);
  vec2 g = vec2((uv.x - 0.5) * asp * z * 2.2, z * 1.6 + t * 0.35);
  vec2 gw = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
  float line = 1.0 - min(min(gw.x, gw.y), 1.0);
  vec3 col = mix(bg, b * 0.6 + bg * 0.4, smoothstep(1.0, hz, uv.y) * 0.7);
  col += a * exp(-abs(uv.y - hz) * 22.0) * 0.8;
  if (uv.y < hz){
    float fade = exp(-z * 0.35);
    col = mix(bg * 0.6, col, 0.25);
    col += mix(b * 1.5, a, fade) * line * fade * 1.2;
    col += a * 0.15 * exp(-(hz - uv.y) * 12.0);
  } else {
    float cx = floor(uv.x * asp * 46.0 + s * 50.0);
    float hgt = hz + 0.03 + 0.22 * pow(h21(vec2(cx, s)), 3.0);
    if (uv.y < hgt){
      vec2 wv = floor(vec2(uv.x * asp * 184.0, uv.y * 220.0));
      float win = step(0.86, h21(wv + s)) * (0.6 + 0.4 * sin(t * 0.8 + h21(wv) * 30.0));
      col = bg * 0.45 + b * 0.12 + a * win * 0.6;
    }
  }
  return col;
}

vec3 sAurora(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec3 col = mix(bg * 1.3 + b * 0.08, bg * 0.6, uv.y);
  vec2 g = floor(uv * vec2(asp, 1.0) * 110.0);
  col += step(0.996, h21(g + s)) * 0.6 * smoothstep(0.3, 1.0, uv.y);
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float x = uv.x * asp * (1.0 + fi * 0.3) + s * 9.0 + fi * 3.7;
    float y0 = 0.52 + 0.12 * sin(x * 1.3 + t * 0.11 + fi) + 0.1 * fbm3(vec2(x * 1.5, t * 0.05 + fi));
    float d = uv.y - y0;
    float curtain = exp(-max(d, 0.0) * mix(5.0, 12.0, fi / 4.0)) * smoothstep(-0.03, 0.01, d);
    float streak = 0.5 + 0.5 * vnoise(vec2(x * 26.0, t * 0.3 + fi));
    col += mix(a, b * 1.6, fi / 4.0) * curtain * streak * 0.42;
  }
  float m = 0.2 + 0.12 * fbm3(vec2(uv.x * asp * 2.0 + s * 4.0, 0.0));
  float mountain = smoothstep(m + 0.003, m - 0.003, uv.y);
  col = mix(col, bg * 0.25 + a * 0.03, mountain);
  return col;
}

vec3 sCrystal(vec2 uv, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec2 p = vec2(uv.x * asp, uv.y) * 5.0 + s * 5.0;
  vec2 ip = floor(p); vec2 fp = fract(p);
  float d1 = 8.0; float d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec2 h = h22(ip + o);
      vec2 pt = o + 0.5 + 0.4 * sin(t * 0.25 + 6.2831 * h) - fp;
      float d = dot(pt, pt);
      if (d < d1){ d2 = d1; d1 = d; id = ip + o; } else if (d < d2){ d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float r = h21(id);
  vec3 c = mix(bg * 1.2, b * 1.2, r) + a * pow(r, 5.0) * 0.9;
  c *= 0.55 + 0.7 * (1.0 - sqrt(d1));
  c += a * smoothstep(0.07, 0.0, edge) * (0.5 + 0.5 * r);
  return c;
}

vec3 art(vec2 uv, float style, float s, float t, float asp, vec3 bg, vec3 a, vec3 b){
  vec3 c;
  if (style < 0.5) c = sDunes(uv, s, t, asp, bg, a, b);
  else if (style < 1.5) c = sOrbit(uv, s, t, asp, bg, a, b);
  else if (style < 2.5) c = sMarble(uv, s, t, asp, bg, a, b);
  else if (style < 3.5) c = sGrid(uv, s, t, asp, bg, a, b);
  else if (style < 4.5) c = sAurora(uv, s, t, asp, bg, a, b);
  else c = sCrystal(uv, s, t, asp, bg, a, b);
  vec2 v = (uv - 0.5) * vec2(1.0, 1.15);
  c *= mix(0.5, 1.0, smoothstep(0.85, 0.2, length(v)));
  return max(c, 0.0);
}
`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const ART_FRAG = /* glsl */ `
uniform float uTime; uniform float uStyle; uniform float uSeed; uniform float uAspect; uniform float uZoom;
uniform vec2 uOffset; uniform vec3 uBg; uniform vec3 uA; uniform vec3 uB;
uniform sampler2D uTex; uniform float uUseTex; uniform float uTexAspect;
varying vec2 vUv;
${NOISE}
${ART}
void main(){
  vec2 uv = (vUv - 0.5) / uZoom + 0.5 + uOffset;
  vec3 c;
  if (uUseTex > 0.5){
    vec2 tuv = uv - 0.5;
    float r = uAspect / uTexAspect;
    if (r > 1.0) tuv.y /= r; else tuv.x *= r;
    c = texture2D(uTex, tuv + 0.5).rgb;
  } else {
    c = art(uv, uStyle, uSeed, uTime, uAspect, uBg, uA, uB);
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Louver slats                                                         */
/* ------------------------------------------------------------------ */
export const SLAT_VERT = /* glsl */ `
attribute float aIndex;
uniform float uCount; uniform float uWidth; uniform float uHeight; uniform float uDepth; uniform float uGap;
uniform float uArc; uniform float uSpan; uniform float uFlip; uniform float uDir; uniform float uSpread;
uniform float uOpen; uniform float uTime; uniform float uMouseX; uniform float uMouseAmt; uniform float uLift;
uniform vec2 uUvShift; uniform float uRipple;
varying vec2 vUvA; varying vec2 vUvB; varying float vFace; varying vec3 vN; varying vec3 vW; varying float vT;

mat3 rotY(float a){ float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }

void main(){
  float N = uCount; float i = aIndex; float fi = i / (N - 1.0);
  float pitch = uWidth / N;
  float w = pitch * (1.0 - uGap);
  vec3 p = position * vec3(w, uHeight, uDepth);

  // staggered flip wave
  float order = uDir > 0.0 ? fi : 1.0 - fi;
  float tt = clamp(uFlip * (1.0 + uSpread) - order * uSpread, 0.0, 1.0);
  // ease-in-out with slight anticipation and overshoot, like a sprung louver
  float c2 = 1.3725;
  float a2 = 2.0 * tt;
  float b2 = 2.0 * tt - 2.0;
  float e = tt < 0.5 ? a2 * a2 * ((c2 + 1.0) * a2 - c2) * 0.5 : (b2 * b2 * ((c2 + 1.0) * b2 + c2) + 2.0) * 0.5;
  float flip = 3.14159265 * e * uDir;

  // opening from edge-on, centre first
  float oc = abs(fi - 0.5) * 2.0;
  float ot = clamp(uOpen * 1.8 - oc * 0.8, 0.0, 1.0);
  float open = (1.0 - ot * ot * (3.0 - 2.0 * ot)) * 1.5707963;

  // position on a concave arc (arc length preserved)
  float s = (fi - 0.5) * (uWidth - pitch);
  float k = uSpan * uArc / uWidth;
  float th = s * k;
  vec3 c = vec3(s, 0.0, 0.0);
  if (k > 0.0001) c = vec3(sin(th) / k, 0.0, (1.0 - cos(th)) / k);

  // cursor opens the nearby slats
  float md = s - uMouseX;
  float tilt = uMouseAmt * exp(-md * md * 0.9) * 0.75;
  float breathe = 0.04 * sin(uTime * 0.6 + i * 0.37) * uArc;
  float ripple = uRipple * sin(fi * 19.0 - uTime * 2.4);

  float yaw = -th + flip + open + tilt + breathe + ripple;
  mat3 R = rotY(yaw);
  vec3 rp = R * p;
  float bump = sin(3.14159265 * tt);
  rp.z += bump * uLift;
  rp.y *= 1.0 - 0.05 * bump;

  vec4 world = modelMatrix * vec4(c + rp, 1.0);
  vW = world.xyz;
  vN = normalize(mat3(modelMatrix) * (R * normal));
  vFace = normal.z;
  vT = bump;
  float hu = position.x * (1.0 - uGap);
  vUvA = (vec2((i + 0.5 + hu) / N, position.y + 0.5) - 0.5) * 0.976 + 0.5 + uUvShift;
  vUvB = (vec2((i + 0.5 - hu) / N, position.y + 0.5) - 0.5) * 0.976 + 0.5 + uUvShift;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const SLAT_FRAG = /* glsl */ `
uniform sampler2D uTexA; uniform sampler2D uTexB; uniform vec3 uBg; uniform vec3 uA; uniform float uDim; uniform float uCross;
varying vec2 vUvA; varying vec2 vUvB; varying float vFace; varying vec3 vN; varying vec3 vW; varying float vT;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  vec3 col;
  if (vFace > 0.5){
    col = mix(texture2D(uTexA, vUvA).rgb, texture2D(uTexB, vUvA).rgb, uCross);
    col *= mix(0.22, 1.0, smoothstep(0.05, 0.95, facing));
    col += uA * 0.3 * vT * pow(1.0 - facing, 2.0);
  } else if (vFace < -0.5){
    col = texture2D(uTexB, vUvB).rgb;
    col *= mix(0.22, 1.0, smoothstep(0.05, 0.95, facing));
    col += uA * 0.3 * vT * pow(1.0 - facing, 2.0);
  } else {
    col = uBg * 0.5 + uA * (0.25 + 1.4 * pow(1.0 - facing, 2.0));
  }
  col *= 1.0 - uDim;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Backdrop, floor, dust, particle orb                                  */
/* ------------------------------------------------------------------ */
export const SKY_VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vP;
void main(){ vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const SKY_FRAG = /* glsl */ `
uniform vec3 uBg; uniform vec3 uA; uniform vec3 uB;
uniform float uTime; uniform float uDim; uniform float uGlow; uniform vec2 uGlowC; uniform vec2 uGlowR;
varying vec2 vUv; varying vec2 vP;
${NOISE}
void main(){
  vec3 col = uBg * 0.9 + uB * 0.06 * smoothstep(0.35, 0.75, vUv.y);
  vec2 d = (vP - uGlowC) / uGlowR;
  vec2 e1 = d * vec2(0.85, 1.25);
  vec2 e2 = d * vec2(1.4, 2.8);
  float band = exp(-dot(e1, e1));
  float core = exp(-dot(e2, e2));
  float halo = exp(-length(d) * 1.1);
  float haze = fbm3(vec2(vP.x * 0.25 + uTime * 0.03, vP.y * 0.6 - uTime * 0.02));
  col += uA * (band * 0.35 + core * 1.25 + halo * 0.08) * uGlow * (0.7 + 0.6 * haze);
  col += uB * 0.1 * haze * halo;
  col *= 1.0 - uDim;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const FloorShader = {
  name: 'LouverFloor',
  uniforms: {
    color: { value: new Color(0x7f7f7f) },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uDim: { value: 0 },
    uBg: { value: new Color() },
    uA: { value: new Color() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vW;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform float uDim;
    uniform vec3 uBg; uniform vec3 uA;
    varying vec4 vUv; varying vec3 vW;
    ${NOISE}
    void main(){
      vec2 q = vW.xz;
      float n1 = fbm3(q * 1.3 + vec2(0.0, uTime * 0.05));
      float n2 = fbm3(q * 1.3 + vec2(5.2, -uTime * 0.04));
      vec4 uv = vUv;
      uv.xy += (vec2(n1, n2) - 0.5) * 0.022 * uv.w;
      vec3 r = texture2DProj(tDiffuse, uv).rgb * 0.4;
      r += texture2DProj(tDiffuse, uv + vec4(0.0, 0.012, 0.0, 0.0) * uv.w).rgb * 0.3;
      r += texture2DProj(tDiffuse, uv + vec4(0.0, 0.028, 0.0, 0.0) * uv.w).rgb * 0.3;
      float fade = exp(-length(vW.xz - vec2(0.0, -1.5)) * 0.16);
      vec3 col = uBg * 0.45 + r * 0.42 * fade + uA * 0.02 * fade;
      col *= 1.0 - uDim;
      // blend into the mirrored backdrop towards the back so floor and sky meet without a seam
      float far = smoothstep(-1.5, -5.9, vW.z);
      col = mix(col, texture2DProj(tDiffuse, vUv).rgb, far);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export const DUST_VERT = /* glsl */ `
attribute float aRand;
uniform float uTime; uniform float uPR;
varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.11 + aRand * 20.0) * 0.4;
  p.y += sin(uTime * 0.07 + aRand * 13.0) * 0.5 + uTime * 0.02 * (aRand - 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((0.6 + aRand * 1.8) * uPR * (14.0 / max(-mv.z, 1.0)), 6.0 * uPR);
  vA = 0.12 + 0.45 * aRand;
}
`;

export const DUST_FRAG = /* glsl */ `
uniform vec3 uA; uniform float uDim;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vA * (1.0 - uDim * 0.6);
  gl_FragColor = vec4(mix(uA, vec3(1.0), 0.5), a);
}
`;

// Particle portrait built from the headshot (see scripts/make-portrait.py)
export const PORTRAIT_VERT = /* glsl */ `
attribute vec3 aCol; attribute float aRand;
uniform float uTime; uniform float uShow; uniform float uLevel; uniform float uPR; uniform float uAspect;
uniform vec2 uMouse; uniform vec3 uA; uniform float uScanH;
varying vec3 vCol; varying float vA;
void main(){
  vec3 p = position;
  float t = uTime;
  // breathing drift, and a little depth pulse with the soundtrack
  p += vec3(sin(t * 0.6 + aRand * 20.0), cos(t * 0.5 + aRand * 31.0), sin(t * 0.8 + aRand * 12.0)) * vec3(0.006, 0.006, 0.02);
  p.z += uLevel * 0.3 * aRand;

  // assemble from a scattered cloud as the page opens
  vec3 dir = normalize(vec3(sin(aRand * 91.0), cos(aRand * 47.0), sin(aRand * 13.0) + 0.3));
  vec3 scatter = p * 1.6 + dir * (1.5 + aRand * 2.5);
  float k = clamp(uShow * 1.5 - aRand * 0.5, 0.0, 1.0);
  p = mix(scatter, p, k * k * (3.0 - 2.0 * k));

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * viewMatrix * world;
  vec2 dm = (clip.xy / clip.w - uMouse) * vec2(uAspect, 1.0);
  float push = smoothstep(0.2, 0.0, length(dm));
  world.xy += normalize(dm + 1e-5) * push * 0.18;
  world.z += push * 0.35;
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((1.4 + aRand * 1.4) * uPR * (16.0 / max(-mv.z, 1.0)), 6.0 * uPR);

  // photo colour, with the dark areas tinted by the project accent so the silhouette still reads
  vec3 lin = pow(aCol, vec3(2.2));
  float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  vCol = lin * 1.3 + uA * (0.1 + 0.3 * (1.0 - l));
  // a slow scan line sweeping down the portrait
  float scanY = uScanH * 0.5 - mod(t * 0.45, uScanH * 1.6);
  vCol += uA * exp(-pow((position.y - scanY) * 7.0, 2.0)) * 0.6;
  vCol = mix(vCol, vec3(1.0), push * 0.4);
  vA = (0.32 + 0.5 * aRand) * uShow;
}
`;

export const PORTRAIT_FRAG = /* glsl */ `
varying vec3 vCol; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vCol, smoothstep(0.5, 0.05, d) * vA);
}
`;

/* ------------------------------------------------------------------ */
/* DOM-synced media planes                                              */
/* ------------------------------------------------------------------ */
export const MEDIA_VERT = /* glsl */ `
uniform float uVel;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 p = position;
  p.y += sin(uv.x * 3.14159265) * uVel;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const MEDIA_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform float uReveal; uniform vec3 uA; uniform float uSeed; uniform float uHover; uniform float uPar;
varying vec2 vUv;
${NOISE}
void main(){
  float edge = uReveal * 1.25 - 0.12 + (vnoise(vec2(vUv.x * 6.0 + uSeed * 10.0, uSeed)) - 0.5) * 0.12;
  float vis = smoothstep(edge, edge - 0.015, vUv.y);
  if (vis <= 0.001) discard;
  vec2 uv = (vUv - 0.5) / (1.08 + uHover * 0.06) + 0.5;
  uv.y -= uPar * 0.035; // image drifts slower than its frame
  vec3 c = texture2D(uTex, uv).rgb;
  float line = smoothstep(0.02, 0.0, abs(vUv.y - edge)) * (1.0 - step(0.999, uReveal));
  c += uA * line * 2.5;
  gl_FragColor = vec4(c, vis);
}
`;

/* ------------------------------------------------------------------ */
/* Post-processing                                                      */
/* ------------------------------------------------------------------ */
export const DistortShader = {
  uniforms: {
    tDiffuse: { value: null },
    tFluid: { value: null },
    uStrength: { value: 1 },
  },
  vertexShader: UV_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tFluid; uniform float uStrength;
    varying vec2 vUv;
    void main(){
      vec2 vel = texture2D(tFluid, vUv).xy;
      vec2 off = vel * 0.0003 * uStrength;
      float m = clamp(length(off) * 14.0, 0.0, 1.0);
      vec2 dir = off * 0.4 + (vUv - 0.5) * 0.002;
      vec2 uv = vUv - off;
      vec3 c = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
      c += c * m * 0.25;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uGrain: { value: 0.05 },
    uExposure: { value: 1 },
    uRes: { value: new Vector2(1, 1) },
  },
  vertexShader: UV_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; uniform float uGrain; uniform float uExposure; uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // ACES filmic fit (the curve three.js uses), then the sRGB transfer function
    vec3 lvRRT(vec3 v){
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 lvACES(vec3 c){
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= uExposure / 0.6;
      return clamp(outM * lvRRT(inM * c), 0.0, 1.0);
    }
    vec3 lvSRGB(vec3 c){
      return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
    }
    void main(){
      vec3 c = lvSRGB(lvACES(texture2D(tDiffuse, vUv).rgb));
      vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      c *= mix(0.6, 1.0, smoothstep(1.05, 0.25, length(v)));
      c += (rnd(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7) - 0.5) * uGrain;
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
