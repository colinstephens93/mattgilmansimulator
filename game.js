/* =====================================================================
   MATT GILMAN SIMULATOR  -  Three.js r128, zero build step
   ===================================================================== */
(() => {
'use strict';

/* ---------------------------- helpers ---------------------------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const rr = (a, b) => a + Math.random() * (b - a);
const damp = (k, dt) => 1 - Math.exp(-k * dt);
let _seed = 1337;
const sr = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const srr = (a, b) => a + sr() * (b - a);
function angLerp(a, b, t) { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
function fmtClock(gm) {
  gm = Math.floor(gm); let h = Math.floor(gm / 60) % 24; const m = gm % 60;
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}
const fmtShort = gm => fmtClock(gm).replace(/^0/, '');
const pad4 = n => String(Math.max(0, Math.floor(n))).padStart(4, '0');

/* ----- game clock constants (minutes since midnight) ----- */
const T_START = 450;      // 7:30 AM
const T_LATE = 511;       // 8:31 AM - hard deadline
const T_DEADLINE = 510;   // 8:30 AM
const T_SCRUM_ALERT = 615;// 10:15 AM
const T_SCRUM_END = 660;  // 11:00 AM
const T_LUNCH = 660;      // 11:00 AM
const T_CONN = 810;       // 1:30 PM
const T_END = 1020;       // 5:00 PM
const IX = 2000;          // interior world offset

/* ---------------------------- audio ------------------------------ */
const Snd = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
      // engine
      this.eng = c.createOscillator(); this.eng.type = 'sawtooth';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
      this.engG = c.createGain(); this.engG.gain.value = 0;
      this.eng.connect(lp); lp.connect(this.engG); this.engG.connect(this.master); this.eng.start();
      // noise buffer
      const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nbuf = nb;
      // tire screech (looping bandpassed noise)
      const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 5;
      this.scG = c.createGain(); this.scG.gain.value = 0;
      ns.connect(bp); bp.connect(this.scG); this.scG.connect(this.master); ns.start();
    } catch (e) { this.ctx = null; }
  },
  tone(f, d = .15, type = 'square', v = .15, slide = 0, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + .03);
  },
  noise(d = .2, v = .25, freq = 900, delay = 0, type = 'lowpass') {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * .5); s.stop(t + d + .02);
  },
  engine(on, frac = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(on ? .05 + .06 * frac : 0, t, .08);
    this.eng.frequency.setTargetAtTime(46 + frac * 120, t, .06);
  },
  screech(on) { if (!this.ctx) return; this.scG.gain.setTargetAtTime(on ? .07 : 0, this.ctx.currentTime, .05); },
  click() { this.tone(1900, .03, 'square', .06); },
  good() { this.tone(660, .08, 'square', .1); this.tone(990, .1, 'square', .1, 0, .07); },
  bad() { this.tone(180, .25, 'sawtooth', .13, -90); },
  coin() { this.tone(988, .07, 'square', .1); this.tone(1319, .18, 'square', .1, 0, .06); },
  thud(v = .3) { this.noise(.18, v, 220); this.tone(90, .15, 'sine', v, -50); },
  cone() { this.noise(.12, .22, 2500, 0, 'highpass'); this.tone(500, .12, 'triangle', .12, 400); },
  ding() { this.tone(2093, .6, 'sine', .15); this.tone(2093, .6, 'sine', .1, 0, .35); },
  alert() { for (let i = 0; i < 3; i++) { this.tone(880, .12, 'square', .1, 0, i * .22); this.tone(660, .1, 'square', .1, 0, i * .22 + .11); } },
  growl() { const c = this.ctx; if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 60; l.frequency.value = 22; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .2); g.gain.linearRampToValueAtTime(0, t + .9);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1); },
  zap() { this.tone(1200, .5, 'sawtooth', .13, -1000); this.noise(.4, .15, 3000, 0, 'highpass'); },
  chew() { this.noise(.07, .15, 700); },
  fanfare() {
    const n = [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1319, 1568];
    n.forEach((f, i) => { this.tone(f, .18, 'square', .1, 0, i * .13); this.tone(f / 2, .18, 'triangle', .1, 0, i * .13); });
    this.tone(1568, .8, 'square', .1, 0, n.length * .13); this.tone(784, .8, 'triangle', .12, 0, n.length * .13);
  },
  sad() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, .3, 'triangle', .15, 0, i * .25)); }
};

/* ------------------- portrait / fallback avatar ------------------- */
function cartoonAvatar(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), s = size / 256;
  x.scale(s, s);
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#cfe8ff'); g.addColorStop(1, '#ffffff'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#1d2a44'; x.beginPath(); x.moveTo(20, 256); x.quadraticCurveTo(128, 190, 236, 256); x.fill();
  x.fillStyle = '#f5f7fb'; x.beginPath(); x.moveTo(98, 206); x.lineTo(128, 256); x.lineTo(158, 206); x.fill();
  x.fillStyle = '#5d8fc9'; x.fillRect(120, 214, 16, 42);
  x.fillStyle = '#f1c1a4'; x.beginPath(); x.ellipse(128, 120, 62, 72, 0, 0, TAU); x.fill();
  x.fillStyle = '#c9541f'; x.beginPath(); x.ellipse(128, 62, 68, 38, 0, Math.PI, 0); x.fill();
  x.fillRect(60, 60, 14, 40); x.fillRect(182, 60, 14, 40);
  x.beginPath(); x.moveTo(70, 150); x.quadraticCurveTo(128, 260, 186, 150); x.quadraticCurveTo(128, 190, 70, 150); x.fill();
  x.fillRect(96, 140, 64, 10);
  x.fillStyle = '#b8431a'; x.fillRect(88, 88, 30, 7); x.fillRect(138, 88, 30, 7);
  x.fillStyle = '#222'; x.beginPath(); x.arc(102, 108, 5, 0, TAU); x.arc(154, 108, 5, 0, TAU); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(128, 158, 20, 8, 0, 0, Math.PI); x.fill();
  return c;
}
const avatarFallback = cartoonAvatar(256);
function installPortraitFallbacks() {
  ['portrait-img', 'title-img'].forEach(id => {
    const im = $(id); if (!im) return;
    im.addEventListener('error', () => { im.src = avatarFallback.toDataURL(); }, { once: true });
  });
}
installPortraitFallbacks();
function portraitSource() {
  const im = $('portrait-img');
  if (im && im.complete && im.naturalWidth > 0 && im.src.indexOf('data:') !== 0) return im;
  return avatarFallback;
}

/* --------------------------- three.js ---------------------------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const SKY = 0x9fd8f5;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 140, 520);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 900);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa07a, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d6, 0.9); sun.position.set(-60, 120, 80); scene.add(sun);

const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.LuminanceFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t;
})();
const matCache = {};
function M(color, o) {
  const k = color + (o ? JSON.stringify(o) : '');
  return matCache[k] || (matCache[k] = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, o || {})));
}
const BM = (color, o) => new THREE.MeshBasicMaterial(Object.assign({ color }, o || {}));
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? M(mat) : mat); }
function cyl(rt, rb, h, seg, mat) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === 'number' ? M(mat) : mat); }
function ball(r, mat, ws = 12, hs = 10) { return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof mat === 'number' ? M(mat) : mat); }
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function textTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); return t; }

/* ============================= MODELS ============================= */
const SKIN = 0xf1c1a4, GINGER = 0xc9541f, GINGER2 = 0xb8431a, NAVY = 0x1d2a44, WHITE = 0xf4f6fa, TIE = 0x5d8fc9;

function buildMatt() {
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const mkLeg = x => { const p = new THREE.Group(); p.position.set(x, 1.5, 0);
    const l = box(.62, 1.5, .66, NAVY); l.position.y = -.75; p.add(l);
    const s = box(.66, .32, 1.0, 0x0d0d12); s.position.set(0, -1.38, .18); p.add(s); inner.add(p); return p; };
  const legL = mkLeg(.4), legR = mkLeg(-.4);
  const torso = new THREE.Group(); torso.position.y = 1.5; inner.add(torso);
  torso.add(at(box(1.6, 1.75, .9, NAVY), 0, .88, 0));
  torso.add(at(box(.62, 1.55, .1, WHITE), 0, .9, .46));
  torso.add(at(box(.2, 1.05, .08, TIE), 0, .78, .52));
  torso.add(at(box(.28, .22, .1, TIE), 0, 1.38, .52));
  const lapL = box(.3, 1.1, .08, 0x141e33); lapL.position.set(.4, 1.0, .47); lapL.rotation.z = .25; torso.add(lapL);
  const lapR = box(.3, 1.1, .08, 0x141e33); lapR.position.set(-.4, 1.0, .47); lapR.rotation.z = -.25; torso.add(lapR);
  const mkArm = x => { const p = new THREE.Group(); p.position.set(x, 1.6, 0);
    const a = box(.42, 1.5, .46, NAVY); a.position.y = -.7; p.add(a);
    p.add(at(ball(.27, SKIN), 0, -1.55, 0)); torso.add(p); return p; };
  const armL = mkArm(1.0), armR = mkArm(-1.0);
  const head = new THREE.Group(); head.position.y = 2.75; torso.add(head);
  const sk = ball(.86, SKIN, 16, 12); sk.scale.set(1, 1.05, 1); head.add(sk);
  const hair = ball(.93, GINGER, 16, 10); hair.scale.set(1, .72, 1.02); hair.position.set(0, .42, -.1); head.add(hair);
  const quiff = box(1.0, .3, .5, GINGER); quiff.position.set(-.1, .78, .35); quiff.rotation.z = .12; head.add(quiff);
  const part = box(.07, .26, .9, 0x8c3412); part.position.set(.32, .83, .15); part.rotation.z = -.12; head.add(part);
  head.add(at(ball(.2, SKIN), .9, -.02, 0)); head.add(at(ball(.2, SKIN), -.9, -.02, 0));
  head.add(at(box(.4, .11, .1, GINGER2), .34, .34, .8)); head.add(at(box(.4, .11, .1, GINGER2), -.34, .34, .8));
  head.add(at(ball(.1, 0x1a1a1a, 8, 6), .34, .14, .8)); head.add(at(ball(.1, 0x1a1a1a, 8, 6), -.34, .14, .8));
  head.add(at(ball(.14, 0xe2a98a, 8, 6), 0, -.05, .86));
  const beard = ball(.88, GINGER, 14, 10); beard.scale.set(.97, .62, .88); beard.position.set(0, -.5, .08); head.add(beard);
  head.add(at(box(.72, .15, .16, GINGER), 0, -.2, .8));
  head.add(at(box(.42, .1, .06, 0xffffff), 0, -.36, .87));
  // billboard nameplate
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  spr.scale.set(5.6, 2.8, 1); spr.position.y = 7.3; root.add(spr);
  root.userData = { inner, legL, legR, torso, armL, armR, head, spr, phase: 0 };
  // blob shadow
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14), BM(0x000000, { transparent: true, opacity: .3 })); sh.rotation.x = -Math.PI / 2; sh.position.y = .06; root.add(sh);
  return root;
}
function drawNameplate(tex) {
  const c = tex.image, x = c.getContext('2d'); x.clearRect(0, 0, 256, 128);
  x.fillStyle = '#0b1220e6'; x.strokeStyle = '#ffe600'; x.lineWidth = 6;
  x.beginPath(); x.roundRect ? x.roundRect(4, 14, 248, 100, 22) : x.rect(4, 14, 248, 100); x.fill(); x.stroke();
  x.save(); x.beginPath(); x.arc(62, 64, 40, 0, TAU); x.clip();
  const draw = src => x.drawImage(src, 0, 0, src.naturalWidth || src.width, src.naturalHeight || src.height, 22, 24, 80, 80);
  try { draw(portraitSource()); x.getImageData(60, 60, 1, 1); }                 // throws if the canvas got tainted (e.g. file:// origin)
  catch (e) { x.clearRect(0, 0, 256, 128); x.fillStyle = '#0b1220e6'; x.beginPath(); x.rect(4, 14, 248, 100); x.fill(); draw(avatarFallback); }
  x.restore(); x.strokeStyle = '#ffe600'; x.lineWidth = 4; x.beginPath(); x.arc(62, 64, 40, 0, TAU); x.stroke();
  x.fillStyle = '#ffe600'; x.font = '900 40px Arial Black, Arial'; x.textAlign = 'left'; x.fillText('MATT', 114, 78);
  x.fillStyle = '#fff'; x.font = '700 15px Arial'; x.fillText('EY CONSULTANT', 114, 100);
  tex.needsUpdate = true;
}

function buildPerson(shirt, pants, brief) {
  const g = new THREE.Group();
  const mk = x => { const p = new THREE.Group(); p.position.set(x, 1.1, 0); const l = box(.4, 1.1, .45, pants); l.position.y = -.55; p.add(l); g.add(p); return p; };
  const lL = mk(.25), lR = mk(-.25);
  g.add(at(box(1.0, 1.2, .6, shirt), 0, 1.7, 0));
  g.add(at(ball(.5, SKIN), 0, 2.7, 0));
  g.add(at(ball(.52, [0x3a2a1a, 0x777777, 0x222222, 0xd9a441][Math.floor(Math.random() * 4)], 10, 6), 0, 2.9, -.05));
  if (brief) g.add(at(box(.9, .6, .25, 0x6b3f1d), .8, 1.0, .2));
  g.userData = { lL, lR };
  return g;
}

function buildCamry() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = M(0x0f1116);
  body.add(at(box(3.3, 1.0, 7.0, paint), 0, 1.0, 0));
  body.add(at(box(2.9, .95, 3.4, paint), 0, 1.95, -.5));
  const glass = new THREE.MeshToonMaterial({ color: 0x24344a, transparent: true, opacity: .55, gradientMap: gradTex });
  body.add(at(box(2.96, .66, 3.0, glass), 0, 2.0, -.5));
  const ws = box(2.6, .66, .1, glass); ws.position.set(0, 2.0, 1.2); ws.rotation.x = -.5; body.add(ws);
  body.add(at(box(2.6, .66, .1, glass), 0, 2.0, -2.2));
  const hood = new THREE.Group(); hood.position.set(0, 1.5, 1.2); body.add(hood);
  hood.add(at(box(3.2, .14, 2.3, paint), 0, .02, 1.15));
  body.add(at(box(3.2, .14, 1.4, paint), 0, 1.52, -2.8));
  const bumper = new THREE.Group(); bumper.position.set(0, .85, 3.5); body.add(bumper);
  bumper.add(box(3.4, .5, .4, 0x222428)); bumper.add(at(box(1.5, .32, .06, 0xb8bcc4), 0, .08, .22));
  const headM = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), tailM = new THREE.MeshBasicMaterial({ color: 0x661111 });
  body.add(at(box(.9, .3, .15, headM), 1.15, 1.22, 3.5)); body.add(at(box(.9, .3, .15, headM), -1.15, 1.22, 3.5));
  body.add(at(box(.9, .3, .15, tailM), 1.15, 1.25, -3.5)); body.add(at(box(.9, .3, .15, tailM), -1.15, 1.25, -3.5));
  const wheels = [];
  [[1.7, 2.2], [-1.7, 2.2], [1.7, -2.2], [-1.7, -2.2]].forEach(([x, z]) => {
    const w = new THREE.Group(); w.position.set(x, .66, z);
    const t = cyl(.66, .66, .5, 12, 0x141414); t.rotation.z = Math.PI / 2; w.add(t);
    const h = cyl(.34, .34, .52, 6, 0xc0c4cc); h.rotation.z = Math.PI / 2; w.add(h); g.add(w); wheels.push(w);
  });
  // Matt at the wheel
  const driver = new THREE.Group(); driver.position.set(.75, 1.9, .2); body.add(driver);
  driver.add(at(box(.8, .9, .5, NAVY), 0, 0, -.15));
  driver.add(at(ball(.46, SKIN, 10, 8), 0, .9, -.05));
  const dh = ball(.5, GINGER, 10, 6); dh.scale.set(1, .7, 1); driver.add(at(dh, 0, 1.15, -.1));
  driver.add(at(box(.5, .35, .3, GINGER), 0, .68, .25));
  const wheelS = new THREE.Group(); wheelS.position.set(.75, 1.8, .85); wheelS.rotation.x = -.9; body.add(wheelS);
  const tor = new THREE.Mesh(new THREE.TorusGeometry(.38, .07, 6, 14), M(0x111111)); wheelS.add(tor);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 16), BM(0x000000, { transparent: true, opacity: .35 }));
  sh.rotation.x = -Math.PI / 2; sh.scale.set(2.2, 4.2, 1); sh.position.y = .06; g.add(sh);
  g.userData = { body, hood, bumper, wheels, wheelS, tailM, headM, driver };
  return g;
}

