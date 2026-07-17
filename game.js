/* =========================================================================
   DUKE REDUX v2 — an original retro FPS homage, built from scratch.
   Build-engine-style raycaster: textured floor/ceiling casting, parallax
   sky, animated textures, distance-lit sprites, synthesized audio + voice.
   Every texture, sprite and sound is generated procedurally. No assets.
   ========================================================================= */
'use strict';

// ---------------------------------------------------------------- constants
const W = 640, H = 400;            // internal resolution
const COLS = 320, COLW = W / COLS; // raycast columns
const FOV_PLANE = 0.66;
const TEXS = 64;                   // texture size
const BUF_W = 320, BUF_H = 200, HORIZ = BUF_H / 2; // floor-cast buffer (2x scaled)
const SKY_W = 1024, SKY_H = 100;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  cv.style.width = (W * s) + 'px';
  cv.style.height = (H * s) + 'px';
}
window.addEventListener('resize', fit); fit();

// deterministic rng for art
let _seed = 1337;
function srand(s) { _seed = s; }
function rnd() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); };

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texCanvas() { return mkCanvas(TEXS, TEXS); }
function dataOf(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }

// ================================================================ TEXTURES
// -- walls: gritty, dithered, 90s grime
function grime(g, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${alpha * (0.5 + rnd())})`;
    g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1 + Math.floor(rnd() * 2), 1);
  }
}
function streaks(g, n) { // vertical grime streaks from top
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * 62), len = 6 + Math.floor(rnd() * 26);
    g.fillStyle = `rgba(10,8,6,${0.12 + rnd() * 0.18})`;
    g.fillRect(x, 0, 1 + Math.floor(rnd() * 2), len);
  }
}
function makeBrick() {
  srand(11); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#3a201a'; g.fillRect(0, 0, TEXS, TEXS);
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 8;
    for (let col = -1; col < 5; col++) {
      const x = col * 16 + off, y = row * 8;
      const v = 0.72 + rnd() * 0.55;
      const r = Math.floor(128 * v), gr = Math.floor(60 * v), b = Math.floor(46 * v);
      g.fillStyle = `rgb(${r},${gr},${b})`;
      g.fillRect(x + 1, y + 1, 14, 6);
      g.fillStyle = `rgb(${Math.min(255, r + 24)},${gr + 14},${b + 12})`; // top bevel
      g.fillRect(x + 1, y + 1, 14, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)';                                    // bottom shadow
      g.fillRect(x + 1, y + 6, 14, 1);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,220,200,0.1)';
        g.fillRect(x + 1 + Math.floor(rnd() * 13), y + 1 + Math.floor(rnd() * 5), 1, 1);
      }
    }
  }
  // a crack
  let cx = 12 + Math.floor(rnd() * 30), cy = 0;
  g.fillStyle = 'rgba(12,6,4,0.8)';
  while (cy < 40) { g.fillRect(cx, cy, 1, 2); cy += 2; cx += Math.floor(rnd() * 3) - 1; }
  streaks(g, 5); grime(g, 60, 0.25);
  return c;
}
function makeMetal() {
  srand(22); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#3b4350'; g.fillRect(0, 0, TEXS, TEXS);
  for (let y = 0; y < TEXS; y++) {
    g.fillStyle = `rgba(255,255,255,${0.03 + 0.035 * Math.sin(y * 0.6)})`;
    g.fillRect(0, y, TEXS, 1);
  }
  // panels with bevels
  [[2, 2, 60, 26], [2, 32, 28, 30], [34, 32, 28, 30]].forEach(p => {
    g.fillStyle = '#6b7484'; g.fillRect(p[0], p[1], p[2], 1); g.fillRect(p[0], p[1], 1, p[3]);
    g.fillStyle = '#20242c'; g.fillRect(p[0], p[1] + p[3] - 1, p[2], 1); g.fillRect(p[0] + p[2] - 1, p[1], 1, p[3]);
  });
  // vent
  g.fillStyle = '#1a1e26'; g.fillRect(38, 38, 20, 18);
  for (let i = 0; i < 5; i++) { g.fillStyle = '#454d5c'; g.fillRect(39, 40 + i * 3, 18, 1); }
  // rivets
  g.fillStyle = '#8a93a3';
  [[5, 5], [57, 5], [5, 24], [57, 24], [5, 35], [27, 35], [5, 58], [27, 58]].forEach(p => g.fillRect(p[0], p[1], 2, 2));
  // scratches
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(180,190,205,0.25)';
    const x = Math.floor(rnd() * 50), y = Math.floor(rnd() * 56);
    g.fillRect(x, y, 6 + Math.floor(rnd() * 8), 1);
  }
  streaks(g, 4); grime(g, 50, 0.2);
  return c;
}
function makeHazard() {
  srand(33); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#2c2c28'; g.fillRect(0, 0, TEXS, TEXS);
  g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); g.translate(-48, -48);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#c89c14' : '#1a1a16';
    g.fillRect(i * 8, 0, 8, 96);
  }
  g.restore();
  g.fillStyle = '#23262c'; g.fillRect(0, 0, TEXS, 7); g.fillRect(0, 57, TEXS, 7);
  g.fillStyle = '#8a93a3'; [[4, 2], [59, 2], [4, 60], [59, 60]].forEach(p => g.fillRect(p[0], p[1], 2, 2));
  // rust bleed
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * 60);
    g.fillStyle = `rgba(110,52,20,${0.25 + rnd() * 0.3})`;
    g.fillRect(x, 7, 2, 4 + Math.floor(rnd() * 22));
  }
  grime(g, 70, 0.3);
  return c;
}
function makeTechFrame(fi) {
  srand(44 + fi * 7); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#1a2130'; g.fillRect(0, 0, TEXS, TEXS);
  g.fillStyle = '#2c3a52'; g.fillRect(0, 0, TEXS, 2); g.fillRect(0, 0, 2, TEXS);
  g.fillStyle = '#0e1220'; g.fillRect(0, 62, TEXS, 2); g.fillRect(62, 0, 2, TEXS);
  // screen with scrolling data
  g.fillStyle = '#060a12'; g.fillRect(7, 7, 50, 26);
  for (let i = 0; i < 11; i++) {
    g.fillStyle = ['#3df53d', '#2cb52c', '#1d7a1d', '#1d7a1d'][Math.floor(rnd() * 4)];
    const wbar = 4 + Math.floor(rnd() * 40);
    g.fillRect(10, 9 + i * 2, wbar, 1);
  }
  g.fillStyle = '#7df0c0'; g.fillRect(10 + ((fi * 17) % 40), 9 + (fi * 5) % 20, 4, 2); // blinking cursor
  g.fillStyle = '#10243a'; g.fillRect(6, 6, 52, 1);
  // status lights row (frame-dependent blink)
  for (let i = 0; i < 6; i++) {
    const on = (i + fi) % 3 !== 0;
    g.fillStyle = on ? (i % 2 ? '#ff4040' : '#41ff7a') : '#26202a';
    g.fillRect(9 + i * 8, 39, 5, 4);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(9 + i * 8, 39, 5, 1);
  }
  // cable conduit
  g.fillStyle = '#27314a'; g.fillRect(6, 48, 52, 10);
  g.fillStyle = '#1a2236'; for (let x = 8; x < 56; x += 6) g.fillRect(x, 48, 2, 10);
  grime(g, 30, 0.18);
  return c;
}
function makeStone() {
  srand(55); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#39413a'; g.fillRect(0, 0, TEXS, TEXS);
  for (let i = 0; i < 300; i++) {
    const v = 0.65 + rnd() * 0.7;
    g.fillStyle = `rgb(${Math.floor(56 * v)},${Math.floor(66 * v)},${Math.floor(56 * v)})`;
    g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2, 2);
  }
  // big block joints
  g.strokeStyle = 'rgba(8,10,8,0.55)'; g.lineWidth = 2;
  g.strokeRect(-6, -2, 40, 34); g.strokeRect(32, -2, 40, 34);
  g.strokeRect(12, 30, 40, 34); g.strokeRect(-26, 30, 40, 34); g.strokeRect(50, 30, 40, 34);
  // moss + slime drips
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rnd() * 60);
    g.fillStyle = `rgba(72,130,52,${0.3 + rnd() * 0.3})`;
    g.fillRect(x, 0, 2 + Math.floor(rnd() * 2), 5 + Math.floor(rnd() * 24));
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(90,150,70,${0.2 + rnd() * 0.25})`;
    g.fillRect(Math.floor(rnd() * 64), 40 + Math.floor(rnd() * 24), 2, 1);
  }
  grime(g, 60, 0.25);
  return c;
}
function makeAlienFrame(fi) {
  srand(66); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#221631'; g.fillRect(0, 0, TEXS, TEXS);
  for (let i = 0; i < 7; i++) { // organic ribs
    g.strokeStyle = `rgba(${118 + i * 10},58,${158 + i * 8},0.85)`;
    g.lineWidth = 3 + (i % 2);
    g.beginPath(); g.moveTo(0, 6 + i * 9);
    for (let x = 0; x <= 64; x += 4) g.lineTo(x, 6 + i * 9 + Math.sin((x + i * 13) * 0.3) * 3);
    g.stroke();
  }
  // veins
  g.strokeStyle = 'rgba(220,80,200,0.5)'; g.lineWidth = 1;
  for (let v = 0; v < 4; v++) {
    g.beginPath(); let vx = 8 + v * 16, vy = 0;
    g.moveTo(vx, vy);
    while (vy < 64) { vy += 5; vx += Math.floor(rnd() * 7) - 3; g.lineTo(vx, vy); }
    g.stroke();
  }
  // pulsing pustules (bright on alternate frames)
  for (let i = 0; i < 8; i++) {
    const x = 5 + Math.floor(rnd() * 54), y = 5 + Math.floor(rnd() * 54);
    const hot = (i + fi) % 2 === 0;
    g.fillStyle = hot ? '#8df5c8' : '#3e8f6e';
    g.beginPath(); g.arc(x, y, hot ? 2.2 : 1.6, 0, 7); g.fill();
    if (hot) { g.fillStyle = 'rgba(141,245,200,0.25)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  }
  return c;
}
function makeDoor(trim) {
  srand(77); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#4c5260'; g.fillRect(0, 0, TEXS, TEXS);
  for (let y = 0; y < TEXS; y += 4) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y, TEXS, 1); }
  for (let y = 2; y < TEXS; y += 4) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, TEXS, 1); }
  g.fillStyle = '#272b33'; g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64); g.fillRect(30, 0, 4, 64);
  g.fillStyle = '#3a3f4a'; g.fillRect(5, 0, 1, 64); g.fillRect(58, 0, 1, 64);
  // handles + warning placard
  g.fillStyle = '#6b7484'; g.fillRect(9, 28, 14, 8); g.fillRect(41, 28, 14, 8);
  g.fillStyle = '#2a2e36'; g.fillRect(9, 35, 14, 1); g.fillRect(41, 35, 14, 1);
  g.fillStyle = '#8a8246'; g.fillRect(10, 44, 12, 9);
  g.fillStyle = '#1c1a10';
  g.fillRect(12, 46, 8, 1); g.fillRect(12, 48, 8, 1); g.fillRect(12, 50, 5, 1);
  if (trim) {
    g.fillStyle = trim; g.fillRect(0, 3, 64, 6); g.fillRect(0, 55, 64, 6);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 3, 64, 1); g.fillRect(0, 55, 64, 1);
    // lock light
    g.fillStyle = trim; g.fillRect(44, 44, 8, 8);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(46, 46, 3, 3);
  }
  grime(g, 40, 0.18);
  return c;
}
function makeExitFrame(on) {
  const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#15201a'; g.fillRect(0, 0, TEXS, TEXS);
  g.strokeStyle = '#2c4436'; g.lineWidth = 3; g.strokeRect(4, 4, 56, 56);
  g.fillStyle = '#06120a'; g.fillRect(10, 18, 44, 26);
  g.fillStyle = on ? '#41ff7a' : '#1d5c33';
  g.font = 'bold 17px monospace'; g.textAlign = 'center';
  g.fillText('EXIT', 32, 37);
  if (on) { g.fillStyle = 'rgba(65,255,122,0.18)'; g.fillRect(8, 16, 48, 30); }
  g.fillStyle = on ? '#41ff7a' : '#1d5c33'; g.fillRect(28, 48, 8, 7);
  g.fillStyle = '#caa017'; g.fillRect(26, 8, 12, 6);
  g.fillStyle = '#1c1a10'; g.fillRect(28, 10, 8, 2);
  return c;
}

