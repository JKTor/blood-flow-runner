// AR Blood Flow Runner — แข่งรถเม็ดเลือดในหัวใจ
// ภาพกล้อง (พื้นหลัง) + หัวใจ 3D (Three.js) + จับมือ (MediaPipe Hand Landmarker)
import * as THREE from './vendor/three.module.min.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ตั้งค่าความไวของท่ามือ (วินาที)
const BUZZ_HOLD = 0.9;     // ชูมือแบค้างนานเท่าไรถึงนับว่าขอตอบ
const CHOICE_HOLD = 1.3;   // ชูนิ้วค้างนานเท่าไรถึงนับว่าเลือก
const ANSWER_TIME = 20;    // เวลาตอบคำถาม
const CARD_TIME = 25;      // เวลาเลือกการ์ด

// ======================= ข้อมูลเกม =======================
const TEAMS = {
  black: { name: 'ทีมเลือดดำ', short: 'เลือดดำ', car: 0x6b0f24, accent: '#7c8cff', heartSide: 'ขวา' },
  red:   { name: 'ทีมเลือดแดง', short: 'เลือดแดง', car: 0xff2a3d, accent: '#ff4d5e', heartSide: 'ซ้าย' },
};
const other = (t) => (t === 'black' ? 'red' : 'black');

const CARDS = {
  enter_ra:   { t: 'เข้าห้องบนขวา',      e: 'Right Atrium',    i: '🚪', side: 'ขวา' },
  tricuspid:  { t: 'เปิดลิ้นไตรคัสปิด',   e: 'Tricuspid Valve', i: '🔓', side: 'ขวา' },
  squeeze_rv: { t: 'บีบห้องล่างขวา',      e: 'Right Ventricle', i: '💪', side: 'ขวา' },
  to_lung:    { t: 'ไปฟอกที่ปอด',         e: 'Lungs',           i: '🫁', side: 'ขวา' },
  enter_la:   { t: 'เข้าห้องบนซ้าย',      e: 'Left Atrium',     i: '🚪', side: 'ซ้าย' },
  mitral:     { t: 'เปิดลิ้นไมทรัล',      e: 'Mitral Valve',    i: '🔓', side: 'ซ้าย' },
  squeeze_lv: { t: 'บีบห้องล่างซ้าย',     e: 'Left Ventricle',  i: '💪', side: 'ซ้าย' },
  to_body:    { t: 'ออกไปเลี้ยงร่างกาย',  e: 'Body',            i: '🏃', side: 'ซ้าย' },
};

// เส้นทางแต่ละทีม: การ์ดที่ถูกของแต่ละด่าน, ชื่อจุดที่รถอยู่, คำอธิบายตอนผ่านด่าน, เส้นทางรถ (x,y)
const ROUTE = {
  black: {
    cards: ['enter_ra', 'tricuspid', 'squeeze_rv', 'to_lung'],
    locs: ['หลอดเลือดดำใหญ่ (Vena Cava)', 'ห้องบนขวา (Right Atrium)', 'ห้องล่างขวา (Right Ventricle)',
           'หลอดเลือดแดงพัลโมนารี (Pulmonary Artery)', 'ปอด — ถึงเส้นชัย!'],
    ok: ['เลือดจากร่างกายไหลกลับทางหลอดเลือดดำใหญ่ (Vena Cava) เข้าห้องบนขวา',
         'ลิ้นไตรคัสปิดเปิด! เลือดไหลลงห้องล่างขวา',
         'ห้องล่างขวาบีบตัว ดันเลือดผ่านลิ้นพัลโมนารี ขึ้นหลอดเลือดแดงพัลโมนารี',
         'ถึงปอดแล้ว! ปล่อย CO₂ รับ O₂ — เลือดดำกลายเป็นเลือดแดง 🫁'],
    segs: [
      [[-1.35, -3.9], [-1.4, -2.3], [-1.3, -0.6], [-1.15, 0.72]],
      [[-1.15, 0.72], [-0.97, 0.0], [-0.8, -0.9]],
      [[-0.8, -0.9], [-0.4, -0.3], [-0.36, 1.1], [-0.3, 2.3]],
      [[-0.3, 2.3], [-1.2, 3.05], [-2.5, 2.8], [-3.3, 2.2]],
    ],
  },
  red: {
    cards: ['enter_la', 'mitral', 'squeeze_lv', 'to_body'],
    locs: ['หลอดเลือดดำพัลโมนารี (Pulmonary Vein)', 'ห้องบนซ้าย (Left Atrium)', 'ห้องล่างซ้าย (Left Ventricle)',
           'เอออร์ตา (Aorta)', 'ร่างกาย — ถึงเส้นชัย!'],
    ok: ['เลือดที่ฟอกจากปอดไหลมาทางหลอดเลือดดำพัลโมนารี เข้าห้องบนซ้าย',
         'ลิ้นไมทรัลเปิด! เลือดไหลลงห้องล่างซ้าย',
         'ห้องล่างซ้าย (ผนังหนาที่สุด) บีบตัว ดันเลือดผ่านลิ้นเอออร์ติก ออกเอออร์ตา',
         'เลือดส่ง O₂ ให้ทุกเซลล์ทั่วร่างกาย — แล้วกลายเป็นเลือดดำ วนกลับเข้าหัวใจ 🏃'],
    segs: [
      [[3.3, 2.2], [2.5, 1.95], [1.8, 1.25], [1.15, 0.75]],
      [[1.15, 0.75], [0.97, 0.0], [0.8, -0.95]],
      [[0.8, -0.95], [0.38, -0.3], [0.32, 1.4], [0.4, 2.8], [1.05, 3.35]],
      [[1.05, 3.35], [1.9, 3.0], [2.6, 1.0], [2.7, -2.0], [2.75, -3.9]],
    ],
  },
};

// ======================= ฉาก 3D =======================
const canvas3 = $('#three');
const renderer = new THREE.WebGLRenderer({ canvas: canvas3, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const cam3 = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4); keyLight.position.set(2, 4, 8); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xff8899, 1.3); rimLight.position.set(-4, -2, 3); scene.add(rimLight);

