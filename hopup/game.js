// Star Hop Up: a portrait one-thumb climber for phones, based on Star Hoppers (fly Gummy home through space).
// Gummy bounces up by himself from platform to platform (asteroids, moon rocks, planet rings, satellites); drag
// anywhere to steer him left and right (the screen wraps). Falling off the bottom ends the run.
// Learning first, then play: every ~150 m Gummy lands on a Launch Station. The action stops and three gap-fill
// questions load his rockets (a right answer = one rocket, a fast right answer also = a star shield). Then he launches
// and the climb goes on: tap the rocket button to blast up 40 m. Three sectors (Luna, Saturna, Planet Gummy) unlock
// by best score; each asks the package's easy, middle or hard third and adds new hazards. One score: height + stars.
// Everything is built in code with three.js (low-poly shapes, tiny canvas textures, no shadows, no image files).
import * as THREE from './lib/three.module.min.js';
window.HOPUP_LOAD && window.HOPUP_LOAD(70);

const $ = (id) => document.getElementById(id);
const R = Math.random, rand = (a, b) => a + R() * (b - a), pick = (a) => a[(R() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms / (SH_TIME.k || 1)));
const SH_TIME = { k: 1 }; // test hook: speeds up waits and the clock in automatic test runs
// a short event log for tests (stations, landings on decks, rockets, shield saves): window.SH.log()
const EVLOG = []; const evlog = (...a) => { EVLOG.push(a.map((v) => typeof v === 'number' ? +v.toFixed(2) : v).join(' ')); if (EVLOG.length > 300) EVLOG.shift(); };

/* ---------- save ---------- */
const SAVE = 'fugio-star-hop-up';
const save = { tier: 0, best: [0, 0, 0], home: [false, false, false], packs: [], hand: 'right', sound: true, music: true, calm: false, runs: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) {}
const store = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) {} };

/* ---------- sound: everything is synthesised with WebAudio ---------- */
let AC = null, master = null, musicBus = null;
const ac = () => {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = save.sound ? .6 : 0; master.connect(AC.destination); musicBus = AC.createGain(); musicBus.gain.value = save.music ? .45 : 0; musicBus.connect(master); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
};
function tone(f, d = .3, type = 'sine', vol = .08, slide = 0, delay = 0, bus) {
  const a = AC; if (!a || !save.sound) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(bus || master); o.start(t); o.stop(t + d + .05);
}
let noiseBuf = null;
function noise(d = .3, vol = .1, freq = 1200, delay = 0, q = 1, slideTo = 0) {
  const a = AC; if (!a || !save.sound) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate); const c = noiseBuf.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = R() * 2 - 1; }
  const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(f).connect(g).connect(master); s.start(t, R() * .4); s.stop(t + d + .05);
}
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637];
let chimeN = 0, chimeT = 0, springN = 0;
const semi = (n) => Math.pow(2, n / 12);
const sfx = {
  boing: () => { const f = 210 * (1 + (R() - .5) * .14); tone(f, .2, 'sine', .1, 2.2); tone(f * 2.01, .1, 'triangle', .025, 1.6); },
  spring: () => { const f = 330 * semi(Math.min(springN++, 12)); tone(f, .35, 'sine', .11, 2.6); tone(f * 1.5, .25, 'triangle', .04, 2, .03); noise(.2, .04, 3000); },
  star: () => { const now = performance.now(); if (now - chimeT > 1300) chimeN = 0; chimeT = now; const f = PENTA[Math.min(chimeN++, PENTA.length - 1)] * (1 + (R() - .5) * .01); tone(f, .32, 'sine', .07); tone(f * 2, .18, 'sine', .02, 0, .02); },
  crumble: () => { noise(.35, .2, 500, 0, .8, 200); tone(120, .25, 'triangle', .06, .6); },
  hit: () => { noise(.3, .3, 380, 0, .7); tone(150, .35, 'sine', .14, .45); },
  smash: () => { noise(.35, .25, 900, 0, .8, 300); [0, 4, 7].forEach((k, i) => tone(PENTA[k], .25, 'triangle', .05, 0, .04 + i * .05)); },
  rocket: () => { noise(1.2, .2, 600, 0, .6, 3500); tone(180, 1.1, 'sawtooth', .025, 3.5); tone(360, .5, 'sine', .05, 2.5, .05); },
  shield: () => { [0, 4, 7, 9, 12].forEach((k, i) => tone(PENTA[k], .5, 'sine', .05, 0, i * .05)); noise(.5, .05, 6000, .05); },
  hole: () => { tone(90, .9, 'sine', .14, .4); tone(60, 1.1, 'triangle', .08, .5, .1); noise(.8, .08, 300, 0, 1, 80); },
  station: () => { tone(220, .12, 'square', .03); noise(.15, .12, 1500); [0, 2, 4].forEach((k, i) => tone(PENTA[k] / 2, .5, 'triangle', .05, 0, .08 + i * .07)); },
  right: () => [0, 2, 4, 7].forEach((k, i) => tone(PENTA[k], .4, 'triangle', .07, 0, i * .07)),
  fast: () => [7, 9, 11, 12].forEach((k, i) => tone(PENTA[k], .3, 'sine', .045, 0, .3 + i * .05)),
  puff: () => { noise(.35, .11, 650); tone(220, .3, 'sine', .06, .75); },
  load: () => { noise(.35, .14, 1800, 0, .8, 4000); tone(300, .3, 'sine', .04, 2.8); },
  combo: () => { [0, 2, 4].forEach((k) => tone(PENTA[k], 1, 'triangle', .045)); [0, 2, 4, 5, 7, 9].forEach((k, i) => tone(PENTA[k] * 2, .4, 'sine', .035, 0, .1 + i * .06)); },
  launch: () => { noise(.9, .2, 500, 0, .6, 2500); tone(160, .8, 'sine', .08, 3); },
  milestone: () => { [0, 2, 4, 7, 9].forEach((k, i) => tone(PENTA[k + 2], .3, 'triangle', .05, 0, i * .05)); noise(.4, .04, 6000, .1); },
  fall: () => { tone(520, 1.1, 'triangle', .07, .25); tone(260, 1.1, 'sine', .05, .3, .05); },
  win: () => { [0, 2, 4, 7, 9, 12].forEach((k, i) => tone(PENTA[k], .6, 'triangle', .06, 0, i * .09)); [0, 4, 7].forEach((k) => tone(PENTA[k] / 2, 1.6, 'sine', .05, 0, .55)); noise(.8, .05, 6000, .5); },
  click: () => tone(880, .07, 'sine', .05),
  tick: () => tone(1320, .06, 'sine', .04),
  locked: () => tone(180, .2, 'triangle', .06, .8),
  warp: () => { tone(900, .12, 'sine', .03, 1.8); },
};
// soft background music: a slow pentatonic arpeggio with a bass note, scheduled ahead with WebAudio
const MUSIC = { on: false, next: 0, step: 0 };
const CHORDS = [[261.6, 329.6, 392, 523.3], [220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2], [196, 246.9, 293.7, 392]];
function musicTick() {
  if (!AC || !MUSIC.on || !save.music || !save.sound) return;
  const spb = .3; if (MUSIC.next < AC.currentTime) MUSIC.next = AC.currentTime + .05;
  while (MUSIC.next < AC.currentTime + .4) {
    const s = MUSIC.step++, ch = CHORDS[(s >> 3) % 4], at = MUSIC.next - AC.currentTime, quiet = state === 'station' ? .55 : 1;
    const pat = [0, 1, 2, 3, 2, 1, 2, 3][s % 8];
    tone(ch[pat] * 2, .5, 'triangle', .022 * quiet, 0, at, musicBus);
    if (s % 8 === 0) tone(ch[0] / 2, 2.2, 'sine', .06 * quiet, 0, at, musicBus);
    if (s % 16 === 12) tone(ch[2] * 4, .9, 'sine', .01 * quiet, 0, at, musicBus);
    MUSIC.next += spb;
  }
}
const buzz = (p) => { if (save.calm) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/* ---------- English: the A0–A2 gap-fill packages (same as the other Fugio games) ---------- */
const PACKS = window.FugioPacks ? FugioPacks.sort(window.GUMMY_PACKAGES || []) : (window.GUMMY_PACKAGES || []);
save.packs = (save.packs || []).filter((id) => PACKS.some((p) => p.id === id));
if (!save.packs.length && PACKS.length) save.packs = [PACKS[0].id];
const packNow = () => (window.FugioPacks ? FugioPacks.merge(PACKS, save.packs) : PACKS[0]) || PACKS[0];
const SLOT = new Set(['do', 'does', "don't", "doesn't", 'did', "didn't", 'was', 'were', "wasn't", "weren't", 'is', 'are', 'am',
  "isn't", "aren't", 'a', 'an', 'the', 'more', 'most', 'less', 'least', 'because', 'so', 'and', 'but', 'or', 'have', 'has', 'not']);
const slotKey = (t) => t.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean).map((w) => SLOT.has(w) ? w : '_').join(' ');
function mixComparisons(q) {
  const m = q.match(/^(.*)\[([^|\]]+)\|(the [^|\]]+)\]( \([^)]*\)) than [^.?!]*([.?!])$/);
  return m && R() < .5 ? `${m[1]}[${m[3]}|${m[2]}]${m[4]} of all${m[5]}` : q;
}
function fillChoices(q) {
  const m = q.match(/\[([^\]]+)\]/);
  const [right, ...wrong] = m[1].split('|');
  const words = [{ text: right, ok: true }, ...shuffle(wrong).slice(0, 2).map((t) => ({ text: t, ok: false }))];
  words.sort((x, y) => slotKey(x.text).localeCompare(slotKey(y.text)) || x.text.localeCompare(y.text));
  words.before = q.slice(0, m.index); words.after = q.slice(m.index + m[0].length); words.right = right;
  return words;
}
const usedQ = new Set();
// Luna asks the package's easy third, Saturna the middle third, Planet Gummy the hardest
function pickSentence(tier) {
  const pk = packNow(); if (!pk) return null;
  const r = clamp(tier, 0, 2), mine = pk.rounds[r] || [], rest = pk.rounds.filter((_, i) => i !== r).flat();
  const free = (l) => l.filter((q) => !usedQ.has(q));
  let pool = free(mine); if (!pool.length) pool = free(rest);
  if (!pool.length) { usedQ.clear(); pool = mine.length ? mine : rest; }
  const q = pick(pool); usedQ.add(q); return mixComparisons(q);
}
const hints = (t) => esc(t).replace(/\(([^)]*)\)/g, '<i>($1)</i>');
const strip = (t) => t.replace(/\s*\([^)]*\)/g, '');
const markedSentence = (w) => (esc(strip(w.before)) + '<b>' + esc(w.right) + '</b>' + esc(strip(w.after))).replace(/\s+/g, ' ').trim();
const plainSentence = (w) => (w.before + w.right + w.after).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

/* ---------- the three sectors ---------- */
const TIERS = [
  { id: 'luna', name: 'Luna', hop: 'Moon Hop', goal: 500, every: 150, need: 0, sub: 'Easy sentences · fly to the moon base', home: 'Welcome to Luna!',
    sky: [[0x060a28, 0x141a56, 0x2c2276], [0x0a1440, 0x2a3a96, 0x7a6ad0]], neb: [0x6a4aff, 0x3a7aff, 0xff6fb5], start: 'earth', goalP: 'luna',
    rock: [0xd2d6ee, 0x8a90b8], rock2: [0xb89a86, 0x6a5560], gap: [1.5, 3.0], width: [2.1, 1.55],
    moving: [.06, .26], crumble: [0, .16], spring: .08, blink: null, meteor: [.38, .07], hole: null, far: [0xffaa4a, 0x55c8ff, 0xff8fc8, 0xa46bff] },
  { id: 'saturna', name: 'Saturna', hop: 'Ring Hop', goal: 650, every: 150, need: 600, sub: 'Harder sentences · icy rings, black holes', home: 'Welcome to Saturna!',
    sky: [[0x041428, 0x0e3050, 0x1e5a7a], [0x0a1a48, 0x2a4a9a, 0x9a6ad8]], neb: [0x3ad8ff, 0x6a4aff, 0xff9a4a], start: 'luna', goalP: 'saturna',
    rock: [0xbfeaff, 0x5a8ac8], rock2: [0xffc98a, 0xb06a3a], gap: [1.8, 3.25], width: [2.0, 1.45],
    moving: [.1, .3], crumble: [.06, .2], spring: .08, blink: null, meteor: [.08, .07], hole: [.25, .07], far: [0x55c8ff, 0xffd27a, 0xa46bff, 0x7fe0a0] },
  { id: 'gummy', name: 'Planet Gummy', hop: 'Home Hop', goal: 750, every: 150, need: 750, sub: 'Hardest sentences · Gummy\'s home', home: 'Gummy is home!',
    sky: [[0x1a0630, 0x3a0e5a, 0x6a1a6a], [0x2a0a4a, 0x7a2a8a, 0xff7ab0]], neb: [0xff6fb5, 0xa46bff, 0x55c8ff], start: 'saturna', goalP: 'gummy',
    rock: [0xff8fc8, 0xb03a8a], rock2: [0x7fd8ff, 0x2a6ac0], gap: [2.0, 3.35], width: [1.9, 1.4],
    moving: [.12, .3], crumble: [.08, .2], spring: .08, blink: [.15, .16], meteor: [.04, .08], hole: [.1, .09], far: [0xff6fb5, 0x55c8ff, 0xffd27a, 0x7fe0a0] },
];
const unlocked = (i) => i === 0 || save.best[i - 1] >= TIERS[i].need;

/* ---------- renderer, camera ---------- */
const stage = $('stage'), cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
let PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.localClippingEnabled = true;
cv.addEventListener('webglcontextlost', (e) => e.preventDefault()); cv.addEventListener('webglcontextrestored', () => location.reload());
const scene = new THREE.Scene();
const FOV = 42;
const cam = new THREE.PerspectiveCamera(FOV, 1, .5, 900);
const PW = 9; // the play field is 9 m wide; it wraps from one side to the other
let VW = 1, VH = 1, visH = 18, visW = 9, camD = 24;
function fit() {
  VW = window.innerWidth; VH = window.innerHeight;
  renderer.setSize(VW, VH, false);
  cam.aspect = VW / VH;
  visH = Math.max(PW / cam.aspect, 16.5); visW = visH * cam.aspect;
  camD = visH / 2 / Math.tan(FOV * Math.PI / 360);
  cam.updateProjectionMatrix();
  rails.visible = visW > PW + .6;
}
// phones that struggle get a lower resolution, step by step
let quality = 0, slowT = 0;
function watchSpeed(raw) {
  if (quality >= 3) return;
  slowT = raw > 1 / 40 ? slowT + raw : Math.max(0, slowT - raw * .5);
  if (slowT > 2.5) { quality++; slowT = 0; PR = Math.max(1, PR * .75); renderer.setPixelRatio(PR); fit(); }
}