function buildSedan(color) {
  const g = new THREE.Group(), body = M(color);
  g.add(at(box(3.2, 1.0, 6.4, body), 0, 1.0, 0));
  g.add(at(box(2.8, .9, 3.2, body), 0, 1.9, -.3));
  g.add(at(box(2.86, .6, 2.9, M(0x2a3a52)), 0, 1.95, -.3));
  [[1.5, 2.1], [-1.5, 2.1], [1.5, -2.1], [-1.5, -2.1]].forEach(([x, z]) => g.add(at(box(.5, 1.1, 1.1, 0x151515), x, .55, z)));
  g.add(at(box(2.4, .3, .1, BM(0xfff1b0)), 0, 1.2, 3.2)); g.add(at(box(2.4, .3, .1, BM(0xaa1111)), 0, 1.25, -3.2));
  return g;
}
function buildCart() {
  const g = new THREE.Group();
  g.add(at(box(2.2, .8, 3.6, 0xf2f2f2), 0, .9, 0)); g.add(at(box(2.0, .15, 2.6, 0x3b8f4a), 0, 3.2, -.2));
  [[.9, -.8], [-.9, -.8], [.9, 1.0], [-.9, 1.0]].forEach(([x, z]) => g.add(at(box(.12, 1.6, .12, 0x333333), x, 2.4, z)));
  g.add(at(box(1.8, .5, .8, 0x3b8f4a), 0, 1.5, -.9));
  [[1.1, 1.2], [-1.1, 1.2], [1.1, -1.2], [-1.1, -1.2]].forEach(([x, z]) => g.add(at(box(.3, .8, .8, 0x111111), x, .4, z)));
  return g;
}
function buildVan() {
  const g = new THREE.Group();
  g.add(at(box(3.4, 3.4, 7, 0x7b4a22), 0, 2.4, 0)); g.add(at(box(3.45, .5, 7.05, 0xf1c40f), 0, 1.0, 0));
  g.add(at(box(3.0, 1.2, .1, M(0x2a3a52)), 0, 3.4, 3.5));
  [[1.7, 2.3], [-1.7, 2.3], [1.7, -2.3], [-1.7, -2.3]].forEach(([x, z]) => g.add(at(box(.4, 1.3, 1.3, 0x111111), x, .65, z)));
  return g;
}

/* ============================== WORLD ============================== */
const ext = new THREE.Group(); scene.add(ext);
const intr = new THREE.Group(); intr.position.x = IX; intr.visible = false; scene.add(intr);
const extC = { solids: [], circles: [] }, intC = { solids: [], circles: [] };
const placed = [];   // building footprints for placement checks

const ROADS = [
  { a: [-60, 0], b: [200, 0], w: 16 },
  { a: [10, 36], b: [10, 0], w: 12 },
  { a: [200, 0], b: [200, -280], w: 16 },
  { a: [200, -280], b: [440, -280], w: 16 },
  { a: [440, -280], b: [440, -560], w: 16 },
  { a: [440, -560], b: [190, -560], w: 16 }
];
const ROUTE = [[-60, 0], [200, 0], [200, -280], [440, -280], [440, -560], [190, -560]];
const ROUTE_SEG = []; let ROUTE_LEN = 0;
for (let i = 0; i < ROUTE.length - 1; i++) {
  const a = ROUTE[i], b = ROUTE[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  ROUTE_SEG.push({ a, b, l, s0: ROUTE_LEN, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }); ROUTE_LEN += l;
}
function posAtS(s) {
  s = clamp(s, 0, ROUTE_LEN - .001);
  for (const g of ROUTE_SEG) if (s <= g.s0 + g.l) { const t = s - g.s0; return { x: g.a[0] + g.dx * t, z: g.a[1] + g.dz * t, dx: g.dx, dz: g.dz }; }
  return { x: 0, z: 0, dx: 1, dz: 0 };
}
const LOT = { x0: -8, x1: 50, z0: 12, z1: 40 };
const PARK = { x0: 206, x1: 436, z0: -276, z1: -6 };
const ZONE = { x: 255, z: -564.5, w: 16, d: 7 };          // yellow parking zone
const EY = { x0: 230, x1: 280, z0: -600, z1: -574, doorX: 255 };
const DOOR_RING = { x: 255, z: -571.5, r: 5 };

function segDist(px, pz, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1]; let t = ((px - a[0]) * abx + (pz - a[1]) * abz) / (abx * abx + abz * abz);
  t = clamp(t, 0, 1); return Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
}
function roadClear(x, z) { let m = 1e9; for (const r of ROADS) m = Math.min(m, segDist(x, z, r.a, r.b) - r.w / 2); return m; }
const inRect = (x, z, r, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
function isOnRoad(x, z) { return roadClear(x, z) < 0.5 || inRect(x, z, LOT); }
function addSolid(C, cx, cz, w, d) { C.solids.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }); }
function overlapsPlaced(x, z, hw, hd, m = 3) { return placed.some(p => Math.abs(x - p.x) < hw + p.hw + m && Math.abs(z - p.z) < hd + p.hd + m); }

/* ---- facade textures ---- */
const facadeSrc = {};
function facadeImg(kind) {
  if (facadeSrc[kind]) return facadeSrc[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64);
  if (kind === 'brick') { x.strokeStyle = '#d8c6bd'; x.lineWidth = 1; for (let y = 0; y < 64; y += 8) { x.beginPath(); x.moveTo(0, y); x.lineTo(64, y); x.stroke(); for (let b = (y / 8) % 2 ? 0 : 8; b < 64; b += 16) { x.beginPath(); x.moveTo(b, y); x.lineTo(b, y + 8); x.stroke(); } } }
  x.fillStyle = kind === 'glass' ? '#4d6f94' : '#7ea0c4'; x.fillRect(12, 14, 40, 30);
  x.fillStyle = '#e6f2ff'; x.fillRect(14, 16, 14, 10);
  x.strokeStyle = '#e8e8ee'; x.lineWidth = 3; x.strokeRect(12, 14, 40, 30);
  return facadeSrc[kind] = c;
}
const facadeMats = {};
function facadeMat(kind, color, rw, rh) {
  rw = Math.max(1, Math.round(rw)); rh = Math.max(1, Math.round(rh));
  const k = kind + color + rw + 'x' + rh; if (facadeMats[k]) return facadeMats[k];
  const t = new THREE.CanvasTexture(facadeImg(kind)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rw, rh);
  return facadeMats[k] = new THREE.MeshToonMaterial({ color, map: t, gradientMap: gradTex });
}
function addBuilding(x, z, w, d, h, color, o = {}) {
  const kind = o.kind || 'plain', story = 5;
  const sx = facadeMat(kind, color, d / 7, h / story), sz = facadeMat(kind, color, w / 7, h / story);
  const top = M(o.roofColor || 0x6d6d78);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sx, sx, top, top, sz, sz]); m.position.set(x, h / 2, z); ext.add(m);
  if (o.pitched) { const r = new THREE.Mesh(new THREE.ConeGeometry(.7071, 1, 4), M(o.roofColor || 0x8a6e5a)); r.rotation.y = Math.PI / 4; r.scale.set(w * 1.04, 3.2, d * 1.04); r.position.set(x, h + 1.6, z); ext.add(r); }
  addSolid(extC, x, z, w, d); placed.push({ x, z, hw: w / 2, hd: d / 2 });
  return m;
}
function addOak(x, z, s = 1) {
  const g = new THREE.Group(); g.add(at(cyl(.5 * s, .8 * s, 4.5 * s, 7, 0x6b4a2a), 0, 2.25 * s, 0));
  const c1 = ball(3.4 * s, 0x2f7d3a, 8, 6); c1.position.y = 6.4 * s; c1.scale.y = .8; g.add(c1);
  const c2 = ball(2.5 * s, 0x3b8f45, 8, 6); c2.position.set(1.8 * s, 5.4 * s, 1 * s); g.add(c2);
  for (let i = 0; i < 6; i++) { const a = i * 1.05, m = box(.18, 2.2 * s, .18, 0xaebd96); m.position.set(Math.cos(a) * 2.6 * s, 4.3 * s, Math.sin(a) * 2.6 * s); g.add(m); }
  g.position.set(x, 0, z); ext.add(g); extC.circles.push({ x, z, r: .9 * s });
}
function addPalm(x, z) {
  const g = new THREE.Group(); const t = cyl(.3, .5, 9, 6, 0x8a6a45); t.position.y = 4.5; t.rotation.z = .08; g.add(t);
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.55, 5, 4), M(0x2c9a4b)); const a = i / 7 * TAU;
    f.position.set(Math.cos(a) * 1.6 + .4, 9.2, Math.sin(a) * 1.6); f.rotation.z = Math.cos(a) * 1.25 - 1.57 * 0; f.rotation.x = -Math.sin(a) * 1.25; f.scale.y = 1; g.add(f); }
  g.position.set(x, 0, z); ext.add(g); extC.circles.push({ x, z, r: .6 });
}
function labelPlane(text, w, h, bg, fg, sub) {
  const tex = textTex(512, Math.round(512 * h / w), (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H); x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + (sub ? H * .5 : H * .62) + 'px Arial Black, Arial'; x.fillText(text, W / 2, sub ? H * .4 : H / 2);
    if (sub) { x.font = '800 ' + H * .2 + 'px Arial'; x.fillText(sub, W / 2, H * .8); }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

/* ---- terrain hills (Cascades Park) ---- */
const HILLS = [{ x: 262, z: -64, r: 20, h: 3.2 }, { x: 385, z: -70, r: 30, h: 6 }, { x: 268, z: -205, r: 30, h: 6.5 }, { x: 410, z: -230, r: 22, h: 4 }];
function terrainH(x, z) {
  let h = 0; for (const k of HILLS) { const d = Math.hypot(x - k.x, z - k.z); if (d < k.r) h = Math.max(h, k.h * Math.sqrt(1 - (d / k.r) ** 2)); } return h;
}

function buildExterior() {
  /* ground */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), M(0x78c466)); ground.rotation.x = -Math.PI / 2; ground.position.set(250, 0, -280); ext.add(ground);
  const park = new THREE.Mesh(new THREE.PlaneGeometry(PARK.x1 - PARK.x0 + 24, PARK.z1 - PARK.z0 + 24), M(0x66bb55)); park.rotation.x = -Math.PI / 2; park.position.set((PARK.x0 + PARK.x1) / 2, .03, (PARK.z0 + PARK.z1) / 2); ext.add(park);
  /* roads: textured asphalt (edge lines, double-yellow centre), plain intersection patches, curbs */
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const roadTex = center => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#3a3e47'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 900; i++) { const v = 48 + Math.floor(Math.random() * 30); g.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 8) + ')'; g.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    g.fillStyle = 'rgba(20,22,28,.22)'; g.fillRect(0, 34, 256, 14); g.fillRect(0, 80, 256, 14);          // tyre wear
    g.fillStyle = '#f1f1ec'; g.fillRect(0, 7, 256, 4); g.fillRect(0, 117, 256, 4);                           // edge lines
    if (center) { g.fillStyle = '#f2c200'; g.fillRect(0, 59, 256, 3); g.fillRect(0, 66, 256, 3); }          // double yellow
    else { g.fillStyle = '#e8e8e2'; for (let x = 0; x < 256; x += 64) g.fillRect(x, 62, 36, 3); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
  };
  const flat = (geo, tex, x, y, z, ry) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })); m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.rotation.y = ry || 0; m.position.set(x, y, z); ext.add(m); return m; };
  const plainTex = roadTex(false); plainTex.repeat.set(1, 1);
  ROADS.forEach(r => {
    let ax = r.a[0], az = r.a[1], bx = r.b[0], bz = r.b[1]; const aisle = r.w <= 12;
    if (aisle) { const l0 = Math.hypot(bx - ax, bz - az); bx = ax + (bx - ax) / l0 * (l0 - 8); bz = az + (bz - az) / l0 * (l0 - 8); }   // stop at the road edge
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
    const tex = roadTex(!aisle); tex.repeat.set(len / 32, 1);
    flat(new THREE.PlaneGeometry(len, r.w), tex, (ax + bx) / 2, .1, (az + bz) / 2, ang);
    if (aisle) return;
    // curbs / sidewalks either side, trimmed where other roads cross
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, trimA = r.a === ROUTE[0] || (r.a[0] === -60) ? 0 : 10.4, trimB = r.b[0] === 190 ? 0 : 10.4;
    [1, -1].forEach(side => {
      if (r.b[0] === 190 && side === 1) return;                   // college ave north side has its own sidewalk
      let spans = [[trimA, len - trimB]];
      if (r.a[0] === -60 && side === 1) spans = [[trimA, 62], [78, len - trimB]];   // gap for the Southwood lot aisle
      spans.forEach(([t0, t1]) => { const l = t1 - t0; if (l < 2) return; const off = r.w / 2 + 1.3, tm = (t0 + t1) / 2;
        const m = box(l, .22, 2.6, 0xb9b6ae); m.position.set(ax + ux * tm + nx * off * side, .11, az + uz * tm + nz * off * side); m.rotation.y = ang; ext.add(m); });
    });
  });
  [[200, 0], [200, -280], [440, -280], [440, -560]].forEach(([x, z]) => flat(new THREE.PlaneGeometry(16, 16), plainTex, x, .105, z, 0));
  /* southwood lot */
  const lot = box(LOT.x1 - LOT.x0, .1, LOT.z1 - LOT.z0, 0x555a64); lot.position.set((LOT.x0 + LOT.x1) / 2, .07, (LOT.z0 + LOT.z1) / 2); ext.add(lot);
  for (let x = LOT.x0 + 6; x < LOT.x1; x += 8) { const l = box(.3, .02, 7, 0xeeeeee); l.position.set(x, .14, 34); ext.add(l); }
  /* sidewalk strip & brick crosswalks downtown */
  const sw = box(260, .16, 4, 0xcdb89c); sw.position.set(320, .08, -570.5); ext.add(sw);
  [[440, -420, true], [330, -560, false]].forEach(([x, z, vert]) => {
    for (let i = -3; i <= 3; i++) { const s = vert ? box(16, .03, .8, 0xa4553a) : box(.8, .03, 16, 0xa4553a); s.position.set(vert ? x : x + i * 1.6, .14, vert ? z + i * 1.6 : z); ext.add(s); }
  });

  /* ---------- ZONE 1: Southwood ---------- */
  const pastel = [0xf7c6d0, 0xc6e4f7, 0xfbe3a8, 0xc9f0cf, 0xe2d0f5, 0xffd8b5];
  for (let x = -54; x <= 120; x += 26) addBuilding(x, 64, 21, 16, 9, pastel[Math.abs(x / 26 | 0) % 6], { pitched: true, kind: 'plain' });
  for (let x = -54; x <= 170; x += 28) addBuilding(x, -32, 22, 15, 9, pastel[(Math.abs(x / 28 | 0) + 2) % 6], { pitched: true, kind: 'plain' });
  const sign = labelPlane('THE CANOPY OAKS', 12, 5, '#2d5a3d', '#fff2c6', 'AT SOUTHWOOD'); sign.position.set(-30, 5, 8); ext.add(sign);
  ext.add(at(box(.5, 5, .5, 0x6b4a2a), -35, 2.5, 8)); ext.add(at(box(.5, 5, .5, 0x6b4a2a), -25, 2.5, 8));
  [[-60, 190, -15], [-20, 100, 44]].forEach(([a, b, z]) => {
    const rail = box(b - a, .3, .3, 0xffffff); rail.position.set((a + b) / 2, 1.4, z); ext.add(rail);
    for (let x = a; x <= b; x += 3) ext.add(at(box(.35, 2, .2, 0xffffff), x, 1, z));
    addSolid(extC, (a + b) / 2, z, b - a, .5);
  });

  /* ---------- ZONE 2: Cascades Park & corridor ---------- */
  HILLS.forEach(k => { const m = new THREE.Mesh(new THREE.SphereGeometry(k.r, 18, 8, 0, TAU, 0, Math.PI / 2), M(0x58aa4a)); m.scale.y = k.h / k.r; m.position.set(k.x, 0, k.z); ext.add(m); });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 13, 20, 1, true, 0, Math.PI), new THREE.MeshToonMaterial({ color: 0xe6e8ee, side: THREE.DoubleSide, gradientMap: gradTex }));
  shell.position.set(400, 6.5, -120); shell.rotation.y = Math.PI / 2 + .3; ext.add(shell);
  ext.add(at(box(30, .8, 16, 0x8b8f99), 400, .4, -122)); addSolid(extC, 400, -128, 30, 8);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(14, 20), M(0x4aa3df)); pond.rotation.x = -Math.PI / 2; pond.position.set(330, .06, -250); ext.add(pond);
  // office blocks beside the corridor
  for (let i = 0; i < 6; i++) { const x = 120 + (i % 2) * 40, z = -60 - i * 45; if (roadClear(x, z) > 30) addBuilding(x, z, 30, 30, srr(12, 22), [0xd7c9b8, 0xc8cfd8][i % 2], { kind: 'brick' }); }

  /* ---------- ZONE 3: Downtown / Capitol ---------- */
  for (let cx = 222; cx <= 420; cx += 46) for (let cz = -330; cz <= -520; cz -= 46) {
    if (roadClear(cx, cz) < 22 || overlapsPlaced(cx, cz, 15, 15, 2)) continue;
    addBuilding(cx, cz, srr(26, 32), srr(26, 32), srr(12, 36), [0xb4623f, 0xc9a07c, 0xa4553a, 0xd8cbbd][Math.floor(sr() * 4)], { kind: 'brick', roofColor: 0x555560 });
  }
  for (let cx = 100; cx <= 170; cx += 46) for (let cz = -330; cz >= -560; cz -= 46) if (roadClear(cx, cz) > 20) addBuilding(cx, cz, 30, 30, srr(10, 28), [0xb4623f, 0xc9a07c][Math.floor(sr() * 2)], { kind: 'brick' });
  // Capitol tower (22 stories) + historic Capitol dome
  const tow = new THREE.Mesh(new THREE.BoxGeometry(24, 88, 24), [facadeMat('glass', 0xf0efe8, 4, 18), facadeMat('glass', 0xf0efe8, 4, 18), M(0xdddddd), M(0xdddddd), facadeMat('glass', 0xf0efe8, 4, 18), facadeMat('glass', 0xf0efe8, 4, 18)]);
  tow.position.set(520, 44, -470); ext.add(tow); addSolid(extC, 520, -470, 24, 24); placed.push({ x: 520, z: -470, hw: 12, hd: 12 });
  ext.add(at(box(14, 8, 14, 0xe8e6de), 520, 92, -470));
  const dome = new THREE.Group(); dome.position.set(500, 0, -370);
  dome.add(at(box(44, 20, 28, 0xf2eee3), 0, 10, 0));
  for (let i = -5; i <= 5; i++) dome.add(at(box(1.6, 3.2, 1.2, i % 2 ? 0xd33a3a : 0xffffff), i * 3.8, 12.6, 14.3));
  dome.add(at(cyl(7, 8, 6, 14, 0xf6f4ec), 0, 23, 0));
  const dm = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 8, 0, TAU, 0, Math.PI / 2), M(0xd9dde4)); dm.position.y = 26; dome.add(dm);
  dome.add(at(cyl(.2, .2, 4, 6, 0xffd23a), 0, 35, 0)); ext.add(dome); addSolid(extC, 500, -370, 44, 28); placed.push({ x: 500, z: -370, hw: 22, hd: 14 });
  for (let z = -300; z >= -540; z -= 40) { const x = 475; if (!overlapsPlaced(x, z, 12, 12, 0)) addBuilding(x + 10, z, 28, 28, srr(10, 24), 0xb4623f, { kind: 'brick' }); }
  // palms
  for (let x = 300; x <= 430; x += 14) if (Math.abs(x - 330) > 6) addPalm(x, -574);
  for (let z = -300; z >= -540; z -= 18) addPalm(453.5, z);
  // double-parked delivery vans on Monroe St
  [-330, -405, -490].forEach(z => { const v = buildVan(); v.position.set(446, 0, z); ext.add(v); addSolid(extC, 446, z, 3.6, 7.2); });
  // angled street parking along E College Ave
  const pcol = [0xd33, 0x3a6ee0, 0xdddddd, 0x3aa655, 0xe8b923, 0x888888];
  for (let x = 216; x <= 410; x += 10.5) { if (Math.abs(x - 330) < 12) continue; const c = buildSedan(pcol[Math.floor(x) % 6]); c.position.set(x, 0, -547.5); c.rotation.y = .55; ext.add(c); addSolid(extC, x, -547.5, 3.6, 5.4); }
  for (let x = 296; x <= 420; x += 10.5) { const c = buildSedan(pcol[Math.floor(x + 2) % 6]); c.position.set(x, 0, -571); c.rotation.y = Math.PI - .55; ext.add(c); addSolid(extC, x, -571, 3.6, 5.4); }

  /* ---------- ZONE 4: EY office (210 E College Ave) ---------- */
  const eyw = EY.x1 - EY.x0, eyd = EY.z1 - EY.z0;
  const eyb = new THREE.Mesh(new THREE.BoxGeometry(eyw, 15, Math.abs(eyd)), [facadeMat('brick', 0xc9714f, 7, 3), facadeMat('brick', 0xc9714f, 7, 3), M(0x555560), M(0x555560), facadeMat('brick', 0xc9714f, 7, 3), facadeMat('brick', 0xc9714f, 7, 3)]);
  eyb.position.set((EY.x0 + EY.x1) / 2, 7.5, (EY.z0 + EY.z1) / 2); ext.add(eyb);
  ext.add(at(box(eyw + .4, 5.4, .4, 0xe9dfc9), 255, 2.7, EY.z1 + .2));
  const glassM = new THREE.MeshToonMaterial({ color: 0x6db3e8, transparent: true, opacity: .7, gradientMap: gradTex });
  [238, 246, 264, 272].forEach(x => { ext.add(at(box(6.4, 4, .3, glassM), x, 2.8, EY.z1 + .45)); const aw = box(7.4, .3, 3.2, 0xffd900); aw.position.set(x, 5.9, EY.z1 + 1.6); aw.rotation.x = .3; ext.add(aw); });
  ext.add(at(box(4.4, 4.6, .3, M(0x9fd6ff, { transparent: true, opacity: .75 })), 255, 2.5, EY.z1 + .5));
  ext.add(at(box(4.8, .5, .5, 0x222222), 255, 5.0, EY.z1 + .6));
  for (let i = 0; i < 6; i++) ext.add(at(box(2.4, 2.6, .25, glassM), 236 + i * 8, 11.2, EY.z1 + .1));
  const eys = labelPlane('EY', 15, 5.2, '#1a1a24', '#ffe600', '210 E COLLEGE AVE'); eys.position.set(255, 8.6, EY.z1 + .55); ext.add(eys);
  addSolid(extC, 255, -587, eyw, 26);
  addBuilding(205, -585, 34, 24, 13, 0xb4623f, { kind: 'brick' }); addBuilding(310, -585, 40, 24, 16, 0xc9a07c, { kind: 'brick' });
  // parking zone
  const zt = textTex(256, 128, (x, W, H) => { x.fillStyle = '#ffe600'; x.fillRect(0, 0, W, H); x.strokeStyle = '#111'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, H - 8);
    x.fillStyle = '#111'; x.font = '900 46px Arial Black,Arial'; x.textAlign = 'center'; x.fillText('EY PARKING', W / 2, 62); x.font = '800 20px Arial'; x.fillText('PARK HERE', W / 2, 98); });
  zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.w, ZONE.d), new THREE.MeshBasicMaterial({ map: zt, transparent: true, opacity: .6 }));
  zoneMesh.rotation.x = -Math.PI / 2; zoneMesh.position.set(ZONE.x, .2, ZONE.z); ext.add(zoneMesh);
  doorRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 28), new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: .8, side: THREE.DoubleSide }));
  doorRing.rotation.x = -Math.PI / 2; doorRing.position.set(DOOR_RING.x, .25, DOOR_RING.z); ext.add(doorRing);

  /* ---------- trees ---------- */
  const trySpot = (x, z, s) => { if (roadClear(x, z) < 6 || inRect(x, z, LOT, 14) || overlapsPlaced(x, z, 2, 2, 2)) return; if (Math.hypot(x - 255, z + 580) < 30) return; addOak(x, z, s); };
  for (let x = -50; x < 190; x += 15) { trySpot(x + srr(-3, 3), -14 + srr(-1, 1), srr(.9, 1.3)); trySpot(x + srr(-3, 3), 18 + srr(0, 20), srr(.9, 1.3)); }
  for (let z = -20; z > -280; z -= 17) { trySpot(184 + srr(-3, 1), z, srr(.9, 1.3)); trySpot(216 + srr(-1, 3), z, srr(.9, 1.3)); }
  for (let i = 0; i < 40; i++) { const x = srr(PARK.x0 + 8, PARK.x1 - 8), z = srr(PARK.z0 + 8, PARK.z1 - 8);
    const t = (x - 200) / 240, lz = -280 * t; if (Math.abs(z - lz) < 22) continue;   // keep the shortcut corridor clear
    if (HILLS.some(k => Math.hypot(x - k.x, z - k.z) < k.r + 3)) continue; if (Math.hypot(x - 400, z + 125) < 24) continue;
    trySpot(x, z, srr(.9, 1.4)); }
  for (let x = 210; x < 440; x += 22) trySpot(x, -296 + srr(-2, 2), srr(.9, 1.2));
}
let zoneMesh, doorRing;