const world = new THREE.Group(); scene.add(world);
const heart = new THREE.Group(); world.add(heart);

const V3 = (p, z) => new THREE.Vector3(p[0], p[1], p[2] ?? z);
const mat = (color, opacity = 1, ei = 0.2) => new THREE.MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: ei, roughness: 0.45, metalness: 0.05,
  transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
});

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();

// ป้ายข้อความภาษาไทยลอยในฉาก
function label(text, { size = 0.26, color = '#fff', bg = 'rgba(10,6,20,.62)', sub = null } = {}) {
  const fs = 64, font = `600 ${fs}px Kanit, Thonburi, "Leelawadee UI", sans-serif`;
  const sfont = `400 ${fs * 0.62}px Kanit, Thonburi, "Leelawadee UI", sans-serif`;
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = font; let w = g.measureText(text).width;
  if (sub) { g.font = sfont; w = Math.max(w, g.measureText(sub).width); }
  const lineH = fs * 1.3, h = lineH + (sub ? fs * 0.8 : 0) + 16;
  c.width = Math.ceil(w + 44); c.height = Math.ceil(h);
  if (bg) {
    const r = 26; g.fillStyle = bg; g.beginPath();
    g.moveTo(r, 0); g.arcTo(c.width, 0, c.width, c.height, r); g.arcTo(c.width, c.height, 0, c.height, r);
    g.arcTo(0, c.height, 0, 0, r); g.arcTo(0, 0, c.width, 0, r); g.fill();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
  g.font = font; g.fillText(text, c.width / 2, 8 + lineH / 2);
  if (sub) { g.font = sfont; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(sub, c.width / 2, 8 + lineH + fs * 0.35); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  const k = size / lineH; sp.scale.set(c.width * k, c.height * k, 1); sp.renderOrder = 5;
  return sp;
}
function addLabel(text, x, y, opts) { const l = label(text, opts); l.position.set(x, y, 1.0); heart.add(l); return l; }

// ตัวหัวใจโปร่งใส (รูปหัวใจ)
function buildHeartBody() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 140; i++) {
    const t = (i / 140) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const p = [x * 0.165, y * 0.165 + 0.3];
    i ? s.lineTo(...p) : s.moveTo(...p);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 4, curveSegments: 8 });
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0xff6b81, emissive: 0xff2d55, emissiveIntensity: 0.15, transparent: true, opacity: 0.2,
    roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.position.z = -0.75; heart.add(m);
  // ผนังกั้นกลาง (Septum)
  const sep = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.5), mat(0xffb3c1, 0.55, 0.1));
  sep.position.set(0, -0.2, 0.2); heart.add(sep);
}

// ห้องหัวใจ 4 ห้อง
const chambers = {};
function buildChambers() {
  const CH = {
    RA: { p: [-1.15, 0.72], s: [0.85, 0.72, 0.45], c: 0x5b6cff, t: 'ห้องบนขวา', e: 'RA' },
    RV: { p: [-0.8, -0.9],  s: [0.95, 1.05, 0.5],  c: 0x4656d8, t: 'ห้องล่างขวา', e: 'RV' },
    LA: { p: [1.15, 0.75],  s: [0.85, 0.72, 0.45], c: 0xff5a6e, t: 'ห้องบนซ้าย', e: 'LA' },
    LV: { p: [0.8, -0.95],  s: [1.05, 1.15, 0.55], c: 0xe0283e, t: 'ห้องล่างซ้าย', e: 'LV' },
  };
  const geo = new THREE.SphereGeometry(1, 40, 28);
  for (const [k, d] of Object.entries(CH)) {
    const m = new THREE.Mesh(geo, mat(d.c, 0.72, 0.3));
    m.position.set(d.p[0], d.p[1], 0.3); m.scale.set(...d.s); m.userData.s = d.s;
    heart.add(m); chambers[k] = m;
    const l = addLabel(d.t, d.p[0], d.p[1] + (k[1] === 'A' ? 0.12 : -0.15), { size: 0.2, bg: null, sub: d.e });
    l.material.opacity = 0.9;
  }
}

// ลิ้นหัวใจ (2 แผ่นพับเปิด-ปิด) dir=1 เปิดลงล่าง, -1 เปิดขึ้นบน
const valves = {};
function buildValve(key, x, y, dir, name) {
  const g = new THREE.Group(); g.position.set(x, y, 0.75);
  const m = mat(0xffe8a3, 1, 0.35);
  const flap = () => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.28), m); return b; };
  const L = new THREE.Group(); L.position.x = -0.27; const fl = flap(); fl.position.x = 0.13; L.add(fl);
  const R = new THREE.Group(); R.position.x = 0.27; const fr = flap(); fr.position.x = -0.13; R.add(fr);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), mat(0xfff3cf, 1, 0.4));
  ring.rotation.x = Math.PI / 2;
  g.add(L, R, ring); heart.add(g);
  valves[key] = { g, L, R, dir, a: 0 };
  if (name) addLabel(name, x + (x < 0 ? -1.0 : 1.0), y, { size: 0.17 });
}