/* ---------- materials ---------- */
const gm = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
gm.minFilter = gm.magFilter = THREE.NearestFilter; gm.needsUpdate = true;
function toon(color, o = {}) {
  const rim = o.rim; delete o.rim;
  const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gm }, o));
  if (rim) {
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
      outgoingLight += vec3(${rim.map((v) => v.toFixed(2)).join(',')}) * rimF;
      #include <opaque_fragment>`); };
    m.customProgramCacheKey = () => 'rim' + rim.join(',');
  }
  return m;
}
const basic = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color }, o));
// shared geometries and materials, so platforms made during a run never leak GPU memory
const GC = new Map(); const cg = (key, fn) => { let g = GC.get(key); if (!g) { g = fn(); if (g.isBufferGeometry) g.userData.keep = true; GC.set(key, g); } return g; };
const r1 = (v) => Math.round(v * 10) / 10;
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const GLOW = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const CLOUD = canvasTex(128, 128, (x) => {
  for (let i = 0; i < 26; i++) { const cx = 64 + rand(-30, 30), cy = 64 + rand(-30, 30), r = rand(14, 40), g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const v = x.createRadialGradient(64, 64, 30, 64, 64, 64); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, 128, 128);
});
function glowSprite(color, size, opacity = .8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1); return s;
}
// clip planes at the field edges: Gummy and his wrap-around twin are cut at the edge, like going through a portal
const clipL = new THREE.Plane(new THREE.Vector3(1, 0, 0), PW / 2), clipR = new THREE.Plane(new THREE.Vector3(-1, 0, 0), PW / 2);
const CLIP = [clipL, clipR];

/* ---------- small geometry helpers ---------- */
const hash3 = (x, y, z, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 13.37) * 43758.5453; return v - Math.floor(v); };
// a low-poly rock with a flat-ish top at y = 0, per-face shades (top lighter, bottom darker = fake shadow)
function rockGeo(seed, top, bottom, detail = 1, flat = .3) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = 1 + (hash3(Math.round(v.x * 1e3), Math.round(v.y * 1e3), Math.round(v.z * 1e3), seed) - .5) * .42;
    v.multiplyScalar(k); if (v.y > flat) v.y = flat + (v.y - flat) * .18; p.setXYZ(i, v.x, v.y, v.z);
  }
  g.translate(0, -flat - .02, 0); g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), cT = new THREE.Color(top), cB = new THREE.Color(bottom), c = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, t = clamp((y + 1.2) / 1.25, 0, 1), sh = .88 + hash3(f, seed, 1, 2) * .24;
    c.copy(cB).lerp(cT, t * t).multiplyScalar(sh);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// a faceted planet with coloured patches from a smooth noise
function planetGeo(kind, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const n3 = (x, y, z, f) => Math.sin(x * f + 1.3) * Math.sin(y * f * 1.3 + 2.1) * Math.sin(z * f * .9 + .7) + .5 * Math.sin((x + y) * f * 2.1 + 4) * Math.sin((z - x) * f * 1.7);
  for (let f = 0; f < p.count; f += 3) {
    const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3, n = n3(x, y, z, 3.2), sh = .92 + hash3(f, 3, 1, 2) * .16;
    if (kind === 'earth') c.set(n > .12 ? (n > .45 ? 0xe8d48a : 0x4fbf5a) : (n > -.05 ? 0x3aa0e8 : 0x2a6ad8)), Math.abs(y) > .97 && c.set(0xf4f8ff);
    else if (kind === 'luna') c.set(n > .35 ? 0x8a90b0 : n > -.2 ? 0xd6dbf0 : 0xb4b9d4);
    else if (kind === 'saturna') { const b = Math.sin(y * 9 + n * 1.2); c.set(b > .5 ? 0xffd28a : b > -.2 ? 0xffaa4a : 0xd8783a); }
    else { c.set(n > .3 ? 0x55c8ff : n > -.15 ? 0xff7ac0 : 0xff9ed2); }
    c.multiplyScalar(sh);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
const PGEO = {}; const planetG = (k, d) => PGEO[k + d] || (PGEO[k + d] = planetGeo(k, d), PGEO[k + d].userData.keep = true, PGEO[k + d]);
const RINGTEX = canvasTex(128, 8, (x) => { for (let i = 0; i < 128; i++) { const a = .25 + .6 * Math.abs(Math.sin(i * .21) * Math.sin(i * .07 + 1)); x.fillStyle = `rgba(255,255,255,${(i < 6 || i > 121 ? .15 : a).toFixed(2)})`; x.fillRect(i, 0, 1, 8); } });
function ringMesh(inner, outer, color, opacity = .85) {
  inner = r1(inner); outer = r1(outer);
  const g = cg(`ring${inner}/${outer}`, () => { const g = new THREE.RingGeometry(inner, outer, 48, 1), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - inner) / (outer - inner), .5); } return g; });
  return new THREE.Mesh(g, cg(`ringM${color}/${opacity}`, () => basic(color, { map: RINGTEX, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
}
function makePlanet(kind, r, detail = 3, lit = true) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(planetG(kind, detail), lit ? toon(0xffffff, { vertexColors: true, flatShading: true }) : basic(0xffffff, { vertexColors: true }));
  m.scale.setScalar(r); grp.add(m); grp.userData.ball = m;
  const atm = { earth: 0x6ac8ff, luna: 0xc8d0ff, saturna: 0xffb060, gummy: 0xff7ac0 }[kind] || 0xffffff;
  const gl = glowSprite(atm, r * 2.9, .55); gl.position.z = -r * .3; gl.renderOrder = -1; grp.add(gl);
  if (kind === 'saturna') { const ring = ringMesh(r * 1.35, r * 2.25, 0xcfeeff); ring.rotation.x = -Math.PI / 2 + .42; ring.rotation.y = .2; grp.add(ring); }
  return grp;
}

/* ---------- background: gradient sky, star layers, nebula clouds, distant planets ---------- */
const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, time: { value: 0 } };
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: skyU, depthWrite: false, depthTest: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }',
  fragmentShader: `uniform vec3 top, mid, bot; varying vec2 vUv;
    void main(){ float y = vUv.y; vec3 c = y > .5 ? mix(mid, top, smoothstep(.5, 1., y)) : mix(bot, mid, smoothstep(0., .5, y));
      float v = 1. - .35 * length(vUv - vec2(.5, .55)); gl_FragColor = vec4(c * v, 1.); }`,
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

const starU = { camY: { value: 0 }, time: { value: 0 }, pr: { value: 1 } };
function starLayer(n, depth, par, size, tint) {
  const hAt = 2 * (30 + depth) * Math.tan(FOV * Math.PI / 360) * 1.45, span = hAt * 1.25, wide = hAt * 2.6;
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos.set([rand(-wide / 2, wide / 2), rand(-span / 2, span / 2), -depth + rand(-4, 4)], i * 3); ph[i] = R(); sz[i] = size * rand(.55, 1.25);
    c.set(pick(tint)); col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('sz', new THREE.BufferAttribute(sz, 1)); g.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign({ span: { value: span }, par: { value: par } }, starU), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float camY, span, par, time, pr; attribute float ph; attribute float sz; attribute vec3 col; varying vec3 vC; varying float vT;
      void main(){ vec3 p = position; float y = p.y - camY * par; p.y = mod(y + span * .5, span) - span * .5 + camY;
        vT = .55 + .45 * sin(time * (1.2 + fract(ph * 7.) * 2.6) + ph * 6.283); vC = col;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); gl_PointSize = sz * pr * (.7 + .5 * vT); }`,
    fragmentShader: `varying vec3 vC; varying float vT; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vC * (a * a * 1.3 + a * .3) * (.6 + .5 * vT), 1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -8; scene.add(pts); return pts;
}
starLayer(520, 230, .03, 2.6, [0xffffff, 0xcfe0ff, 0xffe8c8]);
starLayer(260, 120, .09, 3.6, [0xffffff, 0xbfe8ff, 0xffd0ec]);
starLayer(90, 55, .22, 5.2, [0xffffff, 0xfff3b0, 0x9fe8ff]);

const bgItems = []; // things far away that scroll slower than the play field (parallax) and wrap around
function addBg(obj, depth, par, span, x, y) { obj.position.set(x, y, -depth); scene.add(obj); bgItems.push({ obj, par, span, x, y }); return obj; }
const nebulas = [];
for (let i = 0; i < 7; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: CLOUD, color: 0xffffff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sz = rand(70, 120); s.scale.set(sz * rand(1, 1.5), sz, 1); s.material.rotation = rand(0, TAU); s.renderOrder = -9;
  nebulas.push(addBg(s, 200, .05, 360, rand(-110, 110), i * 52 - 150));
}
const farPlanets = [];
for (let i = 0; i < 5; i++) {
  const kind = ['earth', 'luna', 'saturna', 'gummy', 'luna'][i];
  const p = new THREE.Group(), m = new THREE.Mesh(planetG(kind, 1), basic(0xffffff, { vertexColors: true }));
  const r = rand(1.6, 3.6); m.scale.setScalar(r); p.add(m); const gl = glowSprite(0xffffff, r * 3, .35); gl.position.z = -1; p.add(gl); p.userData = { m, gl, spin: rand(-.2, .2) };
  if (i === 2 || i === 4) { const ring = ringMesh(r * 1.35, r * 2.1, 0xffffff, .6); ring.rotation.x = -Math.PI / 2 + .5; p.add(ring); p.userData.ring = ring; }
  const side = i % 2 ? 1 : -1;
  farPlanets.push(addBg(p, 110 + i * 12, .1, 180, side * rand(14, 34), i * 36 - 60));
}
// the field edges (only seen on screens wider than the field): two faint glowing rails
const rails = new THREE.Group();
for (const k of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.08, 400), basic(0x7fe6ff, { transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.x = k * PW / 2; rails.add(m); const g = new THREE.Mesh(new THREE.PlaneGeometry(.9, 400), basic(0x7fe6ff, { map: canvasTex(32, 4, (x) => { const g = x.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 4); }), transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false })); g.position.x = k * PW / 2; rails.add(g); }
rails.position.z = -.6; scene.add(rails);

const hemi = new THREE.HemisphereLight(0xd8e0ff, 0x4a3070, 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2e0, 2.3); sun.position.set(4, 8, 10); scene.add(sun);
const rimL = new THREE.DirectionalLight(0x8ad8ff, .9); rimL.position.set(-6, 2, -4); scene.add(rimL);