/* ---- cones (launchable) ---- */
const cones = [];
const coneGeo = new THREE.CylinderGeometry(.12, .62, 1.5, 8), stripeGeo = new THREE.CylinderGeometry(.34, .42, .28, 8);
const coneMat = M(0xff6a1a), stripeMat = M(0xffffff);
function buildCones() {
  [.1, .165, .24, .3, .38, .45, .55, .62, .7, .78, .85, .92].forEach(f => {
    const base = ROUTE_LEN * f, side = Math.floor(sr() * 2) ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const p = posAtS(base + i * 2.8), off = clamp(side * (6 - i * 2.2) + srr(-.6, .6), -6.5, 6.5), rx = -p.dz, rz = p.dx;
      const g = new THREE.Group(); g.add(new THREE.Mesh(coneGeo, coneMat)); const st = new THREE.Mesh(stripeGeo, stripeMat); st.position.y = .15; g.add(st); g.children[0].position.y = .75; st.position.y = .85;
      g.position.set(p.x + rx * off, 0, p.z + rz * off); ext.add(g);
      cones.push({ g, x: g.position.x, z: g.position.z, state: 0, vx: 0, vy: 0, vz: 0, t: 0, spin: 0 });
    }
  });
}

/* ---- collectibles ---- */
const COLL = {
  tupper: { color: 0xffc400, pts: 250, label: 'GOLDEN TUPPERWARE +250', mini: '#ffc400' },
  cooler: { color: 0xa24bff, pts: 300, label: 'TOKEN COOLER +300', mini: '#c07bff' },
  brew: { color: 0xb87333, pts: 150, label: 'COLD BREW +150  TURBO!', mini: '#e0a060' },
  badge: { color: 0xffd23a, pts: 500, label: 'GOLDEN EY BADGE +500', mini: '#fff27a' }
};
const collectibles = [];
function makeCollectible(type, x, z, loc) {
  const g = new THREE.Group(), cfg = COLL[type], em = { emissive: cfg.color, emissiveIntensity: .45 };
  if (type === 'tupper') { g.add(at(box(1.8, 1.1, 1.3, M(cfg.color, em)), 0, 0, 0)); g.add(at(box(1.9, .3, 1.4, M(0xfff3b0, em)), 0, .65, 0)); }
  else if (type === 'cooler') { g.add(cyl(.8, .6, 1.5, 10, M(cfg.color, em))); g.add(at(cyl(.85, .85, .25, 10, M(0xffffff)), 0, .85, 0)); g.add(at(cyl(.08, .08, 1.0, 5, M(0xffffff)), .2, 1.4, 0)); }
  else if (type === 'brew') { g.add(cyl(.8, .6, 1.5, 10, M(0xf2f2f2))); g.add(at(cyl(.82, .62, .8, 10, M(cfg.color, em)), 0, -.3, 0)); g.add(at(cyl(.85, .85, .2, 10, M(0x222222)), 0, .85, 0)); }
  else { const c = cyl(1.0, 1.0, .25, 10, M(cfg.color, em)); c.rotation.x = Math.PI / 2; g.add(c); g.add(at(box(.9, .5, .3, M(0x111111)), 0, 0, .2)); }
  const baseY = loc === 'int' ? 2.2 : 2.6; g.position.set(x, baseY, z); (loc === 'int' ? intr : ext).add(g);
  const o = { type, x, z, loc, g, baseY, taken: false }; collectibles.push(o); return o;
}
function buildCollectibles() {
  [['brew', 70, -4], ['brew', 204, -150], ['brew', 330, -276], ['brew', 444, -400], ['brew', -20, 6],
   ['tupper', 150, 4], ['tupper', 200, -60], ['tupper', 440, -330], ['tupper', 300, -558],
   ['cooler', 120, -3], ['cooler', 284, -70], ['cooler', 440, -480], ['cooler', 360, -284],
   ['badge', 98, -22], ['badge', 395, -165]].forEach(c => makeCollectible(c[0], c[1], c[2], 'ext'));
}
function buildInteriorCollectibles() {
  makeCollectible('brew', -20, 6, 'int'); makeCollectible('tupper', 19, 18, 'int'); makeCollectible('cooler', 10, -2, 'int'); makeCollectible('badge', 27.5, -17, 'int');
}

/* ---- dynamic actors: traffic, golf carts, joggers, lobbyists ---- */
const actors = [];
function addCarActor(mesh, o) {
  mesh.visible = true; ext.add(mesh);
  const a = Object.assign({ kind: 'car', mesh, s: 0, dir: 1, speed: 14, lo: 0, hi: ROUTE_LEN, lane: 3.6, r: 2.3, stun: 0, x: 0, z: 0, h: 0, wob: 0 }, o);
  actors.push(a); return a;
}
function buildTraffic() {
  const cols = [0xd33a3a, 0x3a6ee0, 0xe6e6e6, 0x3aa655, 0xe8b923, 0x8a8f99, 0x7b3fe0];
  for (let i = 0; i < 12; i++) {
    const m = buildSedan(cols[i % cols.length]); addCarActor(m, { s: 230 + (ROUTE_LEN - 260) * (i / 12) + srr(-10, 10), dir: i % 2 ? 1 : -1, speed: srr(14, 24), lo: 215, hi: ROUTE_LEN - 20 });
  }
  for (let i = 0; i < 3; i++) addCarActor(buildCart(), { s: 40 + i * 70, dir: i % 2 ? 1 : -1, speed: 6, lo: 20, hi: 195, lane: 4, r: 1.7, cart: true });
  // morning joggers + jaywalking lobbyists
  [[30, -11, 120, -11], [60, 10, 100, 10], [140, -6, 60, -6]].forEach(([ax, az, bx, bz], i) => addPed(ax, az, bx, bz, [0xe63946, 0x2a9d8f, 0xf4a261][i], 0x222222, 4.5, false));
  [[440 - 8, -420, 440 + 10, -420], [330, -566, 330, -553]].forEach((p, i) => {
    addPed(p[0], p[1], p[2], p[3], 0x3a3f4a, 0x222233, 3, true); addPed(p[2], p[3], p[0], p[1], 0x59606e, 0x1e2233, 3.4, true); });
}
function addPed(ax, az, bx, bz, shirt, pants, speed, brief) {
  const m = buildPerson(shirt, pants, brief); ext.add(m);
  actors.push({ kind: 'ped', mesh: m, a: [ax, az], b: [bx, bz], t: Math.random(), dir: 1, speed, r: 1.0, hitT: 0, vy: 0, y: 0, x: ax, z: az, phase: Math.random() * 6 });
}