// หลอดเลือด
function tube(pts, color, r = 0.2, z = 0.35) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V3(p, z)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, r, 14, false), mat(color, 0.9, 0.3));
  heart.add(m); return m;
}
const lungs = {};
function buildVessels() {
  const BLUE = 0x4f6bff, RED = 0xff3048;
  const B = ROUTE.black.segs, Rr = ROUTE.red.segs;
  tube([[-1.35, -4.3], ...B[0].slice(1)], BLUE);                                  // เวนาคาวาล่าง (จากขา)
  tube([[-1.25, 3.9], [-1.3, 2.6], [-1.2, 1.3]], BLUE);                             // เวนาคาวาบน (จากหัว)
  tube([[-0.4, -0.3], ...B[2].slice(2), ...B[3].slice(1)], BLUE);                   // หลอดเลือดแดงพัลโมนารี → ปอดขวา
  tube([[-0.3, 2.3, 0.35], [0.8, 2.2, -0.5], [2.4, 2.3, -0.5], [3.1, 2.2, -0.3]], BLUE, 0.14); // แขนงไปปอดซ้าย (ด้านหลัง)
  tube(Rr[0], RED);                                                                 // หลอดเลือดดำพัลโมนารี (จากปอดซ้าย)
  tube([[-3.1, 1.8, -0.3], [-1.5, 1.5, -0.65], [0.3, 1.15, -0.65], [1.1, 0.8, 0.2]], RED, 0.14); // จากปอดขวา (ด้านหลัง)
  tube([[0.38, -0.3], [0.32, 1.4], [0.4, 2.8], [1.05, 3.35], [1.9, 3.0, -0.2], [2.6, 1.0, -0.6], [2.7, -2.0, -0.6], [2.75, -4.3, -0.4]], RED, 0.22); // เอออร์ตา

  const lg = new THREE.SphereGeometry(1, 36, 24);
  for (const [k, x] of [['right', -3.45], ['left', 3.45]]) {
    const m = mat(0xff9fb2, 0.78, 0.15);
    const l = new THREE.Mesh(lg, m); l.position.set(x, 2.0, -0.2); l.scale.set(0.95, 1.45, 0.55);
    heart.add(l); lungs[k] = l;
  }
  addLabel('ปอดขวา', -3.45, 3.75, { size: 0.24 });
  addLabel('ปอดซ้าย', 3.45, 3.75, { size: 0.24 });
  addLabel('เวนาคาวา', -2.3, -3.1, { size: 0.19, sub: 'Vena Cava' });
  addLabel('เอออร์ตา', 3.65, -1.6, { size: 0.19, sub: 'Aorta' });
  addLabel('⬆ เลือดจากร่างกาย / ขา', -1.35, -4.45, { size: 0.2, bg: 'rgba(79,107,255,.55)' });
  addLabel('⬇ ไปเลี้ยงร่างกาย', 2.75, -4.45, { size: 0.2, bg: 'rgba(255,48,72,.55)' });
}

// รถเม็ดเลือดแดง (ทรงจานเว้ากลางแบบเม็ดเลือดจริง) + ตาการ์ตูน
const cars = {};
const segCurves = { black: [], red: [] };
function makeCar(team) {
  const T = TEAMS[team], R = 0.4, pts = [];
  const h = (r) => { const p = r / R; return R * 0.5 * Math.sqrt(Math.max(0, 1 - p * p)) * (0.207 + 2.003 * p * p - 1.123 * p ** 4) * 1.7; };
  for (let i = 0; i <= 24; i++) { const r = (R * i) / 24; pts.push(new THREE.Vector2(r, h(r))); }
  for (let i = 24; i >= 0; i--) { const r = (R * i) / 24; pts.push(new THREE.Vector2(r, -h(r))); }
  const bodyMat = new THREE.MeshStandardMaterial({ color: T.car, emissive: T.car, emissiveIntensity: 0.35, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), bodyMat);
  body.rotation.x = Math.PI / 2;
  const g = new THREE.Group(); g.add(body);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), dark = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const sx of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), white); e.position.set(sx, 0.06, 0.14);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8), dark); p.position.set(sx, 0.06, 0.2);
    g.add(e, p);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: T.accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.5, 1.5, 1); glow.position.z = -0.15; g.add(glow);
  const tag = label(T.short, { size: 0.2, bg: T.accent }); tag.position.set(0, 0.55, 0.2); tag.renderOrder = 22; g.add(tag);
  g.traverse((o) => { if (o.isMesh) o.renderOrder = 20; });
  g.userData = { bodyMat, glow, team, moving: false };
  heart.add(g); cars[team] = g;
  segCurves[team] = ROUTE[team].segs.map((s) => new THREE.CatmullRomCurve3(s.map((p) => V3(p, 1.25))));
}
function placeCar(team, pos) {
  const segs = segCurves[team];
  const p = pos < segs.length ? segs[pos].getPointAt(0) : segs[segs.length - 1].getPointAt(1);
  cars[team].position.copy(p);
  // กันรถ 2 คันทับกันตอนอยู่จุดเดียวกัน
}

// ประกายตามหลังรถ
const trail = [];
function buildTrail() {
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.visible = false; s.renderOrder = 15; s.userData.life = 0; heart.add(s); trail.push(s);
  }
}
let trailIdx = 0;
function emitTrail(car) {
  const s = trail[trailIdx++ % trail.length];
  s.position.copy(car.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, -0.1));
  s.material.color.set(car.userData.bodyMat.color).lerp(new THREE.Color(0xffffff), 0.3);
  s.userData.life = 0.7; s.visible = true;
}
function updateTrail(dt) {
  for (const s of trail) {
    if (!s.visible) continue;
    s.userData.life -= dt;
    if (s.userData.life <= 0) { s.visible = false; continue; }
    const k = s.userData.life / 0.7; s.material.opacity = k; s.scale.setScalar(0.5 * k + 0.1);
  }
}