/* ---------- Gummy: tall, thin, pink-and-blue gummy alien, curly antennae, big purple eyes, buck teeth ---------- */
const PINK = 0xff6fb5, BLUE = 0x55c8ff;
const gummyMats = {
  pink: toon(PINK, { rim: [.9, .55, .9], clippingPlanes: CLIP }), blue: toon(BLUE, { rim: [.5, .8, 1], clippingPlanes: CLIP }),
  white: toon(0xffffff, { emissive: 0x303040, clippingPlanes: CLIP }), iris: toon(0x8a3ad8, { emissive: 0x3a1070, clippingPlanes: CLIP }),
  pupil: basic(0x16061e, { clippingPlanes: CLIP }), shine: basic(0xffffff, { clippingPlanes: CLIP }), mouth: basic(0x5a0e3a, { clippingPlanes: CLIP }),
  tongue: basic(0xff4a7a, { clippingPlanes: CLIP }), tooth: toon(0xffffff, { emissive: 0x555560, clippingPlanes: CLIP }),
  line: basic(0x2a0b3a, { side: THREE.BackSide, clippingPlanes: CLIP }), orange: toon(0xff9a3d, { rim: [.6, .4, .2], clippingPlanes: CLIP }), purple: toon(0x7b45f0, { clippingPlanes: CLIP }),
  flame: basic(0xffb030, { transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: CLIP }),
  bubble: new THREE.ShaderMaterial({ transparent: true, depthWrite: false, clipping: true, clippingPlanes: CLIP,
    uniforms: { op: { value: 1 } },
    vertexShader: `#include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV; void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz; gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
      }`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
      uniform float op; varying vec3 vN; varying vec3 vV; void main(){
      #include <clipping_planes_fragment>
      float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(mix(vec3(.55, .85, 1.), vec3(1.), f), (.05 + .6 * f) * op); }` }),
};
gummyMats.shieldBub = gummyMats.bubble.clone(); gummyMats.shieldBub.uniforms = { op: { value: 0 } };
gummyMats.shieldBub.fragmentShader = gummyMats.bubble.fragmentShader.replace('mix(vec3(.55, .85, 1.), vec3(1.), f)', 'mix(vec3(.5, .95, 1.), vec3(1., .95, .6), f)').replace('(.05 + .6 * f)', '(.08 + .85 * f)');
function makeGummy(clip = true) {
  const M = gummyMats, g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const mesh = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, par = rig) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); par.add(m); return m; };
  const SPH = (n = 14, h = 10) => new THREE.SphereGeometry(1, n, h);
  // legs and feet
  const legs = [];
  for (const k of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(k * .11, .36, 0); rig.add(leg); legs.push(leg);
    mesh(new THREE.CapsuleGeometry(.065, .22, 3, 6), M.pink, 0, -.16, 0, 1, 1, 1, leg);
    mesh(SPH(10, 6), M.blue, k * .02, -.32, .05, .11, .07, .15, leg);
  }
  // body: a slim gummy pear, with a dark outline shell
  const bodyGeo = new THREE.LatheGeometry([[0, .3], [.15, .31], [.23, .38], [.26, .5], [.25, .64], [.21, .8], [.17, .92], [.15, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  mesh(bodyGeo, M.pink, 0, 0, 0); const bl = mesh(bodyGeo, M.line, 0, -.01, 0, 1.08, 1.02, 1.08);
  mesh(SPH(10, 7), M.blue, .1, .55, .19, .09, .12, .06); mesh(SPH(10, 7), M.blue, -.13, .72, .16, .07, .08, .05); mesh(SPH(8, 6), M.blue, .02, .42, .22, .06, .05, .04);
  // head
  const head = new THREE.Group(); head.position.set(0, 1.27, 0); rig.add(head);
  const hg = SPH(20, 14); mesh(hg, M.pink, 0, 0, 0, .42, .38, .38, head); mesh(hg, M.line, 0, 0, -.01, .45, .41, .41, head);
  mesh(SPH(10, 7), M.blue, -.2, .22, .18, .12, .08, .07, head); mesh(SPH(10, 7), M.blue, .3, .02, .2, .07, .07, .05, head); mesh(SPH(8, 6), M.blue, .12, .3, .1, .06, .05, .05, head);
  // big purple eyes
  const eyes = [];
  for (const k of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(k * .16, .07, .29); head.add(e); eyes.push(e);
    mesh(SPH(16, 12), M.white, 0, 0, 0, .15, .17, .12, e);
    const iris = new THREE.Group(); iris.position.set(0, -.01, .1); e.add(iris);
    mesh(new THREE.CircleGeometry(1, 16), M.iris, 0, 0, 0, .09, .1, 1, iris); mesh(new THREE.CircleGeometry(1, 12), M.pupil, 0, -.005, .004, .045, .055, 1, iris); mesh(new THREE.CircleGeometry(1, 8), M.shine, .03, .035, .008, .022, .022, 1, iris);
    e.userData.iris = iris;
  }
  // a big grin with two buck teeth
  const mouth = new THREE.Group(); mouth.position.set(0, -.15, .34); mouth.rotation.x = -.25; head.add(mouth);
  mesh(new THREE.CircleGeometry(1, 16, Math.PI, Math.PI), M.mouth, 0, 0, 0, .17, .12, 1, mouth);
  mesh(new THREE.CircleGeometry(1, 10, Math.PI, Math.PI), M.tongue, 0, -.07, .002, .08, .045, 1, mouth);
  for (const k of [-1, 1]) mesh(new THREE.BoxGeometry(1, 1, 1), M.tooth, k * .032, -.03, .01, .055, .065, .02, mouth);
  // curly antennae: pink stalks ending in blue curls
  const ants = [];
  for (const k of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(k * .14, .3, 0); head.add(a); ants.push(a);
    const c1 = new THREE.CatmullRomCurve3([[0, 0, 0], [k * .06, .14, .02], [k * .16, .28, .02], [k * .3, .36, 0]].map((p) => new THREE.Vector3(...p)));
    const c2 = new THREE.CatmullRomCurve3([[k * .3, .36, 0], [k * .42, .38, 0], [k * .46, .3, 0], [k * .4, .24, 0], [k * .34, .28, 0], [k * .37, .32, 0]].map((p) => new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(c1, 10, .034, 5), M.pink, 0, 0, 0, 1, 1, 1, a);
    mesh(new THREE.TubeGeometry(c2, 14, .03, 5), M.blue, 0, 0, 0, 1, 1, 1, a);
    mesh(SPH(8, 6), M.blue, k * .37, .32, 0, .045, .045, .045, a);
  }
  // arms
  const arms = [];
  for (const k of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(k * .2, .86, 0); rig.add(a); arms.push(a);
    mesh(new THREE.CapsuleGeometry(.05, .3, 3, 6), M.pink, k * .02, -.18, 0, 1, 1, 1, a);
    mesh(SPH(8, 6), M.blue, k * .03, -.38, 0, .07, .07, .07, a);
  }
  // costume: a little jetpack and a space-helmet bubble with an orange collar
  const pack = new THREE.Group(); pack.position.set(0, .66, -.27); rig.add(pack);
  const flames = [];
  for (const k of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(.085, .09, .34, 8), M.orange, k * .1, 0, 0, 1, 1, 1, pack);
    mesh(new THREE.SphereGeometry(.085, 8, 5, 0, TAU, 0, Math.PI / 2), M.purple, k * .1, .17, 0, 1, 1, 1, pack);
    mesh(new THREE.CylinderGeometry(.05, .07, .07, 8), M.purple, k * .1, -.2, 0, 1, 1, 1, pack);
    const f = mesh(new THREE.ConeGeometry(.07, .4, 8), M.flame, k * .1, -.42, 0, 1, 1, 1, pack); f.rotation.x = Math.PI; flames.push(f);
  }
  mesh(new THREE.TorusGeometry(.2, .045, 6, 16), M.orange, 0, .99, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  const bub = mesh(SPH(22, 16), M.bubble, 0, 1.36, 0, .64, .64, .6); bub.renderOrder = 5;
  const hi = mesh(SPH(8, 6), basic(0xffffff, { transparent: true, opacity: .55, depthWrite: false, clippingPlanes: CLIP }), -.28, 1.66, .38, .09, .05, .02); hi.rotation.z = .7; hi.renderOrder = 6;
  const shield = mesh(SPH(20, 14), M.shieldBub, 0, .95, 0, 1.15, 1.2, 1.0, g); shield.renderOrder = 7; shield.visible = false;
  return { g, rig, head, eyes, ants, arms, legs, flames, shield, bub, hi, pack };
}
const gummy = makeGummy(), twin = makeGummy();
scene.add(gummy.g); scene.add(twin.g);
// a soft glow under Gummy so he always reads against dark space
const gGlow = glowSprite(0xff8fd0, 3.2, .28); scene.add(gGlow);

/* ---------- particles: one pool of solid bits and one pool of glowing sparks ---------- */
function pool(n, geo, mat) {
  const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
  const c = new THREE.Color(1, 1, 1), z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) { im.setColorAt(i, c); im.setMatrixAt(i, z); }
  const P = { im, n, i: 0, list: Array.from({ length: n }, () => ({ life: 0 })) }; scene.add(im); return P;
}
const bits = pool(260, new THREE.OctahedronGeometry(1, 0), basic(0xffffff));
const sparks = pool(320, new THREE.PlaneGeometry(1, 1), basic(0xffffff, { map: GLOW, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.im.renderOrder = 8;
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function emit(P, x, y, z, color, n, speed, life, size, grav = -9, up = 0) {
  for (let k = 0; k < n; k++) {
    const o = P.list[P.i = (P.i + 1) % P.n], a = R() * TAU, s = speed * rand(.35, 1);
    Object.assign(o, { x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s + up, vz: rand(-.5, .5) * s * .4, life: life * rand(.6, 1), max: life, size: size * rand(.6, 1.2), grav, rot: R() * 6, vr: rand(-8, 8) });
    _c.set(Array.isArray(color) ? pick(color) : color); P.im.setColorAt(P.i, _c);
  }
  P.im.instanceColor.needsUpdate = true;
}
function updPool(P, dt, face) {
  for (let i = 0; i < P.n; i++) {
    const o = P.list[i];
    if (o.life <= 0) { _m.makeScale(0, 0, 0); P.im.setMatrixAt(i, _m); continue; }
    o.life -= dt; o.vy += o.grav * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rot += o.vr * dt;
    const k = Math.max(0, o.life / o.max), s = o.size * (face ? (k < .3 ? k / .3 : 1) : k);
    _e.set(face ? 0 : o.rot, face ? 0 : o.rot * .7, face ? o.rot * .2 : 0); _q.setFromEuler(_e); _s.set(s, s, s); _p.set(o.x, o.y, o.z);
    _m.compose(_p, _q, _s); P.im.setMatrixAt(i, _m);
  }
  P.im.instanceMatrix.needsUpdate = true;
}
// speed lines while the rocket burns
const LINES = 46;
const lines = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), basic(0xffffff, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), LINES);
lines.frustumCulled = false; lines.renderOrder = 9; scene.add(lines);
const lineD = Array.from({ length: LINES }, () => ({ x: rand(-1, 1), y: R(), z: rand(2, 9), l: rand(1.5, 4), s: rand(.6, 1.4) }));

/* ---------- world objects ---------- */
const world = new THREE.Group(); scene.add(world);
let T = TIERS[0], TI = 0;
let plats = [], stars = [], meteors = [], holes = [], deco = [];
const GEO = {}; // cached geometries
const MAT = {};
function tierMats() {
  for (const k of Object.keys(MAT)) delete MAT[k];
  MAT.rock = toon(0xffffff, { vertexColors: true, flatShading: true });
  MAT.crumble = toon(0xd8a080, { vertexColors: true, flatShading: true });
  GEO.rocks = cg('rocks' + TI, () => [0, 1, 2].map((s) => keep(rockGeo(s + 11 * TI, T.rock[0], T.rock[1], 1))));
  GEO.rocks2 = cg('rocks2' + TI, () => [0, 1].map((s) => keep(rockGeo(s + 40 + 11 * TI, T.rock2[0], T.rock2[1], 1))));
  GEO.crumb = cg('crumb', () => [0, 1].map((s) => keep(rockGeo(s + 70, 0xc8906a, 0x6a3a2a, 1, .22))));
}
const keep = (g) => { g.userData.keep = true; return g; };
const crackMat = basic(0x2a1410);
GEO.spring = keep(new THREE.TorusGeometry(.15, .04, 5, 10));
GEO.star = (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? .15 : .34; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } const g = new THREE.ExtrudeGeometry(sh, { depth: .1, bevelEnabled: true, bevelThickness: .04, bevelSize: .03, bevelSegments: 1 }); g.center(); return keep(g); })();
const starMat = toon(0xffd84a, { emissive: 0x8a5a00, rim: [1, .9, .4] });
const satMats = { body: toon(0xffc94a, { emissive: 0x3a2a00 }), panel: toon(0x3a6aff, { emissive: 0x10204a }), grid: basic(0x9fd0ff), dish: toon(0xf0f0ff) };
const springMats = { coil: toon(0xdde4ff, { rim: [.4, .4, .5] }), cap: toon(0xff4a6a, { emissive: 0x4a0010 }) };
const meteorMat = toon(0xffb070, { emissive: 0xc04a10, flatShading: true, vertexColors: true });
GEO.meteor = keep(rockGeo(5, 0xffd0a0, 0xb05a2a, 0, 1));
const stationMats = { deck: toon(0x5a4aa0, { rim: [.3, .3, .6] }), edge: toon(0xff9a3d, { emissive: 0x4a2000 }), dark: toon(0x2a2250), yellow: toon(0xffd84a, { emissive: 0x3a2a00 }), light: basic(0x7fe6ff), tower: toon(0x8a7ad8) };

function clearWorld() {
  for (const o of [...plats, ...stars, ...meteors, ...holes, ...deco]) if (o.mesh) world.remove(o.mesh);
  // free the one-off shapes (home decorations, Gummy's family); shared shapes are kept
  for (const o of plats) if (o.type === 'home') o.mesh.traverse((m) => { if (m.geometry && !m.isSprite && !m.geometry.userData.keep) m.geometry.dispose(); });
  plats = []; stars = []; meteors = []; holes = []; deco = [];
}
function addPlat(type, x, y, w, extra = {}) {
  const p = Object.assign({ type, x, x0: x, y, w, t: R() * 10, pop: extra.instant ? 1 : 0, alpha: 1, dead: false }, extra);
  const g = new THREE.Group(); p.mesh = g; g.position.set(x, y, 0); world.add(g);
  if (type === 'normal' || type === 'spring' || type === 'blink') {
    const alt = R() < .35, geo = pick(alt ? GEO.rocks2 : GEO.rocks);
    let mat = MAT.rock;
    if (type === 'blink') { mat = MAT.rock.clone(); mat.transparent = true; p.mat = mat; }
    const m = new THREE.Mesh(geo, mat); m.scale.set(w / 2, .5, .62); g.add(m);
    if (TI === 1 && !alt && R() < .45 && type === 'normal') { // Saturna: some platforms are little ringed planets
      g.remove(m); const ball = new THREE.Mesh(planetG('saturna', 1), cg('ballM', () => toon(0xffffff, { vertexColors: true, flatShading: true }))); ball.scale.setScalar(.42); ball.position.y = -.3; g.add(ball);
      const ring = ringMesh(.55, w / 2 + .05, 0xcfeeff, .95); ring.rotation.x = -Math.PI / 2 + .55; ring.position.y = -.04; g.add(ring); p.ringy = true;
    }
    if (type === 'spring') {
      const s = new THREE.Group(); s.position.set(rand(-w * .2, w * .2), 0, .05); g.add(s); p.spring = s; p.sx = s.position.x;
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(GEO.spring, springMats.coil); t.rotation.x = Math.PI / 2; t.position.y = .06 + i * .09; s.add(t); }
      const cap = new THREE.Mesh(cg('cap', () => new THREE.CylinderGeometry(.24, .24, .08, 12)), springMats.cap); cap.position.y = .3; s.add(cap);
      const gl = glowSprite(0xff6a8a, 1.2, .5); gl.position.y = .3; s.add(gl);
    }
    if (type === 'blink') { const gl = glowSprite(0xff7ac0, w * 1.4, .4); g.add(gl); p.gl = gl; }
  } else if (type === 'crumble') {
    const m = new THREE.Mesh(pick(GEO.crumb), MAT.crumble); m.scale.set(w / 2, .45, .6); g.add(m);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(cg('crack', () => new THREE.PlaneGeometry(.04, .32)), crackMat); c.position.set(rand(-w * .3, w * .3), -.15, .56); c.rotation.z = rand(-.6, .6); g.add(c); }
  } else if (type === 'moving') {
    if (TI === 1) {
      const ball = new THREE.Mesh(planetG(pick(['luna', 'gummy']), 1), cg('ballM', () => toon(0xffffff, { vertexColors: true, flatShading: true }))); ball.scale.setScalar(.38); ball.position.y = -.26; g.add(ball);
      const ring = ringMesh(.5, w / 2 + .05, 0xffe0a8, .95); ring.rotation.x = -Math.PI / 2 + .55; ring.position.y = -.04; g.add(ring);
    } else {
      const body = new THREE.Mesh(cg('satB', () => new THREE.BoxGeometry(.62, .42, .5)), satMats.body); body.position.y = -.21; g.add(body);
      for (const k of [-1, 1]) {
        const pn = new THREE.Mesh(cg('satP' + r1(w), () => new THREE.BoxGeometry(r1(w) / 2 - .32, .05, .42)), satMats.panel); pn.position.set(k * (w / 4 + .15), -.06, 0); g.add(pn);
        const gr = new THREE.Mesh(cg('satG' + r1(w), () => new THREE.PlaneGeometry(r1(w) / 2 - .4, .02)), satMats.grid); gr.rotation.x = -Math.PI / 2; gr.position.set(k * (w / 4 + .15), -.03, 0); g.add(gr);
      }
      const dish = new THREE.Mesh(cg('dish', () => new THREE.ConeGeometry(.16, .14, 10, 1, true)), satMats.dish); dish.position.set(0, -.5, 0); dish.rotation.x = Math.PI; g.add(dish);
      const bl = glowSprite(0xff4a4a, .5, .9); bl.position.set(0, -.02, .27); g.add(bl); p.blinkLight = bl;
    }
    p.amp = Math.max(.4, (PW - w) / 2 - Math.abs(x) * .2) * rand(.6, 1); p.x0 = clamp(x, -(PW - w) / 2 + p.amp, (PW - w) / 2 - p.amp); p.spd = rand(.6, 1.1) * (1 + prog(y) * .6);
  }
  if (!extra.instant) g.scale.setScalar(.001);
  plats.push(p); return p;
}
function addStar(x, y) { const m = new THREE.Group(); const s = new THREE.Mesh(GEO.star, starMat); m.add(s); const gl = glowSprite(0xffd84a, 1.3, .55); gl.position.z = -.1; m.add(gl); m.position.set(x, y, 0); world.add(m); const o = { x, y, mesh: m, star: s, t: R() * 6 }; stars.push(o); return o; }
function addMeteor(y, dir) {
  const g = new THREE.Group(), m = new THREE.Mesh(GEO.meteor, meteorMat); m.scale.setScalar(.48); m.position.y = .2; g.add(m);
  const trail = []; const halo = glowSprite(0xff8a3a, 2.2, .55); halo.position.set(0, .2, -.15); g.add(halo);
  for (let i = 0; i < 4; i++) { const s = glowSprite(i ? 0xff7a2a : 0xffc060, 1.5 - i * .24, .8 - i * .15); s.position.set(-dir * (.35 + i * .38), .2, -.1); g.add(s); trail.push(s); }
  const x = dir > 0 ? -PW / 2 + .6 : PW / 2 - .6; g.position.set(x, y, 0); world.add(g);
  const o = { x, y, vx: dir * rand(1.4, 2.4) * (1 + prog(y) * .5), mesh: g, rock: m, trail, dead: false }; meteors.push(o); return o;
}
const holeMat = new THREE.ShaderMaterial({ uniforms: { time: starU.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform float time; varying vec2 vP; void main(){ float r = length(vP), a = atan(vP.y, vP.x);
    float sw = sin(a * 3. - r * 5. + time * 4.) * .5 + .5; float band = smoothstep(1.9, .8, r) * smoothstep(.5, .72, r);
    vec3 c = mix(vec3(.55, .25, 1.), vec3(1., .55, .25), sw); gl_FragColor = vec4(c * band * (.45 + .8 * sw), 1.); }` });
function addHole(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, -.2); world.add(g);
  const ring = new THREE.Mesh(cg('holeR', () => new THREE.RingGeometry(.45, 1.9, 40, 2)), holeMat); g.add(ring);
  const core = new THREE.Mesh(cg('holeC', () => new THREE.CircleGeometry(.58, 24)), cg('holeCM', () => basic(0x05020c))); core.position.z = .02; g.add(core);
  const gl = glowSprite(0x8a4aff, 5.4, .45); gl.position.z = -.1; g.add(gl);
  const o = { x, y, mesh: g, ring, core, pull: 2.6, kill: .55, dead: false }; holes.push(o); return o;
}
let signTex = null;
function makeStation(y, n) {
  evlog('station made', y);
  const g = new THREE.Group(); g.position.set(0, y, 0); world.add(g);
  const W = PW + .4;
  const deck = new THREE.Mesh(cg('deck', () => new THREE.BoxGeometry(W, .34, 1.5)), stationMats.deck); deck.position.y = -.17; g.add(deck);
  const lip = new THREE.Mesh(cg('lip', () => new THREE.BoxGeometry(W, .08, 1.54)), stationMats.edge); lip.position.y = -.02; g.add(lip);
  for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(cg('stripe', () => new THREE.BoxGeometry(.26, .2, .02)), i % 2 ? stationMats.yellow : stationMats.dark); s.position.set(-W / 2 + .25 + i * (W - .5) / 17, -.2, .76); s.rotation.z = .5; g.add(s); }
  const lights = [];
  for (let i = 0; i < 9; i++) { const l = glowSprite(0x7fe6ff, .5, .9); l.position.set(-W / 2 + .5 + i * (W - 1) / 8, -.36, .8); g.add(l); lights.push(l); }
  for (const k of [-1, 1]) { const leg = new THREE.Mesh(cg('sleg', () => new THREE.CylinderGeometry(.09, .14, 1.6, 6)), stationMats.dark); leg.position.set(k * 2.6, -1.1, 0); g.add(leg); const th = glowSprite(0xff9a3d, 1.4, .8); th.position.set(k * 2.6, -1.95, 0); g.add(th); }
  const tx = 2.15;
  const tower = new THREE.Mesh(cg('tower', () => new THREE.BoxGeometry(.42, 2.7, .42)), stationMats.tower); tower.position.set(tx, 1.35, -.45); g.add(tower);
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const lm = new THREE.Mesh(cg('lamp', () => new THREE.SphereGeometry(.16, 10, 8)), toon(0x55557a, { emissive: 0x111122 })); lm.position.set(tx, .8 + i * .62, -.2); g.add(lm);
    const lg = glowSprite(0xffb357, 1.3, 0); lg.position.set(tx, .8 + i * .62, -.1); g.add(lg); lamps.push({ lm, lg });
  }
  const beacon = glowSprite(0xff3a5a, .9, 1); beacon.position.set(tx, 2.85, -.45); g.add(beacon);
  if (!signTex) signTex = canvasTex(256, 64, (x) => { x.fillStyle = '#1a1250'; x.fillRect(0, 0, 256, 64); x.strokeStyle = '#ff9a3d'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 58); x.fillStyle = '#fff3b0'; x.font = 'bold 30px Lilita One, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LAUNCH STATION', 128, 34); });
  const sign = new THREE.Mesh(cg('sign', () => new THREE.PlaneGeometry(1.8, .45)), cg('signM', () => basic(0xffffff, { map: signTex }))); sign.position.set(-1.75, 2.5, -.6); g.add(sign);
  for (const k of [-1, 1]) { const pole = new THREE.Mesh(cg('pole', () => new THREE.CylinderGeometry(.04, .04, 2.2, 5)), stationMats.dark); pole.position.set(-1.75 + k * .75, 1.1, -.65); g.add(pole); }
  const under = glowSprite(0x7fe6ff, 7, .35); under.scale.set(12, 3, 1); under.position.set(0, -.4, -.6); g.add(under);
  const p = { type: 'station', x: 0, x0: 0, y, w: PW + 2, mesh: g, n, visited: false, lights, lamps, beacon, pop: 0, alpha: 1, t: 0 };
  g.scale.setScalar(.001); plats.push(p); return p;
}
let homeObj = null;
function makeHome(y) {
  const g = new THREE.Group(); world.add(g);
  const Rr = 38, pl = makePlanet(T.goalP, Rr, 4); pl.position.set(0, y - Rr + .2, -2.5); g.add(pl);
  const surf = (x) => y - Rr + .2 + Math.sqrt(Math.max(0, Rr * Rr - x * x - 2.5 * 2.5)) - .05;
  const add = (o, x, dz = -1) => { o.position.set(x, surf(x), dz); g.add(o); return o; };
  if (T.goalP === 'luna') { // the moon base: glass domes, a flag and a fuel tank
    for (const [x, r] of [[-2.6, .9], [-1.2, .55], [2.8, 1.1]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, TAU, 0, Math.PI / 2), toon(0xbfe8ff, { emissive: 0x204060, transparent: true, opacity: .85 })); add(d, x, -1.6); }
    const flag = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.6, 5), toon(0xdddddd)); pole.position.y = .8; flag.add(pole); const cloth = new THREE.Mesh(new THREE.PlaneGeometry(.8, .5), toon(0xff6fb5, { side: THREE.DoubleSide })); cloth.position.set(.42, 1.35, 0); flag.add(cloth); add(flag, 1.2, -.8);
  } else if (T.goalP === 'saturna') { // icy crystals
    for (const x of [-3, -2.4, -1.5, 2, 2.7, 3.4]) { const c = new THREE.Mesh(new THREE.ConeGeometry(rand(.2, .35), rand(.8, 1.6), 5), toon(0xbff4ff, { emissive: 0x2a6a8a, flatShading: true })); c.position.y = .4; const gg = new THREE.Group(); gg.add(c); c.rotation.z = rand(-.3, .3); add(gg, x, rand(-1.4, -.6)); }
  } else { // Planet Gummy: jelly houses and Gummy's family waving
    for (const [x, c] of [[-3, 0x55c8ff], [3.1, 0xffd27a]]) { const h = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(.9, 14, 10, 0, TAU, 0, Math.PI / 2), toon(c, { rim: [.4, .4, .4] })); h.add(b); const d = new THREE.Mesh(new THREE.CircleGeometry(.28, 12, 0, Math.PI), basic(0x5a0e3a)); d.position.set(0, 0, .88); h.add(d); add(h, x, -1.4); }
    const fam = []; for (const [x, s] of [[-1.6, .75], [1.7, .62], [2.3, .5]]) { const f = makeGummy(); f.g.scale.setScalar(s); f.shield.visible = false; f.pack.visible = f.bub.visible = f.hi.visible = false; add(f.g, x, -.5); fam.push(f); }
    g.userData.fam = fam;
  }
  const p = { type: 'home', x: 0, x0: 0, y, w: PW + 4, mesh: g, pop: 1, alpha: 1, t: 0 };
  plats.push(p); homeObj = g; return p;
}