/* ========================= EY INTERIOR (cutaway) ========================= */
const RINGS = {
  turnstile: { x: -12, z: 5, r: 6.5 }, desk: { x: 0, z: -6.2, r: 4.4 }, scrum: { x: 23, z: -7.6, r: 4.6 },
  fridge: { x: 24.8, z: 17, r: 3.8 }, micro: { x: 25.3, z: 10.2, r: 3.8 }, table: { x: 20, z: 9.6, r: 4.2 }
};
let turnArm, turnSolid, coolantMesh = null;
function buildInterior() {
  const W = (w, h, d, x, y, z, c, solid = true) => { const m = box(w, h, d, c); m.position.set(x, y, z); intr.add(m); if (solid) addSolid(intC, x, z, w, d); return m; };
  const glass = new THREE.MeshToonMaterial({ color: 0x9fd6ff, transparent: true, opacity: .28, gradientMap: gradTex });
  intr.add(at(box(60, .4, 40, 0xaab3c2), 0, -.2, 0));
  intr.add(at(box(18, .06, 40, 0xcfc6b2), -21, .03, 0));
  intr.add(at(box(14, .06, 16, 0x3a4663), 23, .03, -12));
  intr.add(at(box(14, .06, 16, 0xd9cfb4), 23, .03, 12));
  W(60, 12, .6, 0, 6, -20.3, 0x30384a, false);
  const logo = labelPlane('EY', 10, 4, '#1a1a24', '#ffe600'); logo.position.set(-3, 8, -19.95); intr.add(logo);
  W(.6, 3, 40, -30.3, 1.5, 0, 0x30384a, false); W(.6, 3, 40, 30.3, 1.5, 0, 0x30384a, false); W(60, 1, .6, 0, .5, 20.3, 0x30384a, false);
  // lobby / security partition with turnstile
  W(.5, 4.5, 22, -12, 2.25, -9, 0x3b4252); W(.5, 4.5, 12, -12, 2.25, 14, 0x3b4252);
  intr.add(at(box(.7, 1.8, .7, 0x888d96), -12, .9, 2.3)); intr.add(at(box(.7, 1.8, .7, 0x888d96), -12, .9, 7.7));
  turnArm = box(.25, .25, 5, M(0xff3b3b, { emissive: 0xff0000, emissiveIntensity: .6 })); turnArm.position.set(-12, 1.5, 5); intr.add(turnArm);
  turnSolid = { x0: -12.6, x1: -11.4, z0: 2, z1: 8, off: false }; intC.solids.push(turnSolid);
  W(5, 1.4, 2, -24, .7, -6, 0x6b4a2a); const rs = labelPlane('WELCOME', 4, 1.2, '#1a1a24', '#ffe600'); rs.position.set(-24, 2.3, -6.9); intr.add(rs);
  W(1, 1, 5, -28.5, .5, 12, 0x546a8a); W(3, 1, 1.4, -26, .5, -14, 0x546a8a, false);
  // matt's desk
  W(9, 1.2, 4, 0, .6, -11, 0x8a5a33);
  [-2.3, 2.3].forEach(x => { const mon = box(3.6, 2.2, .25, 0x0d0d12); mon.position.set(x, 2.6, -11.9); mon.rotation.y = -Math.sign(x) * .18; intr.add(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.9), BM(0x3b82f6)); scr.position.set(0, 0, .14); mon.add(scr); });
  intr.add(at(box(3, .15, 1, 0x222227), 0, 1.3, -9.6)); intr.add(at(box(1, .3, .6, 0x222227), 3, 1.35, -10));
  const ch = box(2, 2.2, 2, 0x222a38); ch.position.set(0, 1.2, -7.4); intr.add(ch);
  W(6, 1.2, 3, -8.5, .6, -15.5, 0x7a7d86); W(6, 1.2, 3, 9, .6, -15.5, 0x7a7d86); W(6, 1.2, 3, 8, .6, -3, 0x7a7d86);
  [[-8.5, -16], [9, -16], [8, -3.2]].forEach(([x, z]) => intr.add(at(box(2.6, 1.6, .2, 0x15151a), x, 2.0, z)));
  // plants
  [[-26, -17], [13, 17], [28.5, 1]].forEach(([x, z]) => { intr.add(at(cyl(.8, .6, 1.2, 8, 0x8a5a33), x, .6, z)); intr.add(at(ball(1.3, 0x2f9a4d, 8, 6), x, 2.2, z)); intC.circles.push({ x, z, r: 1 }); });
  // conference room
  W(.25, 5, 16, 16, 2.5, -12, glass); W(5, 5, .25, 18.5, 2.5, -4, glass); W(5, 5, .25, 27.5, 2.5, -4, glass);
  [[16, -20], [16, -4], [30, -4], [21, -4], [25, -4]].forEach(([x, z]) => intr.add(at(box(.35, 5.2, .35, 0x222733), x, 2.6, z)));
  W(10, 1.2, 4, 23, .6, -12, 0x7a4e2b);
  for (let i = -2; i <= 2; i++) { intr.add(at(box(1.4, 1.6, 1.4, 0x222a38), 23 + i * 2, 1, -9.2)); intr.add(at(box(1.4, 1.6, 1.4, 0x222a38), 23 + i * 2, 1, -14.8)); }
  intr.add(at(cyl(.7, .7, .2, 12, M(0x222222, { emissive: 0x2b86ff, emissiveIntensity: .5 })), 23, 1.3, -12));
  const board = textTex(512, 256, (x, w, h) => { x.fillStyle = '#fafafa'; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8);
    ['TO DO', 'DOING', 'DONE'].forEach((t, i) => { x.fillStyle = '#222'; x.font = '900 28px Arial'; x.textAlign = 'center'; x.fillText(t, 85 + i * 170, 38); x.beginPath(); x.moveTo(170 * (i + 1) + 0, 50); x.lineTo(170 * (i + 1), h - 10); x.stroke();
      for (let k = 0; k < 3 - i * .8; k++) { x.fillStyle = ['#ffe66b', '#ff9aa2', '#9be7a5', '#9bd1ff'][(i + k) % 4]; x.fillRect(20 + i * 170 + k % 2 * 70, 60 + k * 55, 60, 46); } }); });
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({ map: board })); bp.position.set(23, 5.8, -19.9); intr.add(bp);
  // breakroom
  W(5, 4, .4, 18.5, 2, 4, 0x4a5368); W(5, 4, .4, 27.5, 2, 4, 0x4a5368); W(.4, 4, 16, 16, 2, 12, 0x4a5368);
  const steel = M(0xc3c9d1);
  W(3, 7, 2.6, 28, 3.5, 17.5, steel); intr.add(at(box(.15, 2.6, .2, 0x555a66), 26.4, 4, 16.2));
  W(2.6, 3, 10, 28.5, 1.5, 10, 0x8a8f99);
  intr.add(at(box(1.8, 1.2, 1.4, 0x25282e), 28.4, 3.6, 10)); intr.add(at(box(.1, .8, 1.0, M(0x27ff7a, { emissive: 0x27ff7a, emissiveIntensity: .6 })), 27.5, 3.6, 10));
  intr.add(at(cyl(3.2, 3.2, 1.2, 14, 0xd7b98a), 20, .6, 13.5)); intC.circles.push({ x: 20, z: 13.5, r: 3.3 });
  [[-4.5, 0], [4.5, 0], [0, -4.5], [0, 4.5]].forEach(([dx, dz]) => intr.add(at(box(1.3, 1.5, 1.3, 0x3a5a8a), 20 + dx, .8, 13.5 + dz)));
  // mission rings
  Object.keys(RINGS).forEach(k => { const R = RINGS[k];
    const m = new THREE.Mesh(new THREE.RingGeometry(R.r - .8, R.r, 36), new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: .85, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(R.x, .15, R.z); m.visible = false; intr.add(m); R.mesh = m; });
}

/* ============================ STATE ============================ */
const matt = buildMatt(); scene.add(matt);
const nameTex = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 256, height: 128 }));
matt.userData.spr.material.map = nameTex; drawNameplate(nameTex);
$('portrait-img').addEventListener('load', () => drawNameplate(nameTex));
const camry = buildCamry(); ext.add(camry);
const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 4), new THREE.MeshBasicMaterial({ color: 0xffe600 })); arrow.rotation.x = Math.PI; scene.add(arrow);

const G = {
  mode: 'title', loc: 'ext', inCar: false, gm: T_START, t: 0, score: 0,
  bd: { obj: 0, arrive: 0, time: 0, collect: 0, cones: 0, drift: 0, other: 0 }, counts: { cones: 0, collect: 0, drifts: 0 },
  token: 0, tokenLock: 0, meltdowns: 0, lastTap: -9, hunger: 100, buff: false, turbo: 0,
  car: { x: 24, z: 26, h: Math.PI, vx: 0, vz: 0, y: 0, susp: 0, suspV: 0, hood: 0, bump: 0, bumpV: 0, driftT: 0, lastDrift: -9, smokeT: 0, onRoad: true, steer: 0, braking: false },
  foot: { x: -2, z: 24, h: Math.PI / 2, vx: 0, vz: 0, moving: 0 },
  done: { arrive: false, scrum: false, copilot: false, lunch: false, conn: false },
  badged: false, arriveStr: '', modal: null, transition: false, ctx: null, pose: 'idle',
  copilotCount: 0, lunchStage: 0, scrumActive: false, sitX: 0, ffUsed: 0, flags: {}, coolant: null, growlT: 0, speechT: 0, zone: 1, drifting: false
};
let camShake = 0, camSnap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
G.foot.x = -2; G.foot.z = 24;

/* ============================ HELPERS ============================ */
let toastTimer = 0;
function toast(t, ms = 2200) { const e = $('toast'); e.textContent = t; e.classList.remove('hidden'); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; toastTimer = ms / 1000; }
function popup(t, color) {
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = t; if (color) d.style.color = color; d.style.left = (40 + Math.random() * 20) + '%';
  $('popups').appendChild(d); setTimeout(() => d.remove(), 1250);
}
function addScore(n, cat = 'other') { G.score += n; G.bd[cat] = (G.bd[cat] || 0) + n; }
function shakePortrait() { const p = $('portrait'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
function say(t, secs = 2.5) { G.speech = t; G.speechT = secs; }
function fade(on) { $('fade').classList.toggle('on', on); }
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/* ============================ INPUT ============================ */
const input = { x: 0, y: 0, gas: false, brake: false, sprint: false, kx: 0, ky: 0, kgas: false, kbrake: false, ksprint: false };
(function setupInput() {
  const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob'); let jid = null, cx = 0, cy = 0;
  const idle = () => { const r = zone.getBoundingClientRect(); base.style.left = Math.min(90, r.width / 2) + 'px'; base.style.top = (r.height - 100) + 'px'; base.classList.add('show'); base.style.opacity = .35; knob.style.transform = ''; };
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  zone.addEventListener('pointerdown', e => {
    if (jid !== null) return; jid = e.pointerId; try { zone.setPointerCapture(jid); } catch (_) {}
    const r = zone.getBoundingClientRect(); cx = e.clientX; cy = e.clientY; base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px'; base.style.opacity = 1; e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== jid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), M_ = 50;
    if (l > M_) { dx = dx / l * M_; dy = dy / l * M_; } setKnob(dx, dy); input.x = dx / M_; input.y = dy / M_; e.preventDefault();
  });
  const end = e => { if (e.pointerId !== jid) return; jid = null; input.x = input.y = 0; idle(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => { if (jid === null) idle(); }); setTimeout(idle, 0); G.idleJoy = idle;
  const hold = (id, prop) => { const el = $(id);
    el.addEventListener('pointerdown', e => { input[prop] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
    const up = () => { input[prop] = false; el.classList.remove('down'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up); };
  hold('btn-gas', 'gas'); hold('btn-brake', 'brake'); hold('btn-sprint', 'sprint');
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); fn(); });
  tap('btn-act', () => doAction()); tap('btn-exit', () => doAction());
  const KM = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }; const ks = {};
  const upd = () => { input.kx = (ks.r ? 1 : 0) - (ks.l ? 1 : 0); input.ky = (ks.d ? 1 : 0) - (ks.u ? 1 : 0); input.kgas = !!ks.u; };
  window.addEventListener('keydown', e => {
    if (KM[e.code]) { ks[KM[e.code]] = true; upd(); e.preventDefault(); }
    else if (e.code === 'Space') { input.kbrake = true; e.preventDefault(); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.ksprint = true;
    else if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) { if (G.mode === 'title') $('start-btn').click(); else doAction(); }
  });
  window.addEventListener('keyup', e => {
    if (KM[e.code]) { ks[KM[e.code]] = false; upd(); } else if (e.code === 'Space') input.kbrake = false; else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.ksprint = false;
  });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
})();
const stickX = () => clamp(input.x + input.kx, -1, 1), stickY = () => clamp(input.y + input.ky, -1, 1);

/* ============================ COLLISION ============================ */
function collide(px, pz, r, C) {
  let hx = 0, hz = 0, hit = false;
  for (const s of C.solids) {
    if (s.off || px < s.x0 - r || px > s.x1 + r || pz < s.z0 - r || pz > s.z1 + r) continue;
    const cx = clamp(px, s.x0, s.x1), cz = clamp(pz, s.z0, s.z1); const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      let nx, nz, pen; const d = Math.sqrt(d2);
      if (d > 1e-4) { nx = dx / d; nz = dz / d; pen = r - d; }
      else { const l = px - s.x0, rg = s.x1 - px, t = pz - s.z0, b = s.z1 - pz, m = Math.min(l, rg, t, b);
        if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rg) { nx = 1; nz = 0; pen = rg + r; } else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = b + r; } }
      px += nx * pen; pz += nz * pen; hx += nx; hz += nz; hit = true;
    }
  }
  for (const c of C.circles) {
    const dx = px - c.x, dz = pz - c.z; if (Math.abs(dx) > r + c.r || Math.abs(dz) > r + c.r) continue;
    const d = Math.hypot(dx, dz), m = r + c.r;
    if (d < m) { const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0; px += nx * (m - d); pz += nz * (m - d); hx += nx; hz += nz; hit = true; }
  }
  const hl = Math.hypot(hx, hz) || 1; return { x: px, z: pz, hit, nx: hx / hl, nz: hz / hl };
}

/* ============================ SMOKE / FX ============================ */
const puffs = [];
for (let i = 0; i < 36; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 0), new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0 })); m.visible = false; ext.add(m); puffs.push({ m, life: 0 }); }
function puff(x, z) { const p = puffs.find(q => q.life <= 0); if (!p) return; p.life = p.max = .8; p.m.position.set(x, .8, z); p.m.visible = true; p.m.scale.setScalar(.6); }
function updatePuffs(dt) { for (const p of puffs) if (p.life > 0) { p.life -= dt; const k = 1 - p.life / p.max; p.m.scale.setScalar(.6 + k * 2.4); p.m.position.y += dt * 1.5; p.m.material.opacity = (1 - k) * .55; if (p.life <= 0) p.m.visible = false; } }

