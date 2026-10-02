/* UniVybe hero: a field of glossy, clickable study tokens (XP coins, stars, A+ badges, glowing ideas) */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas = document.getElementById('scene');
const hero = canvas?.closest('.hero');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = matchMedia('(max-width: 720px)').matches;

const COLORS = {
  yellow: 0xFFBE0B, blue: 0x3A86FF, pink: 0xFF006E, cyan: 0x00F5D4, purple: 0x8338EC, ink: 0x0E0C09, paper: 0xFFF7E6,
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  canvas.remove();
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.ink, 16, 34);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 20);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xfff3d6, 0x1a1030, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(5, 8, 10);
scene.add(key);
const rimPink = new THREE.PointLight(COLORS.pink, 40, 30);
rimPink.position.set(-10, -4, 4);
scene.add(rimPink);
const rimBlue = new THREE.PointLight(COLORS.blue, 40, 30);
rimBlue.position.set(10, 6, -2);
scene.add(rimBlue);

/* ---------- textures ---------- */
function labelTexture(text, bg, fg, { font = 'Peace Sans', size = 120, ring = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  if (ring) {
    g.strokeStyle = fg; g.globalAlpha = 0.25; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
  g.fillStyle = fg;
  g.font = `${size}px "${font}", "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------- geometries & materials ---------- */
const glossy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, ...extra,
});

const coinGeo = new THREE.CylinderGeometry(1, 1, 0.3, 56);
const badgeGeo = new THREE.CylinderGeometry(1, 1, 0.34, 6);
const starGeo = (() => {
  const s = new THREE.Shape();
  const pts = 5, outer = 1, inner = 0.46;
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (pts * 2)) * Math.PI * 2 + Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 4 });
  g.center();
  return g;
})();
const torusGeo = new THREE.TorusGeometry(0.75, 0.3, 24, 64);
const capsuleGeo = new THREE.CapsuleGeometry(0.42, 0.9, 8, 24);
const gemGeo = new THREE.IcosahedronGeometry(0.85, 0);
const boxGeo = new RoundedBoxGeometry(1.25, 1.25, 1.25, 5, 0.28);
const bulbGeo = new THREE.SphereGeometry(0.62, 40, 32);
const bulbBaseGeo = new THREE.CylinderGeometry(0.3, 0.26, 0.42, 24);

let xpTex, aTex, fireTex;
function buildTextures() {
  xpTex = labelTexture('XP', '#FFBE0B', '#0E0C09', { size: 118 });
  aTex = labelTexture('A+', '#FF006E', '#FFFFFF', { size: 112, ring: false });
  fireTex = labelTexture('100', '#3A86FF', '#FFFFFF', { size: 86, ring: false });
}

const factories = {
  coin() {
    const side = glossy(0xFFB000, { metalness: 0.1, roughness: 0.25 });
    const face = glossy(0xffffff, { map: xpTex, emissive: 0x3a2a00, emissiveIntensity: 0.4 });
    const m = new THREE.Mesh(coinGeo, [side, face, face]);
    m.rotation.x = Math.PI / 2;
    return { mesh: m, xp: 10, scale: 0.95 };
  },
  badgeA() {
    const side = glossy(0xC70057);
    const face = glossy(0xffffff, { map: aTex });
    const m = new THREE.Mesh(badgeGeo, [side, face, face]);
    m.rotation.x = Math.PI / 2;
    return { mesh: m, xp: 15, scale: 0.9 };
  },
  badge100() {
    const side = glossy(0x2160C9);
    const face = glossy(0xffffff, { map: fireTex });
    const m = new THREE.Mesh(coinGeo, [side, face, face]);
    m.rotation.x = Math.PI / 2;
    return { mesh: m, xp: 10, scale: 0.8 };
  },
  star() { return { mesh: new THREE.Mesh(starGeo, glossy(COLORS.yellow)), xp: 5, scale: 0.9 }; },
  starPink() { return { mesh: new THREE.Mesh(starGeo, glossy(COLORS.pink)), xp: 5, scale: 0.65 }; },
  torus() { return { mesh: new THREE.Mesh(torusGeo, glossy(COLORS.pink)), xp: 5, scale: 0.85 }; },
  capsule() { return { mesh: new THREE.Mesh(capsuleGeo, glossy(COLORS.cyan)), xp: 5, scale: 0.9 }; },
  gem() { return { mesh: new THREE.Mesh(gemGeo, glossy(COLORS.purple, { flatShading: true, roughness: 0.18 })), xp: 5, scale: 0.9 }; },
  box() { return { mesh: new THREE.Mesh(boxGeo, glossy(COLORS.blue)), xp: 5, scale: 0.75 }; },
  bulb() {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(bulbGeo, new THREE.MeshPhysicalMaterial({
      color: COLORS.yellow, emissive: COLORS.yellow, emissiveIntensity: 1.4, roughness: 0.2, clearcoat: 1,
    }));
    const base = new THREE.Mesh(bulbBaseGeo, glossy(0x2b2b2b, { metalness: 0.8, roughness: 0.25 }));
    base.position.y = -0.7;
    g.add(glass, base);
    return { mesh: g, xp: 20, scale: 0.85 };
  },
};

const MIX = isSmall
  ? ['coin', 'coin', 'coin', 'badgeA', 'star', 'torus', 'capsule', 'gem', 'box', 'bulb', 'starPink', 'coin', 'badge100']
  : ['coin', 'coin', 'coin', 'coin', 'coin', 'badgeA', 'badgeA', 'badge100', 'star', 'star', 'starPink', 'starPink',
     'torus', 'torus', 'capsule', 'capsule', 'gem', 'gem', 'box', 'box', 'bulb', 'bulb', 'coin', 'gem', 'capsule', 'star'];

/* ---------- layout ---------- */
const field = new THREE.Group();
scene.add(field);
const tokens = [];
let view = { w: 10, h: 10 };

function viewSizeAt(z) {
  const d = camera.position.z - z;
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
  return { w: h * camera.aspect, h };
}

// Keep tokens out of the headline/form area so copy stays readable.
function inTextZone(x, y, z) {
  const v = viewSizeAt(z);
  const nx = x / (v.w / 2), ny = y / (v.h / 2);
  if (ny > 0.78) return true; // nav bar
  if (isSmall) return Math.abs(nx) < 0.82 && ny > -0.42;
  return nx > -0.92 && nx < 0.12 && ny > -0.95 && ny < 0.66;
}

function placeToken(t, fromBelow = false) {
  for (let i = 0; i < 40; i++) {
    const z = THREE.MathUtils.randFloat(-9, 3);
    const v = viewSizeAt(z);
    const x = THREE.MathUtils.randFloatSpread(v.w * 1.05);
    const y = fromBelow ? -v.h / 2 - 2 : THREE.MathUtils.randFloatSpread(v.h * 1.0);
    if (fromBelow || !inTextZone(x, y, z) || i === 39) {
      t.base.set(x, y, z);
      if (fromBelow) {
        // pick a valid resting target, rise into it
        let tx, ty;
        for (let j = 0; j < 40; j++) {
          tx = THREE.MathUtils.randFloatSpread(v.w * 1.05);
          ty = THREE.MathUtils.randFloatSpread(v.h);
          if (!inTextZone(tx, ty, z)) break;
        }
        t.target = new THREE.Vector3(tx, ty, z);
      }
      return;
    }
  }
}

function buildField() {
  buildTextures();
  MIX.forEach((type, i) => {
    const { mesh, xp, scale } = factories[type]();
    const holder = new THREE.Group();
    holder.add(mesh);
    const s = scale * THREE.MathUtils.randFloat(0.85, 1.2);
    holder.scale.setScalar(s);
    holder.userData.token = true;
    field.add(holder);
    const t = {
      holder, type, xp, s,
      base: new THREE.Vector3(),
      target: null,
      phase: Math.random() * Math.PI * 2,
      bob: THREE.MathUtils.randFloat(0.25, 0.6),
      spin: new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.6), THREE.MathUtils.randFloatSpread(0.9), THREE.MathUtils.randFloatSpread(0.4)),
      popT: -1,
    };
    holder.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    if (type === 'coin' || type.startsWith('badge')) holder.rotation.set(THREE.MathUtils.randFloatSpread(0.6), Math.random() * 6, THREE.MathUtils.randFloatSpread(0.3));
    placeToken(t);
    holder.position.copy(t.base);
    tokens.push(t);
  });
}

/* ---------- sizing ---------- */
function resize() {
  const r = hero.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  view = viewSizeAt(0);
}

/* ---------- interaction ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

function pickAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(field.children, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.token) o = o.parent;
  return tokens.find(t => t.holder === o && t.popT < 0) || null;
}

const isUI = el => el.closest('a, button, input, select, label, textarea, .sticker, .hero-vybe');

hero.addEventListener('pointerdown', e => {
  if (isUI(e.target)) return;
  const t = pickAt(e.clientX, e.clientY);
  if (!t) return;
  t.popT = 0;
  window.univybeXP?.add(t.xp, e.clientX, e.clientY - 20);
  if (reduceMotion) { placeToken(t); t.holder.position.copy(t.base); t.popT = -1; renderOnce(); }
});

let hoverRaf = 0;
hero.addEventListener('pointermove', e => {
  mouse.x = (e.clientX / innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / innerHeight - 0.5) * 2;
  if (hoverRaf || !matchMedia('(pointer: fine)').matches) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const over = !isUI(e.target) && pickAt(e.clientX, e.clientY);
    hero.style.cursor = over ? 'pointer' : '';
  });
}, { passive: true });

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let running = false;
let scrollP = 0;

function update(dt, time) {
  mouse.sx += (mouse.x - mouse.sx) * 0.04;
  mouse.sy += (mouse.y - mouse.sy) * 0.04;
  camera.position.x = mouse.sx * 1.2;
  camera.position.y = -mouse.sy * 0.8 - scrollP * 2;
  camera.lookAt(0, -scrollP * 2, 0);
  field.rotation.y = mouse.sx * 0.08;
  field.position.y = isSmall ? 0 : scrollP * 6;

  for (const t of tokens) {
    const h = t.holder;
    if (t.popT >= 0) {
      // pop: squash, spin fast, shrink away, then rise in from below
      t.popT += dt;
      const p = t.popT / 0.45;
      h.rotation.y += dt * 22;
      h.scale.setScalar(t.s * (p < 0.25 ? 1 + p * 1.6 : Math.max(0.001, 1.4 * (1 - (p - 0.25) / 0.75))));
      if (p >= 1) {
        t.popT = -1;
        placeToken(t, true);
        h.position.copy(t.base);
        h.scale.setScalar(t.s);
      }
      continue;
    }
    if (t.target) {
      t.base.lerp(t.target, Math.min(1, dt * 1.6));
      if (t.base.distanceToSquared(t.target) < 0.01) t.target = null;
    }
    h.position.set(t.base.x, t.base.y + Math.sin(time * 0.9 + t.phase) * t.bob, t.base.z);
    h.rotation.x += t.spin.x * dt;
    h.rotation.y += t.spin.y * dt;
    h.rotation.z += t.spin.z * dt;
  }
  rimPink.position.x = -10 + Math.sin(time * 0.4) * 3;
  rimBlue.position.y = 6 + Math.cos(time * 0.5) * 3;
}

function renderOnce() { renderer.render(scene, camera); }

function tick() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime);
  renderOnce();
  requestAnimationFrame(tick);
}

function start() {
  if (running || reduceMotion) return;
  running = true;
  clock.getDelta();
  requestAnimationFrame(tick);
}
function stop() { running = false; }

addEventListener('scroll', () => {
  scrollP = Math.min(1, scrollY / (hero.offsetHeight || 1));
}, { passive: true });

new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop())).observe(hero);
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
addEventListener('resize', () => { resize(); if (!running) renderOnce(); });

/* ---------- boot (wait for the display font so coin labels render in Peace Sans) ---------- */
(async () => {
  try { await document.fonts.load('100px "Peace Sans"'); } catch { /* fall back to system font */ }
  resize();
  buildField();
  if (reduceMotion) { update(0, 0); renderOnce(); }
  else start();
  canvas.classList.add('ready');
})();