/* ---------- the start planet below and the goal planet above ---------- */
let startPlanet = null, goalPlanet = null;
function buildWorld(ti) {
  TI = ti; T = TIERS[ti]; tierMats(); clearWorld();
  if (startPlanet) scene.remove(startPlanet); if (goalPlanet) scene.remove(goalPlanet);
  startPlanet = makePlanet(T.start, 30, 3); scene.add(startPlanet);
  goalPlanet = makePlanet(T.goalP, 10, 3); scene.add(goalPlanet);
  nebulas.forEach((n, i) => n.material.color.set(T.neb[i % 3]));
  farPlanets.forEach((p, i) => { p.userData.m.material.color.set(T.far[i % 4]).lerp(new THREE.Color(0xffffff), .35); p.userData.gl.material.color.set(T.far[i % 4]); });
  homeObj = null;
  resetGen();
}
function setSky(p) {
  const [a, b] = T.sky;
  skyU.top.value.set(a[0]).lerp(_c.set(b[0]), p); skyU.mid.value.set(a[1]).lerp(_c.set(b[1]), p); skyU.bot.value.set(a[2]).lerp(_c.set(b[2]), p);
}

/* ---------- level generation: a guaranteed path upwards, extras, stars and hazards ---------- */
const prog = (y) => clamp(y / T.goal, 0, 1);
const GEN = { y: 0, x: 0, blocked: false, done: false, stations: [], si: 0, lastHazard: -99, lastHole: -99 };
function resetGen() {
  GEN.y = 0; GEN.x = 0; GEN.blocked = false; GEN.done = false; GEN.si = 0; GEN.lastHazard = 12; GEN.lastHole = -99;
  GEN.stations = []; for (let y = T.every; y < T.goal - 40; y += T.every) GEN.stations.push(y);
  addPlat('normal', 0, 0, 3.2, { instant: true, start: true });
  genUpTo(30, true);
}
const fieldX = (w) => (PW - w) / 2;
function chooseType(p) {
  const r = R(), mv = lerp(T.moving[0], T.moving[1], p), cr = lerp(T.crumble[0], T.crumble[1], p), bl = T.blink && p > T.blink[0] ? T.blink[1] : 0;
  if (p < .04) return 'normal';
  if (r < T.spring) return 'spring';
  if (r < T.spring + mv) return 'moving';
  if (r < T.spring + mv + bl) return 'blink';
  return 'normal';
}
function genUpTo(top, instant) {
  while (!GEN.blocked && GEN.y < top) {
    const p = prog(GEN.y), easy = GEN.y < 25 ? .85 : 1;
    const gap = Math.min(3.7, lerp(T.gap[0], T.gap[1], p) * rand(.72, 1.1) * easy);
    const y = GEN.y + gap;
    const st = GEN.stations[GEN.si];
    // before a station or the home planet: always one safe rock within easy reach of it
    const deck = st !== undefined && y > st - 1.2 ? st : y > T.goal - 1.5 ? T.goal : null;
    if (deck !== null) {
      if (deck - GEN.y > 3.1) { const w = lerp(T.width[0], T.width[1], p) * 1.1, x = clamp(GEN.x + rand(1.5, 3.5) * (R() < .5 ? -1 : 1), -fieldX(w), fieldX(w)); addPlat('normal', x, deck - rand(2.2, 2.8), w, { instant }); }
      if (deck === st) { makeStation(st, GEN.si + 1); GEN.y = st; GEN.blocked = true; GEN.si++; }
      else { makeHome(T.goal); GEN.y = T.goal; GEN.blocked = true; GEN.done = true; }
      break;
    }
    const w = lerp(T.width[0], T.width[1], p) * rand(.9, 1.1);
    let type = chooseType(p);
    // the path platform: within reach of the last one, often on the other side so you have to steer
    let x = clamp(GEN.x + rand(2, 5.5) * (R() < .5 ? -1 : 1), -fieldX(w), fieldX(w));
    if (Math.abs(x - GEN.x) < 1.2) x = clamp(-GEN.x * .8, -fieldX(w), fieldX(w));
    addPlat(type, x, y, w, { instant });
    // a crumbling rock now and then as a tempting extra, and extra safe rocks early on
    const extraP = lerp(.32, .1, p), crP = lerp(T.crumble[0], T.crumble[1], p);
    if (R() < extraP + crP) {
      const ty = R() < crP / (extraP + crP) ? 'crumble' : 'normal', ew = w * rand(.85, 1), ey = y + rand(-.4, .8);
      let ex = rand(-fieldX(ew), fieldX(ew)); if (Math.abs(ex - x) < ew + .6) ex = clamp(-x, -fieldX(ew), fieldX(ew));
      const free = plats.slice(-8).every((q) => Math.abs(q.y - ey) > 1.1 || Math.abs(q.x - ex) > (q.w + ew) / 2 + .5);
      if (free && Math.abs(ex - x) > (w + ew) / 2 + .4) addPlat(ty, ex, ey, ew, { instant });
    }
    // stars: one over the rock, or a little column to bounce through
    if (R() < .17) addStar(x + rand(-.3, .3), y + rand(1.2, 1.9));
    else if (R() < .045 && GEN.y > 10) { const sx = rand(-PW / 2 + .8, PW / 2 - .8); for (let i = 0; i < 4; i++) addStar(sx, y + 1 + i * .85); }
    // hazards between the rocks
    const midY = GEN.y + gap * .5 + rand(-.3, .3);
    if (T.hole && p > T.hole[0] && y - GEN.lastHole > 14 && y - GEN.lastHazard > 5 && R() < T.hole[1] * 2.2) {
      const cands = [-3.4, -2.6, -1.8, 1.8, 2.6, 3.4].filter((cx) => Math.abs(wrapD(cx - x)) > 3.2 && Math.abs(wrapD(cx - GEN.x)) > 3.2);
      if (cands.length) { addHole(pick(cands), midY + .6); GEN.lastHole = y; GEN.lastHazard = y; }
    } else if (T.meteor && p > T.meteor[0] && y - GEN.lastHazard > 6 && R() < T.meteor[1] * 2.2) { addMeteor(midY + .3, R() < .5 ? 1 : -1); GEN.lastHazard = y; }
    GEN.x = x; GEN.y = y;
  }
}

/* ---------- the player ---------- */
const G = 34, JV = Math.sqrt(2 * G * 4.6), SV = Math.sqrt(2 * G * 11.5), LV = Math.sqrt(2 * G * 7), SHV = Math.sqrt(2 * G * 12);
const ROCKET_DIST = 40, ROCKET_T = 1.15, FAST = 5;
const P = { x: 0, y: 0, vy: 0, tx: 0, vx: 0, prevY: 0, hold: 0, holdV: 0, land: 9, maxY: 0, stars: 0, rockets: 0, shields: 0, rocket: null, grace: 0, spin: 0, hitT: 0, wrapT: 0, dead: false, inv: 0 };
let run = null; // per-run stats
let state = 'load';
const FEEL = { hitStop: 0, slow: 0, slowK: 1, trauma: 0, fovKick: 0, shake: new THREE.Vector2(), roll: 0 };
const addTrauma = (t) => { FEEL.trauma = Math.min(1, FEEL.trauma + t * (save.calm ? .35 : 1)); };
const slowMo = (k, s) => { FEEL.slow = s; FEEL.slowK = k; };
function flash(op = .6) { if (save.calm) return; const f = $('flash'); f.style.transition = 'none'; f.style.opacity = op; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }

function resetPlayer() {
  Object.assign(P, { x: 0, y: 0, vy: 0, tx: 0, vx: 0, prevY: 0, hold: 0, land: 9, maxY: 0, stars: 0, rockets: 0, shields: 0, rocket: null, grace: 0, graceUsed: false, spin: 0, hitT: 0, dead: false, inv: 0, hole: null, cheer: 0, shieldFx: 0 });
  springN = 0; deathCause = '';
}

/* ---------- camera ---------- */
const CAM = { y: 6, t: 6, zoom: 1, lookOff: 2.2, x: 0 };
function camBase() { return P.y + 1 + visH * .07; }
function updateCam(dt) {
  if (state === 'play' || state === 'menu') CAM.t = Math.max(CAM.t, camBase() + (P.rocket ? 3 : 0));
  if (state === 'menu') CAM.t = MENU.camY;
  let zoom = 1, ty = CAM.t;
  if (state === 'station' || (state === 'win' && run && run.won)) { zoom = .62; ty = P.y + 1 - visH * zoom * .28; }
  CAM.zoom = lerp(CAM.zoom, zoom, 1 - Math.exp(-dt * 4));
  if (state === 'station' || state === 'win') CAM.y = lerp(CAM.y, ty, 1 - Math.exp(-dt * 4));
  else CAM.y = lerp(CAM.y, ty, 1 - Math.exp(-dt * (P.rocket ? 10 : 7)));
  FEEL.trauma = Math.max(0, FEEL.trauma - dt * 1.5);
  const sh = FEEL.trauma * FEEL.trauma, tt = RT * 30;
  FEEL.shake.set((Math.sin(tt * 1.1) + Math.sin(tt * 2.3 + 1) * .5) * .25 * sh, (Math.sin(tt * 1.7 + 2) + Math.sin(tt * 2.9) * .5) * .25 * sh);
  FEEL.roll = (Math.sin(tt * 1.3 + 4) * 2 * Math.PI / 180) * sh;
  FEEL.fovKick = lerp(FEEL.fovKick, P.rocket ? 14 : 0, 1 - Math.exp(-dt * (P.rocket ? 9 : 3)));
  const d = camD * CAM.zoom;
  cam.fov = FOV + FEEL.fovKick; cam.updateProjectionMatrix();
  cam.position.set(FEEL.shake.x, CAM.y + CAM.lookOff * CAM.zoom + FEEL.shake.y, d);
  cam.lookAt(FEEL.shake.x * .5, CAM.y, 0); cam.rotateZ(FEEL.roll);
}
// the next unvisited Launch Station (or the home planet) is a safe floor: you can never fall past it
const blocker = () => (GEN.blocked ? GEN.y : Infinity);
const deathLine = () => Math.min(CAM.y - visH / 2 - .9, P.maxY >= blocker() - 1 ? blocker() - 1.5 : Infinity);

/* ---------- HUD helpers ---------- */
const fx = $('fx');
const _v = new THREE.Vector3();
function toScreen(x, y, z = 0) { _v.set(x, y, z).project(cam); return [(_v.x * .5 + .5) * VW, (-_v.y * .5 + .5) * VH]; }
function popText(x, y, text, cls = '', big = 1) {
  let [sx, sy] = toScreen(x, y); sx = clamp(sx, 70, VW - 70); const el = document.createElement('div'); el.className = 'pop ' + cls; el.innerHTML = text; el.style.left = sx + 'px'; el.style.top = sy + 'px'; fx.appendChild(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: `translate(-50%,-50%) scale(${1.4 * big})`, opacity: 1, offset: .13 }, { transform: `translate(-50%,-50%) scale(${big})`, opacity: 1, offset: .3 }, { transform: 'translate(-50%,-160%) scale(.95)', opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () => el.remove();
}
function flyIcon(id, from, toEl, dur, onArrive, size = 30, delay = 0) {
  const to = toEl.getBoundingClientRect(), x1 = to.left + to.width / 2, y1 = to.top + to.height / 2, [x0, y0] = from;
  const el = document.createElement('div'); el.className = 'flyStar'; el.style.width = el.style.height = size + 'px'; el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
  el.innerHTML = `<svg class="ic" style="width:100%;height:100%"><use href="#${id}"/></svg>`; fx.appendChild(el);
  const mx = (x0 + x1) / 2 + (x0 < x1 ? -40 : 40), my = Math.min(y0, y1) - 60;
  const a = el.animate([{ transform: `translate(${x0}px,${y0}px) scale(.5)` }, { transform: `translate(${x0}px,${y0 - 30}px) scale(1.3)`, offset: .2 }, { transform: `translate(${mx}px,${my}px) scale(1.1)`, offset: .55 }, { transform: `translate(${x1}px,${y1}px) scale(.7)` }],
    { duration: dur, delay, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'both' });
  a.onfinish = () => { el.remove(); onArrive && onArrive(); };
}
const popClass = (el, c = 'bump') => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
let shownScore = -1;
const scoreNow = () => Math.floor(P.maxY) + P.stars * 10;
const HC = {};
const setH = (k, v, fn) => { if (HC[k] !== v) { HC[k] = v; fn(v); } };
function hud() {
  const s = scoreNow(); if (s !== shownScore) { $('score').textContent = s; shownScore = s; }
  setH('h', Math.floor(Math.max(0, P.y)), (v) => $('height').textContent = v + ' m');
  setH('r', P.rockets, (v) => { $('rocketN').textContent = v; $('rocketBtn').classList.toggle('empty', !v); $('rocketBtn').classList.toggle('ready', !!v); });
  setH('s', P.shields, (v) => { $('shieldN').textContent = v; $('shieldBox').classList.toggle('zero', !v); });
  setH('f', Math.round(clamp(P.maxY / T.goal, 0, 1) * 400), (v) => $('progFill').style.height = (v / 4) + '%');
  setH('m', Math.round(clamp(P.y / T.goal, 0, 1) * 400), (v) => $('progMe').style.bottom = (v / 4) + '%');
}
function buildProg() {
  const pr = $('prog'); pr.querySelectorAll('.st').forEach((e) => e.remove());
  GEN.stations.forEach((y, i) => { const d = document.createElement('div'); d.className = 'st'; d.dataset.i = i; d.style.bottom = (y / T.goal * 100) + '%'; pr.appendChild(d); });
  $('progHome').className = 'home pl ' + T.goalP; $('progHome').style.background = { luna: 'radial-gradient(circle at 35% 30%,#fff,#c9cde6 40%,#7e84a8)', saturna: 'radial-gradient(circle at 35% 30%,#ffe2a8,#ffaa4a 50%,#c0602a)', gummy: 'radial-gradient(circle at 35% 30%,#ffd0ec,#ff6fb5 50%,#b02a7a)' }[T.goalP];
  $('progHome').style.boxShadow = '0 0 10px rgba(255,255,255,.6)';
}
let bannerT = 0;
function banner(html, gold = false, ms = 1300) {
  const b = $('banner'); b.innerHTML = html; b.classList.toggle('gold', gold); b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), ms);
}
function setHand() { $('rocketBtn').classList.toggle('left', save.hand === 'left'); $('tapNow').classList.toggle('left', save.hand === 'left'); }

/* ---------- events in the run ---------- */
function onLand(p) {
  if (p.type === 'station' || p.type === 'home') evlog('land', p.type, p.y, p.visited);
  P.y = p.y; P.vy = 0; P.land = 0;
  if (p.type === 'station' && !p.visited) { enterStation(p); return; }
  if (p.type === 'home') { winRun(); return; }
  P.hold = .05;
  if (p.type === 'station') { P.holdV = LV; sfx.spring(); buzz(15); emit(sparks, P.x, p.y + .2, .3, [0x7fe6ff, 0xffffff], 12, 4, .45, .35, -2); return; }
  const col = p.type === 'crumble' ? 0xc8906a : T.rock[0];
  emit(bits, P.x, p.y + .05, .3, [col, 0xffffff], 6, 2.6, .4, .07, -6, 1.5);
  if (p.type === 'spring') {
    P.holdV = SV; sfx.spring(); buzz(15); addTrauma(.12); p.boing = 1; emit(sparks, P.x, p.y + .3, .3, [0xff6a8a, 0xffd84a, 0xffffff], 14, 5, .5, .35, -2);
    popText(P.x, p.y + 1.6, 'BOING!', 'pink', .9);
  } else {
    P.holdV = JV; sfx.boing(); buzz(8); springN = Math.max(0, springN - 1);
    if (p.type === 'crumble') { p.crumbleT = .12; }
  }
  p.squash = 1;
}
function breakPlat(p) {
  p.dead = true; world.remove(p.mesh); sfx.crumble(); addTrauma(.08);
  emit(bits, p.x, p.y - .15, .2, [0xc8906a, 0x8a5a3a, 0x6a3a2a], 18, 3.2, .9, .16, -14, 1);
}
function collectStar(s) {
  s.dead = true; world.remove(s.mesh); P.stars++; run.stars++;
  sfx.star(); buzz(10);
  emit(sparks, s.x, s.y, .3, [0xffd84a, 0xffffff, 0xfff3b0], 10, 4, .45, .35, 0);
  popText(s.x, s.y + .5, '+10', 'gold', .8);
  flyIcon('i-star', toScreen(s.x, s.y), $('score'), 450, () => popClass($('score')), 26);
}
function useRocket() {
  if (!P.rockets || P.rocket || !(state === 'play') || P.dead) return false;
  if (GEN.blocked && P.y > GEN.y - .5) return false; // already over the station or the home planet: just land
  P.rockets--; run.rocketsUsed++;
  genUpTo(P.y + ROCKET_DIST + 6); // make sure a station or the home planet ahead exists, so the rocket stops there
  let to = P.y + ROCKET_DIST;
  for (const p of plats) if ((p.type === 'station' && !p.visited) || p.type === 'home') if (p.y > P.y - .5 && to > p.y + 2.2) to = p.y + 2.2;
  if (GEN.blocked) to = Math.min(to, GEN.y + 2.2);
  P.rocket = { t: 0, from: P.y, to }; evlog('rocket', P.y, to, 'cam', CAM.y, 'dl', deathLine()); P.hold = 0; P.grace = 0; $('tapNow').hidden = true; $('rocketBtn').classList.remove('urgent');
  sfx.rocket(); buzz([20, 30, 40]); addTrauma(.3); flash(.25); popClass($('rocketBtn'));
  $('rocketVig').style.opacity = 1;
  emit(sparks, P.x, P.y + .3, .3, [0xffb030, 0xffe08a, 0xff6a2a], 20, 6, .5, .5, -4);
  if (!run.usedHint) { run.usedHint = true; $('hint').style.opacity = 0; }
  return true;
}
function shieldSave(kind) {
  evlog('shield', kind, P.y, 'dl', deathLine());
  P.shields--; run.shieldsUsed++;
  slowMo(.3, .4); FEEL.hitStop = 0; sfx.shield(); buzz([20, 40, 60]); flash(.4); addTrauma(.25);
  P.vy = SHV; P.hold = 0; P.inv = 1.2; P.grace = 0; $('tapNow').hidden = true; $('rocketBtn').classList.remove('urgent');
  if (P.y < deathLine() + 1) P.y = deathLine() + 1;
  gummy.shield.visible = twin.shield.visible = true; P.shieldFx = 1.3;
  emit(sparks, P.x, P.y + .9, .3, [0x7fe6ff, 0xffe27a, 0xffffff], 24, 6, .7, .5, 0);
  banner(kind === 'hole' ? 'Shield save!<small>OUT OF THE BLACK HOLE</small>' : 'Shield save!<small>THE STAR SHIELD CAUGHT YOU</small>', true, 1100);
  popClass($('shieldBox'));
}
function hitByMeteor(m) {
  m.dead = true; world.remove(m.mesh);
  emit(bits, m.x, m.y + .2, .3, [0x9a5a3a, 0xd08a5a, 0xffb060], 16, 4, .8, .13, -10);
  emit(sparks, m.x, m.y + .2, .3, [0xffb030, 0xff6a2a], 12, 5, .4, .45, 0);
  if (P.rocket) { sfx.smash(); addTrauma(.2); P.stars++; run.stars++; popText(m.x, m.y + .8, 'SMASH! +10', 'gold'); return; }
  if (P.y + .3 > m.y + .2 && P.vy < 0) { // stomped from above: a bonus bounce
    sfx.smash(); FEEL.hitStop = .045; addTrauma(.2); buzz(20); P.vy = JV * 1.1; P.land = 0; P.stars++; run.stars++; popText(m.x, m.y + .9, 'STOMP! +10', 'gold'); return;
  }
  if (P.inv > 0) return;
  if (P.shields > 0) { P.shields--; run.shieldsUsed++; sfx.shield(); FEEL.hitStop = .05; addTrauma(.25); P.shieldFx = .9; gummy.shield.visible = twin.shield.visible = true; P.inv = .8; popClass($('shieldBox')); popText(P.x, P.y + 2, 'Shield!', 'cyan'); return; }
  FEEL.hitStop = .055; sfx.hit(); addTrauma(.45); buzz([30, 40, 30]); flash(.2); $('vig').style.opacity = 1; setTimeout(() => $('vig').style.opacity = 0, 250);
  P.vy = -7; P.spin = 1; P.hold = 0; P.inv = .9; run.hits++;
  popText(P.x, P.y + 2, 'Ouch!', '');
}
let deathCause = '';
function die(cause) {
  if (P.dead) return; P.dead = true; deathCause = cause;
  state = 'fall'; $('tapNow').hidden = true; $('rocketBtn').classList.remove('urgent');
  if (cause === 'hole') { sfx.hole(); addTrauma(.5); FEEL.hitStop = .06; buzz([40, 40, 80]); }
  else { sfx.fall(); buzz([30, 60, 30]); }
  setTimeout(() => endRun(false), cause === 'hole' ? 1000 : 750);
}