// วงจรเลือดครบรอบ (โชว์ตอนจบเกม)
let loopDots = null;
function buildLoop() {
  const P = [[-1.35, -3.9], [-1.4, -2.3], [-1.3, -0.6], [-1.15, 0.72], [-0.97, 0], [-0.8, -0.9], [-0.4, -0.3], [-0.36, 1.1], [-0.3, 2.3],
    [-1.2, 3.05], [-2.5, 2.8], [-3.3, 2.2], [-3.5, 3.3], [-2.0, 4.3], [0, 4.5], [2.0, 4.3], [3.5, 3.3], [3.3, 2.2], [2.5, 1.95], [1.8, 1.25],
    [1.15, 0.75], [0.97, 0], [0.8, -0.95], [0.38, -0.3], [0.32, 1.4], [0.4, 2.8], [1.05, 3.35], [1.9, 3.0], [2.6, 1.0], [2.7, -2.0],
    [2.75, -3.9], [2.0, -4.6], [0.5, -4.8], [-0.8, -4.6]];
  const curve = new THREE.CatmullRomCurve3(P.map((p) => V3(p, 1.1)), true);
  const nearest = (x, y) => { let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const q = curve.getPointAt(i / 400); const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = i / 400; } } return best; };
  const uLung = nearest(0, 4.5), uBody = nearest(0.5, -4.8);
  const geo = new THREE.SphereGeometry(0.08, 10, 8);
  const dots = [];
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.renderOrder = 18; m.visible = false; m.userData.u = i / 70; heart.add(m); dots.push(m);
  }
  loopDots = { curve, dots, uLung, uBody, on: false };
}
const C_BLUE = new THREE.Color(0x6d7dff), C_RED = new THREE.Color(0xff2a3d);
function updateLoop(dt) {
  if (!loopDots.on) return;
  for (const d of loopDots.dots) {
    d.userData.u = (d.userData.u + dt * 0.05) % 1;
    const u = d.userData.u; loopDots.curve.getPointAt(u, d.position);
    d.material.color.copy(u > loopDots.uLung && u < loopDots.uBody ? C_RED : C_BLUE);
  }
}
function setLoop(on) { loopDots.on = on; loopDots.dots.forEach((d) => (d.visible = on)); }

// ---------- ระบบแอนิเมชัน ----------
const tweens = new Set();
function anim(dur, fn) { return new Promise((res) => tweens.add({ t: 0, dur, fn, res })); }
function updateTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt; const p = Math.min(1, tw.t / tw.dur); tw.fn(p);
    if (p >= 1) { tweens.delete(tw); tw.res(); }
  }
}
function clearTweens() { for (const tw of tweens) tw.res(); tweens.clear(); }

function valveTo(key, open, dur = 0.35) {
  const v = valves[key], from = v.a, to = open ? 1.25 : 0;
  return anim(dur, (p) => { v.a = from + (to - from) * ease(p); v.L.rotation.z = -v.a * v.dir; v.R.rotation.z = v.a * v.dir; });
}
function squeeze(key) {
  const m = chambers[key], s = m.userData.s;
  return anim(0.55, (p) => { const k = 1 - 0.25 * Math.sin(p * Math.PI); m.scale.set(s[0] * k, s[1] * k, s[2]); });
}
function moveCar(team, seg, dur = 1.8) {
  const car = cars[team], c = segCurves[team][seg];
  sfx.whoosh(); car.userData.moving = true;
  return anim(dur, (p) => { c.getPointAt(ease(p), car.position); car.rotation.z = Math.sin(p * Math.PI * 6) * 0.15; if (p >= 1) { car.userData.moving = false; car.rotation.z = 0; } });
}
function recolor(team, hex, dur = 1.2) {
  const m = cars[team].userData.bodyMat, from = m.color.clone(), to = new THREE.Color(hex);
  return anim(dur, (p) => { m.color.copy(from).lerp(to, p); m.emissive.copy(m.color); });
}
function glowLung(key) {
  const m = lungs[key].material;
  return anim(1.6, (p) => { m.emissiveIntensity = 0.15 + Math.sin(p * Math.PI) * 0.9; });
}

// ---------- จัดขนาดฉากให้พอดีจอ ----------
const handsCanvas = $('#hands'), hctx = handsCanvas.getContext('2d');
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cam3.aspect = w / h;
  const halfH = Math.max(5.3, 5.0 / cam3.aspect);
  cam3.position.set(0, 0.2, halfH / Math.tan(THREE.MathUtils.degToRad(20)));
  cam3.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio, 2);
  handsCanvas.width = w * dpr; handsCanvas.height = h * dpr; hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);

// ลากนิ้ว/เมาส์บนหัวใจเพื่อหมุนดู
const userRot = { x: 0, y: 0 }; let drag = null;
canvas3.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  userRot.y = THREE.MathUtils.clamp(userRot.y + (e.clientX - drag.x) * 0.008, -0.9, 0.9);
  userRot.x = THREE.MathUtils.clamp(userRot.x + (e.clientY - drag.y) * 0.006, -0.5, 0.5);
  drag = { x: e.clientX, y: e.clientY };
});

// ======================= เสียง (สร้างเอง ไม่ต้องมีไฟล์) =======================
let actx = null, soundOn = true;
function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, to = null } = {}) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime + at, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.2, f0 = 800, f1 = 3000, q = 1 } = {}) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime, n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(actx.destination); src.start(t);
}
const sfx = {
  beat: (v = 0.35) => { tone(62, 0.16, { vol: v }); tone(54, 0.14, { vol: v * 0.8, at: 0.2 }); },
  buzz: () => { tone(660, 0.1, { type: 'square', vol: 0.12 }); tone(990, 0.16, { type: 'square', vol: 0.12, at: 0.1 }); },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.22, at: i * 0.08 })),
  wrong: () => tone(300, 0.45, { type: 'sawtooth', vol: 0.12, to: 120 }),
  crash: () => { noise(0.45, { vol: 0.35, f0: 1200, f1: 200 }); tone(90, 0.4, { type: 'square', vol: 0.15, to: 40 }); },
  whoosh: () => noise(0.9, { vol: 0.16, f0: 300, f1: 2500, q: 2 }),
  valve: () => tone(180, 0.08, { type: 'triangle', vol: 0.22 }),
  sparkle: () => [1319, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, { vol: 0.1, at: i * 0.06 })),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.22, at: i * 0.13 })),
  pick: () => tone(1200, 0.06, { type: 'square', vol: 0.06 }),
};