// -- floors / ceilings (sampled per-pixel by the floor caster)
function makeAsphalt() {
  srand(101); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#262422'; g.fillRect(0, 0, TEXS, TEXS);
  for (let i = 0; i < 420; i++) {
    const v = 0.6 + rnd() * 0.8;
    g.fillStyle = `rgb(${Math.floor(44 * v)},${Math.floor(42 * v)},${Math.floor(39 * v)})`;
    g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, 1);
  }
  // cracks
  for (let k = 0; k < 3; k++) {
    let x = Math.floor(rnd() * 64), y = Math.floor(rnd() * 20);
    g.fillStyle = 'rgba(8,8,8,0.8)';
    while (y < 64) { g.fillRect(x & 63, y, 1, 2); y += 2; x += Math.floor(rnd() * 3) - 1; }
  }
  // worn paint stripe
  g.fillStyle = 'rgba(170,150,40,0.5)';
  for (let y = 0; y < 64; y += 2) if (rnd() > 0.3) g.fillRect(29, y, 5, 2);
  // litter / stains
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${20 + Math.floor(rnd() * 30)},${16 + Math.floor(rnd() * 20)},12,0.5)`;
    g.beginPath(); g.arc(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2 + rnd() * 4, 0, 7); g.fill();
  }
  return c;
}
function makeSludge() {
  srand(102); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#1d2b14'; g.fillRect(0, 0, TEXS, TEXS);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x += 2) {
    const sw = Math.sin(x * 0.18 + y * 0.3) + Math.sin(y * 0.12 - x * 0.07);
    const v = 0.7 + sw * 0.22 + rnd() * 0.15;
    g.fillStyle = `rgb(${Math.floor(36 * v)},${Math.floor(58 * v)},${Math.floor(26 * v)})`;
    g.fillRect(x, y, 2, 1);
  }
  for (let i = 0; i < 14; i++) { // bubbles & scum
    const x = Math.floor(rnd() * 64), y = Math.floor(rnd() * 64);
    g.fillStyle = 'rgba(140,200,90,0.5)';
    g.beginPath(); g.arc(x, y, 1 + rnd() * 1.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,255,150,0.4)'; g.fillRect(x, y - 1, 1, 1);
  }
  return c;
}
function makeDeck() {
  srand(103); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#262033'; g.fillRect(0, 0, TEXS, TEXS);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x = px * 32, y = py * 32;
    const v = 0.85 + rnd() * 0.3;
    g.fillStyle = `rgb(${Math.floor(46 * v)},${Math.floor(38 * v)},${Math.floor(62 * v)})`;
    g.fillRect(x + 1, y + 1, 30, 30);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 1, y + 1, 30, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, y + 31, 30, 1);
    g.fillStyle = '#7a8590';
    [[x + 4, y + 4], [x + 28, y + 4], [x + 4, y + 28], [x + 28, y + 28]].forEach(p => g.fillRect(p[0], p[1], 2, 2));
  }
  // glow seams
  g.fillStyle = 'rgba(80,220,200,0.35)';
  g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, 1); }
  return c;
}
function makeRockCeil() {
  srand(104); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#242a22'; g.fillRect(0, 0, TEXS, TEXS);
  for (let i = 0; i < 360; i++) {
    const v = 0.55 + rnd() * 0.8;
    g.fillStyle = `rgb(${Math.floor(40 * v)},${Math.floor(46 * v)},${Math.floor(38 * v)})`;
    g.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2, 2);
  }
  for (let i = 0; i < 8; i++) { // stalactite shadows
    g.fillStyle = 'rgba(6,8,6,0.6)';
    g.beginPath(); g.arc(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2 + rnd() * 5, 0, 7); g.fill();
  }
  return c;
}
function makeAlienCeil() {
  srand(105); const c = texCanvas(), g = c.getContext('2d');
  g.fillStyle = '#1a1126'; g.fillRect(0, 0, TEXS, TEXS);
  g.strokeStyle = 'rgba(150,60,180,0.6)'; g.lineWidth = 2;
  for (let v = 0; v < 6; v++) {
    g.beginPath(); let vx = Math.floor(rnd() * 64), vy = 0;
    g.moveTo(vx, vy);
    while (vy < 64) { vy += 4; vx += Math.floor(rnd() * 7) - 3; g.lineTo(vx, vy); }
    g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(125,240,192,0.5)' : 'rgba(220,80,200,0.4)';
    g.beginPath(); g.arc(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1.4, 0, 7); g.fill();
  }
  return c;
}

// -- parallax night sky: burning city skyline
function makeSky() {
  srand(200);
  const c = mkCanvas(SKY_W, SKY_H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, SKY_H);
  grad.addColorStop(0, '#05060f'); grad.addColorStop(0.55, '#101430');
  grad.addColorStop(0.85, '#3a1c2a'); grad.addColorStop(1, '#7a2c14');
  g.fillStyle = grad; g.fillRect(0, 0, SKY_W, SKY_H);
  // stars
  for (let i = 0; i < 130; i++) {
    g.fillStyle = `rgba(220,230,255,${0.3 + rnd() * 0.7})`;
    g.fillRect(Math.floor(rnd() * SKY_W), Math.floor(rnd() * 45), 1, 1);
  }
  // moon
  g.fillStyle = '#d8dce8'; g.beginPath(); g.arc(180, 22, 11, 0, 7); g.fill();
  g.fillStyle = '#0a0c18'; g.beginPath(); g.arc(185, 19, 9, 0, 7); g.fill();
  // smoke plumes
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rnd() * SKY_W);
    g.fillStyle = 'rgba(30,22,26,0.5)';
    for (let s = 0; s < 12; s++) {
      g.beginPath();
      g.arc(x + Math.sin(s * 0.9 + i) * 8, SKY_H - 18 - s * 5, 6 + s * 1.4, 0, 7);
      g.fill();
    }
  }
  // fire glow patches on horizon
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * SKY_W);
    const fgr = g.createLinearGradient(0, SKY_H - 30, 0, SKY_H);
    fgr.addColorStop(0, 'rgba(230,90,20,0)'); fgr.addColorStop(1, `rgba(255,${90 + Math.floor(rnd() * 70)},20,${0.35 + rnd() * 0.3})`);
    g.fillStyle = fgr; g.fillRect(x - 30, SKY_H - 30, 60, 30);
  }
  // skyline silhouettes (two depths)
  g.fillStyle = '#0c0e1a';
  for (let x = 0; x < SKY_W;) {
    const bw = 30 + Math.floor(rnd() * 50), bh = 22 + Math.floor(rnd() * 34);
    g.fillRect(x, SKY_H - bh, bw, bh);
    x += bw + Math.floor(rnd() * 14);
  }
  g.fillStyle = '#070810';
  for (let x = 0; x < SKY_W;) {
    const bw = 36 + Math.floor(rnd() * 60), bh = 12 + Math.floor(rnd() * 22);
    g.fillRect(x, SKY_H - bh, bw, bh);
    // lit windows
    for (let wy = SKY_H - bh + 3; wy < SKY_H - 3; wy += 4)
      for (let wx = x + 3; wx < x + bw - 3; wx += 5)
        if (rnd() > 0.62) {
          g.fillStyle = rnd() > 0.85 ? '#ff8030' : '#caa860';
          g.fillRect(wx, wy, 2, 2);
          g.fillStyle = '#070810';
        }
    x += bw + Math.floor(rnd() * 20);
  }
  return c;
}

const TEX_TECH = [makeTechFrame(0), makeTechFrame(1), makeTechFrame(2)];
const TEX_ALIEN = [makeAlienFrame(0), makeAlienFrame(1)];
const TEX_EXIT = [makeExitFrame(true), makeExitFrame(false)];
const TEX = {
  '1': makeBrick(), '2': makeMetal(), '3': makeHazard(), '4': TEX_TECH[0],
  '5': makeStone(), '6': TEX_ALIEN[0],
  'D': makeDoor(null), 'R': makeDoor('#c22b2b'), 'B': makeDoor('#2b58c2'),
  'X': TEX_EXIT[0],
};
let texClock = 0;
function texFor(ch) {
  if (ch === '4') return TEX_TECH[Math.floor(texClock * 2.5) % 3];
  if (ch === '6') return TEX_ALIEN[Math.floor(texClock * 1.6) % 2];
  if (ch === 'X') return TEX_EXIT[Math.floor(texClock * 2) % 2];
  return TEX[ch] || TEX['1'];
}
const WALL_CHARS = '123456DRBX';
const DOOR_CHARS = 'DRB';

const FLOOR_ASPHALT = makeAsphalt(), FLOOR_SLUDGE = makeSludge(), FLOOR_DECK = makeDeck();
const CEIL_ROCK = makeRockCeil(), CEIL_ALIEN = makeAlienCeil();
const SKY_CANVAS = makeSky();
const SKY_DATA = dataOf(SKY_CANVAS);

// floor-cast buffer
const bufCanvas = mkCanvas(BUF_W, BUF_H);
const bufCtx = bufCanvas.getContext('2d');
const bufImg = bufCtx.createImageData(BUF_W, BUF_H);

// ================================================================ SPRITES
function makeSprite(rows, pal, scale) {
  scale = scale || 4;
  let w = 0; rows.forEach(r => w = Math.max(w, r.length));
  const c = mkCanvas(w * scale, rows.length * scale);
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '.' || ch === ' ' || !pal[ch]) continue;
    g.fillStyle = pal[ch]; g.fillRect(x * scale, y * scale, scale, scale);
  }
  return c;
}
function tint(src, color, alpha) {
  const c = mkCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha; g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
// distance-shading variants (sector lighting feel), cached per canvas
const shadeCache = new WeakMap();
const SHADE_A = [0, 0.28, 0.5, 0.7];
function shaded(c, lvl) {
  if (lvl <= 0) return c;
  let arr = shadeCache.get(c);
  if (!arr) { arr = {}; shadeCache.set(c, arr); }
  if (!arr[lvl]) arr[lvl] = tint(c, '#04040c', SHADE_A[lvl]);
  return arr[lvl];
}
function shadeLvl(depth) { return depth < 4.5 ? 0 : depth < 8 ? 1 : depth < 11.5 ? 2 : 3; }

// ---- TROOPER (pig-faced alien cop) 20x27
const TROOP_PAL = {
  k: '#14141a', v: '#272d3b', p: '#eda3a8', P: '#c06d78', n: '#8a4750',
  w: '#f4f6ff', b: '#3c58d0', B: '#27408e', l: '#5d78ea',
  g: '#4b515e', G: '#2b2f37', s: '#9aa2b0', t: '#3c4238', T: '#252a22', y: '#ffd23e',
};
const TROOP_HEAD = [
  '......kkkkkkk.......',
  '.....kvvvvvvvk......',
  '....kvvvvvvvvvk.....',
  '....kvvPpppPvvk.....',
  '...kpppppppppppk....',
  '...kpkwpppppwkpk....',
  '...kpppppppppppk....',
  '...kPppnnnnnppPk....',
  '...kpppnknknpppk....',
  '....kPpppppppPk.....',
];
const TROOP_TORSO = [
  '....kkbbbbbbbkk.....',
  '...kbblbbbbblbbk....',
  '..kbbBlbbbbblBbbk...',
  '..kbbk.bblbb.kbbk...',
  '..kbbk.bbbbb.kbbk...',
  '.kGgggggggggggggGk..',
  '.kpGgggGsGgggggGpk..',
  '..kbbk.bBBBb.kbbk...',
  '...kk..bbbbb..kk....',
];
const TROOP_LEGS_STAND = [
  '......kbb.bbk.......',
  '.....kttk.kttk......',
  '.....kttk.kttk......',
  '.....kttk.kttk......',
  '.....kTtk.ktTk......',
  '.....ktt...ttk......',
  '....kkkk...kkkk.....',
  '...kkkkk...kkkkk....',
];
const TROOP_LEGS_W1 = [
  '......kbb.bbk.......',
  '.....kttk..kttk.....',
  '....kttk....kttk....',
  '....kttk....kttk....',
  '...kTtk......ktTk...',
  '...ktt........ttk...',
  '..kkkk........kkkk..',
  '.kkkkk........kkkkk.',
];
const TROOP_LEGS_W2 = [
  '......kbb.bbk.......',
  '.....kttkkttk.......',
  '......kttkttk.......',
  '.....kttk.kttk......',
  '....kTtk...ktTk.....',
  '....ktt.....ttk.....',
  '...kkkk.....kkkk....',
  '..kkkkk.....kkkkk...',
];
const TROOP_TORSO_FIRE = [
  '....kkbbbbbbbkk.....',
  '...kbblbbbbblbbk....',
  '..kbbBlbbbbblBbbk...',
  '..kbbk.bblbb.kbbk...',
  '..kbbkybbbbbykbbk...',
  '.kGggyyGgGgyyggGk...',
  '.kpGgyyyGsyyygGpk...',
  '..kbbk.bBBBb.kbbk...',
  '...kk..bbbbb..kk....',
];
const TROOP_DIE = [
  '....................',
  '........kkkk........',
  '.....kkvvvvvkk......',
  '....kpppppppppk.....',
  '...kPpnknknppPbk....',
  '..kbbbbblbbbbbbbk...',
  '.kbbBbbbbbbbBbbbbk..',
  '..kGgggggggggGk.....',
  '...kttk..kttk.......',
  '....kkk...kkk.......',
];
const TROOP_DEAD = [
  '....................',
  '......kk..kkk.......',
  '...kkpPPkkbbbkk.....',
  '..kpPnknkbbBbbbk....',
  '.kPPpppPbbbbbbBbk...',
  '..kkPPkkbBbbkkk.....',
  '....kk...kkk........',
];
function troopFrames(pal, scale) {
  const stand = TROOP_HEAD.concat(TROOP_TORSO, TROOP_LEGS_STAND);
  const walk1 = TROOP_HEAD.concat(TROOP_TORSO, TROOP_LEGS_W1);
  const walk2 = TROOP_HEAD.concat(TROOP_TORSO, TROOP_LEGS_W2);
  const fire = TROOP_HEAD.concat(TROOP_TORSO_FIRE, TROOP_LEGS_STAND);
  const f = {
    stand: makeSprite(stand, pal, scale),
    walk1: makeSprite(walk1, pal, scale),
    walk2: makeSprite(walk2, pal, scale),
    fire: makeSprite(fire, pal, scale),
    die: makeSprite(TROOP_DIE, pal, scale),
    dead: makeSprite(TROOP_DEAD, pal, scale),
  };
  f.pain = tint(f.stand, '#ff4040', 0.45);
  f.flash = tint(f.stand, '#ffffff', 0.65);
  return f;
}
const ENF_PAL = { // enforcer: bone horns, green hide, crimson armor
  k: '#14141a', v: '#d8cf9a', p: '#a2d87e', P: '#6f9b52', n: '#41602c',
  w: '#ffe9e9', b: '#a82c2c', B: '#6e1a1a', l: '#d05050',
  g: '#3a3f49', G: '#22252b', s: '#7d8590', t: '#33302a', T: '#201e1a', y: '#7df0ff',
};

// ---- DRONE 18x14
const DRONE_ROWS = [
  '......kkkkkk......',
  '....kkssssssskk...',
  '...kssssssssssk...',
  '..ksgGGGGGGGGgsk..',
  '.ksgGrrrrrrrrGgsk.',
  '.ksgGrkRRRRkrGgsk.',
  '.ksgGrrrrrrrrGgsk.',
  '..ksgGGGGGGGGgsk..',
  '...kssssssssssk...',
  '....kksssssskk....',
  '......kg..gk......',
  '.....kg....gk.....',
  '......g....g......',
  '.....k......k.....',
];
const DRONE_ROWS_2 = DRONE_ROWS.map((r, i) =>
  i === 10 ? '.....kg....gk.....' :
  i === 11 ? '......kg..gk......' :
  i === 12 ? '......g....g......' : r);
const DRONE_ROWS_FIRE = DRONE_ROWS.map((r, i) =>
  i === 5 ? '.ksgGykWWWWkyGgsk.' :
  i === 6 ? '.ksgGyyyyyyyyGgsk.' : r);
const DRONE_PAL = {
  s: '#9aa3b0', G: '#535b68', g: '#3a4150', r: '#9c1d1d', k: '#14141a',
  R: '#ff3a3a', W: '#fff7c0', y: '#ffd23e',
};
const DRONE_DEAD = [
  '..................',
  '....k...kk...k....',
  '...ksGGsrrsGGk....',
  '..ksGsrRRrsGsk....',
  '....k.sGGs..k.....',
  '......k..k........',
];

// ---- BOSS (the OVERLORD) 28x32
const BOSS_ROWS = [
  '....hh..............hh......',
  '...hhhh............hhhh.....',
  '...hhhh............hhhh.....',
  '....hhhh..........hhhh......',
  '.....hhkkkkkkkkkkkkhh.......',
  '......kggggggggggggk........',
  '.....kgggggggggggggggk......',
  '.....kgkkRRgggggRRkkgk......',
  '.....kgkRRRgggggRRRkgk......',
  '......kggggGGGGggggk........',
  '......kgggGnnnnGgggk........',
  '......kggGnwnwnnGggk........',
  '.....kkkkkkkkkkkkkkkk.......',
  '...kkaaaaaaaaaaaaaaaakk.....',
  '..kaaaaaaaaaaaaaaaaaaaak....',
  '.kaaAAaaaaaaaaaaaaaAAaaak...',
  '.kaak.kaaaaaaaaaaak.kaaak...',
  'kgggk.kaaaaaaaaaaak.kgggk...',
  'kGGGk.kaaAAAAAAaaak.kGGGk...',
  'kGyGk.kaaaaaaaaaaak.kGyGk...',
  'kGGGk.kaaaaaaaaaaak.kGGGk...',
  'kgggk.kaaaaaaaaaaak.kgggk...',
  '.kkk..kaaaakkkaaaak..kkk....',
  '......kaaaak.kaaaak.........',
  '......kaaaak.kaaaak.........',
  '......kaaaak.kaaaak.........',
  '......kAAaak.kaaAAk.........',
  '......kaaaak.kaaaak.........',
  '.....kaaaaak.kaaaaak........',
  '....kkkkkkk...kkkkkkk.......',
  '...kkkkkkkk...kkkkkkkk......',
];
const BOSS_ROWS_W = BOSS_ROWS.map((r, i) => {
  if (i === 27) return '.....kaaaak...kaaaak........';
  if (i === 28) return '....kaaaaak...kaaaaak.......';
  if (i === 29) return '...kkkkkkk.....kkkkkkk......';
  if (i === 30) return '..kkkkkkkk.....kkkkkkkk.....';
  return r;
});
const BOSS_ROWS_FIRE = BOSS_ROWS.map((r, i) => {
  if (i === 19) return 'kGWGk.kaaaaaaaaaaak.kGWGk...';
  if (i === 18) return 'kGyGk.kaaAAAAAAaaak.kGyGk...';
  if (i === 20) return 'kGyGk.kaaaaaaaaaaak.kGyGk...';
  return r;
});
const BOSS_PAL = {
  g: '#8a8f7a', G: '#565b4b', h: '#d8cf9a', k: '#101014', w: '#fff',
  R: '#ff2929', n: '#2c3019', a: '#6e7752', A: '#42492c', y: '#7df0ff', W: '#eaffff',
};
const BOSS_DEAD = [
  '............................',
  '......hh...kkkk...hh........',
  '...kkgggkkaaaaakkgggkk......',
  '..kgaaAAggRRgggAAaaagk......',
  '...kkgaaGGggGGGaagkk........',
  '.....kk..gggg..kk...........',
];

function buildDroneFrames() {
  const f = {
    stand: makeSprite(DRONE_ROWS, DRONE_PAL, 4),
    walk1: makeSprite(DRONE_ROWS, DRONE_PAL, 4),
    walk2: makeSprite(DRONE_ROWS_2, DRONE_PAL, 4),
    fire: makeSprite(DRONE_ROWS_FIRE, DRONE_PAL, 4),
    die: makeSprite(DRONE_DEAD, DRONE_PAL, 4),
    dead: makeSprite(DRONE_DEAD, DRONE_PAL, 4),
  };
  f.pain = tint(f.stand, '#ff4040', 0.45);
  f.flash = tint(f.stand, '#ffffff', 0.65);
  return f;
}
function buildBossFrames() {
  const f = {
    stand: makeSprite(BOSS_ROWS, BOSS_PAL, 6),
    walk1: makeSprite(BOSS_ROWS, BOSS_PAL, 6),
    walk2: makeSprite(BOSS_ROWS_W, BOSS_PAL, 6),
    fire: makeSprite(BOSS_ROWS_FIRE, BOSS_PAL, 6),
    die: makeSprite(BOSS_DEAD, BOSS_PAL, 6),
    dead: makeSprite(BOSS_DEAD, BOSS_PAL, 6),
  };
  f.pain = tint(f.stand, '#ff4040', 0.4);
  f.flash = tint(f.stand, '#ffffff', 0.6);
  return f;
}
const FRAMES = {
  grunt: troopFrames(TROOP_PAL, 4),
  heavy: troopFrames(ENF_PAL, 5),
  drone: buildDroneFrames(),
  boss: buildBossFrames(),
};

// ---- pickups
const MEDKIT = makeSprite([
  '.kkkkkkkkkk.',
  'kwwwwwwwwwwk',
  'kwwwwrrwwwwk',
  'kwwwwrrwwwwk',
  'kwwrrrrrrwwk',
  'kwwrrrrrrwwk',
  'kwwwwrrwwwwk',
  'kwwwwrrwwwwk',
  'kWWWWWWWWWWk',
  '.kkkkkkkkkk.',
], { w: '#e8e8e8', W: '#b8bcc4', r: '#d42222', k: '#2a2d33' }, 4);
const STIM = makeSprite([
  '.kkkkkk.',
  'kwwwwwwk',
  'kwwrrwwk',
  'kwrrrrwk',
  'kwwrrwwk',
  'kWWWWWWk',
  '.kkkkk..',
], { w: '#e8e8e8', W: '#b8bcc4', r: '#d42222', k: '#2a2d33' }, 4);
const ARMOR = makeSprite([
  '.kbb....bbk.',
  'kbbbbkkbbbbk',
  'kbBBbbbbBBbk',
  'kbbbbbbbbbbk',
  'kblbBBBBblbk',
  '.kbbbbbbbbk.',
  '.kbbbbbbbbk.',
  '..kbbbbbbk..',
  '...kkkkkk...',
], { b: '#3a66d4', B: '#24407f', l: '#6f94ea', k: '#181c28' }, 4);
const AMMO_CLIP = makeSprite([
  '.kkkkk.',
  'kgggggk',
  'kglgggk',
  'kgggggk',
  'kyyyyyk',
  'kyYyyyk',
  'kgggggk',
  '.kkkkk.',
], { k: '#23262e', g: '#5d6470', l: '#8a93a3', y: '#caa017', Y: '#ecd060' }, 4);
const SHELL_BOX = makeSprite([
  'kkkkkkkkkkkk',
  'krrrrrrrrrrk',
  'krYyyYyyYyrk',
  'krYyyYyyYyrk',
  'krrrrrrrrrrk',
  'kRRRRRRRRRRk',
  'kkkkkkkkkkkk',
], { k: '#33241a', r: '#9c2a1c', R: '#641a10', y: '#e0b32e', Y: '#f6d468' }, 4);
const SHOTGUN_PICK = makeSprite([
  '..................',
  'kkkkkkkkkkkggggggk',
  'kssssssssssgglgggk',
  'kkkkkkkkk.kgggggk.',
  '...kkkk....ggg....',
  '....kk............',
], { k: '#2a2d35', s: '#777f8d', g: '#6e4a2a', l: '#9a6c3e' }, 4);
const CHAIN_PICK = makeSprite([
  '.kkkkkkkkkkkk.....',
  'kssksskssksskgg...',
  'kssksskssksskggg..',
  'kssksskssksskggg..',
  '.kkkkkkkkkkkk.....',
  '.....kyyk.........',
  '.....kyyk.........',
], { k: '#23262e', s: '#6b7382', g: '#5d3a20', y: '#caa017' }, 4);
function keycard(col, dark) {
  return makeSprite([
    'kkkkkkkk',
    'kccccccK',
    'kccccccK',
    'kwwwwwwK',
    'kccccccK',
    'kccCCccK',
    'kccCCccK',
    'kccccccK',
    'kccccccK',
    'kccccccK',
    'kKKKKKKK',
  ], { c: col, C: dark, K: dark, w: '#e8e8e8', k: '#1a1c22' }, 3);
}
const KEY_RED = keycard('#d42222', '#7a1010');
const KEY_BLUE = keycard('#2b58c2', '#16306e');
const BOLT = makeSprite([
  '.yy.', 'yWWy', 'yWWy', '.yy.',
], { y: '#ffd23e', W: '#fff7c0' }, 4);
const BOLT_G = makeSprite([
  '.gg.', 'gWWg', 'gWWg', '.gg.',
], { g: '#41ff7a', W: '#e0fff0' }, 4);

function particleDot(color, size) {
  const c = mkCanvas(size || 4, size || 4);
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
const P_BLOOD = particleDot('#b01818');
const P_BLOOD2 = particleDot('#7a0e0e');
const P_CHUNK = particleDot('#8a1414', 6);
const P_SPARK = particleDot('#ffe9a0');
const P_GREEN = particleDot('#41ff7a');

// ---- mugshot face (24x24) — flattop, shades, square jaw. Original design.
const FACE_BASE = [
  '......kkkkkkkkkkkk......',
  '....kkYYYYYYYYYYYYkk....',
  '...kYYYYYYYYYYYYYYYYk...',
  '...kYYYYYYYYYYYYYYYYk...',
  '...kYffffffffffffffYk...',
  '...kffffffffffffffffk...',
  '...kffffffffffffffffk...',
  '...kkkkkkkkkkkkkkkkkk...',
  '...kkkwkkkkkkkkkwkkkk...',
  '...kkkkkkkkkkkkkkkkkk...',
  '...kffffffffffffffffk...',
  '...kfFffffFnnFffffFfk...',
  '...kffffffFnnFffffffk...',
  '...kfFfffffffffffFffk...',
  '....kffffffffffffffk....',
  '....kffMMMMMMMMMMfk.....',
  '.....kffffffffffffk.....',
  '.....kkffffffffffkk.....',
  '.......kffffffffk.......',
  '........kkkkkkkk........',
  '.......kfffffffffk......',
  '....kkkfffffffffffkkk...',
  '..kkbbbffffffffffbbbkk..',
  '.kbbbbbbffffffffbbbbbbk.',
];
const FACE_PAL = {
  k: '#14141a', Y: '#e0c23a', f: '#d9a070', F: '#b27a4e',
  n: '#c08a5c', w: '#cfd6e2', M: '#7a4040', b: '#a82c2c',
};
function buildFace(tier, expr) {
  const c = mkCanvas(24 * 4, 24 * 4), g = c.getContext('2d');
  g.drawImage(makeSprite(FACE_BASE, FACE_PAL, 4), 0, 0);
  const px = (x, y, w2, h2, col) => { g.fillStyle = col; g.fillRect(x * 4, y * 4, w2 * 4, h2 * 4); };
  // mouth region (rows 15-16, cols 7-16)
  if (expr === 'grin') {
    px(7, 15, 10, 1, '#5c2c2c'); px(8, 15, 8, 1, '#e8e8ee'); px(7, 16, 10, 1, '#5c2c2c');
  } else if (expr === 'pain') {
    px(8, 14, 8, 1, '#5c2c2c'); px(8, 15, 8, 2, '#3c1414'); px(9, 16, 6, 1, '#5c2c2c');
  } else {
    px(7, 15, 10, 1, '#7a4040');
  }
  // damage
  srand(900 + tier * 7);
  const cuts = tier === 1 ? 5 : tier === 2 ? 12 : 0;
  for (let i = 0; i < cuts; i++) {
    const x = 5 + Math.floor(rnd() * 14), y = 4 + Math.floor(rnd() * 14);
    px(x, y, 1, 1, 'rgba(170,20,20,0.9)');
    if (tier === 2 && rnd() > 0.5) px(x, y + 1, 1, 1 + Math.floor(rnd() * 2), 'rgba(130,12,12,0.8)');
  }
  if (tier === 2) { px(4, 4, 2, 1, '#a01414'); px(17, 10, 2, 2, '#a01414'); px(10, 19, 4, 1, '#7a0e0e'); }
  return c;
}
const FACES = {};
for (let tier = 0; tier < 3; tier++)
  for (const expr of ['idle', 'grin', 'pain'])
    FACES[tier + expr] = buildFace(tier, expr);

// ================================================================ VIEWMODELS
const SKIN = '#d8a878', SKIN_D = '#a87c50', MET = '#4a505c', MET_D = '#2c3038', MET_L = '#6e7785';
function gunCanvas() { return mkCanvas(240, 170); }
function hand(g, x, y, w2, h2) {
  g.fillStyle = SKIN; g.fillRect(x, y, w2, h2);
  g.fillStyle = SKIN_D; g.fillRect(x, y, 4, h2); g.fillRect(x, y + h2 - 8, w2, 8);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, y, w2 - 8, 3);
}
function drawPistol(slide) {
  const c = gunCanvas(), g = c.getContext('2d');
  hand(g, 100, 92 + slide, 44, 78);                       // grip hand
  g.fillStyle = MET_D; g.fillRect(106, 74 + slide, 32, 36); // grip
  g.fillStyle = '#3a2c1e'; g.fillRect(110, 80 + slide, 24, 26);
  g.fillStyle = MET; g.fillRect(88, 34 + slide, 68, 42);    // frame
  g.fillStyle = MET_L; g.fillRect(88, 34 + slide, 68, 12);  // slide top
  g.fillStyle = MET_D; g.fillRect(88, 64 + slide, 68, 6);
  g.fillStyle = MET_D; g.fillRect(112, 12 + slide, 20, 24); // barrel
  g.fillStyle = '#101218'; g.fillRect(116, 6 + slide, 12, 12);
  g.fillStyle = MET_L; g.fillRect(112, 12 + slide, 3, 24);
  g.fillStyle = '#161a20'; g.fillRect(96, 40 + slide, 8, 4); // ejection hint
  hand(g, 84, 100 + slide, 22, 46);                        // support fingers
  return c;
}
function drawShotgun(pump, recoil) {
  const c = gunCanvas(), g = c.getContext('2d');
  const y0 = recoil;
  g.fillStyle = MET_D; g.fillRect(88, y0, 66, 60);          // receiver/barrels
  g.fillStyle = MET; g.fillRect(94, y0, 54, 54);
  g.fillStyle = MET_L; g.fillRect(94, y0, 54, 8);
  g.fillStyle = '#101218'; g.fillRect(102, y0, 16, 14); g.fillRect(124, y0, 16, 14); // double bore
  g.fillStyle = '#2c3038'; g.fillRect(104, y0 + 2, 12, 10); g.fillRect(126, y0 + 2, 12, 10);
  g.fillStyle = '#6e4a2a'; g.fillRect(90, y0 + 62 + pump, 62, 30); // pump forend
  g.fillStyle = '#553a20'; g.fillRect(90, y0 + 84 + pump, 62, 8);
  g.fillStyle = '#8a6038'; g.fillRect(90, y0 + 62 + pump, 62, 5);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#472f18'; g.fillRect(94 + i * 15, y0 + 68 + pump, 3, 18); }
  hand(g, 76, y0 + 64 + pump, 30, 58);                     // pump hand
  hand(g, 138, y0 + 96, 30, 70);                           // trigger hand
  g.fillStyle = '#6e4a2a'; g.fillRect(110, y0 + 96, 36, 74); // stock
  g.fillStyle = '#553a20'; g.fillRect(110, y0 + 96, 8, 74);
  return c;
}
function drawRipper(rot, hot) {
  const c = gunCanvas(), g = c.getContext('2d');
  g.fillStyle = MET_D; g.fillRect(56, 36, 132, 64);
  g.fillStyle = MET; g.fillRect(62, 40, 120, 54);
  g.fillStyle = MET_L; g.fillRect(62, 40, 120, 8);
  // rotating barrel cluster: 3 bores around center, positions by rot
  const cx = 122, cyB = 22;
  for (let i = 0; i < 3; i++) {
    const a = rot + i * (Math.PI * 2 / 3);
    const bx = cx + Math.cos(a) * 17, by = cyB + Math.sin(a) * 9;
    g.fillStyle = '#101218'; g.fillRect(bx - 8, by - 8, 16, 16);
    g.fillStyle = hot && i === 0 ? '#8a4020' : '#2c3038';
    g.fillRect(bx - 6, by - 6, 12, 12);
    g.fillStyle = MET_L; g.fillRect(bx - 6, by - 6, 3, 12);
  }
  g.fillStyle = MET_D; g.fillRect(96, 30, 52, 8);
  g.fillStyle = '#caa017'; g.fillRect(76, 70, 52, 18);     // ammo feed
  g.fillStyle = '#8a6c10'; g.fillRect(76, 82, 52, 6);
  for (let i = 0; i < 5; i++) { g.fillStyle = '#ecd060'; g.fillRect(80 + i * 10, 73, 4, 8); }
  hand(g, 48, 96, 34, 70);
  hand(g, 160, 96, 34, 70);
  g.fillStyle = MET_D; g.fillRect(82, 100, 80, 26);        // underbody
  return c;
}
const GUNS = {
  pistol: { idle: drawPistol(0), fire: drawPistol(14) },
  shotgun: { idle: drawShotgun(0, 0), fire: drawShotgun(0, 16), pump: drawShotgun(22, 4) },
  chain: { idle: drawRipper(0, false), f1: drawRipper(0.7, true), f2: drawRipper(1.75, true), f3: drawRipper(2.8, true) },
};
function flashCanvas(size) {
  const c = mkCanvas(size, size), g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.fillStyle = '#ffd23e';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, r = i % 2 ? size * 0.2 : size * 0.48;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  g.fillStyle = '#fff7c0'; g.beginPath(); g.arc(0, 0, size * 0.15, 0, 7); g.fill();
  return c;
}
const FLASH_SM = flashCanvas(80), FLASH_LG = flashCanvas(130);

// ================================================================ AUDIO
let AC = null, noiseBuf = null, musicOn = true, voiceOn = true, musicTimer = null;
let ambGain = null, ambFilter = null;
function audioInit() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // ambient bed: looping noise through lowpass
  const amb = AC.createBufferSource(); amb.buffer = noiseBuf; amb.loop = true;
  ambFilter = AC.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 90;
  ambGain = AC.createGain(); ambGain.gain.value = 0;
  amb.connect(ambFilter); ambFilter.connect(ambGain); ambGain.connect(AC.destination);
  amb.start();
  startMusic();
}
function setAmbience(levelIdx) {
  if (!ambGain) return;
  const cfg = [[120, 0.045], [220, 0.06], [70, 0.07]][levelIdx] || [100, 0.04];
  ambFilter.frequency.setTargetAtTime(cfg[0], AC.currentTime, 0.5);
  ambGain.gain.setTargetAtTime(cfg[1], AC.currentTime, 0.5);
}
function tone(freq, dur, type, gain, slideTo, t0) {
  if (!AC) return;
  const t = AC.currentTime + (t0 || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  g.gain.setValueAtTime(gain || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, cutoff, gain, t0, type) {
  if (!AC) return;
  const t = AC.currentTime + (t0 || 0);
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = AC.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = cutoff;
  const g = AC.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(AC.destination);
  src.start(t); src.stop(t + dur + 0.05);
}
// pig-cop style squeal: descending saw with wobble, bandpassed noise on top
function squeal(base, dur, gain) {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 1.6, t + dur * 0.25);
  o.frequency.exponentialRampToValueAtTime(base * 0.4, t + dur);
  const lfo = AC.createOscillator(), lg = AC.createGain();
  lfo.frequency.value = 26; lg.gain.value = base * 0.22;
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur);
  noise(dur * 0.7, 2200, gain * 0.4, 0, 'bandpass');
}
let _deepVoice = null, _voicePicked = false;
function pickDeepVoice(ss) {
  if (_voicePicked) return _deepVoice;
  const voices = ss.getVoices();
  if (!voices || !voices.length) return null;   // not loaded yet; try again next call
  _voicePicked = true;
  // prefer an explicitly deep/male English voice; fall back to any male, then any English
  const en = voices.filter(v => /en[-_]/i.test(v.lang) || /english/i.test(v.name));
  const pool = en.length ? en : voices;
  const byName = re => pool.find(v => re.test(v.name));
  _deepVoice =
    byName(/daniel|arthur|fred|albert|bruce|reed|rocko|google uk english male|microsoft (david|guy|mark)/i) ||
    byName(/\bmale\b/i) ||
    pool.find(v => v.default) || pool[0] || null;
  return _deepVoice;
}
function say(text) {
  if (!voiceOn) return;
  try {
    const ss = window.speechSynthesis;
    if (!ss || typeof window.SpeechSynthesisUtterance !== 'function') return;
    ss.cancel();
    const u = new window.SpeechSynthesisUtterance(text.toLowerCase().replace(/[^a-z0-9 ,.'!?-]/g, ''));
    const v = pickDeepVoice(ss);
    if (v) u.voice = v;
    u.pitch = 0; u.rate = 0.86; u.volume = 0.95;   // floor pitch + slower = deeper, gravellier growl
    ss.speak(u);
  } catch (e) { /* voice is a bonus, never fatal */ }
}
// voices load asynchronously in some browsers — re-pick once they arrive
if (typeof window !== 'undefined' && window.speechSynthesis) {
  try { window.speechSynthesis.onvoiceschanged = () => { _voicePicked = false; }; } catch (e) {}
}
const SFX = {
  pistol() { noise(0.1, 2800, 0.5); noise(0.05, 6000, 0.25, 0, 'highpass'); tone(150, 0.06, 'square', 0.16, 45); tone(2400, 0.03, 'sine', 0.05, null, 0.22); },
  shotgun() {
    noise(0.45, 1600, 0.85); noise(0.2, 420, 0.55); tone(85, 0.22, 'sawtooth', 0.3, 28);
    // pump-action chk-chk
    noise(0.05, 1400, 0.3, 0.42); tone(420, 0.04, 'square', 0.1, 280, 0.42);
    noise(0.06, 1000, 0.35, 0.56); tone(300, 0.05, 'square', 0.12, 180, 0.56);
  },
  chain() { noise(0.06, 3400, 0.4); tone(190 + Math.random() * 90, 0.04, 'square', 0.1, 60); },
  dryfire() { tone(900, 0.04, 'square', 0.1, 500); },
  step() { noise(0.05, 600, 0.07); },
  enemyShoot() { noise(0.14, 1700, 0.26); tone(140, 0.08, 'square', 0.11, 45); },
  plasma() { tone(820, 0.22, 'sawtooth', 0.13, 190); tone(1640, 0.12, 'sine', 0.05, 400); },
  hurt() { tone(240, 0.24, 'sawtooth', 0.32, 60); noise(0.16, 800, 0.2); },
  alert_grunt() { squeal(520, 0.35, 0.2); },
  alert_heavy() { squeal(300, 0.5, 0.24); },
  alert_drone() { tone(1100, 0.16, 'square', 0.12, 1700); tone(1700, 0.1, 'square', 0.09, 1100, 0.14); },
  alert_boss() { tone(70, 0.9, 'sawtooth', 0.32, 45); tone(110, 0.9, 'sawtooth', 0.22, 60); noise(0.8, 350, 0.3); },
  pain_grunt() { squeal(700, 0.18, 0.16); },
  pain_heavy() { squeal(380, 0.22, 0.2); },
  pain_drone() { tone(1400, 0.08, 'square', 0.12, 900); },
  pain_boss() { tone(120, 0.3, 'sawtooth', 0.25, 70); },
  die_grunt() { squeal(800, 0.55, 0.26); noise(0.4, 700, 0.3, 0.1); tone(110, 0.35, 'square', 0.12, 35, 0.15); },
  die_heavy() { squeal(420, 0.7, 0.3); noise(0.5, 500, 0.35, 0.15); },
  die_drone() { tone(1600, 0.25, 'square', 0.2, 80); noise(0.2, 5000, 0.3, 0, 'highpass'); noise(0.35, 900, 0.4, 0.12); },
  die_boss() { tone(110, 1.4, 'sawtooth', 0.38, 18); tone(165, 1.2, 'sawtooth', 0.25, 25); noise(1.1, 420, 0.45); noise(0.7, 1000, 0.3, 0.4); },
  pickup() { tone(660, 0.07, 'square', 0.14, 700); tone(990, 0.09, 'square', 0.13, 1050, 0.07); },
  weapon() { noise(0.05, 1600, 0.3); tone(330, 0.05, 'square', 0.12, null, 0.0); noise(0.06, 1100, 0.35, 0.13); tone(495, 0.08, 'square', 0.14, null, 0.13); },
  key() { tone(523, 0.1, 'square', 0.15); tone(659, 0.1, 'square', 0.15, null, 0.1); tone(784, 0.18, 'square', 0.15, null, 0.2); },
  door() { // pneumatic hiss + servo + clunk
    noise(0.5, 900, 0.18, 0, 'bandpass'); noise(0.4, 2600, 0.1, 0.05, 'highpass');
    tone(60, 0.45, 'sawtooth', 0.1, 95); tone(48, 0.1, 'square', 0.2, 30, 0.5);
  },
  locked() { tone(130, 0.12, 'square', 0.22); tone(98, 0.2, 'square', 0.22, null, 0.13); },
  exit() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.18, null, i * 0.09)); },
  die() { tone(200, 1.0, 'sawtooth', 0.32, 35); noise(0.9, 450, 0.3); },
};
// driving grunge loop: kick/snare/hat + bass riff + chord stabs
const RIFF = [82.41, 82.41, 0, 82.41, 98, 0, 82.41, 0, 110, 0, 98, 82.41, 0, 123.47, 98, 0];
let musStep = 0, musNext = 0, musBar = 0;
function stab(freqs, t0) {
  freqs.forEach(f => {
    tone(f, 0.34, 'sawtooth', 0.035, null, t0);
    tone(f * 1.007, 0.34, 'sawtooth', 0.03, null, t0);
  });
}
function startMusic() {
  if (musicTimer) return;
  musNext = AC.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!AC) return;
    if (musicOn) {
      while (musNext < AC.currentTime + 0.14) {
        const s = musStep % 16, t0 = Math.max(0, musNext - AC.currentTime);
        if (s === 0) musBar++;
        if (s % 4 === 0) tone(150, 0.13, 'sine', 0.32, 36, t0);                  // kick
        if (s === 4 || s === 12) { noise(0.09, 1800, 0.16, t0, 'bandpass'); tone(190, 0.07, 'triangle', 0.1, 120, t0); } // snare
        noise(0.025, 6500, s % 2 ? 0.045 : 0.028, t0, 'highpass');               // hats
        const n = RIFF[s];
        if (n) { tone(n, 0.12, 'square', 0.065, null, t0); tone(n * 2.01, 0.1, 'sawtooth', 0.028, null, t0); }
        if (s === 0 && musBar % 2 === 0) stab(musBar % 4 === 0 ? [82.41, 123.47, 164.8] : [98, 146.8, 196], t0);
        musNext += 0.135; musStep++;
      }
    } else musNext = AC.currentTime + 0.1;
    // sparse per-level ambient events
    if (state === 'play' && Math.random() < 0.011) ambientEvent();
  }, 40);
}
function ambientEvent() {
  if (curLevel === 0) {
    if (Math.random() < 0.6) tone(46, 1.4, 'sine', 0.07, 30);                    // distant boom
    else { tone(620, 0.7, 'sine', 0.018, 880); tone(880, 0.7, 'sine', 0.015, 620, 0.7); } // far siren
  } else if (curLevel === 1) {
    tone(1300 + Math.random() * 600, 0.05, 'sine', 0.05, 320);                   // drip
    if (Math.random() < 0.3) noise(0.7, 300, 0.05);                              // gurgle
  } else {
    tone(52, 0.7, 'sine', 0.07, 44);                                             // ship throb
    if (Math.random() < 0.25) tone(1900, 0.3, 'sine', 0.02, 2400);               // alien chitter
  }
}

// ================================================================ LEVELS
const LEVELS = [
  {
    name: 'STREET JUSTICE', sub: 'LEVEL 1',
    brief: 'The aliens torched the strip. Somebody has to clean up,\nand the city sure isn\'t paying a janitor.',
    floorTex: FLOOR_ASPHALT, ceilTex: null, sky: true,
    angle: 0,
    map: [
      '11111111111111111111111111',
      '1P       1       1      h1',
      '1   m    1   e   1   e   1',
      '1        D       D       1',
      '1        1       1   m   1',
      '1111D11111       1111D1111',
      '1      a 1       1       1',
      '1  e     1  e e  1   e   1',
      '1        D       D       1',
      '1  S     1       1  s    1',
      '1        1       1       1',
      '1111D11111111D1111111D1111',
      '1  e         m        e  1',
      '1      h    e     e      1',
      '1  s          e      X   1',
      '11111111111111111111111111',
    ],
  },
  {
    name: 'SEWER PURGE', sub: 'LEVEL 2',
    brief: 'They crawled into the sewers. Fine by me —\nsaves the taxpayers a funeral.',
    floorTex: FLOOR_SLUDGE, ceilTex: CEIL_ROCK, sky: false,
    angle: 0,
    map: [
      '55555555555555555555555555',
      '5P      5        5      h5',
      '5       5   o    5  e    5',
      '5  m    D        D       5',
      '5       5        5   m   5',
      '5555D5555    e   5555D5555',
      '5  e    5        5  o    5',
      '5       5555D55555       5',
      '5  C    5   e    5  e    5',
      '5       D        D       5',
      '5   h   5   o    5   m   5',
      '5555D55555555D555555555555',
      '5      e         3       5',
      '5          o     3  o    5',
      '5   E            R       5',
      '5  r             3   h   5',
      '5       s      m 3   X   5',
      '55555555555555555555555555',
    ],
  },
  {
    name: 'MOTHERSHIP', sub: 'LEVEL 3',
    brief: 'Beamed aboard their ship. Smells like roadkill\nand bad decisions. Time to end this.',
    floorTex: FLOOR_DECK, ceilTex: CEIL_ALIEN, sky: false,
    angle: 0,
    map: [
      '44444444444444444444444444',
      '4          X             4',
      '4   h                h   4',
      '4     E    O             4',
      '4  m                  m  4',
      '4   o                    4',
      '4                        4',
      '444444444444B4444444444444',
      '4    o     4 4    E      4',
      '4          4 4           4',
      '4  m       D D    b  h   4',
      '4   e      4 4   o       4',
      '4          4 4           4',
      '444444444444 4444444444444',
      '4        e               4',
      '4  6    e    6    e    6 4',
      '4          C             4',
      '4 P        h   m    s    4',
      '4    a              +    4',
      '44444444444444444444444444',
    ],
  },
  {
    name: 'REACTOR CORE', sub: 'LEVEL 4',
    brief: 'Found their power plant humming under the city.\nLet\'s trip the breaker — permanently.',
    floorTex: FLOOR_DECK, ceilTex: CEIL_ROCK, sky: false,
    angle: 0,
    map: [
      '22222222222222222222222222',
      '2P  e          o   h     2',
      '2           +   E   e    2',
      '2   4   3         3      2',
      '2 m        o 4         a 2',
      '2   E                    2',
      '2                     m  2',
      '2     2       e     3    2',
      '2                  o     2',
      '2  e             E    h  2',
      '2          e             2',
      '2 m  3          4        2',
      '2        o  O            2',
      '2 h   e              22222',
      '2         2   s      R  X2',
      '2  r                 22222',
      '2                        2',
      '22222222222222222222222222',
    ],
  },
  {
    name: 'TOXIC WARRENS', sub: 'LEVEL 5',
    brief: 'Toxic warrens, wall to wall with hostiles.\nI\'m the cleanup crew — and I bill by the body.',
    floorTex: FLOOR_SLUDGE, ceilTex: CEIL_ROCK, sky: false,
    angle: 0,
    map: [
      '55555555555555555555555555',
      '5P         h 5        o  5',
      '5      e  o  5  e  E   h 5',
      '5   3        5   6       5',
      '5            5           5',
      '5   E    6   5       3   5',
      '5  e         5 e         5',
      '5            5           5',
      '5     +   e  5   6     e 5',
      '5 m 6        B E    O   X5',
      '5            5           5',
      '5     e      5       6   5',
      '5        3   5  e   o    5',
      '5            5 m         5',
      '5            5    3   h  5',
      '5     6      5           5',
      '5 b    o  s  5 o   E 6   5',
      '5            5  a     s  5',
      '55555555555555555555555555',
    ],
  },
  {
    name: 'HIVE THRONE', sub: 'LEVEL 6',
    brief: 'The hive throne — two big uglies on the dais.\nNobody leaves until the room is quiet.',
    floorTex: FLOOR_DECK, ceilTex: CEIL_ALIEN, sky: false,
    angle: 0,
    map: [
      '66666666666666666666666666',
      '6P       6       6       6',
      '6 h   e  6 e  E  6     a 6',
      '6        6   4   6 e     6',
      '6   4  o 6       6   4   6',
      '6     E  6  o    6       6',
      '6        6     m 6 o O   6',
      '6        6       6       6',
      '6   o    6h  3   6       6',
      '6        6       B E 3mo 6',
      '6   3    R       6      X6',
      '6      m 6     e 6       6',
      '6        6h      6 s O   6',
      '6  e     6  4    6  4  E 6',
      '6        6 o     6       6',
      '6    4   6       6       6',
      '6        6 e 3   6   3 h 6',
      '6     e  6       6 e     6',
      '6 r+     6 s    b6 h     6',
      '66666666666666666666666666',
    ],
  },
];
// extract floor/ceil pixel data once
LEVELS.forEach(L => {
  L._fd = dataOf(L.floorTex);
  L._cd = L.ceilTex ? dataOf(L.ceilTex) : null;
});

// ================================================================ DEFS
const ETYPES = {
  grunt: { hp: 30, speed: 1.7, dmg: [4, 11], rate: 1.4, range: 9, hitR: 0.36, scale: 0.62, lift: 0, proj: null, painCh: 0.6, frames: 'grunt', name: 'TROOPER' },
  heavy: { hp: 90, speed: 1.25, dmg: [8, 16], rate: 1.7, range: 11, hitR: 0.42, scale: 0.74, lift: 0, proj: null, painCh: 0.35, frames: 'heavy', name: 'ENFORCER' },
  drone: { hp: 22, speed: 2.4, dmg: [6, 12], rate: 2.0, range: 12, hitR: 0.32, scale: 0.46, lift: 0.32, proj: 'bolt', painCh: 0.5, frames: 'drone', name: 'DRONE' },
  boss:  { hp: 450, speed: 0.95, dmg: [9, 17], rate: 1.9, range: 16, hitR: 0.62, scale: 1.0, lift: 0, proj: 'spread', painCh: 0.08, frames: 'boss', name: 'OVERLORD' },
};
const ECHARS = { e: 'grunt', E: 'heavy', o: 'drone', O: 'boss' };

const ITYPES = {
  h: { c: MEDKIT, scale: 0.2, msg: 'MEDKIT +25', sfx: 'pickup', apply: p => p.hp < 100 && (p.hp = Math.min(100, p.hp + 25), true) },
  '+': { c: STIM, scale: 0.13, msg: 'STIMPACK +10', sfx: 'pickup', apply: p => p.hp < 100 && (p.hp = Math.min(100, p.hp + 10), true) },
  a: { c: ARMOR, scale: 0.2, msg: 'COMBAT ARMOR', sfx: 'pickup', apply: p => p.armor < 100 && (p.armor = Math.min(100, p.armor + 50), true) },
  m: { c: AMMO_CLIP, scale: 0.15, msg: 'BULLETS +20', sfx: 'pickup', apply: p => p.ammo.bullets < 240 && (p.ammo.bullets = Math.min(240, p.ammo.bullets + 20), true) },
  s: { c: SHELL_BOX, scale: 0.14, msg: 'SHELLS +8', sfx: 'pickup', apply: p => p.ammo.shells < 50 && (p.ammo.shells = Math.min(50, p.ammo.shells + 8), true) },
  S: { c: SHOTGUN_PICK, scale: 0.16, msg: 'GOT THE SHOTGUN!', sfx: 'weapon', grin: true, apply: p => { p.has.shotgun = true; p.ammo.shells = Math.min(50, p.ammo.shells + 8); p.weapon = 'shotgun'; return true; } },
  C: { c: CHAIN_PICK, scale: 0.16, msg: 'GOT THE RIPPER!', sfx: 'weapon', grin: true, apply: p => { p.has.chain = true; p.ammo.bullets = Math.min(240, p.ammo.bullets + 50); p.weapon = 'chain'; return true; } },
  r: { c: KEY_RED, scale: 0.15, msg: 'RED KEYCARD', sfx: 'key', grin: true, apply: p => { p.keys.red = true; return true; } },
  b: { c: KEY_BLUE, scale: 0.15, msg: 'BLUE KEYCARD', sfx: 'key', grin: true, apply: p => { p.keys.blue = true; return true; } },
};

const WEAPONS = {
  pistol: { name: 'PISTOL', rate: 0.32, dmg: [10, 16], pellets: 1, spread: 0.014, ammo: null, sfx: 'pistol', kick: 5, flash: FLASH_SM },
  shotgun: { name: 'SHOTGUN', rate: 0.95, dmg: [6, 11], pellets: 7, spread: 0.075, ammo: 'shells', sfx: 'shotgun', kick: 13, flash: FLASH_LG },
  chain: { name: 'RIPPER', rate: 0.105, dmg: [7, 12], pellets: 1, spread: 0.032, ammo: 'bullets', sfx: 'chain', kick: 3, flash: FLASH_SM },
};

const QUIPS = [
  'TIME TO TAKE OUT THE TRASH.',
  'UGLY AND SLOW. TOUGH BREAK.',
  'EARTH IS CLOSED, FREAKSHOW.',
  'THAT ALL YOU GOT?',
  'CHEW ON THIS.',
  'MY BOOTS STAY CLEAN. YOU DON\'T.',
  'NOT EVEN A WORKOUT.',
  'WHO\'S NEXT?',
  'I\'VE SEEN SCARIER PLUMBING.',
];

// ================================================================ STATE
let state = 'title';
let curLevel = 0;
let grid = [], mapW = 0, mapH = 0;
let doors = new Map();
let enemies = [], items = [], projectiles = [], particles = [];
let totalKills = 0, kills = 0, levelTime = 0, totalScore = 0;
const MAX_LIVES = 3;
let lives = MAX_LIVES;
let msg = '', msgT = 0, quip = '', quipT = 0;
let dmgFlash = 0, pickFlash = 0, shake = 0;
let introT = 0, deadT = 0;
let faceExpr = 'idle', faceT = 0;
let paused = false;
let zBuffer = new Float32Array(COLS);
let snapshot = null;
let bossIntroDone = false;

const player = {
  x: 2, y: 2, a: 0,
  hp: 100, armor: 0,
  weapon: 'pistol',
  has: { pistol: true, shotgun: false, chain: false },
  ammo: { bullets: 48, shells: 0 },
  keys: { red: false, blue: false },
  cool: 0, muzzle: 0, bobT: 0, moving: false, stepPh: 0, sway: 0,
};
function dirX() { return Math.cos(player.a); }
function dirY() { return Math.sin(player.a); }
function setFace(expr, t) { faceExpr = expr; faceT = t; }

function cellAt(x, y) {
  if (x < 0 || y < 0 || x >= mapW || y >= mapH) return '1';
  return grid[y][x];
}
function doorAt(x, y) { return doors.get(x + ',' + y); }
function isSolidCell(x, y) {
  const ch = cellAt(x, y);
  if (DOOR_CHARS.includes(ch)) {
    const d = doorAt(x, y);
    return !d || d.open < 0.85;
  }
  return WALL_CHARS.includes(ch);
}
function blocked(x, y, r) {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
      if (isSolidCell(cx, cy)) return true;
  return false;
}
function moveWithCollide(o, dx, dy, r) {
  if (!blocked(o.x + dx, o.y, r)) o.x += dx;
  if (!blocked(o.x, o.y + dy, r)) o.y += dy;
}
function castRayDist(px, py, dx, dy, maxD) {
  maxD = maxD || 40;
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
  if (dy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
  for (let i = 0; i < 128; i++) {
    let t;
    if (sdx < sdy) { t = sdx; sdx += ddx; mx += sx; } else { t = sdy; sdy += ddy; my += sy; }
    if (t > maxD) return maxD;
    const ch = cellAt(mx, my);
    if (DOOR_CHARS.includes(ch)) {
      const d = doorAt(mx, my);
      if (!d || d.open < 0.6) return t;
    } else if (WALL_CHARS.includes(ch)) return t;
  }
  return maxD;
}
function hasLOS(x1, y1, x2, y2) {
  const d = dist2(x1, y1, x2, y2);
  if (d < 0.001) return true;
  const dx = (x2 - x1) / d, dy = (y2 - y1) / d;
  return castRayDist(x1, y1, dx, dy, d + 1) > d - 0.15;
}

// ---------------------------------------------------------------- level load
function startLevel(i, keepStats) {
  curLevel = i;
  const L = LEVELS[i];
  mapH = L.map.length;
  mapW = 0; L.map.forEach(r => mapW = Math.max(mapW, r.length));
  grid = []; doors = new Map();
  enemies = []; items = []; projectiles = []; particles = [];
  kills = 0; levelTime = 0; bossIntroDone = false;
  msg = ''; msgT = 0; quip = ''; quipT = 0; dmgFlash = 0; shake = 0;
  for (let y = 0; y < mapH; y++) {
    const row = (L.map[y] || '').padEnd(mapW, L.map[0][0]);
    const out = [];
    for (let x = 0; x < mapW; x++) {
      let ch = row[x];
      if (ch === 'P') {
        player.x = x + 0.5; player.y = y + 0.5; player.a = L.angle;
        ch = ' ';
      } else if (ECHARS[ch]) {
        const t = ETYPES[ECHARS[ch]];
        enemies.push({
          type: ECHARS[ch], t,
          x: x + 0.5, y: y + 0.5,
          hp: t.hp, alive: true, alert: false,
          cool: rand(0.4, 1.4), windup: 0, pain: 0, flash: 0, dieT: 0,
          anim: rand(0, 10), seed: Math.random() * 10,
          avoidT: 0, avoidDir: 1,
        });
        ch = ' ';
      } else if (ITYPES[ch]) {
        items.push({ k: ch, x: x + 0.5, y: y + 0.5, taken: false });
        ch = ' ';
      } else if (DOOR_CHARS.includes(ch)) {
        doors.set(x + ',' + y, {
          open: 0, state: 'closed', timer: 0,
          locked: ch === 'R' ? 'red' : ch === 'B' ? 'blue' : null,
          x, y,
        });
      } else if (!WALL_CHARS.includes(ch)) ch = ' ';
      out.push(ch);
    }
    grid.push(out);
  }
  totalKills = enemies.length;
  if (!keepStats) {
    // fresh, fair start each level: full heal + a small ammo resupply so a rough
    // previous level doesn't doom every retry (weapons & armor still carry over).
    player.hp = 100;
    player.ammo.bullets = Math.min(240, player.ammo.bullets + 20);
    if (player.has.shotgun) player.ammo.shells = Math.min(50, player.ammo.shells + 6);
    snapshot = {
      hp: player.hp, armor: player.armor, weapon: player.weapon,
      has: { ...player.has }, ammo: { ...player.ammo },
    };
  }
  player.keys.red = false; player.keys.blue = false;
  player.cool = 0; player.muzzle = 0;
  introT = 3.2;
  setAmbience(i);
  state = 'play';
}
function restartLevel() {
  if (snapshot) {
    player.hp = snapshot.hp; player.armor = snapshot.armor;
    player.weapon = snapshot.weapon;
    player.has = { ...snapshot.has }; player.ammo = { ...snapshot.ammo };
  }
  startLevel(curLevel, true);
}

// ---------------------------------------------------------------- input
const keys = {};
let firing = false;
let touchUseT = 0;   // throttle for auto-"use" while the touch FIRE button is held
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
let touchUI = null;
let tjX = 0, tjY = 0, tjOn = false;   // analog joystick: turn (x), forward (y)
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyM') { musicOn = !musicOn; setMsg(musicOn ? 'MUSIC ON' : 'MUSIC OFF'); }
  if (e.code === 'KeyV') { voiceOn = !voiceOn; setMsg(voiceOn ? 'VOICE ON' : 'VOICE OFF'); }
  if (state === 'play') {
    if (e.code === 'Digit1') switchWeapon('pistol');
    if (e.code === 'Digit2') switchWeapon('shotgun');
    if (e.code === 'Digit3') switchWeapon('chain');
    if (e.code === 'KeyE' || e.code === 'Space') useAction();
  } else if (e.code === 'Enter' || e.code === 'Space') {
    advanceState();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('mousedown', e => {
  audioInit();
  if (AC && AC.state === 'suspended') AC.resume();
  if (state === 'title') { advanceState(); return; }
  if (state !== 'play') { advanceState(); return; }
  if (document.pointerLockElement !== cv) { if (!isTouch) cv.requestPointerLock(); return; }
  if (e.button === 0) firing = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
window.addEventListener('mousemove', e => {
  if (document.pointerLockElement === cv && state === 'play') {
    player.a += e.movementX * 0.0023;
    player.sway = clamp(player.sway + e.movementX * 0.25, -22, 22);
  }
});
document.addEventListener('pointerlockchange', () => {
  paused = (document.pointerLockElement !== cv);
});
window.addEventListener('wheel', e => {
  if (state !== 'play') return;
  const order = ['pistol', 'shotgun', 'chain'].filter(w => player.has[w]);
  let i = order.indexOf(player.weapon);
  i = (i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length;
  switchWeapon(order[i]);
});

function resetCampaign() {
  totalScore = 0; lives = MAX_LIVES;
  player.hp = 100; player.armor = 0; player.weapon = 'pistol';
  player.has = { pistol: true, shotgun: false, chain: false };
  player.ammo = { bullets: 48, shells: 0 };
}
function advanceState() {
  if (state === 'title') {
    resetCampaign();
    if (!isTouch) cv.requestPointerLock();
    say('come get some');
    startLevel(0);
  } else if (state === 'dead') {
    if (!isTouch) cv.requestPointerLock();
    restartLevel();
  } else if (state === 'score') {
    if (curLevel + 1 < LEVELS.length) { if (!isTouch) cv.requestPointerLock(); startLevel(curLevel + 1); }
    else state = 'win';
  } else if (state === 'win' || state === 'gameover') {
    resetCampaign();
    state = 'title';
  }
}
function switchWeapon(w) {
  if (!player.has[w] || player.weapon === w) return;
  player.weapon = w; player.cool = 0.25;
  SFX.weapon();
  setMsg(WEAPONS[w].name);
}
function setMsg(m) { msg = m; msgT = 2.2; }
function setQuip(q) { quip = q; quipT = 2.4; say(q); }

function useAction() {
  // March along the view ray and act on the first interactable cell (door / exit).
  // A longer reach than a step-in-front probe makes the FIRE button forgiving on
  // touch (no key auto-repeat there), and stopping at the first solid wall keeps
  // us from reaching through walls into the room beyond.
  const dx = dirX(), dy = dirY();
  const REACH = 2.5, STEP = 0.25;
  let last = '';
  for (let march = 0.4; march <= REACH; march += STEP) {
    const tx = Math.floor(player.x + dx * march);
    const ty = Math.floor(player.y + dy * march);
    const key = tx + ',' + ty;
    if (key === last) continue;      // same cell as last step — skip
    last = key;
    const ch = cellAt(tx, ty);
    if (ch === 'X') { levelComplete(); return; }
    if (DOOR_CHARS.includes(ch)) {
      const d = doorAt(tx, ty);
      if (!d) return;
      if (d.locked) {
        if (!player.keys[d.locked]) {
          setMsg(d.locked.toUpperCase() + ' KEYCARD REQUIRED');
          SFX.locked();
          return;
        }
        d.locked = null;
        setMsg('ACCESS GRANTED');
      }
      if (d.state === 'closed' || d.state === 'closing') { d.state = 'opening'; SFX.door(); }
      return;
    }
    if (WALL_CHARS.includes(ch)) return;  // solid wall — don't act through it
  }
}
function levelComplete() {
  if (state !== 'play') return;   // ignore repeat triggers (e.g. multiple shotgun pellets on the exit)
  SFX.exit();
  document.exitPointerLock();
  totalScore += kills * 100;
  state = 'score';
}

// ---------------------------------------------------------------- combat
function fireWeapon() {
  const w = WEAPONS[player.weapon];
  if (player.cool > 0) return;
  if (w.ammo && player.ammo[w.ammo] <= 0) {
    SFX.dryfire(); player.cool = 0.4;
    if (player.has.pistol && player.weapon !== 'pistol') switchWeapon('pistol');
    return;
  }
  if (w.ammo) player.ammo[w.ammo]--;
  player.cool = w.rate;
  player.muzzle = 0.07;
  shake = Math.min(shake + w.kick * 0.012, 0.2);
  SFX[w.sfx]();
  for (let p = 0; p < w.pellets; p++) {
    const a = player.a + rand(-w.spread, w.spread);
    hitscan(player.x, player.y, a, irand(w.dmg[0], w.dmg[1]));
  }
  for (const e of enemies) {
    if (e.alive && !e.alert && dist2(e.x, e.y, player.x, player.y) < 14 && hasLOS(e.x, e.y, player.x, player.y))
      alertEnemy(e);
  }
}
function hitscan(px, py, angle, dmg) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const wallD = castRayDist(px, py, dx, dy, 40);
  let best = null, bestT = wallD;
  for (const e of enemies) {
    if (!e.alive) continue;
    const rx = e.x - px, ry = e.y - py;
    const t = rx * dx + ry * dy;
    if (t <= 0.2 || t >= bestT) continue;
    const off = Math.abs(rx * dy - ry * dx);
    if (off < e.t.hitR) { best = e; bestT = t; }
  }
  if (best) {
    damageEnemy(best, dmg);
    spawnParticles(best.x - dx * 0.2, best.y - dy * 0.2, best.type === 'drone' ? P_GREEN : P_BLOOD, 5, 0.45);
    spawnParticles(best.x - dx * 0.2, best.y - dy * 0.2, P_BLOOD2, 3, 0.45);
  } else if (wallD < 39) {
    // shooting the EXIT block (with clear line of sight — no enemy hit first)
    // ends the level, so FIRE both fights and exits with no separate "use".
    const ex = Math.floor(px + dx * (wallD + 0.05));
    const ey = Math.floor(py + dy * (wallD + 0.05));
    if (cellAt(ex, ey) === 'X') { levelComplete(); return; }
    spawnParticles(px + dx * (wallD - 0.08), py + dy * (wallD - 0.08), P_SPARK, 3, 0.5, true);
  }
}
function alertEnemy(e) {
  if (e.alert) return;
  e.alert = true;
  const fn = SFX['alert_' + e.type]; if (fn) fn();
  if (e.type === 'boss' && !bossIntroDone) {
    bossIntroDone = true;
    setQuip('SO YOU\'RE THE OVERLORD? YOU\'RE UGLIER IN PERSON.');
    shake = 0.2;
  }
}
function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = 0.07;
  alertEnemy(e);
  if (e.hp <= 0) {
    e.alive = false;
    e.dieT = 0.3;
    kills++;
    const fn = SFX['die_' + e.type]; if (fn) fn();
    if (e.type === 'boss') { setQuip('OVERLORD DOWN. EARTH SENDS ITS REGARDS.'); shake = 0.3; setFace('grin', 1.6); }
    else {
      if (Math.random() < 0.25) { setQuip(QUIPS[irand(0, QUIPS.length - 1)]); setFace('grin', 1.1); }
      if (Math.random() < 0.3) items.push({ k: Math.random() < 0.5 ? 'm' : 's', x: e.x, y: e.y, taken: false });
    }
    const gib = e.type === 'drone' ? P_GREEN : P_BLOOD;
    spawnParticles(e.x, e.y, gib, 10, 0.5);
    spawnParticles(e.x, e.y, P_CHUNK, 4, 0.55);
  } else if (Math.random() < e.t.painCh) {
    e.pain = 0.28;
    const fn = SFX['pain_' + e.type]; if (fn) fn();
  }
}
function damagePlayer(d) {
  if (state !== 'play') return;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, Math.ceil(d / 3));
    player.armor -= absorbed;
    d -= absorbed;
  }
  player.hp -= d;
  dmgFlash = Math.min(dmgFlash + 0.25 + d * 0.012, 0.65);
  shake = Math.min(shake + 0.08, 0.25);
  setFace('pain', 0.7);
  SFX.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    SFX.die();
    document.exitPointerLock();
    deadT = 0;
    lives--;
    state = lives > 0 ? 'dead' : 'gameover';
  }
}
function spawnParticles(x, y, img, n, lift, add) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 90) particles.shift();
    particles.push({
      x, y, img, add: !!add,
      vx: rand(-1.4, 1.4), vy: rand(-1.4, 1.4),
      lift: lift + rand(-0.1, 0.15), vlift: rand(0.3, 1.2),
      life: rand(0.3, 0.7),
    });
  }
}

// ---------------------------------------------------------------- updates
function updatePlayer(dt) {
  let mx = 0, my = 0, speedScale = 1, run = (keys['ShiftLeft'] || keys['ShiftRight']);
  if (keys['KeyW'] || keys['ArrowUp']) mx += 1;
  if (keys['KeyS'] || keys['ArrowDown']) mx -= 1;
  if (keys['KeyA']) my -= 1;
  if (keys['KeyD']) my += 1;
  if (keys['ArrowLeft']) player.a -= 2.4 * dt;
  if (keys['ArrowRight']) player.a += 2.4 * dt;
  if (isTouch && tjOn) {                      // analog stick: gentle = slow, full shove = run
    const DZ = 0.18, ax = j => Math.abs(j) > DZ ? (j - Math.sign(j) * DZ) / (1 - DZ) : 0;
    const fwd = ax(tjY), turn = ax(tjX);
    if (fwd !== 0) { mx += fwd; speedScale = Math.min(Math.abs(fwd) * 1.1, 1); }
    player.a += 1.6 * turn * dt;              // slower & proportional vs the 2.4 key-turn
    player.sway = clamp(player.sway + turn * 6, -22, 22);
    if (Math.abs(fwd) > 0.92) run = true;
  }
  const sp = (run ? 4.6 : 3.1) * speedScale;
  const len = Math.hypot(mx, my);
  player.moving = len > 0;
  if (len > 0) {
    mx /= len; my /= len;
    const dx = (dirX() * mx - dirY() * my) * sp * dt;
    const dy = (dirY() * mx + dirX() * my) * sp * dt;
    moveWithCollide(player, dx, dy, 0.22);
    player.bobT += sp * dt * 1.6;
    const ph = Math.floor(player.bobT / Math.PI);
    if (ph !== player.stepPh) { player.stepPh = ph; SFX.step(); }
  }
  player.sway *= Math.pow(0.0001, dt); // decay turn sway
  if (player.cool > 0) player.cool -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  if (firing) {
    fireWeapon();
    // Touch has no key auto-repeat, so holding FIRE re-attempts the "use" action
    // on a throttle — walk up to a door/exit with FIRE held and it opens in range,
    // matching how holding E works on desktop.
    if (isTouch) {
      touchUseT -= dt;
      if (touchUseT <= 0) { useAction(); touchUseT = 0.3; }
    }
  }
  for (const it of items) {
    if (it.taken) continue;
    if (dist2(it.x, it.y, player.x, player.y) < 0.62) {
      const def = ITYPES[it.k];
      const hadWeapons = isTouch ? { ...player.has } : null;
      if (def.apply(player)) {
        it.taken = true;
        setMsg(def.msg);
        SFX[def.sfx]();
        pickFlash = 0.18;
        if (def.grin) setFace('grin', 1.1);
        if (isTouch) {            // mobile has no weapon keys: auto-equip new pickups
          for (const w of ['chain', 'shotgun']) {
            if (player.has[w] && !hadWeapons[w]) { switchWeapon(w); break; }
          }
        }
      }
    }
  }
}
function updateDoors(dt) {
  for (const d of doors.values()) {
    if (d.state === 'opening') {
      d.open += dt * 1.8;
      if (d.open >= 1) { d.open = 1; d.state = 'open'; d.timer = 4.5; }
    } else if (d.state === 'open') {
      d.timer -= dt;
      if (d.timer <= 0) {
        let occupied = dist2(player.x, player.y, d.x + 0.5, d.y + 0.5) < 1.1;
        for (const e of enemies) if (e.alive && dist2(e.x, e.y, d.x + 0.5, d.y + 0.5) < 1.1) occupied = true;
        if (occupied) d.timer = 1;
        else { d.state = 'closing'; SFX.door(); }
      }
    } else if (d.state === 'closing') {
      d.open -= dt * 1.8;
      if (d.open <= 0) { d.open = 0; d.state = 'closed'; }
    }
  }
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) { if (e.dieT > 0) e.dieT -= dt; continue; }
    if (e.flash > 0) e.flash -= dt;
    if (e.pain > 0) { e.pain -= dt; continue; }
    const pd = dist2(e.x, e.y, player.x, player.y);
    const los = pd < 18 && hasLOS(e.x, e.y, player.x, player.y);
    if (!e.alert) {
      if ((los && pd < 11) || pd < 1.6) alertEnemy(e);
      continue;
    }
    e.cool -= dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) enemyAttack(e);
      continue;
    }
    if (los && pd < e.t.range && e.cool <= 0) {
      e.windup = e.type === 'boss' ? 0.45 : 0.3;
      continue;
    }
    if (pd > 1.6 || !los) {
      let ang = Math.atan2(player.y - e.y, player.x - e.x);
      ang += Math.sin(performance.now() * 0.001 + e.seed) * 0.35;
      if (e.avoidT > 0) { e.avoidT -= dt; ang += e.avoidDir * Math.PI / 2; }
      const ox = e.x, oy = e.y;
      moveWithCollide(e, Math.cos(ang) * e.t.speed * dt, Math.sin(ang) * e.t.speed * dt, 0.3);
      if (Math.abs(e.x - ox) < 0.001 && Math.abs(e.y - oy) < 0.001 && e.avoidT <= 0) {
        e.avoidT = 0.5; e.avoidDir = Math.random() < 0.5 ? -1 : 1;
      }
      e.anim += dt * 7;
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i]; if (!a.alive) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j]; if (!b.alive) continue;
      const d = dist2(a.x, a.y, b.x, b.y);
      if (d < 0.55 && d > 0.001) {
        const push = (0.55 - d) * 0.5;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        moveWithCollide(b, nx * push, ny * push, 0.3);
        moveWithCollide(a, -nx * push, -ny * push, 0.3);
      }
    }
  }
}
function enemyAttack(e) {
  e.cool = e.t.rate * rand(0.85, 1.25);
  if (!hasLOS(e.x, e.y, player.x, player.y)) return;
  const d = dist2(e.x, e.y, player.x, player.y);
  if (e.t.proj) {
    SFX.plasma();
    const base = Math.atan2(player.y - e.y, player.x - e.x);
    const angles = e.t.proj === 'spread' ? [base - 0.22, base, base + 0.22] : [base + rand(-0.06, 0.06)];
    for (const a of angles) {
      projectiles.push({
        x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4,
        dx: Math.cos(a), dy: Math.sin(a),
        speed: e.type === 'boss' ? 6.5 : 7.5,
        dmg: irand(e.t.dmg[0], e.t.dmg[1]),
        img: e.type === 'boss' ? BOLT_G : BOLT,
        lift: e.t.lift + 0.25,
      });
    }
  } else {
    SFX.enemyShoot();
    const chance = clamp(0.85 - d * 0.055 - (player.moving ? 0.18 : 0), 0.12, 0.8);
    if (Math.random() < chance) damagePlayer(irand(e.t.dmg[0], e.t.dmg[1]));
    else spawnParticles(player.x - dirX() * 0.5 + rand(-0.5, 0.5), player.y - dirY() * 0.5 + rand(-0.5, 0.5), P_SPARK, 2, 0.4, true);
  }
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.dx * p.speed * dt;
    p.y += p.dy * p.speed * dt;
    if (isSolidCell(Math.floor(p.x), Math.floor(p.y))) {
      spawnParticles(p.x - p.dx * 0.2, p.y - p.dy * 0.2, P_SPARK, 4, p.lift, true);
      projectiles.splice(i, 1);
      continue;
    }
    if (dist2(p.x, p.y, player.x, player.y) < 0.42) {
      damagePlayer(p.dmg);
      projectiles.splice(i, 1);
    }
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.lift += p.vlift * dt; p.vlift -= 4.5 * dt;
    if (p.lift < 0.02) { p.lift = 0.02; p.vlift = 0; p.vx *= 0.8; p.vy *= 0.8; }
  }
}

// ================================================================ RENDER
function renderFloors(L) {
  const d = bufImg.data;
  const px = player.x, py = player.y;
  const dX = dirX(), dY = dirY();
  const plX = -dY * FOV_PLANE, plY = dX * FOV_PLANE;
  const fd = L._fd, cd = L._cd;
  const skyBase = (((player.a / (Math.PI * 2)) % 1 + 1) % 1) * SKY_W;
  const skySpan = SKY_W * 0.19; // ~FOV/360
  for (let y = 0; y < BUF_H; y++) {
    const p = y - HORIZ + 0.5;
    const rowOff = y * BUF_W * 4;
    if (p < 0 && L.sky) {
      // parallax sky
      const skyY = Math.min(SKY_H - 1, Math.floor(y * SKY_H / HORIZ));
      const srow = skyY * SKY_W;
      for (let x = 0; x < BUF_W; x++) {
        const sx = ((skyBase + x * skySpan / BUF_W) | 0) % SKY_W;
        const si = (srow + sx) * 4, di = rowOff + x * 4;
        d[di] = SKY_DATA[si]; d[di + 1] = SKY_DATA[si + 1]; d[di + 2] = SKY_DATA[si + 2]; d[di + 3] = 255;
      }
      continue;
    }
    const tdata = p < 0 ? cd : fd;
    const rowDist = HORIZ / Math.abs(p);
    let shade = 1 - rowDist / 14;
    if (shade < 0.1) shade = 0.1;
    const stepX = rowDist * 2 * plX / BUF_W;
    const stepY = rowDist * 2 * plY / BUF_W;
    let wx = px + rowDist * (dX - plX);
    let wy = py + rowDist * (dY - plY);
    for (let x = 0; x < BUF_W; x++) {
      const tx = ((wx * TEXS) | 0) & 63, ty = ((wy * TEXS) | 0) & 63;
      const si = ((ty << 6) + tx) << 2, di = rowOff + x * 4;
      d[di] = tdata[si] * shade;
      d[di + 1] = tdata[si + 1] * shade;
      d[di + 2] = tdata[si + 2] * shade;
      d[di + 3] = 255;
      wx += stepX; wy += stepY;
    }
  }
  bufCtx.putImageData(bufImg, 0, 0);
  ctx.drawImage(bufCanvas, 0, 0, W, H);
}

function render3D() {
  const L = LEVELS[curLevel];
  const shakeX = shake > 0 ? rand(-1, 1) * shake * 30 : 0;
  const shakeY = shake > 0 ? rand(-1, 1) * shake * 20 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  renderFloors(L);

  const px = player.x, py = player.y;
  const dX = dirX(), dY = dirY();
  const plX = -dY * FOV_PLANE, plY = dX * FOV_PLANE;

  for (let col = 0; col < COLS; col++) {
    const camX = 2 * col / COLS - 1;
    const rdx = dX + plX * camX, rdy = dY + plY * camX;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
    let sx, sy, sdx, sdy;
    if (rdx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
    let side = 0, hitCh = '1', perp = 30, texX = 0;
    for (let it = 0; it < 80; it++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      const ch = cellAt(mx, my);
      if (!WALL_CHARS.includes(ch)) continue;
      const t = side === 0 ? sdx - ddx : sdy - ddy;
      let wallX = side === 0 ? py + t * rdy : px + t * rdx;
      wallX -= Math.floor(wallX);
      if (DOOR_CHARS.includes(ch)) {
        const d = doorAt(mx, my);
        const open = d ? d.open : 0;
        if (wallX < open) continue;
        hitCh = ch; perp = t;
        texX = Math.floor((wallX - open) * TEXS);
        break;
      }
      hitCh = ch; perp = t;
      let tx = Math.floor(wallX * TEXS);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TEXS - tx - 1;
      texX = tx;
      break;
    }
    perp = Math.max(perp, 0.04);
    zBuffer[col] = perp;
    const lineH = H / perp;
    const y0 = H / 2 - lineH / 2;
    ctx.drawImage(texFor(hitCh), texX, 0, 1, TEXS, col * COLW, y0, COLW, lineH);
    let sh = clamp(perp / 13, 0, 0.82);
    if (side === 1) sh = Math.min(sh + 0.14, 0.88);
    if (player.muzzle > 0 && perp < 5) sh = Math.max(0, sh - 0.18); // gunfire light
    if (sh > 0.02) {
      ctx.fillStyle = `rgba(4,4,12,${sh})`;
      ctx.fillRect(col * COLW, y0, COLW, lineH);
    }
  }

  // ---- sprites
  const list = [];
  for (const it of items) {
    if (it.taken) continue;
    const def = ITYPES[it.k];
    list.push({ img: def.c, x: it.x, y: it.y, scale: def.scale, lift: 0 });
  }
  for (const e of enemies) {
    const F = FRAMES[e.t.frames];
    let img, scale = e.t.scale, lift = e.t.lift;
    if (!e.alive) {
      img = e.dieT > 0 ? F.die : F.dead;
      scale = e.dieT > 0 ? e.t.scale * 0.7 : e.t.scale * 0.4;
      lift = 0;
    }
    else if (e.flash > 0) img = F.flash;
    else if (e.pain > 0) img = F.pain;
    else if (e.windup > 0) img = F.fire;
    else if (e.alert) img = [F.walk1, F.stand, F.walk2, F.stand][Math.floor(e.anim) % 4];
    else img = F.stand;
    if (e.alive && e.t.lift > 0) lift = e.t.lift + Math.sin(performance.now() * 0.004 + e.seed) * 0.06;
    list.push({ img, x: e.x, y: e.y, scale, lift });
  }
  for (const p of projectiles) list.push({ img: p.img, x: p.x, y: p.y, scale: 0.1, lift: p.lift, add: true });
  for (const p of particles) list.push({ img: p.img, x: p.x, y: p.y, scale: p.img === P_CHUNK ? 0.05 : 0.035, lift: p.lift, add: p.add });

  const invDet = 1 / (plX * dY - dX * plY);
  for (const s of list) {
    const rx = s.x - px, ry = s.y - py;
    s.ty = invDet * (-plY * rx + plX * ry);
    s.tx = invDet * (dY * rx - dX * ry);
  }
  list.sort((a, b) => b.ty - a.ty);
  for (const s of list) {
    if (s.ty <= 0.08) continue;
    const sxc = (W / 2) * (1 + s.tx / s.ty);
    const hFull = H / s.ty;
    const drawH = hFull * s.scale;
    const aspect = s.img.width / s.img.height;
    const drawW = drawH * aspect;
    const bottom = H / 2 + hFull / 2 - s.lift * hFull;
    const top = bottom - drawH;
    const left = sxc - drawW / 2;
    if (left + drawW < 0 || left > W) continue;
    const img = s.add ? s.img : shaded(s.img, shadeLvl(s.ty));
    if (s.add) ctx.globalCompositeOperation = 'lighter';
    const c0 = Math.max(0, Math.floor(left / COLW));
    const c1 = Math.min(COLS - 1, Math.ceil((left + drawW) / COLW));
    for (let c = c0; c <= c1; c++) {
      if (zBuffer[c] <= s.ty) continue;
      const scrX = c * COLW;
      const u = (scrX - left) / drawW;
      const srcX = clamp(Math.floor(u * img.width), 0, img.width - 1);
      const srcW = Math.max(1, Math.ceil(img.width * COLW / drawW));
      ctx.drawImage(img, srcX, 0, srcW, img.height, scrX, top, COLW, drawH);
    }
    if (s.add) ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function gunFrame() {
  const wdef = WEAPONS[player.weapon];
  const f = player.cool > 0 ? 1 - (player.cool / wdef.rate) : 1;
  if (player.weapon === 'pistol') return f < 0.4 ? GUNS.pistol.fire : GUNS.pistol.idle;
  if (player.weapon === 'shotgun') {
    if (f < 0.22) return GUNS.shotgun.fire;
    if (f < 0.62) return GUNS.shotgun.pump;
    return GUNS.shotgun.idle;
  }
  if (firing && player.cool > 0) {
    return [GUNS.chain.f1, GUNS.chain.f2, GUNS.chain.f3][Math.floor(performance.now() / 50) % 3];
  }
  return GUNS.chain.idle;
}
function renderWeapon() {
  const g = gunFrame();
  const wdef = WEAPONS[player.weapon];
  const bobX = Math.sin(player.bobT) * (player.moving ? 10 : 2) + player.sway * 0.6;
  const bobY = Math.abs(Math.cos(player.bobT)) * (player.moving ? 8 : 2);
  const kick = player.cool > 0 ? (player.cool / wdef.rate) * wdef.kick : 0;
  const gx = W / 2 - g.width / 2 + bobX;
  const gy = H - g.height + 24 + bobY + kick;
  if (player.muzzle > 0) {
    const fl = wdef.flash;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(fl, W / 2 - fl.width / 2 + bobX + rand(-3, 3), gy - fl.height + 34 + rand(-3, 3));
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(g, gx, gy);
}

// ---------------------------------------------------------------- HUD
function bevel(x, y, w2, h2, base) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w2, h2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w2, 2); ctx.fillRect(x, y, 2, h2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x, y + h2 - 2, w2, 2); ctx.fillRect(x + w2 - 2, y, 2, h2);
}
function inset(x, y, w2, h2) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w2, 2); ctx.fillRect(x, y, 2, h2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y + h2 - 2, w2, 2); ctx.fillRect(x + w2 - 2, y, 2, h2);
  ctx.fillStyle = '#0c0e14'; ctx.fillRect(x + 2, y + 2, w2 - 4, h2 - 4);
}
function led(text, x, y, color, size) {
  ctx.font = `bold ${size || 26}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function renderHUD() {
  // crosshair
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(W / 2 - 1, H / 2 - 7, 2, 5); ctx.fillRect(W / 2 - 1, H / 2 + 2, 2, 5);
  ctx.fillRect(W / 2 - 7, H / 2 - 1, 5, 2); ctx.fillRect(W / 2 + 2, H / 2 - 1, 5, 2);

  // ---- status bar
  const ph = 54, py0 = H - ph;
  bevel(0, py0, W, ph, '#2b2f3a');
  ctx.fillStyle = '#222631'; ctx.fillRect(0, py0 + 2, W, 2);

  // mugshot
  inset(6, py0 + 4, 50, 46);
  const tier = player.hp > 66 ? 0 : player.hp > 33 ? 1 : 2;
  const expr = faceT > 0 ? faceExpr : 'idle';
  ctx.drawImage(FACES[tier + expr], 9, py0 + 6, 44, 44);

  // health & armor
  inset(62, py0 + 4, 104, 46);
  ctx.textAlign = 'left'; ctx.font = 'bold 10px "Courier New", monospace';
  ctx.fillStyle = '#8a93a5'; ctx.fillText('HEALTH', 70, py0 + 16);
  led(String(Math.ceil(player.hp)), 158, py0 + 44, player.hp <= 25 ? '#ff3030' : '#ffd23e', 30);

  inset(170, py0 + 4, 86, 46);
  ctx.textAlign = 'left'; ctx.font = 'bold 10px "Courier New", monospace';
  ctx.fillStyle = '#8a93a5'; ctx.fillText('ARMOR', 178, py0 + 16);
  led(String(player.armor), 248, py0 + 44, '#6f9aff', 30);

  // weapon slots
  inset(262, py0 + 4, 96, 46);
  ctx.font = 'bold 12px "Courier New", monospace'; ctx.textAlign = 'center';
  ['pistol', 'shotgun', 'chain'].forEach((wp, i) => {
    const owned = player.has[wp];
    const sel = wp === player.weapon;
    if (sel) { ctx.fillStyle = '#454f63'; ctx.fillRect(268 + i * 30, py0 + 9, 26, 36); }
    ctx.fillStyle = sel ? '#ffd23e' : owned ? '#c8cdd8' : '#3a4150';
    ctx.fillText(String(i + 1), 281 + i * 30, py0 + 24);
    ctx.fillText(['PST', 'SHG', 'RIP'][i], 281 + i * 30, py0 + 40);
  });

  // ammo
  inset(364, py0 + 4, 130, 46);
  const wdef = WEAPONS[player.weapon];
  ctx.textAlign = 'left'; ctx.font = 'bold 10px "Courier New", monospace';
  ctx.fillStyle = '#8a93a5'; ctx.fillText('AMMO', 372, py0 + 16);
  led(wdef.ammo ? String(player.ammo[wdef.ammo]) : '--', 452, py0 + 44, '#ffd23e', 30);
  ctx.textAlign = 'left'; ctx.font = 'bold 9px "Courier New", monospace';
  ctx.fillStyle = '#7d8696';
  ctx.fillText('BUL ' + player.ammo.bullets, 458, py0 + 26);
  ctx.fillText('SHL ' + player.ammo.shells, 458, py0 + 40);

  // keys + level stats
  inset(500, py0 + 4, 134, 46);
  ctx.fillStyle = player.keys.red ? '#d42222' : '#2a2228';
  ctx.fillRect(508, py0 + 10, 12, 16);
  ctx.fillStyle = player.keys.blue ? '#2b58c2' : '#22252e';
  ctx.fillRect(508, py0 + 30, 12, 16);
  if (player.keys.red) { ctx.fillStyle = '#fff'; ctx.fillRect(511, py0 + 14, 6, 3); }
  if (player.keys.blue) { ctx.fillStyle = '#fff'; ctx.fillRect(511, py0 + 34, 6, 3); }
  ctx.font = 'bold 10px "Courier New", monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#8a93a5';
  ctx.fillText('KILLS', 528, py0 + 18);
  ctx.fillStyle = '#c8cdd8'; ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillText(kills + '/' + totalKills, 528, py0 + 34);
  const mm = Math.floor(levelTime / 60), ss = String(Math.floor(levelTime % 60)).padStart(2, '0');
  ctx.font = 'bold 10px "Courier New", monospace'; ctx.fillStyle = '#7d8696';
  ctx.fillText(mm + ':' + ss, 528, py0 + 47);

  // top-left level tag
  ctx.textAlign = 'left'; ctx.font = 'bold 12px "Courier New", monospace';
  ctx.fillStyle = 'rgba(220,225,235,0.8)';
  ctx.fillText(LEVELS[curLevel].sub + ' — ' + LEVELS[curLevel].name, 10, 18);

  // lives
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = 'rgba(220,225,235,0.8)'; ctx.fillText('LIVES', 10, 35);
  for (let i = 0; i < MAX_LIVES; i++) {
    ctx.fillStyle = i < lives ? '#ff4444' : '#3a2630';
    ctx.fillRect(52 + i * 12, 26, 9, 9);
  }

  // messages
  if (msgT > 0) {
    ctx.textAlign = 'center'; ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillStyle = `rgba(255,230,140,${clamp(msgT, 0, 1)})`;
    ctx.fillText(msg, W / 2, 52);
  }
  if (quipT > 0) {
    ctx.textAlign = 'center'; ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = `rgba(120,240,160,${clamp(quipT, 0, 1)})`;
    ctx.fillText(quip, W / 2, H - 76);
  }
  if (introT > 0) {
    const a = clamp(introT, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`; ctx.fillRect(0, 110, W, 110);
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillStyle = `rgba(255,210,62,${a})`;
    ctx.fillText(LEVELS[curLevel].name, W / 2, 152);
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillStyle = `rgba(220,225,235,${a})`;
    LEVELS[curLevel].brief.split('\n').forEach((l, i) => ctx.fillText(l, W / 2, 178 + i * 17));
  }
  // boss bar
  const boss = enemies.find(e => e.type === 'boss');
  if (boss && boss.alive && boss.alert) {
    ctx.fillStyle = 'rgba(8,8,14,0.8)'; ctx.fillRect(W / 2 - 130, 44, 260, 16);
    ctx.fillStyle = '#601818'; ctx.fillRect(W / 2 - 127, 47, 254, 10);
    ctx.fillStyle = '#e03030'; ctx.fillRect(W / 2 - 127, 47, 254 * boss.hp / boss.t.hp, 10);
    ctx.textAlign = 'center'; ctx.font = 'bold 10px "Courier New", monospace';
    ctx.fillStyle = '#ffb0b0'; ctx.fillText('OVERLORD', W / 2, 41);
  }

  if (dmgFlash > 0) { ctx.fillStyle = `rgba(200,20,10,${dmgFlash})`; ctx.fillRect(0, 0, W, H); }
  if (pickFlash > 0) { ctx.fillStyle = `rgba(255,240,180,${pickFlash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (player.hp <= 25 && state === 'play') {
    const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.07;
    ctx.fillStyle = `rgba(180,10,10,${pulse})`; ctx.fillRect(0, 0, W, H);
  }
  if (keys['Tab']) renderMinimap();
  if (paused && state === 'play') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.font = 'bold 26px "Courier New", monospace';
    ctx.fillStyle = '#ffd23e'; ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = '#c8cdd8'; ctx.fillText('CLICK TO RESUME', W / 2, H / 2 + 18);
  }
}
function renderMinimap() {
  const cs = 7, ox = W - mapW * cs - 12, oy = 30;
  ctx.fillStyle = 'rgba(5,6,10,0.75)';
  ctx.fillRect(ox - 4, oy - 4, mapW * cs + 8, mapH * cs + 8);
  for (let y = 0; y < mapH; y++) for (let x = 0; x < mapW; x++) {
    const ch = grid[y][x];
    if (DOOR_CHARS.includes(ch)) ctx.fillStyle = '#caa017';
    else if (ch === 'X') ctx.fillStyle = '#41ff7a';
    else if (WALL_CHARS.includes(ch)) ctx.fillStyle = '#4a5263';
    else continue;
    ctx.fillRect(ox + x * cs, oy + y * cs, cs - 1, cs - 1);
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = e.type === 'boss' ? '#ff60ff' : '#e03030';
    ctx.fillRect(ox + e.x * cs - 2, oy + e.y * cs - 2, 4, 4);
  }
  ctx.fillStyle = '#ffd23e';
  ctx.fillRect(ox + player.x * cs - 2, oy + player.y * cs - 2, 4, 4);
  ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + player.x * cs, oy + player.y * cs);
  ctx.lineTo(ox + (player.x + dirX() * 1.6) * cs, oy + (player.y + dirY() * 1.6) * cs);
  ctx.stroke();
}

// ---------------------------------------------------------------- screens
function bigTitle(y) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 58px "Courier New", monospace';
  const grad = ctx.createLinearGradient(0, y - 46, 0, y + 8);
  grad.addColorStop(0, '#ffe9a0'); grad.addColorStop(0.5, '#ffb02e'); grad.addColorStop(1, '#b33b10');
  ctx.fillStyle = '#000'; ctx.fillText('DUKE REDUX', W / 2 + 3, y + 3);
  ctx.fillStyle = grad; ctx.fillText('DUKE REDUX', W / 2, y);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(W / 2 - 180, y + 10, 360, 2);
}
function renderTitle() {
  // parallax sky backdrop, slowly drifting
  const drift = (performance.now() * 0.01) % SKY_W;
  ctx.drawImage(SKY_CANVAS, drift, 0, Math.min(SKY_W - drift, 640 / 2), SKY_H, 0, 0, Math.min(SKY_W - drift, 320) * 2, 260);
  if (SKY_W - drift < 320) {
    const rem = 320 - (SKY_W - drift);
    ctx.drawImage(SKY_CANVAS, 0, 0, rem, SKY_H, (SKY_W - drift) * 2, 0, rem * 2, 260);
  }
  ctx.fillStyle = '#0a0a10'; ctx.fillRect(0, 260, W, H - 260);
  const fg = ctx.createLinearGradient(0, 230, 0, 270);
  fg.addColorStop(0, 'rgba(122,44,20,0.45)'); fg.addColorStop(1, 'rgba(10,10,16,1)');
  ctx.fillStyle = fg; ctx.fillRect(0, 230, W, 40);

  bigTitle(110);
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.fillStyle = '#c8cdd8';
  ctx.textAlign = 'center';
  ctx.fillText('AN ORIGINAL HOMAGE TO THE KING OF ONE-LINERS', W / 2, 140);

  ctx.drawImage(FACES['0grin'], W / 2 - 33, 158, 66, 66);

  const blink = Math.floor(performance.now() / 500) % 2 === 0;
  if (blink) {
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#41ff7a'; ctx.textAlign = 'center';
    ctx.fillText(isTouch ? 'TAP TO COME GET SOME' : 'CLICK TO COME GET SOME', W / 2, 250);
  }
  if (isTouch) {
    ctx.font = 'bold 14px "Courier New", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#7a818f'; ctx.fillText('— TOUCH CONTROLS —', W / 2, 286);
    ctx.fillStyle = '#c8cdd8';
    ctx.fillText('LEFT STICK — MOVE & TURN', W / 2, 310);
    ctx.fillText('FIRE BUTTON — SHOOT & OPEN DOORS', W / 2, 332);
  } else {
    // desktop keyboard legend
    ctx.font = 'bold 12px "Courier New", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#7a818f'; ctx.fillText('— KEYBOARD —', W / 2, 278);
    ctx.fillStyle = '#c8cdd8'; ctx.textAlign = 'left';
    const pair = (a, b) => a.padEnd(24, ' ') + b;
    const lines = [
      pair('WASD     MOVE / STRAFE', 'MOUSE    LOOK / AIM'),
      pair('CLICK    FIRE', 'E / SPACE  USE · OPEN DOORS'),
      pair('1 2 3    SWITCH WEAPON', 'SHIFT    RUN'),
      'TAB  MAP        M  MUSIC        V  VOICE        ESC  PAUSE',
    ];
    lines.forEach((l, i) => ctx.fillText(l, 96, 300 + i * 17));
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px "Courier New", monospace'; ctx.fillStyle = '#5d6470';
  ctx.fillText('6 LEVELS · 3 LIVES · ALIENS WON\'T SHOOT THEMSELVES', W / 2, 374);
}
function renderDead() {
  // death cam: slow tilt + sink
  const tilt = Math.min(deadT * 0.12, 0.14);
  const sink = Math.min(deadT * 40, 50);
  ctx.save();
  ctx.translate(W / 2, H / 2 + sink);
  ctx.rotate(tilt);
  ctx.translate(-W / 2, -H / 2);
  render3D();
  ctx.restore();
  ctx.fillStyle = `rgba(120,0,0,${Math.min(0.25 + deadT * 0.15, 0.5)})`; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px "Courier New", monospace';
  ctx.fillStyle = '#ff3030'; ctx.fillText('YOU\'RE DEAD', W / 2, 180);
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.fillStyle = '#ffd0d0'; ctx.fillText('SHAKE IT OFF — THIS PLANET STILL NEEDS YOU.', W / 2, 210);
  ctx.font = 'bold 19px "Courier New", monospace'; ctx.fillStyle = '#ffd23e';
  ctx.fillText('LIVES LEFT:  ' + lives, W / 2, 242);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(isTouch ? 'TAP TO TRY AGAIN' : 'PRESS ENTER OR CLICK TO TRY AGAIN', W / 2, 278);
  }
}
function renderGameOver() {
  ctx.fillStyle = '#0a0406'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(70,0,0,0.30)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px "Courier New", monospace';
  ctx.fillStyle = '#ff3030'; ctx.fillText('GAME OVER', W / 2, 150);
  ctx.font = 'bold 16px "Courier New", monospace'; ctx.fillStyle = '#ffd0d0';
  ctx.fillText('OUT OF LIVES — THE ALIENS TAKE THE PLANET.', W / 2, 190);
  ctx.font = 'bold 18px "Courier New", monospace'; ctx.fillStyle = '#e8e0c8';
  ctx.fillText('YOU FELL ON ' + LEVELS[curLevel].sub + ' — ' + LEVELS[curLevel].name, W / 2, 250);
  ctx.fillText('FINAL SCORE:  ' + (totalScore + kills * 100), W / 2, 282);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#41ff7a'; ctx.font = 'bold 17px "Courier New", monospace';
    ctx.fillText(isTouch ? 'TAP TO START OVER' : 'PRESS ENTER TO START OVER', W / 2, 332);
  }
}
function renderScore() {
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(SKY_CANVAS, 0, 0, SKY_W, SKY_H, 0, 0, W, 130);
  ctx.fillStyle = 'rgba(6,7,12,0.6)'; ctx.fillRect(0, 0, W, 130);
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px "Courier New", monospace';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(LEVELS[curLevel].name + ' — CLEARED', W / 2, 90);
  ctx.drawImage(FACES['0grin'], W / 2 - 33, 116, 66, 66);
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = '#e8e0c8';
  const mm = Math.floor(levelTime / 60), ss = String(Math.floor(levelTime % 60)).padStart(2, '0');
  ctx.fillText('KILLS:  ' + kills + ' / ' + totalKills, W / 2, 225);
  ctx.fillText('TIME:   ' + mm + ':' + ss, W / 2, 258);
  ctx.fillText('SCORE:  ' + (kills * 100), W / 2, 291);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.font = 'bold 17px "Courier New", monospace';
    ctx.fillStyle = '#41ff7a';
    ctx.fillText(curLevel + 1 < LEVELS.length ? 'PRESS ENTER FOR NEXT LEVEL' : 'PRESS ENTER', W / 2, 345);
  }
}
function renderWin() {
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(SKY_CANVAS, 0, 0, SKY_W, SKY_H, 0, 0, W, 180);
  ctx.fillStyle = 'rgba(6,7,12,0.4)'; ctx.fillRect(0, 0, W, 180);
  bigTitle(100);
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.fillStyle = '#41ff7a';
  ctx.fillText('EARTH: SAVED. ALIENS: EVICTED.', W / 2, 200);
  ctx.drawImage(FACES['0grin'], W / 2 - 40, 215, 80, 80);
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.fillStyle = '#e8e0c8';
  ctx.fillText('TOTAL SCORE: ' + totalScore, W / 2, 322);
  ctx.fillStyle = '#c8cdd8';
  ctx.fillText('"AND THAT\'S WHY YOU DON\'T MESS WITH THIS PLANET."', W / 2, 348);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('PRESS ENTER FOR TITLE', W / 2, 378);
  }
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;
  texClock += dt;

  if (state === 'play' && !paused) {
    levelTime += dt;
    updatePlayer(dt);
    updateDoors(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    if (msgT > 0) msgT -= dt;
    if (quipT > 0) quipT -= dt;
    if (dmgFlash > 0) dmgFlash -= dt * 1.6;
    if (pickFlash > 0) pickFlash -= dt;
    if (shake > 0) shake -= dt * 0.9;
    if (introT > 0) introT -= dt;
    if (faceT > 0) faceT -= dt;
  }
  if (state === 'dead') deadT += dt;

  if (isTouch && touchUI) touchUI.style.display = (state === 'play' && !paused) ? '' : 'none';

  if (state === 'title') renderTitle();
  else if (state === 'dead') renderDead();
  else if (state === 'gameover') renderGameOver();
  else if (state === 'score') renderScore();
  else if (state === 'win') renderWin();
  else {
    render3D();
    renderWeapon();
    renderHUD();
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- touch controls (mobile)
// Desktop is untouched: everything here is gated behind isTouch. The joystick only
// sets the same keys[] flags the keyboard uses, so movement flows through unchanged.
if (isTouch) {
  touchUI = document.createElement('div'); touchUI.id = 'touch';
  const stick = document.createElement('div'); stick.id = 'stick';
  const knob  = document.createElement('div'); knob.id  = 'knob';
  const fire  = document.createElement('div'); fire.id  = 'fire'; fire.textContent = 'FIRE';
  stick.appendChild(knob); touchUI.appendChild(stick); touchUI.appendChild(fire);
  document.body.appendChild(touchUI);

  const resumeAudio = () => { audioInit(); if (AC && AC.state === 'suspended') AC.resume(); };

  // joystick feeds analog vars; updatePlayer reads them (vertical = move, horizontal = turn)
  function setJoy(nx, ny) { tjX = nx; tjY = ny; tjOn = true; }
  function clearJoy() { tjX = 0; tjY = 0; tjOn = false; }

  let jId = null, jcx = 0, jcy = 0, jR = 60;
  function jStart(t) {
    const r = stick.getBoundingClientRect();
    jcx = r.left + r.width / 2; jcy = r.top + r.height / 2; jR = r.width * 0.34;
    jId = t.identifier; jMove(t);
  }
  function jMove(t) {
    let dx = t.clientX - jcx, dy = t.clientY - jcy;
    const d = Math.hypot(dx, dy) || 1;
    if (d > jR) { dx = dx / d * jR; dy = dy / d * jR; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    setJoy(dx / jR, -dy / jR);
  }
  function jEnd() { jId = null; clearJoy(); knob.style.transform = 'translate(-50%, -50%)'; }

  stick.addEventListener('touchstart', e => {
    e.preventDefault(); resumeAudio(); jStart(e.changedTouches[0]);
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (jId === null) return;
    for (const t of e.changedTouches) if (t.identifier === jId) { e.preventDefault(); jMove(t); }
  }, { passive: false });
  const jLift = e => { if (jId === null) return; for (const t of e.changedTouches) if (t.identifier === jId) jEnd(); };
  window.addEventListener('touchend', jLift);
  window.addEventListener('touchcancel', jLift);

  // fire button: shoot + open doors / hit exit switch, and "come get some" on menus
  let fId = null;
  fire.addEventListener('touchstart', e => {
    e.preventDefault(); resumeAudio();
    fId = e.changedTouches[0].identifier;
    if (state !== 'play') { advanceState(); return; }
    useAction();       // doors, keycard doors, exit switch
    touchUseT = 0.3;   // next auto-use fires after the throttle window
    firing = true;     // and fire the current weapon
  }, { passive: false });
  const fLift = e => { for (const t of e.changedTouches) if (t.identifier === fId) { fId = null; firing = false; } };
  fire.addEventListener('touchend', fLift);
  fire.addEventListener('touchcancel', fLift);

  // safety net: whenever every finger leaves the glass (incl. iOS system-gesture
  // touchcancels) or the app backgrounds, force input to neutral so it can't stick.
  function resetInput() { jEnd(); firing = false; fId = null; }
  const allUp = e => { if (!e.touches || e.touches.length === 0) resetInput(); };
  window.addEventListener('touchend', allUp);
  window.addEventListener('touchcancel', allUp);
  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });

  // Tapping ANYWHERE starts / advances past menus (title, dead, game-over, score,
  // win). The touch controls are hidden outside 'play', and the 640x400 canvas is
  // letterboxed on tall phones — so a canvas-only handler misses taps on the black
  // bars. A window-level handler catches every tap and is the sole advance path on
  // mobile (e.g. "TAP TO TRY AGAIN" after death).
  window.addEventListener('touchstart', e => {
    if (state === 'play') return;
    e.preventDefault(); resumeAudio();
    advanceState();
  }, { passive: false });
}

requestAnimationFrame(frame);