/* ============================ CAR ============================ */
function crash(imp) {
  if (imp < 4) return; Snd.thud(clamp(imp / 30, .12, .5)); const c = G.car;
  if (imp > 7) shakePortrait(); c.suspV -= clamp(imp * .18, 0, 6); camShake = Math.max(camShake, clamp(imp / 25, 0, 1));
  if (imp > 16) { c.hood = 1; c.bumpV += imp * .6; }
}
function updateCar(dt) {
  const c = G.car, modal = !!G.modal;
  let ang = c.h, fx = Math.sin(ang), fz = Math.cos(ang);
  const sx = modal ? 0 : stickX(), sy = modal ? 0 : stickY();
  const gas = !modal && (input.gas || input.kgas), brake = !modal && (input.brake || input.kbrake);
  let vF = c.vx * fx + c.vz * fz;
  const onRoad = isOnRoad(c.x, c.z);
  if (onRoad !== c.onRoad) { c.suspV -= 2.5; c.onRoad = onRoad; }
  const turbo = G.turbo > 0, maxF = (onRoad ? 42 : 29) * (turbo ? 1.35 : 1);
  // steering (turn the heading, velocity lags -> natural drift)
  c.steer = lerp(c.steer, sx, damp(12, dt));
  const grounded = clamp(Math.abs(vF) / 9, 0, 1), rev = vF < -.5 ? -1 : 1;
  const drifting = brake && vF > 12;
  c.h -= c.steer * 2.35 * grounded * rev * (drifting ? 1.45 : 1) * dt;
  fx = Math.sin(c.h); fz = Math.cos(c.h); const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  vF = c.vx * fx + c.vz * fz; let vR = c.vx * rx + c.vz * rz;
  if (gas) { vF += (vF < maxF ? 82 * (1 - clamp(vF / maxF, 0, 1) * .55) : 0) * dt; }
  else if (!brake && sy < .6) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 13 * dt); }
  if (brake) { if (vF > 1) vF -= 58 * dt; else vF = Math.max(vF - 32 * dt, -13); }
  else if (!gas && sy > .6 && vF < 2) vF = Math.max(vF - 32 * dt, -13);
  if (vF > maxF) vF -= (vF - maxF) * Math.min(1, 3 * dt);
  if (!onRoad) vF *= 1 - .35 * dt;
  vF *= 1 - .12 * dt;
  vR *= Math.exp(-(drifting ? 1.5 : 8.5) * dt);
  c.vx = fx * vF + rx * vR; c.vz = fz * vF + rz * vR;
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.braking = brake && vF > 1;
  // collisions: two circles
  let nx = 0, nz = 0, hit = false;
  for (const off of [2.0, -2.0]) {
    const px = c.x + fx * off, pz = c.z + fz * off, res = collide(px, pz, 1.85, extC);
    if (res.hit) { c.x += res.x - px; c.z += res.z - pz; nx += res.nx; nz += res.nz; hit = true; }
  }
  if (hit) { const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) { c.vx -= 1.4 * vn * nx; c.vz -= 1.4 * vn * nz; c.vx *= .88; c.vz *= .88; crash(-vn); } }
  c.x = clamp(c.x, -85, 600); c.z = clamp(c.z, -690, 110);
  // cones launch
  const speed = Math.hypot(c.vx, c.vz);
  for (const k of cones) if (k.state === 0) {
    if (dist(k.x, k.z, c.x, c.z) < 3.4 || dist(k.x, k.z, c.x + fx * 2, c.z + fz * 2) < 2.8) {
      if (speed < 4) continue; k.state = 1; k.t = 0; k.vx = c.vx * 1.05 + rr(-4, 4); k.vz = c.vz * 1.05 + rr(-4, 4); k.vy = rr(15, 22); k.spin = rr(6, 12);
      G.counts.cones++; addScore(50, 'cones'); popup('+50 CONE!', '#ff9a3c'); Snd.cone(); c.vx *= .985; c.vz *= .985;
    }
  }
  // drift scoring near capitol corners
  const drifting2 = Math.abs(vR) > 6 && speed > 14;
  G.drifting = drifting2;
  c.driftT = drifting2 ? c.driftT + dt : 0;
  if (c.driftT > .55 && G.t - c.lastDrift > 3 && (dist(c.x, c.z, 440, -560) < 55 || dist(c.x, c.z, 440, -280) < 55)) {
    c.lastDrift = G.t; G.counts.drifts++; addScore(100, 'drift'); popup('CAPITOL DRIFT +100', '#7bd6ff'); Snd.coin();
  }
  if (drifting2) { c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = .045; [1.7, -1.7].forEach(s => puff(c.x - fx * 2.2 + rx * s, c.z - fz * 2.2 + rz * s)); } }
  // suspension spring, terrain
  c.suspV += (-120 * c.susp - 9 * c.suspV) * dt; c.susp += c.suspV * dt;
  c.bumpV += (-90 * c.bump - 5 * c.bumpV) * dt; c.bump += c.bumpV * dt;
  c.hood = Math.max(0, c.hood - dt * .3);
  c.y = lerp(c.y, terrainH(c.x, c.z), damp(10, dt));
  // mesh
  const u = camry.userData; camry.position.set(c.x, c.y + c.susp * .25, c.z); camry.rotation.y = c.h;
  u.body.rotation.z = clamp(vR * .012, -.1, .1) + c.steer * .03 * Math.min(1, speed / 20); u.body.rotation.x = c.susp * .05 + (brake ? .03 : gas ? -.02 : 0);
  u.body.position.y = c.susp * .3; u.hood.rotation.x = -(c.hood > 0 ? .75 * Math.min(1, c.hood * 2.5) + Math.sin(G.t * 18) * .04 * c.hood : 0);
  u.bumper.rotation.x = c.bump * .12; u.bumper.position.y = .85 + c.bump * .05;
  u.wheels.forEach((w, i) => { w.rotation.x += vF * dt / .66; if (i < 2) w.rotation.y = -c.steer * .45; });
  u.wheelS.rotation.z = -c.steer * 1.6;
  u.tailM.color.setHex(c.braking ? 0xff2222 : 0x661111);
  // audio
  const frac = clamp(speed / 42, 0, 1); Snd.engine(true, frac); Snd.screech(drifting2 || (brake && speed > 18));
  return speed;
}

/* ============================ ON FOOT ============================ */
function updateFoot(dt) {
  const f = G.foot, C = G.loc === 'ext' ? extC : intC, modal = !!G.modal || G.sitting;
  let ix = modal ? 0 : stickX(), iz = modal ? 0 : stickY(); const mag = Math.min(1, Math.hypot(ix, iz));
  const sprint = !modal && (input.sprint || input.ksprint) && mag > .15;
  const sp = (sprint ? 15 : 9.5) * (G.hunger < 30 ? .65 : 1) * (G.buff ? 1.2 : 1) * (G.turbo > 0 ? 1.5 : 1);
  const tx = mag > .05 ? ix / Math.max(mag, 1e-3) * sp * mag : 0, tz = mag > .05 ? iz / Math.max(mag, 1e-3) * sp * mag : 0;
  f.vx = lerp(f.vx, tx, damp(14, dt)); f.vz = lerp(f.vz, tz, damp(14, dt));
  f.x += f.vx * dt; f.z += f.vz * dt;
  const res = collide(f.x, f.z, .95, C); f.x = res.x; f.z = res.z;
  if (G.loc === 'int') { f.x = clamp(f.x, -29, 29); f.z = clamp(f.z, -19, 19); } else { f.x = clamp(f.x, -85, 600); f.z = clamp(f.z, -690, 110); }
  const spd = Math.hypot(f.vx, f.vz); f.moving = spd / 15;
  if (spd > .8) f.h = angLerp(f.h, Math.atan2(f.vx, f.vz), damp(14, dt));
  G.sprinting = sprint && spd > 3;
}

function poseMatt(dt) {
  const u = matt.userData, f = G.foot; let mode = G.pose;
  if (mode === 'idle' || mode === 'walk') mode = f.moving > .06 ? 'walk' : 'idle';
  u.phase += dt * (6 + 14 * f.moving * (G.sprinting ? 1.3 : 1));
  const amp = clamp(f.moving * 1.6, 0, 1.1) * (G.sprinting ? 1.15 : 1);
  if (mode === 'walk') {
    u.legL.rotation.x = Math.sin(u.phase) * amp; u.legR.rotation.x = -Math.sin(u.phase) * amp;
    u.armL.rotation.x = -Math.sin(u.phase) * amp * .9; u.armR.rotation.x = Math.sin(u.phase) * amp * .9;
    u.torso.rotation.x = G.sprinting ? .28 : .1; u.inner.position.y = Math.abs(Math.sin(u.phase)) * .22 * amp;
  } else if (mode === 'idle') {
    u.legL.rotation.x = u.legR.rotation.x = 0; u.armL.rotation.x = u.armR.rotation.x = Math.sin(G.t * 2) * .05;
    u.torso.rotation.x = 0; u.inner.position.y = Math.sin(G.t * 2.4) * .04;
  } else if (mode === 'sit') {
    u.legL.rotation.x = u.legR.rotation.x = -1.5; u.torso.rotation.x = .1; u.inner.position.y = -.05;
    const k = Math.sin(G.t * 16) * .12; u.armL.rotation.x = -1.2 + k; u.armR.rotation.x = -1.2 - k;
  } else if (mode === 'eat') {
    u.legL.rotation.x = u.legR.rotation.x = -1.5; u.inner.position.y = -.05; u.torso.rotation.x = .12 + Math.sin(G.t * 10) * .06;
    u.armR.rotation.x = -2.1 + Math.sin(G.t * 12) * .35; u.armL.rotation.x = -1.0; u.head.rotation.x = Math.sin(G.t * 10) * .1;
  } else if (mode === 'win') {
    u.armR.rotation.x = -3; u.armL.rotation.x = -3;
  }
  if (mode !== 'eat') u.head.rotation.x = 0;
  matt.rotation.y = f.h;
}

/* ============================ ACTORS ============================ */
function updateActors(dt) {
  const c = G.car, inCarExt = G.inCar && G.loc === 'ext';
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (const a of actors) {
    if (a.kind === 'car') {
      if (a.stun > 0) a.stun -= dt; else { a.s += a.dir * a.speed * dt; if (a.s > a.hi) a.s = a.lo; else if (a.s < a.lo) a.s = a.hi; }
      const p = posAtS(a.s), dx = p.dx * a.dir, dz = p.dz * a.dir; a.x = p.x - dz * a.lane; a.z = p.z + dx * a.lane; a.h = Math.atan2(dx, dz);
      a.wob = Math.max(0, a.wob - dt * 2);
      a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.h + Math.sin(G.t * 30) * .05 * a.wob;
      if (inCarExt && Math.abs(a.x - c.x) < 9 && Math.abs(a.z - c.z) < 9) {
        for (const off of [2.0, -2.0]) {
          const px = c.x + fx * off, pz = c.z + fz * off, d = dist(px, pz, a.x, a.z), m = 1.85 + a.r;
          if (d < m) {
            const nx = (px - a.x) / (d || 1), nz = (pz - a.z) / (d || 1); c.x += nx * (m - d) * .7; c.z += nz * (m - d) * .7;
            const vn = c.vx * nx + c.vz * nz; if (vn < 0) { c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz; crash(-vn + 4); }
            c.vx += nx * 3; c.vz += nz * 3; a.stun = 1.4; a.wob = 1;
          }
        }
      }
    } else {
      const ex = a.b[0] - a.a[0], ez = a.b[1] - a.a[1], len = Math.hypot(ex, ez);
      if (a.hitT > 0) { a.hitT -= dt; a.vy -= 38 * dt; a.y = Math.max(0, a.y + a.vy * dt); if (a.y === 0 && a.vy < 0) a.vy = 0; a.mesh.rotation.z += dt * 12; if (a.hitT <= 0) { a.mesh.rotation.z = 0; a.y = 0; } }
      else { a.t += a.dir * a.speed / len * dt; if (a.t > 1) { a.t = 1; a.dir = -1; } else if (a.t < 0) { a.t = 0; a.dir = 1; } }
      a.x = a.a[0] + ex * a.t; a.z = a.a[1] + ez * a.t; a.phase += dt * a.speed * 2.6;
      a.mesh.position.set(a.x, a.y, a.z); if (a.hitT <= 0) a.mesh.rotation.y = Math.atan2(ex * a.dir, ez * a.dir);
      const sw = Math.sin(a.phase) * .8; a.mesh.userData.lL.rotation.x = sw; a.mesh.userData.lR.rotation.x = -sw;
      if (inCarExt && a.hitT <= 0 && Math.abs(a.x - c.x) < 8 && Math.abs(a.z - c.z) < 8) {
        if (dist(c.x + fx * 2, c.z + fz * 2, a.x, a.z) < 2.9 || dist(c.x - fx * 2, c.z - fz * 2, a.x, a.z) < 2.9) {
          a.hitT = 1.5; a.vy = 13; Snd.tone(300, .2, 'triangle', .15, 300); popup('WHOA!', '#fff'); c.vx *= .93; c.vz *= .93;
        }
      }
    }
  }
}

function updateCones(dt) {
  for (const k of cones) if (k.state === 1) {
    k.t += dt; k.vy -= 40 * dt; k.g.position.x += k.vx * dt; k.g.position.z += k.vz * dt; k.g.position.y += k.vy * dt;
    k.g.rotation.x += k.spin * dt; k.g.rotation.z += k.spin * .7 * dt;
    if (k.g.position.y < 0) { k.g.position.y = 0; k.vy = Math.abs(k.vy) * .35; k.vx *= .7; k.vz *= .7; }
    if (k.t > 2.8) { k.state = 2; k.g.visible = false; }
  }
}

function updateCollectibles(dt) {
  const px = G.loc === 'ext' ? (G.inCar ? G.car.x : G.foot.x) : G.foot.x, pz = G.loc === 'ext' ? (G.inCar ? G.car.z : G.foot.z) : G.foot.z;
  for (const o of collectibles) {
    if (o.taken) continue; o.g.rotation.y += dt * 2.2; o.g.position.y = o.baseY + Math.sin(G.t * 3 + o.x) * .35;
    o.g.visible = o.loc === G.loc;
    if (o.loc === G.loc && Math.abs(o.x - px) < 4 && Math.abs(o.z - pz) < 4 && dist(o.x, o.z, px, pz) < (G.inCar ? 4 : 3.2)) {
      o.taken = true; o.g.visible = false; const cfg = COLL[o.type]; G.counts.collect++; addScore(cfg.pts, 'collect'); popup(cfg.label, '#ffe600'); Snd.coin();
      if (o.type === 'tupper') G.hunger = Math.min(100, G.hunger + 25);
      else if (o.type === 'cooler') { G.token = Math.max(0, G.token - 40); if (G.tokenLock > 0 && G.token < 100) { G.tokenLock = 0; G.token = Math.min(G.token, 60); } }
      else if (o.type === 'brew') G.turbo = 10;
    }
  }
  if (G.coolant) {
    const k = G.coolant; k.mesh.rotation.y += dt * 3; k.mesh.position.y = 2.6 + Math.sin(G.t * 5) * .5;
    if (G.loc === 'int' && dist(k.x, k.z, G.foot.x, G.foot.z) < 3.4) {
      intr.remove(k.mesh); G.coolant = null; G.tokenLock = 0; G.token = 40; popup('CREDIT REQUEST APPROVED  +150 CREDITS', '#c07bff'); Snd.coin(); toast('CREDIT REQUEST FROM AMY JONES APPROVED. TOKENS AND CREDITS REPLENISHED.', 3000);
      addScore(150, 'collect');
    }
  }
}

/* ========================= OBJECTIVES / RULES ========================= */
const carInZone = () => Math.abs(G.car.x - ZONE.x) < ZONE.w / 2 + 1.5 && Math.abs(G.car.z - ZONE.z) < ZONE.d / 2 + 1.5;
const lunchRing = () => ['fridge', 'micro', 'table'][G.lunchStage] || 'table';
const scrumOpen = () => !G.done.scrum && G.gm >= T_SCRUM_ALERT;
const lunchOpen = () => !G.done.lunch && G.gm >= T_LUNCH;
const connOpen = () => !G.done.conn && G.done.copilot && G.gm >= T_CONN;