// ======================= กล้อง + จับมือ =======================
const video = $('#cam');
let stream = null, facing = 'user', landmarker = null, hands = [], showHands = true;
let lastVideoTime = -1, lastDetect = 0;

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(isSecureContext ? 'เบราว์เซอร์นี้ไม่รองรับกล้อง' : 'ต้องเปิดผ่าน https ถึงจะใช้กล้องได้');
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream; await video.play();
  video.classList.toggle('rear', facing !== 'user');
}
async function loadHands() {
  const { FilesetResolver, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', location.href).href);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: new URL('./vendor/hand_landmarker.task', location.href).href, delegate },
    runningMode: 'VIDEO', numHands: 4,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
  catch (e) { console.warn('GPU ใช้ไม่ได้ สลับไป CPU', e); landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
}
// แปลงพิกัดในภาพกล้อง → พิกัดบนจอ (ภาพกล้องแสดงแบบ cover และกลับซ้ายขวาเหมือนกระจกถ้าเป็นกล้องหน้า)
function mapPt(x, y) {
  const vw = video.videoWidth, vh = video.videoHeight, W = innerWidth, H = innerHeight;
  const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
  let sx = (W - dw) / 2 + x * dw;
  if (facing === 'user') sx = W - sx;
  return [sx, (H - dh) / 2 + y * dh];
}
const TIPS = [8, 12, 16, 20], PIPS = [6, 10, 14, 18];
function analyzeHand(lm) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const dist = (a, b) => Math.hypot((lm[a].x - lm[b].x) * vw, (lm[a].y - lm[b].y) * vh);
  let count = 0;
  TIPS.forEach((t, k) => { if (dist(t, 0) > dist(PIPS[k], 0) * 1.15) count++; });
  const pts = lm.map((p) => mapPt(p.x, p.y));
  const [cx, cy] = pts[9];
  const size = Math.hypot(pts[0][0] - pts[9][0], pts[0][1] - pts[9][1]);
  return { pts, count, cx, cy, size, zone: cx < innerWidth / 2 ? 'black' : 'red' };
}
function detectHands(now) {
  if (!landmarker || video.readyState < 2 || now - lastDetect < 55) return;
  if (video.currentTime === lastVideoTime) return;
  lastDetect = now; lastVideoTime = video.currentTime;
  try {
    const res = landmarker.detectForVideo(video, now);
    hands = (res.landmarks || []).map(analyzeHand);
  } catch (e) { console.warn(e); }
}
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
function drawHands() {
  hctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!showHands) return;
  for (const h of hands) {
    const col = TEAMS[h.zone].accent;
    const live = S.state === 'buzz' || S.state === 'win' || ((S.state === 'answer' || S.state === 'cards') && h.zone === S.team);
    hctx.globalAlpha = live ? 1 : 0.3;
    hctx.strokeStyle = col; hctx.lineWidth = 4; hctx.lineCap = 'round';
    hctx.beginPath();
    for (const [a, b] of BONES) { hctx.moveTo(...h.pts[a]); hctx.lineTo(...h.pts[b]); }
    hctx.stroke();
    hctx.fillStyle = '#fff';
    for (const p of h.pts) { hctx.beginPath(); hctx.arc(p[0], p[1], 4, 0, Math.PI * 2); hctx.fill(); }
    // ป้ายบอกว่าเครื่องอ่านได้กี่นิ้ว
    const bx = h.cx, by = Math.min(...h.pts.map((p) => p[1])) - 34;
    hctx.fillStyle = col; hctx.beginPath(); hctx.arc(bx, by, 26, 0, Math.PI * 2); hctx.fill();
    hctx.fillStyle = '#fff'; hctx.font = '700 26px Kanit, sans-serif'; hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
    hctx.fillText(h.count >= 4 ? '🖐' : String(h.count), bx, by + 1);
  }
  hctx.globalAlpha = 1;
}

// ======================= สถานะเกม =======================
const S = {
  state: 'start', tok: 0, pos: { black: 0, red: 0 }, team: null, tried: [], disabled: new Set(),
  q: null, used: new Set(), correctIdx: 0, cardOpts: [], cardCorrect: 0,
  deadline: 0, timeLimit: 0, buzz: { black: 0, red: 0 }, hold: { v: 0, t: 0 }, winHold: 0,
};
// รอแบบยกเลิกได้ (ถ้าครูกดข้าม/เริ่มใหม่ระหว่างรอ จะคืนค่า false)
async function wait(ms) { const tok = S.tok; await sleep(ms); return tok === S.tok; }

const panel = $('#panel');
function setState(st) {
  S.state = st;
  for (const t of ['black', 'red']) {
    const z = $(`#zone-${t}`), hud = $(`#hud-${t}`);
    const act = st === 'buzz' || ((st === 'answer' || st === 'cards') && S.team === t);
    z.classList.toggle('dim', !act); z.classList.toggle('active', act && st !== 'buzz');
    hud.classList.toggle('active', (st === 'answer' || st === 'cards' || st === 'moving') && S.team === t);
    if (st !== 'buzz') setBuzzBar(t, 0);
  }
  S.hold = { v: 0, t: 0 };
}
function setBuzzBar(t, p) { $(`#zone-${t} .bar i`).style.width = `${Math.min(1, p) * 100}%`; }

function showPanel({ team = null, tag, title, html, hint = '', timer = 0 }) {
  panel.className = team || '';
  $('#p-tag').innerHTML = tag; $('#p-title').innerHTML = title;
  $('#p-choices').innerHTML = html; $('#p-hint').innerHTML = hint;
  panel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i)));
  setTimer(timer);
  document.body.classList.add('panel-open');
}
function hidePanel() { panel.className = 'hidden'; document.body.classList.remove('panel-open'); }
function setHint(h) { $('#p-hint').innerHTML = h; }
function setTimer(sec) {
  S.timeLimit = sec; S.deadline = sec ? performance.now() + sec * 1000 : 0;
  $('#p-timer').classList.toggle('off', !sec);
}
function choiceEls() { return [...panel.querySelectorAll('.choice')]; }
function mark(i, cls) { const el = choiceEls()[i]; if (el) el.classList.add(cls); }
function setHoldRing(v, p) {
  choiceEls().forEach((el, i) => { const on = v === i + 1; el.style.setProperty('--p', on ? Math.min(100, p * 100) : 0); el.classList.toggle('hot', on); });
}
function showCaption(html) { const c = $('#caption'); c.innerHTML = html; c.classList.remove('hidden'); }
function hideCaption() { $('#caption').classList.add('hidden'); }
function flash() { const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = 0.55; setTimeout(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; }, 60); }