/* ---------- Launch Station: three questions load the rockets ---------- */
let Q = null;
function enterStation(st) {
  st.visited = true; state = 'station'; P.vy = 0; P.hold = 0; P.rocket = null; run.stationsReached++;
  sfx.station(); buzz(25); addTrauma(.15); P.land = 0;
  emit(sparks, P.x, st.y + .2, .3, [0x7fe6ff, 0xffffff], 16, 4, .5, .4, -2);
  const di = $('prog').querySelector(`.st[data-i="${st.n - 1}"]`); di && di.classList.add('done');
  Q = { st, i: 0, right: 0, loaded: 0, shields: 0, busy: false };
  $('qKick').textContent = `LAUNCH STATION ${st.n} OF ${GEN.stations.length}`; $('qHead').textContent = 'Load your rockets!';
  [...$('qDots').children].forEach((d) => d.className = '');
  for (let i = 0; i < 3; i++) $('slot' + i).className = 'slot';
  $('slotS').className = 'slot shield'; $('slotSx').hidden = true;
  $('qAsk').hidden = false; $('qDone').hidden = true; $('qSent').innerHTML = ''; $('qOpts').innerHTML = ''; $('qMsg').textContent = '';
  banner(`${Math.floor(st.y)} m<small>LAUNCH STATION</small>`, false, 1000);
  setTimeout(() => { if (state === 'station') { $('quiz').classList.add('on'); askNext(); } }, 650 / SH_TIME.k);
}
function askNext() {
  const q = pickSentence(TI); if (!q) { finishStation(); return; }
  const w = fillChoices(q), dots = $('qDots').children; dots[Q.i].className = 'now';
  Q.w = w; Q.answered = false;
  const sent = (cls) => `${hints(w.before)}<span class="gap ${cls || ''}">${cls ? esc(w.right) : '&nbsp;'}</span>${hints(w.after)}`;
  $('qSent').innerHTML = sent(''); $('qMsg').textContent = ''; $('qMsg').className = '';
  const box = $('qOpts'); box.innerHTML = ''; box.classList.remove('done'); $('qFast').classList.remove('gone'); $('qFastBar').style.width = '100%';
  Q.t0 = 0;
  setTimeout(() => {
    if (state !== 'station') return;
    w.forEach((o, k) => {
      const b = document.createElement('button'); b.textContent = o.text; b.dataset.k = k;
      b.onclick = () => answer(k, sent);
      box.appendChild(b);
    });
    Q.t0 = performance.now();
    if (BOT.on && !BOT.noAnswer) setTimeout(() => { if (state === 'station' && !Q.answered) answer(botPick(w), sent); }, (BOT.answer === 'slow' ? 5600 : rand(700, 1600)) / SH_TIME.k);
  }, 450 / SH_TIME.k);
}
function answer(k, sent) {
  if (!Q || Q.answered || !Q.t0) return; Q.answered = true;
  const w = Q.w, o = w[k], el = (performance.now() - Q.t0) / 1000 * SH_TIME.k, box = $('qOpts'), kids = [...box.children], dots = $('qDots').children;
  box.classList.add('done');
  run.answers.push({ ok: o.ok, sentence: plainSentence(w), html: markedSentence(w), right: w.right, chose: o.text, secs: +el.toFixed(1) });
  if (o.ok) {
    kids[k].classList.add('ok'); kids.forEach((b, i) => i !== k && b.classList.add('dim'));
    $('qSent').innerHTML = sent('ok'); dots[Q.i].className = 'ok';
    Q.right++; Q.loaded++; run.right++; run.streak++;
    const slot = $('slot' + (Q.loaded - 1)); slot.classList.add('full');
    sfx.right(); setTimeout(sfx.load, 120); buzz(15);
    const lamp = Q.st.lamps[Q.loaded - 1]; if (lamp) { lamp.lm.material.color.set(0xffb357); lamp.lm.material.emissive.set(0xff7a1f); lamp.lg.material.opacity = .9; }
    P.cheer = 1;
    const fast = el < FAST;
    let msg = pick(['Right!', 'Great!', 'Super!', 'Yes!', 'Well done!']) + ' +1 rocket';
    if (fast) { Q.shields++; $('slotS').classList.remove('full'); void $('slotS').offsetWidth; $('slotS').classList.add('full'); $('slotSx').hidden = Q.shields < 2; $('slotSx').textContent = '×' + Q.shields; msg += ' + shield'; sfx.fast(); }
    $('qMsg').textContent = msg; $('qMsg').className = '';
    if (run.streak > 0 && run.streak % 3 === 0) celebrate();
    setTimeout(nextQ, 1050 / SH_TIME.k);
  } else {
    kids[k].classList.add('no'); kids.forEach((b, i) => { if (w[i].ok) b.classList.add('ok'); else if (i !== k) b.classList.add('dim'); });
    $('qSent').innerHTML = sent('no'); dots[Q.i].className = 'no'; run.streak = 0;
    $('qMsg').className = 'soft'; $('qMsg').innerHTML = `The answer is <b>${esc(w.right)}</b>.`;
    sfx.puff();
    setTimeout(nextQ, 1700 / SH_TIME.k);
  }
}
function nextQ() { if (state !== 'station') return; Q.i++; if (Q.i < 3) askNext(); else finishStation(); }
function celebrate() {
  sfx.combo(); buzz([20, 30, 20, 30, 60]);
  const sh = $('sheet'), c = document.createElement('div'); c.className = 'combo'; c.textContent = `${run.streak} in a row!`; sh.appendChild(c); setTimeout(() => c.remove(), 1700);
  confetti(sh, 26);
  emit(sparks, P.x, P.y + 1.2, .5, [0xffd84a, 0xff6fb5, 0x7fe6ff, 0xffffff], 26, 6, .8, .45, -3);
}
function confetti(host, n) {
  const r = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i'); d.className = 'conf'; d.style.background = pick(['#ffd84a', '#ff6fb5', '#7fe6ff', '#a46bff', '#3fe08a']);
    d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + 10) + 'px'; fx.appendChild(d);
    const a = rand(-Math.PI * .9, -Math.PI * .1), s = rand(140, 320), dx = Math.cos(a) * s, dy = Math.sin(a) * s;
    d.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${rand(-400, 400)}deg)`, opacity: 1, offset: .5 }, { transform: `translate(${dx * 1.3}px,${dy + 260}px) rotate(${rand(-700, 700)}deg)`, opacity: 0 }], { duration: rand(900, 1400), easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => d.remove();
  }
}
function finishStation() {
  $('qAsk').hidden = true; $('qDone').hidden = false;
  const n = Q.loaded;
  $('qDoneT').textContent = n === 3 ? '3 rockets loaded!' : n === 2 ? '2 rockets loaded!' : n === 1 ? '1 rocket loaded!' : 'No rockets this time';
  const bits_ = []; if (Q.shields) bits_.push(`+${Q.shields} star shield${Q.shields > 1 ? 's' : ''}`);
  bits_.push(n ? 'Tap the rocket button to blast up!' : 'Keep bouncing. You can do it!');
  $('qDoneP').textContent = bits_.join(' · ');
  if (BOT.on && !BOT.holdLaunch) setTimeout(() => { if (state === 'station') launch(); }, 500 / SH_TIME.k);
}
function launch() {
  if (state !== 'station' || !Q) return;
  // the loaded rockets and shields fly from the sheet down to the HUD
  const loaded = Q.loaded, shields = Q.shields;
  for (let i = 0; i < loaded; i++) { const r = $('slot' + i).getBoundingClientRect(); flyIcon('i-rocket', [r.left + r.width / 2, r.top + r.height / 2], $('rocketBtn'), 520, () => { P.rockets++; popClass($('rocketBtn')); sfx.tick(); hud(); }, 40, i * 120); }
  if (shields) { const r = $('slotS').getBoundingClientRect(); flyIcon('i-shield', [r.left + r.width / 2, r.top + r.height / 2], $('shieldBox'), 520, () => { P.shields += shields; popClass($('shieldBox')); sfx.tick(); hud(); }, 40, loaded * 120); }
  $('quiz').classList.remove('on');
  state = 'play'; Q.st.launched = true;
  P.vy = LV; P.land = 0; sfx.launch(); addTrauma(.2); buzz(30);
  emit(sparks, P.x, P.y + .2, .3, [0xffb030, 0xffe08a, 0x7fe6ff], 24, 6, .6, .45, -3);
  GEN.blocked = false; GEN.y = Q.st.y + .4; GEN.x = P.x;
  genUpTo(CAM.y + visH);
  if (loaded && !run.rocketHint) { run.rocketHint = true; const h = $('hint'); h.textContent = 'Tap the rocket button to blast up!'; h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 3500); }
  Q = null;
}

/* ---------- the run ---------- */
function startRun() {
  ac(); MUSIC.on = true;
  buildWorld(TI); resetPlayer(); usedQ.clear();
  run = { tier: TI, stars: 0, right: 0, answers: [], streak: 0, stationsReached: 0, rocketsUsed: 0, shieldsUsed: 0, hits: 0, milestone: 0, won: false, t0: performance.now(), usedHint: false };
  CAM.y = CAM.t = camBase(); CAM.zoom = 1; FEEL.trauma = 0; FEEL.fovKick = 0;
  P.vy = JV; P.land = 0;
  $('menu').hidden = true; $('result').hidden = true; $('pause').hidden = true; $('hud').hidden = false; $('quiz').classList.remove('on');
  buildProg(); setHand(); shownScore = -1; for (const k in HC) delete HC[k]; hud();
  const h = $('hint'); h.textContent = 'Drag left and right to steer Gummy'; h.style.opacity = 1; setTimeout(() => { if (run && !run.rocketHint) h.style.opacity = 0; }, 3200);
  state = 'play'; save.runs++; store();
}
function winRun() {
  state = 'win'; run.won = true; P.vy = 0; P.maxY = T.goal;
  sfx.win(); buzz([60, 50, 120]); addTrauma(.3); slowMo(.4, .5); flash(.35);
  banner(`${T.home}<small>${T.goal} M · YOU MADE IT</small>`, true, 2400);
  emit(sparks, P.x, P.y + 1, .5, [0xffd84a, 0xff6fb5, 0x7fe6ff, 0xffffff, 0x3fe08a], 50, 8, 1.2, .5, -4);
  emit(bits, P.x, P.y + 1, .5, [0xffd84a, 0xff6fb5, 0x7fe6ff, 0xa46bff, 0x3fe08a], 40, 7, 1.6, .1, -6, 4);
  setTimeout(() => endRun(true), 2300 / SH_TIME.k);
}
let lastResult = null;
function endRun(won) {
  if (state === 'result') return;
  state = 'result'; MUSIC.on = false;
  const score = scoreNow(), prevBest = save.best[TI], wasLocked = TIERS.map((_, i) => unlocked(i));
  if (score > save.best[TI]) save.best[TI] = score;
  if (won) save.home[TI] = true;
  store();
  const newly = TIERS.findIndex((t, i) => !wasLocked[i] && unlocked(i));
  try { window.parent.postMessage({ fugio: 'score', game: 'hopup', score }, '*'); } catch (e) {}
  lastResult = { score, won, height: Math.floor(P.maxY), stars: P.stars, right: run.right, asked: run.answers.length, cause: deathCause, secs: Math.round((performance.now() - run.t0) / 1000), stations: run.stationsReached, rocketsUsed: run.rocketsUsed, shieldsUsed: run.shieldsUsed };
  $('hud').hidden = true; $('quiz').classList.remove('on');
  $('resTitle').textContent = won ? T.home : deathCause === 'hole' ? 'Oops, a black hole!' : 'Good try!';
  $('resSub').textContent = newly > 0 ? `${TIERS[newly].name} is open now!` : won ? `Gummy reached ${T.name}.` : `Gummy fell at ${Math.floor(P.maxY)} m.`;
  $('rsH').textContent = Math.floor(P.maxY) + ' m'; $('rsS').textContent = P.stars; $('rsB').textContent = save.best[TI];
  $('newBest').hidden = !(score > prevBest && score > 0);
  const n = run.answers.length;
  $('engT').innerHTML = n ? `English ${run.right}/${n} right <small>${run.right === n ? 'PERFECT!' : ''}</small>` : 'English <small>NO QUESTIONS YET</small>';
  const wrong = run.answers.filter((a) => !a.ok);
  $('learn').innerHTML = wrong.length ? '<div style="border:0;padding-top:2px;font:900 11px Nunito;letter-spacing:.14em;color:#c7cdf5">LEARN THESE</div>' + wrong.map((a, i) => `<div style="animation-delay:${.1 + i * .06}s">${a.html}<s>${esc(a.chose)}</s></div>`).join('')
    : (n ? '<div style="border:0">No mistakes. Great job!</div>' : '');
  $('result').hidden = false;
  // count the score up
  const t0 = performance.now(), el = $('resNum');
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); el.textContent = Math.round(score * easeOutCubic(k)); if (k < 1) requestAnimationFrame(step); else popClass($('resScore')); };
  step(); tone(659, .3, 'triangle', .05, 0, .1); tone(880, .3, 'triangle', .05, 0, .3);
  if (BOT.on && BOT.loops > 0) { BOT.loops--; setTimeout(() => $('again').click(), 1500); }
}
$('again').onclick = () => { sfx.click(); startRun(); };
$('toMenu').onclick = () => { sfx.click(); showMenu(); };

/* ---------- menu ---------- */
function showMenu() {
  state = 'menu'; MUSIC.on = true;
  $('result').hidden = true; $('pause').hidden = true; $('hud').hidden = true; $('quiz').classList.remove('on'); $('menu').hidden = false;
  if (!unlocked(save.tier)) save.tier = 0;
  if (TI !== save.tier || run) { buildWorld(save.tier); run = null; }
  resetPlayer(); menuFit(); P.vy = MENU.v; CAM.zoom = 1; CAM.y = CAM.t = MENU.camY;
  const box = $('tiers'); box.innerHTML = '';
  TIERS.forEach((t, i) => {
    const ok = unlocked(i), b = document.createElement('button');
    b.className = 'tier glass' + (i === save.tier ? ' on' : '') + (ok ? '' : ' locked');
    b.innerHTML = `<span class="pl ${t.goalP}"></span>${ok ? '' : '<span class="lock">🔒</span>'}<b>${t.name}</b><i>${ok ? (save.best[i] ? 'Best ' + save.best[i] : t.goal + ' m') : `Score ${t.need} on ${TIERS[i - 1].name}`}</i>`;
    b.onclick = () => { ac(); if (!ok) { sfx.locked(); popClass(b, 'shake'); return; } sfx.click(); save.tier = i; store(); showMenu(); };
    box.appendChild(b);
  });
  $('tierSub').textContent = `${TIERS[save.tier].hop}: ${TIERS[save.tier].sub}`;
  $('bestNum').textContent = Math.max(...save.best);
  showPack();
}
const MENU = { camY: 2, v: JV * .8 };
function menuFit() {
  const tiers = $('tiers').getBoundingClientRect(), best = $('bestPill').getBoundingClientRect(), pxu = VH / visH;
  const rockY = (tiers.top > 0 ? tiers.top : VH * .62) - 22;
  MENU.camY = (rockY - VH / 2) / pxu;
  const room = (rockY - (best.bottom || 190) - 14) / pxu - 2.1;
  MENU.v = Math.sqrt(2 * G * clamp(room, .7, 3.4));
  if (state === 'menu') CAM.y = CAM.t = MENU.camY;
}
function showPack() {
  const sum = window.FugioPacks ? FugioPacks.summary(PACKS, save.packs) : { title: 'Questions', level: '–' };
  const LVC = { A0: '#5ee08a', A1: '#4fb4ff', A2: '#b57bff' };
  $('qLv').textContent = sum.level; $('qLv').style.setProperty('--c', LVC[sum.level] || '#ffc76b'); $('qTitle').textContent = sum.title;
}
$('qbtn').onclick = async () => {
  if (!window.FugioPacks) return; ac(); sfx.click();
  const ids = await FugioPacks.open(PACKS, save.packs, { theme: 'gummy', kicker: 'CHOOSE THE WORDS' });
  if (ids && ids.length) { save.packs = ids; store(); usedQ.clear(); showPack(); }
};
$('play').onclick = () => { ac(); sfx.click(); fadeThen(startRun); };
$('leaveBtn').onclick = () => { ac(); sfx.click(); if (window.parent !== window) window.parent.postMessage({ fugio: 'leave' }, '*'); else location.href = 'https://www.fugio.co/'; };
function fadeThen(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); f.classList.remove('on'); }, 220); }
// settings
function segs() {
  const set = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  set('segHand', save.hand); set('segSound', save.sound ? 1 : 0); set('segMusic', save.music ? 1 : 0); set('segCalm', save.calm ? 1 : 0);
}
$('gearBtn').onclick = () => { ac(); sfx.click(); segs(); $('settings').hidden = false; };
$('setClose').onclick = () => { sfx.click(); $('settings').hidden = true; };
for (const [id, key] of [['segHand', 'hand'], ['segSound', 'sound'], ['segMusic', 'music'], ['segCalm', 'calm']]) {
  $(id).onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; const v = b.dataset.v;
    save[key] = key === 'hand' ? v : v === '1'; store(); segs(); setHand();
    if (master) master.gain.value = save.sound ? .6 : 0; if (musicBus) musicBus.gain.value = save.music ? .45 : 0;
    sfx.click();
  };
}
// pause
function pause() { if (state !== 'play' && state !== 'station') return; prevState = state; state = 'pause'; $('pause').hidden = false; }
let prevState = 'play';
$('pauseBtn').onclick = (e) => { e.stopPropagation(); sfx.click(); pause(); };
$('resume').onclick = () => { sfx.click(); $('pause').hidden = true; state = prevState; last = performance.now(); };
$('quit').onclick = () => { sfx.click(); $('pause').hidden = true; $('quiz').classList.remove('on'); showMenu(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });
$('qLaunch').onclick = () => { sfx.click(); launch(); };

/* ---------- input: drag anywhere to steer, rocket button, keys ---------- */
const drag = { id: null, lx: 0, bx: 0, by: 0 };
const finger = $('finger'), fBase = finger.querySelector('.base'), fDot = finger.querySelector('.dot');
stage.addEventListener('pointerdown', (e) => {
  if (state !== 'play' && state !== 'fall') return;
  if (e.target.closest('button')) return;
  drag.id = e.pointerId; drag.lx = e.clientX; drag.bx = e.clientX; drag.by = e.clientY;
  fBase.style.left = fDot.style.left = e.clientX + 'px'; fBase.style.top = fDot.style.top = e.clientY + 'px'; finger.classList.add('on');
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.lx; drag.lx = e.clientX;
  if (state === 'play') P.tx += dx * (visW / VW) * 1.25;
  // the faint ring follows the finger like a floating joystick
  const ox = e.clientX - drag.bx, oy = e.clientY - drag.by, d = Math.hypot(ox, oy);
  if (d > 46) { drag.bx = e.clientX - ox / d * 46; drag.by = e.clientY - oy / d * 46; fBase.style.left = drag.bx + 'px'; fBase.style.top = drag.by + 'px'; }
  fDot.style.left = e.clientX + 'px'; fDot.style.top = e.clientY + 'px';
});
const endDrag = (e) => { if (e.pointerId !== drag.id) return; drag.id = null; finger.classList.remove('on'); };
window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
$('rocketBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (!useRocket() && state === 'play') { sfx.locked(); popClass($('rocketBtn')); } });
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (state === 'play' && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')) { e.preventDefault(); useRocket(); }
  if (state === 'station' && Q && ['1', '2', '3'].includes(e.key)) { const b = $('qOpts').children[+e.key - 1]; b && b.click(); }
  if (e.key === 'Enter') { if (state === 'station' && !$('qDone').hidden) launch(); else if (state === 'result') $('again').click(); else if (state === 'menu' && $('settings').hidden) $('play').click(); }
  if ((e.key === 'Escape' || e.key === 'p') && (state === 'play' || state === 'station')) pause();
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

/* ---------- the auto-steer bot (for tests: window.SH) ---------- */
const BOT = { on: false, answer: 'right', loops: 0, target: null, bestY: 0, bestT: 0 };
function botPick(w) {
  const right = w.findIndex((o) => o.ok), wrongs = w.map((o, i) => i).filter((i) => !w[i].ok);
  if (BOT.answer === 'wrong') return wrongs[0];
  if (BOT.answer === 'mix') return R() < .6 ? right : wrongs[0];
  return right;
}
const wrapD = (d) => { d = ((d + PW / 2) % PW + PW) % PW - PW / 2; return d; };
function botSteer() {
  if (state !== 'play' || P.rocket) return;
  const apex = P.y + Math.max(0, P.vy) * Math.max(0, P.vy) / (2 * G);
  let best = null, bs = -1e9;
  for (const p of plats) {
    if (p.dead || p.y > apex - .15 || p.y < deathLine() + .5) continue;
    if (p.type === 'blink' && p.alpha < .7) continue;
    if (P.vy <= 0 && p.y > P.y) continue;
    const dy = (P.vy > 0 ? apex : P.y) - p.y; const tFall = (Math.max(0, P.vy) + Math.sqrt(Math.max(0, P.vy * P.vy + 2 * G * (P.y - p.y)))) / G;
    const px = p.type === 'moving' ? p.x0 + Math.sin((p.t + tFall) * p.spd) * p.amp : p.x;
    const dx = Math.abs(wrapD(px - P.x)); if (dx > 20 * tFall + p.w / 2) continue;
    let s = p.y * 3 - dx * .4 - dy * .05 + (p.type === 'crumble' ? -2 : 0) + (p.type === 'spring' ? 4 : 0);
    for (const h of holes) if (Math.abs(h.y - p.y) < 3 && Math.abs(wrapD(h.x - px)) < 2.6) s -= 30;
    if (s > bs) { bs = s; best = { p, px }; }
  }
  if (best) P.tx = P.x + wrapD(best.px - P.x);
  if (P.vy < -2 && P.y < deathLine() + 2.5 && P.rockets && (!best || best.p.y < deathLine() - .3)) useRocket();
  if (BOT.rocketHappy && P.rockets > 0 && P.vy > 0 && R() < .004) useRocket();
  // stuck (no new height for a while): do what a kid would do and use a rocket
  if (P.maxY > BOT.bestY + .5) { BOT.bestY = P.maxY; BOT.bestT = T_; } else if (T_ - (BOT.bestT || 0) > 9 && P.rockets && P.vy > 0) { BOT.bestT = T_; useRocket(); }
}

/* ---------- step: physics and the world ---------- */
let RT = 0, T_ = 0;
function step(dt) {
  T_ += dt;
  if (state === 'play') {
    if (BOT.on) botSteer();
    if (keys.ArrowLeft || keys.a || keys.A) P.tx -= 11 * dt;
    if (keys.ArrowRight || keys.d || keys.D) P.tx += 11 * dt;
  }
  const playing = state === 'play';
  // horizontal: chase the finger target quickly, but not instantly
  if (state === 'station') { P.tx = 0; }
  if (playing || state === 'fall' || state === 'station') {
    const dx = P.tx - P.x, mv = clamp(dx * (1 - Math.exp(-dt * 20)), -26 * dt, 26 * dt);
    P.x += mv; P.vx = lerp(P.vx, mv / Math.max(dt, 1e-4), 1 - Math.exp(-dt * 12));
    if (P.x > PW / 2) { P.x -= PW; P.tx -= PW; } else if (P.x < -PW / 2) { P.x += PW; P.tx += PW; }
  }
  P.prevY = P.y;
  if (playing) {
    if (P.rocket) {
      const r = P.rocket; r.t += dt / ROCKET_T; const k = Math.min(1, r.t), e = 1 - Math.pow(1 - k, 2.4);
      const ny = lerp(r.from, r.to, e); P.vy = (ny - P.y) / Math.max(dt, 1e-4); P.y = ny;
      emit(sparks, P.x + rand(-.15, .15), P.y + .2, -.25, [0xffb030, 0xffe08a, 0xff6a2a], 2, 2, .35, .5, -8);
      if (k >= 1) { P.rocket = null; P.vy = 9; $('rocketVig').style.opacity = 0; }
    } else if (P.hold > 0) {
      P.hold -= dt; if (P.hold <= 0) { P.vy = P.holdV; P.land = .08; emit(sparks, P.x, P.y + .1, .3, [0xffffff, 0x9fe8ff], 3, 2, .25, .25, 0); }
    } else {
      P.vy -= G * dt; P.y += P.vy * dt;
    }
    P.inv = Math.max(0, P.inv - dt);
    // land on platforms only when falling (you pass through them from below)
    if (P.vy < 0 && !P.rocket && P.hold <= 0) {
      for (const p of plats) {
        if (p.dead || p.pop < .5) continue;
        if (p.type === 'blink' && p.alpha < .5) continue;
        if (P.prevY >= p.y - .02 && P.y <= p.y && Math.abs(wrapD(P.x - p.x)) <= p.w / 2 + .22) { onLand(p); break; }
      }
    }
    if (P.y > P.maxY) {
      P.maxY = P.y;
      const m = Math.floor(P.maxY / 100);
      if (m > run.milestone) { run.milestone = m; if (m * 100 < T.goal) { banner(`${m * 100} m!`, false, 1100); sfx.milestone(); emit(sparks, P.x, P.y + 1, .3, [0x7fe6ff, 0xffffff, 0xa46bff], 18, 5, .6, .4, -2); popClass($('height')); } }
    }
    // stars (a little magnet; a big one while the rocket burns)
    const cy = P.y + .9, mag = P.rocket ? 3.2 : 1.5;
    for (const s of stars) {
      if (s.dead) continue;
      const dx = wrapD(s.x - P.x), dy = s.y - cy, d = Math.hypot(dx, dy);
      if (d < .75) collectStar(s);
      else if (d < mag) { const k = Math.min(1, dt * (P.rocket ? 14 : 7)); s.x -= dx * k; s.y -= dy * k; s.mesh.position.set(s.x, s.y, 0); }
    }
    // meteors
    for (const m of meteors) {
      if (m.dead) continue;
      if (Math.hypot(wrapD(m.x - P.x), m.y + .2 - cy) < .95) hitByMeteor(m);
    }
    // black holes pull you in
    for (const h of holes) {
      if (h.dead) continue;
      const dx = wrapD(h.x - P.x), dy = h.y - cy, d = Math.hypot(dx, dy);
      if (P.rocket) { if (d < 1.2 && !h.burped) { h.burped = true; popText(h.x, h.y + 1, 'Zoom!', 'cyan'); } continue; }
      if (d < h.pull) {
        const f = (1 - d / h.pull) * 26; P.tx += dx / d * f * dt * .9; P.vy += dy / d * f * dt * 1.4;
        if (R() < .3) emit(sparks, P.x, cy, .3, [0xa46bff, 0xff9a3d], 1, 1, .3, .25, 0);
      }
      if (d < h.kill) {
        if (P.inv > 0) continue;
        if (P.shields > 0) { h.dead = true; h.collapse = 1; shieldSave('hole'); }
        else { P.hole = h; die('hole'); }
        break;
      }
    }
    // off the bottom: a star shield saves you, a rocket can save you, otherwise the run ends
    if (state === 'play' && !P.rocket && P.y < deathLine()) {
      if (P.shields > 0) shieldSave('fall');
      else if (P.rockets > 0 && !P.graceUsed) { if (!P.grace) { P.grace = 1.1; P.graceUsed = true; slowMo(.3, 1.1); $('tapNow').hidden = false; $('rocketBtn').classList.add('urgent'); buzz([20, 20, 20]); } }
      else if (!P.grace) die('fall');
    }
    if (P.grace > 0) { P.grace -= dt / Math.max(.3, FEEL.slow > 0 ? FEEL.slowK : 1); if (P.grace <= 0 && state === 'play' && !P.rocket) { P.grace = 0; $('tapNow').hidden = true; $('rocketBtn').classList.remove('urgent'); die('fall'); } }
    if (P.y > P.maxY - 1 && P.graceUsed && P.vy > 0 && P.y > deathLine() + 4) P.graceUsed = false;
    genUpTo(CAM.y + visH * .5 + 12);
    // tidy up what fell far below
    const low = CAM.y - visH / 2 - 6;
    if (plats.length > 60 || T_ % 1 < dt) {
      plats = plats.filter((p) => { if (p.y < low && p.type !== 'home') { world.remove(p.mesh); return false; } return true; });
      stars = stars.filter((s) => { if (s.dead || s.y < low) { world.remove(s.mesh); return false; } return true; });
      meteors = meteors.filter((m) => { if (m.dead || m.y < low) { world.remove(m.mesh); return false; } return true; });
      holes = holes.filter((h) => { if ((h.dead && !h.collapse) || h.y < low) { world.remove(h.mesh); return false; } return true; });
    }
  } else if (state === 'fall') {
    if (P.hole) { const h = P.hole, k = 1 - Math.exp(-dt * 5); P.x += wrapD(h.x - P.x) * k; P.y += (h.y - .9 - P.y) * k; P.spin += dt * 3; }
    else { P.vy -= G * .6 * dt; P.y += P.vy * dt; P.spin += dt * 1.5; }
  } else if (state === 'win') {
    if (P.hold > 0) P.hold -= dt; else { P.vy -= G * dt; P.y += P.vy * dt; if (P.y <= T.goal) { P.y = T.goal; P.vy = JV * .55; P.land = 0; P.hold = .05; sfx.boing(); emit(sparks, P.x, P.y + .3, .3, [0xffd84a, 0xff6fb5, 0x7fe6ff], 8, 4, .5, .4, -2); } }
  } else if (state === 'menu') {
    if (P.hold > 0) P.hold -= dt; else { P.vy -= G * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = MENU.v; P.land = 0; P.hold = .05; plats[0] && (plats[0].squash = 1); } }
  }
}

/* ---------- animation of everything that moves ---------- */
const pose = { blink: 0, nextBlink: 2, look: 0 };
function animGummy(M, dt, ghost) {
  const s = M.g;
  if (!ghost) {
    P.land += dt;
    pose.nextBlink -= dt; if (pose.nextBlink < 0) { pose.blink = .14; pose.nextBlink = rand(2, 4.5); }
    pose.blink = Math.max(0, pose.blink - dt);
    P.cheer = Math.max(0, (P.cheer || 0) - dt * 1.4);
    P.shieldFx = Math.max(0, (P.shieldFx || 0) - dt);
  }
  // squash on landing (1.3, 0.7, 1.3 for 80 ms, ease back in 120 ms), stretch in the air from the speed
  let sx = 1, sy = 1;
  const air = clamp(P.vy / JV, -1, 1.6);
  const stretch = P.rocket ? 1.25 : 1 + (air > 0 ? air * .17 : -air * .06);
  if (P.hold > 0 || P.land < .08) { sy = .7; sx = 1.3; }
  else if (P.land < .2) { const k = easeOutCubic((P.land - .08) / .12); sy = lerp(.7, stretch, k); sx = lerp(1.3, 1 / Math.sqrt(stretch), k); }
  else { sy = stretch; sx = 1 / Math.sqrt(stretch); }
  if (state === 'station') { const b = Math.sin(RT * 3) * .02, walk = Math.min(1, Math.abs(P.x) * 3); sy = 1 + b + walk * Math.abs(Math.sin(RT * 16)) * .08; sx = 1 - b * .5; }
  M.rig.scale.set(sx, sy, sx);
  const lean = clamp(-P.vx * .025, -.35, .35);
  M.rig.rotation.z = lerp(M.rig.rotation.z, lean, 1 - Math.exp(-dt * 10));
  M.rig.rotation.y = lerp(M.rig.rotation.y, clamp(P.vx * .03, -.5, .5), 1 - Math.exp(-dt * 8));
  if (P.spin) { M.rig.rotation.z += P.spin * dt * 0; s.rotation.z = (state === 'fall' ? P.spin * 4 : Math.sin(P.spin * 20) * .5 * P.spin); }
  else s.rotation.z = 0;
  if (!ghost && P.spin && state === 'play') P.spin = Math.max(0, P.spin - dt * 1.4);
  if (state === 'fall' && P.hole) { const k = clamp(1 - (P.spin - 1) * .6, 0, 1); s.scale.setScalar(k); } else s.scale.setScalar(1);
  // arms up when rising, flailing when falling, waving when cheering
  const up = P.rocket ? 2.6 : P.vy > 2 ? 1.2 + air * .4 : P.vy < -6 ? 2.2 + Math.sin(RT * 22) * .4 : .5;
  M.arms.forEach((a, i) => { const k = i ? -1 : 1; let r = -k * up; if (P.cheer > 0 || state === 'win') r = -k * (2.6 + Math.sin(RT * 14 + i) * .4); a.rotation.z = lerp(a.rotation.z, r, 1 - Math.exp(-dt * 14)); });
  M.legs.forEach((l, i) => { const t = P.vy > 0 && P.land > .1 ? .5 : P.vy < -4 ? -.2 + Math.sin(RT * 18 + i * 3) * .3 : 0; l.rotation.x = lerp(l.rotation.x, t, 1 - Math.exp(-dt * 12)); });
  // antennae wobble against the motion
  M.ants.forEach((a, i) => { const k = i ? -1 : 1; a.rotation.z = lerp(a.rotation.z, clamp(-P.vy * .012, -.3, .25) * k + Math.sin(RT * 5 + i) * .06, 1 - Math.exp(-dt * 8)); });
  M.eyes.forEach((e) => { e.scale.y = pose.blink > 0 ? .12 : 1; e.userData.iris.position.x = clamp(P.vx * .004, -.03, .03); e.userData.iris.position.y = -.01 + clamp(P.vy * .002, -.03, .03); });
  M.flames.forEach((f, i) => { const on = P.rocket ? 1 : P.land < .25 ? .45 : 0; f.visible = on > 0; f.scale.set(1, on * (1.6 + Math.sin(RT * 40 + i) * .4) * (P.rocket ? 1.8 : 1), 1); });
  M.shield.visible = P.shieldFx > 0; if (M.shield.visible) { const k = P.shieldFx; gummyMats.shieldBub.uniforms.op.value = Math.min(1, k * 2); M.shield.scale.set(1.15 + (1 - k) * .3, 1.2 + (1 - k) * .3, 1); }
  // blink while invulnerable
  M.rig.visible = !(P.inv > 0 && !P.shieldFx && Math.sin(RT * 40) > .3 && state === 'play');
}
function animWorld(dt) {
  for (const p of plats) {
    if (p.dead) continue;
    p.t += dt;
    if (p.pop < 1) { p.pop = Math.min(1, p.pop + dt * 3.2); p.mesh.scale.setScalar(Math.max(.001, easeOutBack(p.pop))); }
    if (p.type === 'moving' && (state === 'play' || state === 'station' || state === 'menu')) { p.x = p.x0 + Math.sin(p.t * p.spd) * p.amp; p.mesh.position.x = p.x; if (p.blinkLight) p.blinkLight.material.opacity = Math.sin(p.t * 6) > 0 ? .95 : .15; }
    if (p.type === 'blink') { const c = (p.t * .9) % 3.2; p.alpha = c < 2.2 ? 1 : c < 2.6 ? 1 - (c - 2.2) / .4 : c < 2.9 ? 0 : (c - 2.9) / .3; p.mat.opacity = .15 + .85 * p.alpha; p.gl.material.opacity = .4 * p.alpha; }
    if (p.squash) { p.squash = Math.max(0, p.squash - dt * 6); const k = Math.sin(p.squash * Math.PI) * .12; p.mesh.position.y = p.y - k * .5; if (p.spring) p.spring.scale.y = 1 - p.squash * .5 + Math.sin((1 - p.squash) * 10) * .15 * p.squash; }
    if (p.crumbleT !== undefined) { p.crumbleT -= dt; p.mesh.position.x = p.x + Math.sin(p.t * 80) * .05; if (p.crumbleT <= 0) breakPlat(p); }
    if (p.type === 'station') {
      p.lights.forEach((l, i) => { l.material.opacity = .35 + .65 * (Math.sin(p.t * 5 - i * .7) > 0 ? 1 : 0); });
      p.beacon.material.opacity = Math.sin(p.t * 4) > 0 ? 1 : .2;
    }
  }
  if (homeObj && homeObj.userData.fam) homeObj.userData.fam.forEach((f, i) => { f.arms[i % 2].rotation.z = (i % 2 ? 1 : -1) * (2.4 + Math.sin(RT * 8 + i) * .4); f.g.position.y += Math.sin(RT * 6 + i) * .004; });
  for (const s of stars) { if (s.dead) continue; s.t += dt; s.star.rotation.y = Math.sin(s.t * 2.2) * .55; s.star.rotation.z = Math.sin(s.t * 1.3) * .15; s.mesh.position.y = s.y + Math.sin(s.t * 2.5) * .08; }
  for (const m of meteors) {
    if (m.dead) continue;
    if (state === 'play' || state === 'menu') { m.x += m.vx * dt; if (m.x > PW / 2 - .5 || m.x < -PW / 2 + .5) { m.vx *= -1; m.x = clamp(m.x, -PW / 2 + .5, PW / 2 - .5); m.trail.forEach((t, i) => t.position.x = -Math.sign(m.vx) * (.35 + i * .38)); } }
    m.mesh.position.x = m.x; m.rock.rotation.x += dt * 2; m.rock.rotation.z += dt * 1.3;
    m.trail.forEach((t, i) => { t.material.opacity = (.7 - i * .14) * (.75 + .25 * Math.sin(RT * 20 + i)); });
  }
  for (const h of holes) {
    h.ring.rotation.z -= dt * 1.4; const pulse = 1 + Math.sin(RT * 3) * .05;
    if (h.collapse) { h.collapse = Math.max(0, h.collapse - dt * 2.5); h.mesh.scale.setScalar(Math.max(.001, h.collapse)); if (!h.collapse) h.dead = true; }
    else h.mesh.scale.setScalar(pulse);
  }
}
function updateBackground(dt, p) {
  starU.camY.value = CAM.y; starU.time.value = RT; starU.pr.value = PR;
  for (const b of bgItems) {
    const span = b.span; let y = b.y - CAM.y * b.par; y = ((y + span / 2) % span + span) % span - span / 2;
    b.obj.position.y = y + CAM.y;
    if (b.obj.userData.spin) b.obj.userData.m.rotation.y += b.obj.userData.spin * dt;
  }
  setSky(p);
  // the start planet sinks away below, the goal planet grows above
  if (startPlanet) {
    const depth = 55, hAt = 2 * (camD + depth) * Math.tan(FOV * Math.PI / 360);
    startPlanet.position.set(0, CAM.y - hAt * .5 - 30 + 9 - CAM.y * .32 + 1.5, -depth); startPlanet.userData.ball.rotation.y += dt * .03;
    startPlanet.visible = startPlanet.position.y + 40 > CAM.y - hAt;
  }
  if (goalPlanet) {
    const depth = 170, hAt = 2 * (camD + depth) * Math.tan(FOV * Math.PI / 360), k = Math.pow(p, 1.5);
    const r = hAt * lerp(.05, .36, k); goalPlanet.scale.setScalar(r / 10);
    const near = homeObj ? clamp((CAM.y + visH - T.goal) / visH, 0, 1) : 0;
    goalPlanet.position.set(hAt * .12 * (1 - k) * cam.aspect * .5, CAM.y + hAt * .5 - r * lerp(1.8, .8, k) + near * hAt * .9, -depth);
    goalPlanet.userData.ball.rotation.y += dt * .05;
  }
  if (homeObj) homeObj.children[0].userData.ball.rotation.y += dt * .02;
  // speed lines while the rocket burns
  const lop = P.rocket ? .55 : 0; lines.material.opacity = lerp(lines.material.opacity, lop, 1 - Math.exp(-dt * 10));
  if (lines.material.opacity > .01) {
    for (let i = 0; i < LINES; i++) {
      const d = lineD[i]; d.y -= dt * 2.2 * d.s; if (d.y < 0) { d.y += 1; d.x = rand(-1, 1); }
      const hz = (camD - d.z) * Math.tan((FOV + FEEL.fovKick) * Math.PI / 360);
      _p.set(d.x * hz * cam.aspect, CAM.y + (d.y * 2 - 1) * hz * 1.1, d.z); _s.set(.035, d.l, 1); _q.identity(); _m.compose(_p, _q, _s); lines.setMatrixAt(i, _m);
    }
    lines.instanceMatrix.needsUpdate = true; lines.visible = true;
  } else lines.visible = false;
}

/* ---------- main loop ---------- */
let last = performance.now(), frameMs = [], workMs = [];
function frame(now) {
  requestAnimationFrame(frame);
  const w0 = performance.now();
  const raw = (now - last) / 1000; last = now;
  let dt = Math.min(.05, raw) * SH_TIME.k;
  if (raw > 0 && raw < 1) { frameMs.push(raw * 1000); if (frameMs.length > 1200) frameMs.shift(); }
  if (raw < .5 && state !== 'load') watchSpeed(raw);
  RT += Math.min(.05, raw);
  if (state === 'pause' || state === 'load') { renderer.render(scene, cam); return; }
  // hit-stop freezes the world for a few frames; slow motion stretches a big moment and eases back
  if (FEEL.hitStop > 0) { FEEL.hitStop -= Math.min(.05, raw); dt = 0; }
  else if (FEEL.slow > 0) { FEEL.slow -= Math.min(.05, raw); const k = FEEL.slow < .1 ? FEEL.slowK + (1 - FEEL.slowK) * (1 - FEEL.slow / .1) : FEEL.slowK; dt *= k; }
  // small physics steps so fast falls never skip a platform
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) step(dt / n);
  if (state === 'station') { if (Q && Q.t0 && !Q.answered) { const el = (performance.now() - Q.t0) / 1000 * SH_TIME.k; $('qFastBar').style.width = Math.max(0, 1 - el / FAST) * 100 + '%'; if (el > FAST) $('qFast').classList.add('gone'); } }
  animWorld(dt); updPool(bits, dt, false); updPool(sparks, dt, true);
  const p = prog(Math.max(P.y, 0));
  updateCam(Math.min(.05, raw));
  updateBackground(dt, p);
  gummy.g.position.set(P.x, P.y, 0); animGummy(gummy, dt, false);
  const near = Math.abs(P.x) > PW / 2 - .9; twin.g.visible = near && state !== 'menu';
  if (twin.g.visible) { twin.g.position.set(P.x - Math.sign(P.x) * PW, P.y, 0); animGummy(twin, dt, true); }
  gGlow.position.set(P.x, P.y + .9, -.5);
  musicTick();
  if (state === 'play' || state === 'station') hud();
  renderer.render(scene, cam);
  workMs.push(performance.now() - w0); if (workMs.length > 1200) workMs.shift();
}

/* ---------- test hooks ---------- */
window.SH = {
  get state() { return state; }, P, get run() { return run; }, get result() { return lastResult; }, TIERS, save,
  bot(on = true, answer = 'right', loops = 0) { BOT.on = on; BOT.answer = answer; BOT.loops = loops; BOT.bestY = 0; BOT.bestT = T_; },
  set rocketHappy(v) { BOT.rocketHappy = v; },
  set holdLaunch(v) { BOT.holdLaunch = v; },
  pauseAnswers(v) { BOT.noAnswer = v; },
  speed(k) { SH_TIME.k = k; },
  start(t = 0) { save.tier = t; store(); TI = t; startRun(); },
  menu() { showMenu(); },
  rightIndex() { return Q && Q.w ? Q.w.findIndex((o) => o.ok) : -1; },
  answer(i) { const b = $('qOpts').children[i]; b && b.click(); },
  launch() { launch(); },
  rocket() { return useRocket(); },
  give(r = 3, s = 1) { P.rockets += r; P.shields += s; },
  unlockAll() { save.best = [9999, 9999, save.best[2]]; store(); },
  tris() { renderer.render(scene, cam); return { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
  frames() { const a = frameMs.slice(-600); return { n: a.length, avg: a.reduce((s, v) => s + v, 0) / Math.max(1, a.length), p95: a.slice().sort((x, y) => x - y)[Math.floor(a.length * .95)] || 0 }; },
  resetFrames() { frameMs = []; workMs = []; },
  work() { const a = workMs.slice(-600); return a.reduce((s, v) => s + v, 0) / Math.max(1, a.length); },
  log() { return EVLOG.slice(); },
  near() { return plats.filter((p) => Math.abs(p.y - P.y) < 12).map((p) => [p.type, +p.x.toFixed(1), +p.y.toFixed(1), +p.w.toFixed(1), p.dead]).concat(holes.map((h) => ['HOLE', +h.x.toFixed(1), +h.y.toFixed(1)])); },
  dbg() { return { gen: { y: +GEN.y.toFixed(1), blocked: GEN.blocked, done: GEN.done, si: GEN.si }, home: plats.filter((p) => p.type === 'home').map((p) => p.y), top: Math.max(...plats.map((p) => p.y)), camY: +CAM.y.toFixed(1) }; },
  info() { return { state, y: +P.y.toFixed(1), maxY: Math.floor(P.maxY), score: scoreNow(), rockets: P.rockets, shields: P.shields, stars: P.stars, plats: plats.length, holes: holes.length, meteors: meteors.length, PR, quality }; },
};

/* ---------- start ---------- */
fit(); window.addEventListener('resize', () => { fit(); if (state === 'menu') menuFit(); });
try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
window.HOPUP_LOAD && window.HOPUP_LOAD(85);
buildWorld(unlocked(save.tier) ? save.tier : 0);
setHand();
showMenu();
renderer.compile(scene, cam);
window.HOPUP_LOAD && window.HOPUP_LOAD(100);
requestAnimationFrame((t) => { last = t; frame(t); setTimeout(() => $('loading').classList.add('done'), 150); setTimeout(() => $('loading').remove(), 700); });