function objective() {
  if (G.loc === 'ext') {
    if (G.inCar) return { x: ZONE.x, z: ZONE.z, txt: 'DRIVE TO 210 E COLLEGE AVE BY 8:30 AM' };
    if (carInZone()) return { x: DOOR_RING.x, z: DOOR_RING.z, txt: 'WALK INTO THE EY OFFICE BY 8:30 AM' };
    return { x: G.car.x, z: G.car.z, txt: G.t < 3 || dist(G.foot.x, G.foot.z, G.car.x, G.car.z) > 8 ? 'GET TO YOUR BLACK CAMRY' : 'GET IN THE CAMRY' };
  }
  if (!G.badged) return { ring: 'turnstile', txt: 'BADGE IN AT THE SECURITY TURNSTILE' };
  if (G.tokenLock > 0 && G.coolant) return { x: G.coolant.x, z: G.coolant.z, txt: 'SPRINT TO AMY JONES\' CREDIT REQUEST!' };
  if (scrumOpen()) return { ring: 'scrum', txt: '10:15 ALERT: LEAD THE 10:30 SCRUM IN THE CONFERENCE ROOM' };
  if (lunchOpen() && G.hunger < 45) return { ring: lunchRing(), txt: 'EAT THE MANDATORY BEEF & RICE' };
  if (!G.done.copilot) return { ring: 'desk', txt: 'APPROVE COPILOT PROMPTS (' + G.copilotCount + '/20)' };
  if (lunchOpen()) return { ring: lunchRing(), txt: 'EAT THE MANDATORY BEEF & RICE' };
  if (connOpen()) return { ring: 'desk', txt: 'FINISH EY CHRISTMAS CONNECTIONS' };
  if (!G.done.scrum && G.gm < T_SCRUM_ALERT) return { txt: 'SCRUM ALERT AT 10:15 AM - FAST-FORWARD OR COLLECT BADGES' };
  if (!G.done.lunch) return { txt: 'LUNCH OPENS AT 11:00 AM' };
  if (!G.done.conn) return { txt: 'CONNECTIONS OPEN AT 1:30 PM' };
  return { txt: 'CLOCK OUT!' };
}
function ringActive(id) {
  switch (id) {
    case 'turnstile': return G.badged ? null : { label: 'BADGE IN', act: actBadge };
    case 'desk':
      if (!G.badged) return null;
      if (!G.done.copilot) return { label: 'USE LAPTOP', act: () => openModal('copilot') };
      if (connOpen()) return { label: 'USE LAPTOP', act: () => openModal('conn') };
      if (!G.done.conn) return { label: 'CONNECTIONS OPEN 1:30 PM', enabled: false };
      return null;
    case 'scrum':
      if (!G.badged || G.done.scrum) return null;
      return scrumOpen() ? { label: 'LEAD 10:30 SCRUM', act: () => openModal('scrum') } : G.gm < T_SCRUM_ALERT ? { label: 'SCRUM OPENS 10:15 AM', enabled: false } : null;
    case 'fridge': case 'micro': case 'table': {
      if (!G.badged || G.done.lunch || lunchRing() !== id) return null;
      if (!lunchOpen()) return { label: 'LUNCH OPENS 11:00 AM', enabled: false };
      return { label: ['GRAB MEAL PREP', 'COOK BEEF & RICE', 'EAT BEEF & RICE'][G.lunchStage], act: () => openModal('lunch') };
    }
  }
  return null;
}
function computeCtx() {
  G.ctx = null; if (G.mode !== 'play' || G.modal || G.transition) return;
  if (G.inCar) { G.ctx = { type: 'exit', label: 'EXIT CAR', enabled: Math.hypot(G.car.vx, G.car.vz) < 10, pulse: carInZone() }; return; }
  const f = G.foot;
  if (G.loc === 'ext') {
    if (dist(f.x, f.z, DOOR_RING.x, DOOR_RING.z) < DOOR_RING.r) { G.ctx = carInZone() ? { type: 'enterEY', label: 'ENTER EY OFFICE', enabled: true, pulse: true } : { type: 'none', label: 'PARK IN THE YELLOW ZONE FIRST', enabled: false }; return; }
    if (dist(f.x, f.z, G.car.x, G.car.z) < 7.5) G.ctx = { type: 'enterCar', label: 'ENTER CAMRY', enabled: true };
    return;
  }
  let best = null, bd = 1e9;
  Object.keys(RINGS).forEach(id => { const R = RINGS[id], d = dist(f.x, f.z, R.x, R.z); if (d < R.r) { const a = ringActive(id); if (a && d < bd) { best = a; bd = d; } } });
  if (best) G.ctx = { type: 'ring', label: best.label, enabled: best.enabled !== false, act: best.act, pulse: best.enabled !== false };
}
function doAction() {
  if (G.mode !== 'play') return; const c = G.ctx; if (!c || G.transition) return;
  if (!c.enabled) { Snd.bad(); toast(c.type === 'exit' ? 'SLOW DOWN TO EXIT' : c.label, 1400); return; }
  Snd.click();
  if (c.type === 'exit') exitCar(); else if (c.type === 'enterCar') enterCar(); else if (c.type === 'enterEY') enterOffice(); else if (c.type === 'ring') c.act();
}
function exitCar() {
  const c = G.car; G.inCar = false; c.vx = c.vz = 0; Snd.engine(false); Snd.screech(false);
  G.foot.x = c.x + Math.cos(c.h) * 3.8; G.foot.z = c.z - Math.sin(c.h) * 3.8; G.foot.h = c.h; G.foot.vx = G.foot.vz = 0;
  camry.userData.driver.visible = false; camry.userData.tailM.color.setHex(0x661111); camSnap = false;
}
function enterCar() { G.inCar = true; camry.userData.driver.visible = true; Snd.tone(220, .1, 'square', .1); Snd.tone(330, .1, 'square', .1, 0, .1); }
function enterOffice() {
  G.transition = true; fade(true);
  setTimeout(() => {
    G.loc = 'int'; ext.visible = false; intr.visible = true; scene.background = new THREE.Color(0x1b2233); scene.fog = null;
    intr.add(matt); G.foot.x = -17; G.foot.z = 8; G.foot.h = Math.PI / 2; G.foot.vx = G.foot.vz = 0; camSnap = true;
    fade(false); G.transition = false; toast('WELCOME TO EY. BADGE IN AT THE TURNSTILE!', 2600);
  }, 380);
}
function actBadge() {
  G.badged = true; G.done.arrive = true; turnSolid.off = true; turnArm.material = M(0x2cff7a, { emissive: 0x00ff55, emissiveIntensity: .7 }); turnArm.rotation.y = 1.2;
  const rem = Math.max(0, T_DEADLINE - G.gm), bonus = 250 + Math.floor(rem) * 20; G.arriveStr = fmtShort(G.gm);
  addScore(bonus, 'arrive'); popup('BADGED IN ' + G.arriveStr + '  +' + bonus, '#7dff9a'); Snd.ding(); toast('BADGED IN AT ' + G.arriveStr + '. ARRIVAL LOCKED. +' + bonus, 3000);
}

/* ============================ METERS ============================ */
function addToken(d) {
  if (G.tokenLock > 0) return; G.token = clamp(G.token + d, 0, 100); if (G.token >= 100) overheat();
}
function overheat() {
  G.meltdowns++; Snd.zap();
  G.tokenLock = 12; G.token = 100; spawnCoolant();
  toast('TOKEN RATE LIMIT EXCEEDED! FIND AMY JONES\' CREDIT REQUEST!', 3000);
}
function spawnCoolant() {
  if (G.coolant) intr.remove(G.coolant.mesh);
  const spots = [[-22, -14], [-6, 14], [27, -1], [27, 19], [-20, 4], [8, 15], [14, -2]].filter(p => dist(p[0], p[1], 0, -6) > 12);
  const p = spots[Math.floor(Math.random() * spots.length)], g = new THREE.Group();
  g.add(box(2.6, 1.7, .3, M(0xffffff, { emissive: 0xa24bff, emissiveIntensity: .35 }))); g.add(at(box(2.6, .12, .34, 0xa24bff), 0, .4, 0)); g.add(at(box(.9, .5, .36, M(0xffe600)), 0, -.2, 0));
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.2, 20), new THREE.MeshBasicMaterial({ color: 0xc07bff, side: THREE.DoubleSide })); halo.rotation.x = Math.PI / 2; g.add(halo);
  g.position.set(p[0], 2.6, p[1]); intr.add(g); G.coolant = { mesh: g, x: p[0], z: p[1] };
  if (G.modal) closeModal();
}

/* ============================ MODALS ============================ */
const MODALS = { copilot: 'm-copilot', scrum: 'm-scrum', conn: 'm-conn', lunch: 'm-lunch' };
const OCTO = '<svg viewBox="0 0 64 64"><g fill="#ff5a5a"><circle cx="32" cy="30" r="17"/><path d="M18 18 L16 4 L28 14Z M46 18 L48 4 L36 14Z"/><path d="M20 44 Q12 56 8 52 M28 47 Q26 60 20 58 M36 47 Q38 60 44 58 M44 44 Q52 56 56 52" stroke="#ff5a5a" stroke-width="5" fill="none" stroke-linecap="round"/></g><circle cx="25" cy="30" r="4" fill="#fff"/><circle cx="39" cy="30" r="4" fill="#fff"/><circle cx="25" cy="31" r="2" fill="#000"/><circle cx="39" cy="31" r="2" fill="#000"/></svg>';
['cp-lock', 'cn-lock'].forEach(id => { $(id).innerHTML = OCTO + '<h3>TOKEN RATE LIMIT EXCEEDED</h3><div class="count">12</div><p>Laptop locked. Close it and sprint to the floating Credit Request from Amy Jones to replenish your tokens and credits!</p>'; });
function openModal(name) {
  if (G.modal) return; G.modal = name; document.body.classList.add('modal-open'); $(MODALS[name]).classList.remove('hidden');
  if (name === 'copilot' || name === 'conn') { G.sitting = true; G.foot.x = 0; G.foot.z = -7.1; G.foot.h = Math.PI; G.foot.vx = G.foot.vz = 0; G.pose = 'sit'; }
  if (name === 'scrum') { G.foot.x = 23; G.foot.z = -7.6; G.foot.h = Math.PI; G.foot.vx = G.foot.vz = 0; G.pose = 'idle'; G.scrumActive = true; scrumStart(); }
  if (name === 'copilot') { cp.card = null; cp.gap = .2; $('cp-count').textContent = G.copilotCount; $('cp-fill').style.width = G.copilotCount / 20 * 100 + '%'; }
  if (name === 'conn') connRender();
  if (name === 'lunch') lunchOpenUI();
}
function closeModal() {
  if (!G.modal) return; Object.values(MODALS).forEach(id => $(id).classList.add('hidden'));
  document.body.classList.remove('modal-open'); G.modal = null; G.sitting = false; G.pose = 'idle'; G.scrumActive = false; cp.card = null;
}

/* ---- Copilot approval spree ---- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const VALID = [
  ['Refactor microservice auth', '- const user = req.headers.user;\n+ const user = await verifyJwt(req);'],
  ['Generate unit tests', '+ describe("invoiceService", () => {\n+   it("totals line items", () => expect(total(items)).toBe(120));'],
  ['Optimize SQL query', '- SELECT * FROM orders\n+ SELECT id, total FROM orders\n+ WHERE created_at > now() - interval \'7d\''],
  ['Fix CSS flexbox alignment', '- .row { display: block; }\n+ .row { display: flex; align-items: center; }'],
  ['Add null check to parser', '- return node.value.trim();\n+ return node?.value?.trim() ?? "";'],
  ['Rename variable for clarity', '- let x = getRate();\n+ let hourlyRate = getRate();'],
  ['Add retry with backoff', '+ for (let i = 0; i < 3; i++) {\n+   try { return await call(); } catch { await sleep(2 ** i * 100); }'],
  ['Update README install steps', '- npm install\n+ npm ci && npm run build']
];
const TRAPS = [
  ['Commit .env AWS keys to public repo', '+ AWS_SECRET_ACCESS_KEY=AKIA7XJ2...\n+ git push origin main --force'],
  ['DROP TABLE production_clients', '+ DROP TABLE production_clients;\n+ -- tests pass locally, ship it'],
  ['Infinite while(true) billing loop', '+ while (true) {\n+   await callPaidApi();  // $0.04 per call\n+ }'],
  ['Disable all auth checks "temporarily"', '- if (!user.isAdmin) throw new Error();\n+ // if (!user.isAdmin) throw new Error();']
];
const cp = { card: null, t: 0, limit: 3.4, gap: .2 };
function cpShow() {
  const trap = Math.random() < .2, pool = trap ? TRAPS : VALID, it = pool[Math.floor(Math.random() * pool.length)];
  cp.card = { trap, it }; cp.limit = cp.t = Math.max(2.3, 3.7 - G.copilotCount * .07);
  const el = $('cp-card'); el.className = 'card'; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('cp-title').textContent = it[0];
  $('cp-diff').innerHTML = it[1].split('\n').map(l => '<span class="' + (l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : '') + '">' + esc(l) + '</span>').join('\n');
}
function cpAnswer(approve) {
  if (G.tokenLock > 0 || !cp.card || G.modal !== 'copilot') return; const c = cp.card; G.lastTap = G.t; Snd.click();
  if (approve) {
    if (c.trap) { addToken(35); popup('HALLUCINATION MERGED! +35% TOKENS', '#ff5a5a'); Snd.bad(); }
    else { addToken(8); G.copilotCount++; addScore(20); Snd.good(); }
  } else if (c.trap) { G.copilotCount++; addScore(20); popup('NICE CATCH!', '#7dff9a'); Snd.good(); }
  else { popup('Perfectly good PR rejected...', '#ffb3b3'); Snd.bad(); }
  cp.card = null; cp.gap = .22; $('cp-card').classList.add('hidden'); $('cp-count').textContent = G.copilotCount; $('cp-fill').style.width = G.copilotCount / 20 * 100 + '%';
  if (G.copilotCount >= 20) { G.done.copilot = true; addScore(500, 'obj'); popup('COPILOT QUOTA COMPLETE +500', '#7dff9a'); Snd.fanfare && Snd.good(); closeModal(); toast('COPILOT APPROVAL QUOTA COMPLETE!', 2600); }
}
function cpUpdate(dt) {
  if (G.modal !== 'copilot' || G.tokenLock > 0) return;
  if (cp.card) { cp.t -= dt; $('cp-timer').style.width = Math.max(0, cp.t / cp.limit * 100) + '%'; if (cp.t <= 0) { cp.card = null; cp.gap = .3; $('cp-card').classList.add('hidden'); } }
  else { cp.gap -= dt; if (cp.gap <= 0) { $('cp-card').classList.remove('hidden'); cpShow(); } }
}
$('cp-approve').addEventListener('pointerdown', e => { e.preventDefault(); cpAnswer(true); });
$('cp-reject').addEventListener('pointerdown', e => { e.preventDefault(); cpAnswer(false); });
$('cp-close').addEventListener('pointerdown', e => { e.preventDefault(); closeModal(); });

/* ---- Backup Scrum Facilitator ---- */
const SCRUM = [
  { who: 'DEV (SHARING SCREEN)', say: 'Let me share my screen and walk through all 400 lines of this YAML file...', ok: "Let's take that offline after standup!", bad: ['Sure, scroll slowly so everyone can read it.', 'Go ahead, we have all morning.'] },
  { who: 'ANALYST (BLOCKED)', say: "I've been stuck waiting on environment access since Tuesday.", ok: "Noted! I'll log that blocker and escalate.", bad: ['That sounds like a you problem.', 'Have you tried turning the environment off and on?'] },
  { who: 'TESTER (CURIOUS)', say: 'Wait, is the regular Scrum Master on PTO today?', ok: "I'm serving as Backup Facilitator - keep the updates moving!", bad: ['No idea, I just wandered in here.', 'Probably. Want to cancel standup?'] }
];
const sc = { round: 0, t: 4, strikes: 0, busy: false };
function scrumStart() { sc.round = 0; sc.strikes = 0; sc.busy = false; Snd.alert(); scrumShow(); }
function scrumShow() {
  const r = SCRUM[sc.round]; sc.t = 4; sc.busy = false;
  $('sc-round').textContent = 'ROUND ' + (sc.round + 1) + '/3'; $('sc-who').textContent = r.who; $('sc-text').textContent = '"' + r.say + '"';
  $('sc-lives').textContent = 'PATIENCE: ' + '●'.repeat(3 - sc.strikes) + '○'.repeat(sc.strikes);
  const opts = [{ t: r.ok, ok: true }, { t: r.bad[0] }, { t: r.bad[1] }].sort(() => Math.random() - .5), box_ = $('sc-options'); box_.innerHTML = '';
  opts.forEach(o => { const b = document.createElement('button'); b.textContent = o.t; b.addEventListener('pointerdown', e => { e.preventDefault(); scrumPick(o.ok, b); }); box_.appendChild(b); });
}
function scrumPick(ok, btn) {
  if (sc.busy) return; Snd.click();
  if (ok) { sc.busy = true; Snd.good(); sc.round++; if (sc.round >= 3) { scrumWin(); return; } setTimeout(() => { if (G.modal === 'scrum') scrumShow(); }, 350); }
  else { btn.classList.add('wrong'); Snd.bad(); scrumStrike(); }
}
function scrumStrike() {
  sc.strikes++; if (sc.strikes >= 3) { toast('STANDUP DERAILED! (-5 MIN) TRY AGAIN', 2600); G.gm += 5; closeModal(); return; }
  if (!sc.busy) { sc.busy = true; setTimeout(() => { if (G.modal === 'scrum') scrumShow(); }, 400); }
}
function scrumWin() {
  G.done.scrum = true; addScore(1000, 'obj'); popup('BACKUP SCRUM FACILITATOR: COMPLETE +1000', '#7dff9a'); Snd.coin(); Snd.ding(); closeModal(); toast('BACKUP SCRUM FACILITATOR: COMPLETE', 2600);
}
function scrumUpdate(dt) {
  if (G.modal !== 'scrum' || sc.busy) return; sc.t -= dt; $('sc-timer').style.width = Math.max(0, sc.t / 4 * 100) + '%';
  if (sc.t <= 0) { Snd.bad(); sc.busy = false; scrumStrike(); }
}