function updateHud() {
  for (const t of ['black', 'red']) {
    $(`#hud-${t}`).querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < S.pos[t]));
    $(`#hud-${t} .loc`).textContent = '📍 ' + ROUTE[t].locs[S.pos[t]];
  }
}

// ---------- รอบคำถาม ----------
function nextQuestion() {
  S.tok++; hideCaption();
  const Q = window.QUESTIONS;
  if (S.used.size >= Q.length) S.used.clear();
  let i; do i = (Math.random() * Q.length) | 0; while (S.used.has(i));
  S.used.add(i);
  const q = Q[i], order = shuffle(q.choices.map((_, k) => k));
  S.q = { ...q, choices: order.map((k) => q.choices[k]) };
  S.correctIdx = order.indexOf(q.answer);
  S.tried = []; S.team = null; S.disabled = new Set(); S.buzz = { black: 0, red: 0 };
  setState('buzz');
  showPanel({
    tag: '❓ คำถาม', title: q.q,
    html: S.q.choices.map((c, k) => `<button class="choice" data-i="${k}"><span class="num">${k + 1}</span><span>${c}</span></button>`).join(''),
    hint: 'ทีมไหนรู้คำตอบ <b>ชูมือแบ 🖐 ค้างไว้</b> ในโซนของทีมตัวเอง (หรือแตะปุ่มโซนทีมด้านล่าง)',
  });
}
function onBuzz(team) {
  if (S.state !== 'buzz') return;
  sfx.buzz(); S.team = team; S.tried.push(team);
  startAnswer(team);
}
function startAnswer(team) {
  S.team = team; setState('answer');
  panel.className = team;
  $('#p-tag').innerHTML = `✋ ${TEAMS[team].name} ตอบ!`;
  setHint(`<b>${TEAMS[team].name}</b> ชูนิ้ว <b>☝️ 1 · ✌️ 2 · 🤟 3</b> ค้างไว้ เพื่อเลือกข้อ`);
  setTimer(ANSWER_TIME);
}
function choose(i) {
  if (S.state === 'answer') answer(i);
  else if (S.state === 'cards') pickCard(i);
}
async function answer(i) {
  if (S.state !== 'answer' || S.disabled.has(i)) return;
  const team = S.team; setState('reveal'); setTimer(0); setHoldRing(0, 0);
  if (i === S.correctIdx) {
    sfx.correct(); mark(i, 'ok');
    setHint(`✅ <b>ถูกต้อง!</b> ${S.q.explain || ''}`);
    if (!(await wait(3000))) return;
    showCards(team);
    return;
  }
  sfx.wrong();
  if (i >= 0) { mark(i, 'bad'); S.disabled.add(i); }
  const o = other(team);
  if (!S.tried.includes(o)) {
    setHint(i < 0 ? `⏰ หมดเวลา! <b>${TEAMS[o].name}</b> แย่งตอบได้!` : `❌ ยังไม่ถูก! <b>${TEAMS[o].name}</b> แย่งตอบได้!`);
    if (!(await wait(2000))) return;
    S.tried.push(o); startAnswer(o);
  } else {
    mark(S.correctIdx, 'ok');
    setHint(`เฉลย: <b>${S.q.choices[S.correctIdx]}</b> — ${S.q.explain || ''}`);
    if (!(await wait(4500))) return;
    nextQuestion();
  }
}

// ---------- รอบการ์ดคำสั่ง ----------
function showCards(team) {
  const r = ROUTE[team], step = S.pos[team];
  const correct = r.cards[step];
  const mirror = ROUTE[other(team)].cards[step];            // การ์ดหลอก: ด่านเดียวกันของหัวใจอีกซีก
  const own = r.cards[step < 3 ? step + 1 : step - 1];      // การ์ดหลอก: ผิดลำดับในซีกเดียวกัน
  S.cardOpts = shuffle([correct, mirror, own]);
  S.cardCorrect = S.cardOpts.indexOf(correct);
  S.team = team; setState('cards');
  showPanel({
    team, tag: `🃏 ${TEAMS[team].name} เลือกการ์ดคำสั่ง`,
    title: `รถอยู่ที่ <b>${r.locs[step]}</b> — ต้องใช้การ์ดไหนถึงจะไปต่อได้?`,
    html: S.cardOpts.map((id, k) => { const c = CARDS[id]; return `<button class="choice cardc" data-i="${k}"><span class="num">${k + 1}</span><span class="emo">${c.i}</span><span class="ct">${c.t}</span><span class="ce">${c.e}</span></button>`; }).join(''),
    hint: `ชูนิ้ว <b>☝️ 1 · ✌️ 2 · 🤟 3</b> ค้างไว้ เพื่อเลือกการ์ด`,
    timer: CARD_TIME,
  });
}
function wrongWhy(team, id) {
  const r = ROUTE[team], step = S.pos[team], correct = CARDS[r.cards[step]], c = CARDS[id];
  let why;
  if (!r.cards.includes(id)) why = `การ์ด “${c.t}” เป็นของหัวใจ<b>ซีก${c.side}</b> แต่${TEAMS[team].name}วิ่งอยู่ในหัวใจซีก${TEAMS[team].heartSide}`;
  else why = r.cards.indexOf(id) > step ? `ใจร้อนไปหนึ่งขั้น! “${c.t}” ต้องใช้ทีหลัง` : `ขั้น “${c.t}” ผ่านมาแล้ว`;
  return `💥 <b>รถชนผนัง!</b> ${why}<br>ตอนนี้อยู่ที่ <b>${r.locs[step]}</b> ต้องใช้การ์ด <b>“${correct.t}”</b>`;
}
async function pickCard(i) {
  if (S.state !== 'cards') return;
  const team = S.team, step = S.pos[team];
  setState('reveal'); setTimer(0); setHoldRing(0, 0);
  if (i === S.cardCorrect) {
    sfx.correct(); mark(i, 'ok');
    if (!(await wait(700))) return;
    hidePanel(); setState('moving');
    await playMove(team, step);
    if (S.state !== 'moving') return;
    S.pos[team]++; updateHud();
    if (S.pos[team] >= 4) return win(team);
    if (!(await wait(500))) return;
    nextQuestion();
    return;
  }
  if (i >= 0) { mark(i, 'bad'); mark(S.cardCorrect, 'ok'); setHint(wrongWhy(team, S.cardOpts[i])); crash(team); }
  else { sfx.wrong(); mark(S.cardCorrect, 'ok'); setHint(`⏰ หมดเวลา! เสียตานี้ไป — การ์ดที่ถูกคือ <b>“${CARDS[ROUTE[team].cards[step]].t}”</b>`); }
  if (!(await wait(5000))) return;
  nextQuestion();
}
async function crash(team) {
  sfx.crash(); flash();
  const car = cars[team], p0 = car.position.clone();
  await anim(0.7, (p) => { const k = 1 - p; car.position.x = p0.x + Math.sin(p * 40) * 0.14 * k; car.rotation.z = Math.sin(p * 30) * 0.6 * k; });
  car.position.copy(p0); car.rotation.z = 0;
}
async function playMove(team, step) {
  const tok = S.tok;
  showCaption(`✅ ${ROUTE[team].ok[step]}`);
  const K = team === 'black' ? { av: 'tri', sv: 'pul', v: 'RV', lung: 'right' } : { av: 'mit', sv: 'aor', v: 'LV', lung: 'left' };
  if (step === 0) {
    await moveCar(team, 0, 2.0);
  } else if (step === 1) {
    sfx.valve(); await valveTo(K.av, true);
    await moveCar(team, 1, 1.5);
    sfx.valve(); await valveTo(K.av, false);
  } else if (step === 2) {
    sfx.beat(0.5); squeeze(K.v); valveTo(K.sv, true);
    await moveCar(team, 2, 1.5);
    await valveTo(K.sv, false);
  } else {
    await moveCar(team, 3, 2.2);
    if (tok !== S.tok) return;
    if (team === 'black') { glowLung('right'); sfx.sparkle(); await recolor('black', 0xff2a3d); }
    else { sfx.sparkle(); await recolor('red', 0x6b0f24); }
  }
  if (tok === S.tok) await sleep(1800);
  if (tok === S.tok) hideCaption();
}

// ---------- จบเกม ----------
function win(team) {
  S.tok++; S.team = team; setState('win'); S.winHold = 0;
  sfx.win(); setLoop(true); hideCaption();
  const chip = (t, c) => `<span class="${c}">${t}</span>`;
  const arrow = '<span>→</span>';
  const chain = [
    chip('ร่างกาย', 'x'), chip('เวนาคาวา', 'b'), chip('ห้องบนขวา', 'b'), chip('ลิ้นไตรคัสปิด', 'b'), chip('ห้องล่างขวา', 'b'),
    chip('ลิ้นพัลโมนารี', 'b'), chip('หลอดเลือดแดงพัลโมนารี', 'b'), chip('ปอด (ฟอกเลือด)', 'x'), chip('หลอดเลือดดำพัลโมนารี', 'r'),
    chip('ห้องบนซ้าย', 'r'), chip('ลิ้นไมทรัล', 'r'), chip('ห้องล่างซ้าย', 'r'), chip('ลิ้นเอออร์ติก', 'r'), chip('เอออร์ตา', 'r'), chip('ร่างกาย', 'x'),
  ].join(arrow);
  showPanel({
    team, tag: '🏆 จบเกม', title: `${TEAMS[team].name} ชนะ! 🎉`,
    html: `<div style="grid-column:1/-1"><div style="margin-bottom:6px">สรุปเส้นทางเลือดครบ 1 รอบ (ดูเม็ดเลือดวิ่งวนบนหัวใจได้เลย)</div><div class="chain">${chain}</div>
           <div class="win-btns"><button id="again">🔄 เล่นอีกรอบ</button></div></div>`,
    hint: 'ชูมือแบ 🖐 ค้างไว้ 2 วินาที หรือแตะปุ่ม เพื่อเล่นอีกรอบ',
  });
  $('#again').addEventListener('click', resetGame);
}

// วางรถกลับตามตำแหน่งจริง (ใช้ตอนครูกดข้ามระหว่างรถกำลังวิ่ง)
function syncCars() {
  clearTweens();
  for (const t of ['black', 'red']) { placeCar(t, S.pos[t]); cars[t].rotation.z = 0; cars[t].userData.moving = false; }
}
function skip() { if (S.state === 'win') return; syncCars(); nextQuestion(); }

function resetGame() {
  S.tok++; clearTweens(); setLoop(false); hideCaption();
  S.pos = { black: 0, red: 0 }; S.used.clear();
  for (const t of ['black', 'red']) {
    placeCar(t, 0); cars[t].rotation.z = 0;
    const m = cars[t].userData.bodyMat; m.color.set(TEAMS[t].car); m.emissive.set(TEAMS[t].car);
  }
  for (const k in valves) { valves[k].a = 0; valves[k].L.rotation.z = 0; valves[k].R.rotation.z = 0; }
  updateHud(); nextQuestion();
}