/* ---- Mandatory Ground Beef & Rice ---- */
const lu = { heat: 0, eat: 0, heatT: 0 };
const LU = [
  { title: 'BREAKROOM FRIDGE', text: 'Matt\'s meal prep container is in the stainless steel fridge. Grab it before the macros run out.', btn: 'GRAB MEAL PREP', bar: false },
  { title: 'INDUSTRIAL MICROWAVE', text: 'Heat the ground beef and rice to sizzling perfection. Tap fast!', btn: 'HEAT BEEF & RICE', bar: true },
  { title: 'BREAKROOM TABLE', text: 'Consume the macros. All of them.', btn: 'CONSUME MACROS', bar: true }
];
function lunchOpenUI() {
  const s = LU[G.lunchStage]; $('lu-title').textContent = s.title; $('lu-text').textContent = s.text; $('lu-btn').textContent = s.btn;
  $('lu-fill').parentElement.style.visibility = s.bar ? 'visible' : 'hidden'; lu.heat = lu.eat = 0; $('lu-fill').style.width = '0%';
  if (G.lunchStage === 2) { G.sitting = true; G.foot.x = 20; G.foot.z = 9.7; G.foot.h = 0; G.foot.vx = G.foot.vz = 0; G.pose = 'eat'; }
}
$('lu-btn').addEventListener('pointerdown', e => {
  e.preventDefault(); if (G.modal !== 'lunch') return; Snd.click();
  if (G.lunchStage === 0) { G.lunchStage = 1; popup('MEAL PREP ACQUIRED', '#ffe600'); closeModal(); toast('GOT THE MEAL PREP. WALK TO THE MICROWAVE.', 2400); }
  else if (G.lunchStage === 1) {
    lu.heat = Math.min(100, lu.heat + 6); $('lu-fill').style.width = lu.heat + '%'; Snd.tone(300 + lu.heat * 5, .05, 'sawtooth', .05);
    if (lu.heat >= 100) { G.lunchStage = 2; Snd.ding(); popup('SIZZLING!', '#ff9a3c'); closeModal(); toast('PERFECTLY HEATED. EAT AT THE BREAKROOM TABLE.', 2600); }
  } else {
    lu.eat = Math.min(100, lu.eat + 9); $('lu-fill').style.width = lu.eat + '%'; Snd.chew();
    G.hunger = Math.min(100, Math.max(G.hunger, lu.eat));
    if (lu.eat >= 100) { G.lunchStage = 3; G.done.lunch = true; G.hunger = 100; G.buff = true; addScore(1000, 'obj'); $('portrait').classList.add('gold'); popup('CLEAN BULK UNLOCKED +1000', '#ffd23a'); Snd.coin(); Snd.ding(); closeModal(); toast('MANDATORY BEEF & RICE: CONSUMED. CLEAN BULK ACTIVE!', 3000); }
  }
});
$('lu-close').addEventListener('pointerdown', e => { e.preventDefault(); closeModal(); });
setInterval(() => { if (G.modal === 'lunch' && G.lunchStage === 1 && lu.heat < 100) { lu.heat = Math.max(0, lu.heat - 3); $('lu-fill').style.width = lu.heat + '%'; } }, 250);

/* ---- EY Christmas Connections ---- */
const CGROUPS = [
  { name: 'HOLIDAY DRINKS', items: ['Rum', 'Pineapple', 'Ginger Ale', 'Eggnog'], color: '#ffd23a' },
  { name: 'DAILY ESSENTIALS', items: ['Ground Beef', 'White Rice', 'Black Camry', 'GitHub Copilot'], color: '#7bd6ff' },
  { name: 'TALLAHASSEE STAPLES', items: ['Southwood', 'Cascades Park', 'College Ave', 'Capitol Tower'], color: '#8ee08e' },
  { name: 'SCRUM SPEAK', items: ['Blocker', 'Standup', 'Sprint', 'Offline'], color: '#d9a6ff' }
];
const cn = { solved: [], sel: [], tiles: [] };
function connRender() {
  const left = CGROUPS.map((g, i) => ({ g, i })).filter(o => !cn.solved.includes(o.i));
  if (!cn.tiles.length || cn.tiles.some(t => cn.solved.includes(t.g))) cn.tiles = left.flatMap(o => o.g.items.map(t => ({ t, g: o.i }))).sort(() => Math.random() - .5);
  $('cn-solved').innerHTML = cn.solved.map(i => '<div class="grp" style="background:' + CGROUPS[i].color + '">' + CGROUPS[i].name + '<small>' + CGROUPS[i].items.join(' / ') + '</small></div>').join('');
  const grid = $('cn-grid'); grid.innerHTML = '';
  cn.tiles.forEach(o => { const b = document.createElement('button'); b.textContent = o.t; if (cn.sel.includes(o)) b.className = 'sel';
    b.addEventListener('pointerdown', e => { e.preventDefault(); connPick(o, b); }); grid.appendChild(b); });
  $('cn-count').textContent = cn.solved.length; $('cn-fill').style.width = cn.solved.length / 4 * 100 + '%';
}
function connPick(o, b) {
  if (G.tokenLock > 0) return; Snd.click(); const i = cn.sel.indexOf(o);
  if (i >= 0) { cn.sel.splice(i, 1); connRender(); return; }
  if (cn.sel.length >= 4) return; cn.sel.push(o); connRender(); if (cn.sel.length < 4) return;
  const g = cn.sel[0].g, ok = cn.sel.every(s => s.g === g);
  if (ok) { cn.solved.push(g); cn.tiles = cn.tiles.filter(t => t.g !== g); cn.sel = []; addScore(50); addToken(6); Snd.good(); $('cn-msg').textContent = 'CONNECTED: ' + CGROUPS[g].name; connRender();
    if (cn.solved.length >= 4) { G.done.conn = true; addScore(750, 'obj'); popup('EY CHRISTMAS CONNECTIONS COMPLETE +750', '#7dff9a'); Snd.ding(); closeModal(); toast('CHRISTMAS CONNECTIONS: COMPLETE!', 2600); } }
  else {
    const counts = {}; cn.sel.forEach(s => counts[s.g] = (counts[s.g] || 0) + 1); const one = Object.values(counts).some(v => v === 3);
    $('cn-msg').textContent = one ? 'ONE AWAY...' : 'NOT A GROUP. +4% TOKENS'; Snd.bad(); addToken(4);
    [...$('cn-grid').children].forEach(el => { if (el.classList.contains('sel')) { el.classList.add('shake'); } });
    setTimeout(() => { cn.sel = []; if (G.modal === 'conn') connRender(); }, 380);
  }
}
$('cn-close').addEventListener('pointerdown', e => { e.preventDefault(); closeModal(); });

/* ============================ FAST FORWARD ============================ */
function ffTarget() {
  if (G.mode !== 'play' || G.loc !== 'int' || !G.badged || G.modal || G.tokenLock > 0) return null;
  if (!G.done.copilot || scrumOpen() || lunchOpen() || connOpen()) return null;
  const c = []; if (!G.done.scrum && G.gm < T_SCRUM_ALERT) c.push(T_SCRUM_ALERT); if (!G.done.lunch && G.gm < T_LUNCH) c.push(T_LUNCH); if (!G.done.conn && G.gm < T_CONN) c.push(T_CONN);
  return c.length ? Math.min(...c) : null;
}
$('ff-btn').addEventListener('pointerdown', e => {
  e.preventDefault(); const t = ffTarget(); if (t == null) return; const bonus = Math.round((t - G.gm) * 3); G.gm = t; G.ffUsed++; addScore(bonus, 'time');
  popup('FAST-FORWARD +' + bonus, '#ffe600'); Snd.ding(); toast('FAST-FORWARDED TO ' + fmtShort(t), 1800);
});

/* ============================ END STATES ============================ */
function bust(reason, sub) { if (G.mode !== 'play') return; finish('bust', reason, sub); }
function win() {
  if (G.mode !== 'play') return; const rem = Math.max(0, T_END - G.gm), tb = Math.floor(rem) * 2; addScore(tb, 'time');
  finish(G.score >= 5000 ? 'S' : G.score >= 3000 ? 'A' : 'B');
}
function finish(kind, reason, sub) {
  G.mode = 'end'; closeModal(); Snd.engine(false); Snd.screech(false); document.body.classList.remove('modal-open');
  $('hud').classList.add('hidden'); $('controls').classList.add('hidden'); $('speech').classList.add('hidden'); $('toast').classList.add('hidden');
  const rows = [['Core objectives', G.bd.obj], ['Arrival bonus (' + (G.arriveStr || 'never') + ')', G.bd.arrive], ['Time remaining / fast-forward', G.bd.time], ['Collectibles (' + G.counts.collect + ')', G.bd.collect], ['Traffic cones (' + G.counts.cones + ')', G.bd.cones], ['Capitol drifts (' + G.counts.drifts + ')', G.bd.drift], ['Copilot reviews & connections', G.bd.other]];
  const table = '<table class="sum">' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '<tr class="tot"><td>TOTAL</td><td>' + G.score + '</td></tr></table>';
  const retry = '<button id="retry-btn" class="gbtn green wide">ONE-TAP RETRY</button>';
  let h = '';
  const portrait = '<div class="vportrait"><img src="' + ($('portrait-img').currentSrc || 'matt.png') + '" alt="Matt">';
  if (kind === 'bust') { h = '<div class="stamp">BUSTED</div><div class="reason">' + reason + '</div><p style="font-family:Arial;font-size:12px;margin:0 0 6px">' + (sub || '') + '</p>' + table + retry; Snd.sad(); }
  else if (kind === 'S') {
    h = '<div class="stamp win">S-RANK</div><div class="rpgname">LEGENDARY &middot; THE RPG UNLOCKED</div><div class="victory-art">' + portrait + '<div class="shades"><i></i><i></i></div></div><canvas id="rpg-canvas" width="260" height="380"></canvas></div>' +
      '<div class="reason">Rum, Pineapple, and Ginger Ale. Ice cold. Earned.</div>' + table + retry; Snd.fanfare(); startConfetti();
  } else if (kind === 'A') {
    h = '<div class="stamp rankA">A-RANK</div><div class="rpgname" style="color:#7bd6ff">PROMOTED</div><div class="victory-art">' + portrait + '</div></div><div class="reason">EXCEEDS EXPECTATIONS!</div><p style="font-family:Arial;font-size:12px;margin:0 0 6px">Matt clocks out on time and walks back to his Black Camry, just shy of earning the top-shelf RPG. Score 5,000+ for the drink.</p>' + table + retry; Snd.ding();
  } else {
    h = '<div class="stamp rankA">CLOCKED OUT</div><div class="victory-art">' + portrait + '</div></div><div class="reason">All five objectives complete.</div><p style="font-family:Arial;font-size:12px;margin:0 0 6px">No promotion this time. Hit 3,000+ for an A-rank and 5,000+ for the RPG.</p>' + table + retry; Snd.ding();
  }
  $('end-card').innerHTML = h; $('end').classList.remove('hidden');
  $('retry-btn').addEventListener('pointerdown', e => { e.preventDefault(); try { sessionStorage.setItem('mgs-retry', '1'); } catch (_) {} location.reload(); });
  G.rpgCanvas = $('rpg-canvas');
}
function drawRPG(cv, t) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height; x.clearRect(0, 0, W, H);
  const top = 90, bot = 350, lt = 56, rt = 204, lb = 82, rb = 178;
  const gx = (y, side) => side ? lerp(rt, rb, (y - top) / (bot - top)) : lerp(lt, lb, (y - top) / (bot - top));
  // glass body
  x.save(); x.beginPath(); x.moveTo(lt, top); x.lineTo(rt, top); x.lineTo(rb, bot); x.quadraticCurveTo(130, bot + 14, lb, bot); x.closePath(); x.clip();
  x.fillStyle = 'rgba(210,235,255,.18)'; x.fillRect(0, top, W, bot - top);
  const layers = [['#c8782b', .22], ['#f6d54a', .40], ['#f3e8a2', .38]]; let y = bot;
  layers.forEach(l => { const h = (bot - top - 16) * l[1]; x.fillStyle = l[0]; x.fillRect(0, y - h, W, h); y -= h; });
  x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 14; i++) { const by = bot - ((t * 40 + i * 37) % (bot - top - 30)), bx = lerp(lb + 8, rb - 8, ((i * 53) % 100) / 100); x.beginPath(); x.arc(bx + Math.sin(t * 3 + i) * 3, by, 2 + i % 3, 0, TAU); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.75)'; [[96, 130], [140, 118], [118, 160]].forEach(([ix, iy], k) => { x.save(); x.translate(ix, iy); x.rotate(.3 * (k - 1) + Math.sin(t * 2 + k) * .05); x.fillRect(-16, -16, 32, 32); x.restore(); });
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(lt + 16, top + 10, 10, bot - top - 40);
  x.restore();
  x.strokeStyle = '#eaf6ff'; x.lineWidth = 5; x.beginPath(); x.moveTo(lt, top); x.lineTo(lb, bot); x.quadraticCurveTo(130, bot + 14, rb, bot); x.lineTo(rt, top); x.stroke();
  x.beginPath(); x.ellipse(130, top, (rt - lt) / 2, 7, 0, 0, TAU); x.stroke();
  // frost drops
  x.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(lerp(lb, rb, ((i * 37) % 100) / 100), top + 40 + (i * 29) % 190, 2.5, 4, 0, 0, TAU); x.fill(); }
  // straw
  x.strokeStyle = '#ff4d5a'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(120, 250); x.lineTo(170, 34); x.stroke();
  x.strokeStyle = '#fff'; x.setLineDash([10, 10]); x.lineWidth = 3; x.stroke(); x.setLineDash([]);
  // pineapple wedge
  x.save(); x.translate(196, 92); x.rotate(.35);
  x.fillStyle = '#2f9a4d'; [[-14, -16, -26], [0, -22, 0], [14, -16, 26]].forEach(([dx, dy, r]) => { x.save(); x.translate(dx, dy - 6); x.rotate(r * Math.PI / 180); x.beginPath(); x.ellipse(0, -10, 5, 17, 0, 0, TAU); x.fill(); x.restore(); });
  x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(0, 0, 30, 0, Math.PI); x.closePath(); x.fill(); x.strokeStyle = '#d99a00'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#fff2a8'; x.beginPath(); x.arc(0, 0, 22, 0.15, Math.PI - .15); x.closePath(); x.fill(); x.restore();
}
let confetti = null;
function startConfetti() {
  const cv = $('confetti'); cv.classList.remove('hidden'); cv.width = innerWidth; cv.height = innerHeight; const colors = ['#ffe600', '#ff6a3c', '#ff4d9a', '#4dd0ff', '#7dff9a', '#ffffff'];
  confetti = { cv, ps: Array.from({ length: 140 }, () => ({ x: Math.random() * innerWidth, y: -Math.random() * innerHeight, vx: rr(-30, 30), vy: rr(60, 180), r: rr(4, 9), c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6, va: rr(-6, 6) })) };
}
function updateConfetti(dt) {
  if (!confetti) return; const x = confetti.cv.getContext('2d'); x.clearRect(0, 0, confetti.cv.width, confetti.cv.height);
  confetti.ps.forEach(p => { p.x += (p.vx + Math.sin(p.a) * 30) * dt; p.y += p.vy * dt; p.a += p.va * dt; if (p.y > innerHeight + 10) { p.y = -10; p.x = Math.random() * innerWidth; }
    x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); });
}

/* ============================ HUD ============================ */
const hc = {};
function setText(id, v) { if (hc[id] !== v) { hc[id] = v; $(id).textContent = v; } }
function setW(id, v) { v = Math.round(v * 10) / 10; if (hc['w' + id] !== v) { hc['w' + id] = v; $(id).style.width = v + '%'; } }
function setCls(el, cls, on) { const k = 'c' + (el.id || '') + cls; if (hc[k] !== on) { hc[k] = on; el.classList.toggle(cls, on); } }
const _v = new THREE.Vector3();
let curObj = null;