// ---------- ตรวจท่ามือทุกเฟรม ----------
function gameTick(dt) {
  if (S.state === 'buzz') {
    for (const t of ['black', 'red']) {
      const up = hands.some((h) => h.zone === t && h.count >= 4);
      S.buzz[t] = up ? S.buzz[t] + dt : Math.max(0, S.buzz[t] - dt * 1.5);
      setBuzzBar(t, S.buzz[t] / BUZZ_HOLD);
      if (S.buzz[t] >= BUZZ_HOLD) { onBuzz(t); break; }
    }
  } else if (S.state === 'answer' || S.state === 'cards') {
    const mine = hands.filter((h) => h.zone === S.team && h.count >= 1 && h.count <= 3).sort((a, b) => b.size - a.size);
    let v = mine.length ? mine[0].count : 0;
    if (v && S.state === 'answer' && S.disabled.has(v - 1)) v = 0;
    if (v && v !== S.hold.v) { S.hold = { v, t: 0 }; sfx.pick(); }
    else if (v) S.hold.t += dt;
    else S.hold.t = Math.max(0, S.hold.t - dt * 2);   // มือหลุดจากกล้องแป๊บเดียว ไม่รีเซ็ตทันที
    setHoldRing(S.hold.t > 0 ? S.hold.v : 0, S.hold.t / CHOICE_HOLD);
    if (S.hold.v && S.hold.t >= CHOICE_HOLD) { const i = S.hold.v - 1; S.hold = { v: 0, t: 0 }; choose(i); return; }
    if (S.deadline) {
      const left = (S.deadline - performance.now()) / 1000;
      $('#p-timer i').style.width = `${Math.max(0, left / S.timeLimit) * 100}%`;
      if (left <= 0) { S.deadline = 0; choose(-1); }
    }
  } else if (S.state === 'win') {
    const up = hands.some((h) => h.count >= 4);
    S.winHold = up ? S.winHold + dt : 0;
    if (S.winHold >= 2) resetGame();
  }
}

// ======================= ปุ่ม / คีย์ลัด / เมนู =======================
for (const t of ['black', 'red']) $(`#zone-${t}`).addEventListener('click', () => onBuzz(t));
addEventListener('keydown', (e) => {
  if (S.state === 'start') return;
  const k = e.key.toLowerCase();
  if (['1', '2', '3'].includes(k)) choose(+k - 1);
  else if (k === 'q') onBuzz('black');
  else if (k === 'p') onBuzz('red');
  else if (k === 'n') skip();
  else if (k === 'r') resetGame();
});
$('#menu-btn').addEventListener('click', () => $('#menu').classList.remove('hidden'));
$('#menu').addEventListener('click', async (e) => {
  const act = e.target.dataset?.act;
  if (!act) { if (e.target.id === 'menu') $('#menu').classList.add('hidden'); return; }
  if (act === 'skip') skip();
  if (act === 'reset') resetGame();
  if (act === 'hands') showHands = !showHands;
  if (act === 'sound') soundOn = !soundOn;
  if (act === 'flip' && stream) { facing = facing === 'user' ? 'environment' : 'user'; try { await startCamera(); } catch (err) { console.warn(err); } }
  $('#menu').classList.add('hidden');
});

async function begin(useCam) {
  audio();
  const msg = (m) => ($('#start-msg').textContent = m);
  let camOk = false;
  if (useCam) {
    try {
      msg('กำลังเปิดกล้อง...'); await startCamera(); camOk = true;
      msg('กำลังโหลดตัวจับมือ (ครั้งแรกอาจใช้เวลา 5-20 วินาที)...'); await loadHands();
    } catch (e) {
      console.error(e);
      msg(camOk ? `โหลดตัวจับมือไม่สำเร็จ (${e.message}) — ใช้การแตะจอแทน` : `เปิดกล้องไม่ได้ (${e.message}) — เล่นแบบแตะจอแทน`);
      await sleep(2500);
    }
  }
  document.body.classList.toggle('nocam', !camOk);
  $('#start').classList.add('hidden');
  resetGame();
}
$('#btn-start').addEventListener('click', () => begin(true));
$('#btn-nocam').addEventListener('click', () => begin(false));

// ======================= วนลูปหลัก =======================
let last = performance.now(), T = 0, lastBeat = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; T += dt;
  detectHands(now); gameTick(dt); drawHands();
  updateTweens(dt); updateTrail(dt); updateLoop(dt);
  for (const t of ['black', 'red']) if (cars[t].userData.moving) emitTrail(cars[t]);
  // หัวใจเต้น ~72 ครั้ง/นาที
  const period = 60 / 72, ph = (T % period) / period;
  const k = Math.max(0, 1 - ph * 7) + 0.6 * Math.max(0, 1 - Math.abs(ph - 0.28) * 7);
  heart.scale.setScalar(1 + 0.022 * k);
  if (T - lastBeat >= period) { lastBeat = T; if (S.state !== 'start' && soundOn) sfx.beat(0.1); }
  for (const t of ['black', 'red']) cars[t].userData.glow.material.opacity = 0.65 + 0.35 * Math.sin(T * 5);
  world.rotation.y = userRot.y + (drag ? 0 : Math.sin(T * 0.45) * 0.12);
  world.rotation.x = userRot.x;
  renderer.render(scene, cam3);
  requestAnimationFrame(frame);
}

// รอฟอนต์ไทยโหลดก่อน (ป้ายในฉาก 3D วาดจากฟอนต์) แล้วค่อยสร้างฉาก
await Promise.race([document.fonts.ready, sleep(2000)]);
buildHeartBody(); buildVessels(); buildChambers();
buildValve('tri', -0.97, -0.05, 1, 'ลิ้นไตรคัสปิด');
buildValve('mit', 0.97, -0.05, 1, 'ลิ้นไมทรัล');
buildValve('pul', -0.37, 0.4, -1);
buildValve('aor', 0.35, 0.4, -1);
makeCar('black'); makeCar('red'); buildTrail(); buildLoop();
placeCar('black', 0); placeCar('red', 0); updateHud();
resize(); requestAnimationFrame(frame);
// โหมดทดสอบ (?debug) ไว้เร่งแอนิเมชันตอนตรวจงาน
if (new URLSearchParams(location.search).has('debug')) window.BFR = { S, updateTweens, hands: (h) => (hands = h), gameTick, render: () => renderer.render(scene, cam3) };