function zoneOf(x, z) {
  if (z < -540 && x < 345 && x > 180) return 4;
  if (z < -290 || (x > 420 && z < -270)) return 3;
  if (x > 150 || z < -60) return 2; return 1;
}
const ZN = { 1: 'SOUTHWOOD', 2: 'COMMUTE CORRIDOR / CASCADES PARK', 3: 'DOWNTOWN / CAPITOL DISTRICT', 4: 'EY OFFICE - 210 E COLLEGE AVE' };
const ZT = { 1: 'THE CANOPY OAKS AT SOUTHWOOD', 2: 'CASCADES PARK - CUT ACROSS THE HILLS!', 3: 'DOWNTOWN TALLAHASSEE - CAPITOL DISTRICT', 4: '210 E COLLEGE AVE - PARK IN THE YELLOW ZONE' };

function updateHUD(dt) {
  setText('clock', fmtClock(G.gm) + ' EST'); setCls($('clock'), 'urgent', !G.badged && T_DEADLINE - G.gm < 15 && G.gm < T_LATE + 1);
  curObj = objective(); setText('mission', curObj.txt);
  setText('score', 'SCORE: ' + pad4(G.score)); setW('rpg-fill', Math.min(100, G.score / 5000 * 100));
  setText('token-val', Math.round(G.token) + '%'); setW('token-fill', G.token); setText('hunger-val', Math.round(G.hunger) + '%'); setW('hunger-fill', G.hunger);
  setCls($('meters'), 'hot', G.token > 85); setCls($('portrait'), 'sweaty', G.token > 85); setCls($('portrait'), 'gold', G.buff);
  $('chips').querySelectorAll('span').forEach(s => setCls(s, 'done', !!G.done[s.dataset.k]));
  const zn = G.loc === 'int' ? 'EY OFFICE - INTERIOR' : ZN[G.zone]; setText('zone-name', zn);
  const t = ffTarget(), ff = $('ff-btn'); setCls(ff, 'hidden', t == null);
  if (t != null) setText('ff-btn', 'FAST-FORWARD TO ' + fmtShort(t) + '  (+' + Math.round((t - G.gm) * 3) + ' PTS)');
  // toast
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
  // controls
  const play = G.mode === 'play'; setCls($('btns-drive'), 'hidden', !(play && G.inCar)); setCls($('btns-foot'), 'hidden', !(play && !G.inCar));
  const act = $('btn-act'), c = G.ctx;
  if (G.inCar) { const ex = $('btn-exit'); setCls(ex, 'off', !(c && c.enabled)); setCls(ex, 'pulse', !!(c && c.pulse)); }
  else { setCls(act, 'hidden', !c); if (c) { setText('btn-act', c.label); setCls(act, 'off', !c.enabled); setCls(act, 'pulse', !!c.pulse); } }
  setCls($('btn-sprint'), 'hidden', G.loc !== 'int' && false);
  // speech bubble
  const sp = $('speech');
  if (G.speechT > 0) { G.speechT -= dt; const src = G.inCar ? camry.position : matt.getWorldPosition(_v);
    _v.set(src.x, (G.inCar ? 5.5 : 8.8), src.z); _v.project(camera);
    if (_v.z < 1) { sp.style.left = ((_v.x * .5 + .5) * innerWidth) + 'px'; sp.style.top = ((-_v.y * .5 + .5) * innerHeight) + 'px'; }
    if (sp.textContent !== G.speech) sp.textContent = G.speech; sp.classList.remove('hidden');
  } else sp.classList.add('hidden');
  // lock overlays
  const lk = G.tokenLock > 0;
  ['cp-lock', 'cn-lock'].forEach(id => { const e = $(id); setCls(e, 'hidden', !(lk && G.modal)); if (lk) e.querySelector('.count').textContent = Math.ceil(G.tokenLock); });
}

function drawMinimap() {
  const cv = $('minimap'), x = cv.getContext('2d'), S = 200, R = 100, ext_ = G.loc === 'ext';
  const p = G.inCar && ext_ ? G.car : G.foot, h = G.inCar && ext_ ? G.car.h : Math.PI, sc_ = ext_ ? (G.inCar ? .75 : 1.1) : 3.2;
  const tr = (wx, wz) => { const dx = wx - p.x, dz = wz - p.z; return [R + (-dx * Math.cos(h) + dz * Math.sin(h)) * sc_, R - (dx * Math.sin(h) + dz * Math.cos(h)) * sc_]; };
  x.clearRect(0, 0, S, S); x.fillStyle = ext_ ? '#1c3f2a' : '#222b3d'; x.fillRect(0, 0, S, S);
  const poly = pts => { x.beginPath(); pts.forEach((q, i) => { const t = tr(q[0], q[1]); i ? x.lineTo(t[0], t[1]) : x.moveTo(t[0], t[1]); }); x.closePath(); };
  if (ext_) {
    x.fillStyle = '#2f7a3f'; poly([[PARK.x0, PARK.z0], [PARK.x1, PARK.z0], [PARK.x1, PARK.z1], [PARK.x0, PARK.z1]]); x.fill();
    x.lineCap = 'round'; x.strokeStyle = '#8a8f99';
    ROADS.forEach(r => { const a = tr(r.a[0], r.a[1]), b = tr(r.b[0], r.b[1]); x.lineWidth = r.w * sc_; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); });
    x.fillStyle = 'rgba(255,230,0,.8)'; poly([[ZONE.x - 8, ZONE.z - 3.5], [ZONE.x + 8, ZONE.z - 3.5], [ZONE.x + 8, ZONE.z + 3.5], [ZONE.x - 8, ZONE.z + 3.5]]); x.fill();
    x.fillStyle = '#000'; const cp_ = tr(G.car.x, G.car.z); x.fillRect(cp_[0] - 3, cp_[1] - 3, 6, 6);
    collectibles.forEach(o => { if (o.taken || o.loc !== 'ext') return; const t = tr(o.x, o.z); if (Math.hypot(t[0] - R, t[1] - R) < R - 4) { x.fillStyle = COLL[o.type].mini; x.beginPath(); x.arc(t[0], t[1], 3, 0, TAU); x.fill(); } });
  } else {
    x.fillStyle = '#5b6680'; intC.solids.forEach(s => { if (s.off) return; poly([[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]]); x.fill(); });
    collectibles.forEach(o => { if (o.taken || o.loc !== 'int') return; const t = tr(o.x, o.z); x.fillStyle = COLL[o.type].mini; x.beginPath(); x.arc(t[0], t[1], 3, 0, TAU); x.fill(); });
    if (G.coolant) { const t = tr(G.coolant.x, G.coolant.z); x.fillStyle = '#c07bff'; x.beginPath(); x.arc(t[0], t[1], 5, 0, TAU); x.fill(); }
  }
  // GPS line + objective pin
  const o = curObj; let ox = null, oz = null;
  if (o) { if (o.ring) { ox = RINGS[o.ring].x; oz = RINGS[o.ring].z; } else if (o.x != null) { ox = o.x; oz = o.z; } }
  if (ox != null) {
    let t = tr(ox, oz), dx = t[0] - R, dz = t[1] - R, l = Math.hypot(dx, dz), m = R - 8; if (l > m) { dx = dx / l * m; dz = dz / l * m; }
    x.strokeStyle = 'rgba(255,230,0,' + (.55 + .35 * Math.sin(G.t * 6)) + ')'; x.lineWidth = 4; x.setLineDash([8, 6]); x.beginPath(); x.moveTo(R, R); x.lineTo(R + dx, R + dz); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#ffe600'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.arc(R + dx, R + dz, 7, 0, TAU); x.fill(); x.stroke();
  }
  x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.moveTo(R, R - 10); x.lineTo(R + 7, R + 8); x.lineTo(R, R + 4); x.lineTo(R - 7, R + 8); x.closePath(); x.fill(); x.stroke();
}

/* ============================ MAIN UPDATE ============================ */
function update(dt) {
  G.t += dt;
  const rate = G.badged ? 1 : 1 / 3;               // 1 real second = 1 in-game minute; the morning commute runs at 1/3 speed (180 real seconds for 7:30 -> 8:30)
  G.gm += dt * rate;
  if (G.turbo > 0) G.turbo -= dt;
  // events
  if (!G.flags.alert && G.gm >= T_SCRUM_ALERT) { G.flags.alert = true; if (!G.done.scrum) { Snd.alert(); toast('10:15 AM ALERT: HEAD TO THE CONFERENCE ROOM FOR STANDUP!', 3200); } }
  if (!G.flags.lunch && G.gm >= T_LUNCH) { G.flags.lunch = true; if (G.badged) toast('11:00 AM: LUNCH WINDOW OPEN. BEEF AND RICE TIME.', 3000); }
  if (!G.flags.conn && G.gm >= T_CONN) { G.flags.conn = true; if (G.done.copilot) toast('1:30 PM: EY CHRISTMAS CONNECTIONS NOW OPEN AT YOUR LAPTOP.', 3000); }
  // hunger (drains from 7:30 until the mandatory lunch is eaten)
  const moving = G.inCar ? false : G.sprinting;
  if (!G.done.lunch) G.hunger = Math.max(0, G.hunger - .4 * (moving ? 1.6 : 1) * dt * rate);
  if (!G.done.lunch && G.hunger < 30) { G.growlT -= dt; if (G.growlT <= 0) { G.growlT = 6; Snd.growl(); say('Macros dropping... need ground beef and rice...', 3); } }
  // token cooling
  if (G.tokenLock > 0) { G.tokenLock -= dt; if (G.tokenLock <= 0) { G.tokenLock = 0; G.token = 60; if (G.coolant) { intr.remove(G.coolant.mesh); G.coolant = null; } toast('RATE LIMIT LIFTED. TOKENS RESET TO 60%.', 2400); } }
  else if (G.t - G.lastTap > .9 && G.token > 0) G.token = Math.max(0, G.token - 4 * dt);

  if (G.loc === 'ext') {
    if (G.inCar) updateCar(dt); else { updateFoot(dt); camry.userData.driver.visible = false; }
    updateActors(dt); updateCones(dt); updatePuffs(dt);
    const p = G.inCar ? G.car : G.foot, z = zoneOf(p.x, p.z); if (z !== G.zone) { G.zone = z; toast(ZT[z], 2000); }
  } else {
    updateFoot(dt); updateCones(dt);
  }
  updateCollectibles(dt);
  cpUpdate(dt); scrumUpdate(dt);
  if (camShake > 0) camShake = Math.max(0, camShake - dt * 2.5);

  // rings & arrow
  const o = curObj;
  Object.keys(RINGS).forEach(id => { const R = RINGS[id]; R.mesh.visible = G.loc === 'int' && !!(o && o.ring === id) && !G.modal; R.mesh.material.opacity = .55 + .35 * Math.sin(G.t * 5); });
  zoneMesh.material.opacity = G.loc === 'ext' && !G.done.arrive ? .45 + .25 * Math.sin(G.t * 4) : .0; doorRing.visible = G.loc === 'ext' && carInZone(); doorRing.material.opacity = .5 + .4 * Math.sin(G.t * 6);
  arrow.visible = !!(o && (o.ring || o.x != null)) && !G.modal;
  if (arrow.visible) {
    const ax = o.ring ? RINGS[o.ring].x : o.x, az = o.ring ? RINGS[o.ring].z : o.z;
    const off = G.loc === 'int' ? IX : 0, ay = (o.ring || (o.x != null && G.loc === 'int')) ? 7.5 : (o.x === G.car.x ? 8 : 7);
    arrow.position.set(ax + off, ay + Math.sin(G.t * 5) * .9, az); arrow.rotation.y += dt * 2.5;
  }
  computeCtx();

  // fail / win checks
  if (!G.transition) {
    if (!G.badged && !G.flags.late && G.gm >= T_LATE) { G.flags.late = true; toast('8:30 AM PASSED. NO ARRIVAL BONUS, BUT KEEP GOING!', 3200); }
    if (G.done.arrive && G.done.scrum && G.done.copilot && G.done.lunch && G.done.conn) win();
  }
}

/* ============================ CAMERA ============================ */
function updateCamera(dt, title) {
  let dp = new THREE.Vector3(), dl = new THREE.Vector3(), fov = 55;
  if (title) {
    const a = G.t * .15; dp.set(10 + Math.cos(a) * 38, 16, 22 + Math.sin(a) * 38); dl.set(10, 3, 22);
  } else if (G.loc === 'int') {
    const port = innerHeight > innerWidth, k = port ? 1 : .35, f = G.foot, d = port ? 1.3 : 1;
    const tx = IX + f.x * k, tz = f.z * k * .8; dp.set(tx, 31 * d, tz + 29 * d); dl.set(tx, 0, tz); fov = 52;
  } else if (G.inCar) {
    const c = G.car, sp = Math.hypot(c.vx, c.vz), fx = Math.sin(c.h), fz = Math.cos(c.h), back = 13 + sp * .09;
    dp.set(c.x - fx * back, 6.8 + sp * .035, c.z - fz * back); dl.set(c.x + fx * 6, 1.6, c.z + fz * 6); fov = 55 + sp * .22 + (G.turbo > 0 ? 6 : 0);
  } else { const f = G.foot; dp.set(f.x, 21, f.z + 20); dl.set(f.x, 0, f.z - 2); }
  if (camSnap) { camPos.copy(dp); camLook.copy(dl); camSnap = false; }
  else { camPos.lerp(dp, damp(G.inCar && !title ? 7 : 6, dt)); camLook.lerp(dl, damp(10, dt)); }
  camera.position.copy(camPos); if (camShake > 0) camera.position.add(_v.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(camShake * .6));
  camera.lookAt(camLook); camera.fov = lerp(camera.fov, fov, damp(4, dt)); camera.updateProjectionMatrix();
}

/* ============================ START / LOOP ============================ */
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const cv = $('confetti'); if (confetti) { cv.width = w; cv.height = h; }
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

function startGame() {
  Snd.init(); G.mode = 'play'; $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
  if (G.idleJoy) G.idleJoy(); toast('7:30 AM. RUN TO YOUR BLACK CAMRY!', 3000); camSnap = true; G.zone = 1;
}
$('start-btn').addEventListener('pointerdown', e => { e.preventDefault(); startGame(); });
$('start-btn').addEventListener('click', () => { if (G.mode === 'title') startGame(); });
window.addEventListener('pointerdown', () => Snd.init(), { passive: true });

let last = performance.now(), mmT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.mode === 'play') {
    update(dt);
    if (G.mode === 'play') {
      // visuals follow state
      if (G.loc === 'int' && matt.parent !== intr) intr.add(matt);
      matt.visible = !G.inCar; matt.position.set(G.foot.x, 0, G.foot.z); poseMatt(dt);
      updateCamera(dt); updateHUD(dt); mmT -= dt; if (mmT <= 0) { mmT = .05; drawMinimap(); }
      const pt = G.hunger < 30 && !G.done.lunch ? 1 : 0; matt.userData.spr.visible = !G.inCar;
    }
  } else if (G.mode === 'title') {
    G.t += dt; matt.position.set(G.foot.x, 0, G.foot.z); poseMatt(dt); updateCamera(dt, true);
    camry.position.set(G.car.x, 0, G.car.z); camry.rotation.y = G.car.h;
  } else {
    G.t += dt; updateConfetti(dt); if (G.rpgCanvas && G.rpgCanvas.isConnected) drawRPG(G.rpgCanvas, G.t);
  }
  renderer.render(scene, camera);
}

/* ============================ INIT ============================ */
buildExterior(); buildCones(); buildCollectibles(); buildTraffic(); buildInterior(); buildInteriorCollectibles();
camry.position.set(G.car.x, 0, G.car.z); camry.rotation.y = G.car.h; camry.userData.driver.visible = false;
matt.position.set(G.foot.x, 0, G.foot.z); matt.rotation.y = G.foot.h;
resize(); camSnap = true;
window.MGS = { G, input, RINGS, ROUTE, camry, matt, collectibles, actors, cones, openModal, closeModal, enterOffice, actBadge, addToken, bust, win, startGame, ffTarget };   // debug hook
requestAnimationFrame(frame);
try { if (sessionStorage.getItem('mgs-retry') === '1') { sessionStorage.removeItem('mgs-retry'); startGame(); } } catch (_) {}
})();
