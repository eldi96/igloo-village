// 일반 이글루 내부. 언리얼 작업이 나오기 전까지 쓰는 임시 3D 방이다.
// 빛과 그림자는 텍스처에 미리 그려 그림자 계산 없이 가볍게 돌린다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const STYLE = `
  .room-ui { font: 400 14px/1.55 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; color: #fff3e4; }
  .room-ui[hidden], .room-ui [hidden] { display: none !important; }
  .room-label { position: fixed; z-index: 3; transform: translate(-50%, -100%); padding: 4px 12px; border: 1px solid rgba(255,226,190,.42); border-radius: 13px; background: rgba(38,18,10,.74); color: #fff3e4; font: 500 12px/1.5 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; white-space: nowrap; pointer-events: none; }
  .room-label[data-empty="true"] { background: rgba(255,232,205,.2); color: #fff3e4; }
  .room-label[data-active="true"] { border-color: #ffe9cf; background: #fff0dd; color: #3a1a0a; }
  .room-veil { position: fixed; z-index: 5; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(26,10,4,.36); }
  .room-form { box-sizing: border-box; width: min(400px, 100%); padding: 26px; border: 1px solid rgba(255,226,190,.2); border-radius: 18px; background: rgb(40,21,13); box-shadow: 0 18px 60px rgba(20,7,2,.5); transition: opacity 160ms cubic-bezier(.23,1,.32,1), transform 160ms cubic-bezier(.23,1,.32,1); }
  @starting-style { .room-form { opacity: 0; transform: translateY(6px) scale(.98); } }
  .room-form h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
  .room-form p { margin: 0; color: #e2c5ab; text-wrap: balance; }
  .room-form label { display: block; margin-top: 18px; color: #e2c5ab; font-size: 12px; }
  .room-form input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin-top: 6px; padding: 0 12px; border: 1px solid rgba(255,226,190,.26); border-radius: 10px; background: rgba(255,226,190,.07); color: #fff6ea; font: inherit; font-size: 15px; }
  .room-form input:focus { outline: 2px solid #ffe9cf; outline-offset: 1px; }
  .room-error { margin-top: 10px !important; color: #ffb9a4 !important; font-size: 13px; }
  .room-error:empty { display: none; }
  .room-actions { display: flex; gap: 8px; margin-top: 18px; }
  .room-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; padding: 8px 16px; border: 1px solid rgba(255,226,190,.28); border-radius: 12px; background: transparent; color: #fff3e4; font: inherit; font-weight: 500; text-align: center; text-decoration: none; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease; }
  .room-btn:active:not(:disabled) { transform: scale(.97); }
  .room-btn:disabled { opacity: .55; cursor: progress; }
  .room-btn.primary { flex: 1; border-color: #fff0dd; background: #fff0dd; color: #3a1a0a; font-weight: 600; }
  .room-card { position: fixed; z-index: 4; top: 24px; right: 24px; bottom: 24px; display: flex; flex-direction: column; box-sizing: border-box; width: min(440px, calc(100vw - 32px)); padding: 26px 28px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid rgba(255,226,190,.24); border-radius: 26px; background: rgba(40,21,13,.93); box-shadow: 0 18px 60px rgba(20,7,2,.42), inset 0 1px rgba(255,226,190,.08); transition: opacity 180ms cubic-bezier(.23,1,.32,1), transform 180ms cubic-bezier(.23,1,.32,1); }
  @starting-style { .room-card { opacity: 0; transform: translateX(12px); } }
  .room-card-top { display: flex; align-items: center; justify-content: space-between; flex: none; }
  .room-pager { display: flex; align-items: center; gap: 4px; color: #e2c5ab; font-size: 13px; font-variant-numeric: tabular-nums; }
  .room-icon { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: #f0d8c2; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease; }
  .room-icon:active:not(:disabled) { transform: scale(.94); }
  .room-icon:disabled { opacity: .3; cursor: default; }
  .room-shot { flex: none; aspect-ratio: 16 / 9; margin-top: 12px; overflow: hidden; border-radius: 14px; background: #f8f3ec; }
  .room-shot svg { display: block; width: 100%; height: 100%; }
  .room-author { display: flex; align-items: center; gap: 10px; flex: none; margin-top: 18px; color: #f0d8c2; font-size: 13px; }
  .room-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #d67030; color: #fff6ea; font-weight: 600; }
  .room-card h2 { flex: none; margin: 12px 0 0; font-size: 25px; font-weight: 600; letter-spacing: -.02em; line-height: 1.3; overflow-wrap: anywhere; }
  .room-link { flex: none; margin-top: 4px; color: #e2c5ab; font-size: 13px; overflow-wrap: anywhere; }
  .room-desc { flex: none; margin: 12px 0 0; color: #f0d8c2; }
  .room-howto { flex: none; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,226,190,.16); }
  .room-howto h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .room-howto ol { margin: 0; padding-left: 20px; color: #f0d8c2; }
  .room-card-actions { display: flex; flex-direction: column; gap: 8px; flex: none; margin-top: auto; padding-top: 18px; }
  .room-btn.quiet { min-height: 36px; border-color: transparent; color: #e2c5ab; font-size: 13px; font-weight: 400; }
  .room-ui button:focus-visible, .room-ui a:focus-visible { outline: 2px solid #fff0dd; outline-offset: 2px; }
  @media (hover: hover) and (pointer: fine) { .room-btn:hover:not(:disabled) { background: rgba(255,226,190,.12); } .room-btn.primary:hover:not(:disabled) { background: #fff; } .room-icon:hover:not(:disabled) { background: rgba(255,226,190,.12); color: #fff; } }
  @media (max-width: 720px) { .room-card { top: auto; right: 0; bottom: 0; width: 100%; max-height: 82dvh; padding: 20px; border-width: 1px 0 0; border-radius: 22px 22px 0 0; } @starting-style { .room-card { opacity: 0; transform: translateY(16px); } } }
  @media (prefers-reduced-motion: reduce) { .room-form, .room-card { transition-property: opacity; } @starting-style { .room-form, .room-card { transform: none; } } .room-btn:active:not(:disabled), .room-icon:active:not(:disabled) { transform: none; } }
`;

const DOME_R = 12;
const WINDOW_PHI = 2.45;
const BOXES = [
  { angle: 0.35, w: 2.1, h: 0.95, d: 1.75 },
  { angle: 2.45, w: 2.1, h: 1.2, d: 1.75 },
  { angle: 4.55, w: 2.1, h: 1.0, d: 1.75 }
];
const BOX_RING = 3.0;
// 빛이 들어오는 방향. 창에서 방 안쪽으로 향한다.
const toWindow = new THREE.Vector3(-Math.cos(WINDOW_PHI), 0, Math.sin(WINDOW_PHI));
const boxAt = box => ({ x: Math.cos(box.angle) * BOX_RING, z: Math.sin(box.angle) * BOX_RING, yaw: -box.angle + Math.PI / 2 });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}
function texture(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// 창틀 그림자가 진 빛 조각을 칸별로 그린다. place(u, v)는 창 안의 위치를 그림 좌표로 바꾼다.
function drawWindowLight(g, place, color) {
  const COLS = 3, ROWS = 4, GAP = 0.06;
  g.fillStyle = color;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const u0 = (c + GAP) / COLS, u1 = (c + 1 - GAP) / COLS, v0 = (r + GAP) / ROWS, v1 = (r + 1 - GAP) / ROWS;
    g.beginPath();
    [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].forEach(([u, v], i) => {
      const [x, y] = place(u, v);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
  }
}

function makeDomeTexture() {
  const W = 4096, H = 1024, ROWS = 7;
  const [canvas, g] = makeCanvas(W, H);
  for (let r = 0; r < ROWS; r++) {
    const y1 = H - r / ROWS * H, y0 = H - (r + 1) / ROWS * H;
    const phi = (r + 0.5) / ROWS * Math.PI / 2;
    const n = Math.max(5, Math.round(Math.PI * 2 * DOME_R * Math.cos(phi) / 3.1));
    for (let i = -1; i < n; i++) {
      const x = (i + (r % 2) * 0.5) / n * W;
      const tone = Math.abs(Math.sin(i * 7.13 + r * 3.71));
      g.fillStyle = `hsl(${21 + tone * 4}, ${56 + tone * 6}%, ${27 + tone * 5 + (ROWS - r) * -0.8}%)`;
      g.fillRect(x, y0, W / n + 1, y1 - y0);
      g.fillStyle = 'rgba(30,11,4,.5)';
      g.fillRect(x - 3, y0, 6, y1 - y0);
    }
    g.fillStyle = 'rgba(30,11,4,.55)';
    g.fillRect(0, y0 - 3, W, 6);
  }
  // 아래쪽은 바닥에서 튄 빛으로 밝고, 꼭대기는 어둡다.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(26,9,3,.62)');
  shade.addColorStop(0.55, 'rgba(26,9,3,.08)');
  shade.addColorStop(1, 'rgba(255,170,90,.2)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // 창 맞은편 벽에 떨어지는 비스듬한 빛.
  const center = ((WINDOW_PHI + Math.PI) % (Math.PI * 2)) / (Math.PI * 2) * W;
  g.save();
  g.filter = 'blur(10px)';
  g.globalCompositeOperation = 'lighter';
  drawWindowLight(g, (u, v) => [center - 340 + u * 620 + v * 240, H * 0.4 + v * H * 0.5 + u * 70], 'rgba(255,176,98,.5)');
  g.restore();
  return texture(canvas);
}

function makeFloorTexture() {
  const S = 2048;
  const [canvas, g] = makeCanvas(S, S);
  const toPx = (x, z) => [(x + DOME_R) / (2 * DOME_R) * S, (z + DOME_R) / (2 * DOME_R) * S];
  g.fillStyle = '#9c5426';
  g.fillRect(0, 0, S, S);
  const [cx, cz] = toPx(0, 0);
  const glow = g.createRadialGradient(cx, cz, 0, cx, cz, S * 0.5);
  glow.addColorStop(0, 'rgba(232,142,76,.7)');
  glow.addColorStop(0.6, 'rgba(190,100,48,.2)');
  glow.addColorStop(1, 'rgba(50,20,8,.75)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // 창에서 방 안쪽으로 길게 뻗는 빛 조각.
  const dir = toWindow.clone().negate();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const start = toWindow.clone().multiplyScalar(8.2);
  g.save();
  g.filter = 'blur(7px)';
  g.globalCompositeOperation = 'lighter';
  drawWindowLight(g, (u, v) => {
    const along = v * 13.5, across = (u - 0.5) * (5 + v * 2.6) + v * 1.6;
    return toPx(start.x + dir.x * along + side.x * across, start.z + dir.z * along + side.z * across);
  }, 'rgba(255,150,84,.62)');
  g.restore();
  // 상자 그림자는 빛 반대쪽으로 길게 늘인다.
  g.save();
  g.filter = 'blur(13px)';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(176,124,98)';
  for (const box of BOXES) {
    const { x, z, yaw } = boxAt(box);
    const hw = box.w / 2, hd = box.d / 2, reach = box.h * 2.1;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + c * a + s * b, z - s * a + c * b]);
    const shifted = corners.map(([a, b]) => [a + dir.x * reach, b + dir.z * reach]);
    const pts = [...corners, ...shifted].map(([a, b]) => toPx(a, b));
    const mid = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
    pts.sort((a, b) => Math.atan2(a[1] - mid[1], a[0] - mid[0]) - Math.atan2(b[1] - mid[1], b[0] - mid[0]));
    g.beginPath();
    pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
    g.closePath();
    g.fill();
  }
  g.restore();
  // 바닥에 닿은 곳을 어둡게 해서 상자가 떠 보이지 않게 한다.
  g.save();
  g.filter = 'blur(6px)';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(120,74,50)';
  for (const box of BOXES) {
    const { x, z, yaw } = boxAt(box);
    const hw = box.w / 2 + 0.04, hd = box.d / 2 + 0.04, c = Math.cos(yaw), s = Math.sin(yaw);
    g.beginPath();
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([a, b], i) => {
      const [px, py] = toPx(x + c * a + s * b, z - s * a + c * b);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
  }
  g.restore();
  return texture(canvas);
}

function makeWindowTexture() {
  const [canvas, g] = makeCanvas(512, 720);
  const sky = g.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, '#fff3dc');
  sky.addColorStop(1, '#ffc98a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 720);
  g.fillStyle = '#4a2413';
  g.fillRect(0, 0, 512, 18);
  g.fillRect(0, 702, 512, 18);
  g.fillRect(0, 0, 18, 720);
  g.fillRect(494, 0, 18, 720);
  for (let i = 1; i < 3; i++) g.fillRect(i * 512 / 3 - 6, 0, 12, 720);
  for (let i = 1; i < 4; i++) g.fillRect(0, i * 720 / 4 - 6, 512, 12);
  return texture(canvas);
}

// 프로젝트 링크로 쓸 수 있는 주소로 정리한다. 형식이 틀리면 null이다.
function normalizeLink(value) {
  let text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = 'https://' + text;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
const hostOf = link => {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return link; }
};
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>';
const ICON_PREV = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2L4 7l5 5"/></svg>';
const ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2l5 5-5 5"/></svg>';
// 첫 화면 캡처가 생기기 전까지 쓰는 예시 그림.
const SAMPLE_SHOT = `<svg viewBox="0 0 640 360" role="img" aria-label="첫 화면 예시 이미지"><rect width="640" height="360" fill="#f8f3ec"/><rect width="640" height="40" fill="#ecdfd0"/><circle cx="24" cy="20" r="6" fill="#e97860"/><circle cx="46" cy="20" r="6" fill="#eeba5c"/><circle cx="68" cy="20" r="6" fill="#7ebe80"/><rect x="104" y="11" width="432" height="18" rx="9" fill="#f8f3ec"/><rect x="36" y="74" width="250" height="22" rx="7" fill="#4a2e1e"/><rect x="36" y="110" width="180" height="12" rx="6" fill="#d0c0b0"/><rect x="36" y="146" width="128" height="38" rx="10" fill="#d67030"/><rect x="36" y="216" width="84" height="104" rx="10" fill="#f0e6da"/><rect x="134" y="216" width="84" height="104" rx="10" fill="#f0e6da"/><rect x="232" y="216" width="84" height="104" rx="10" fill="#f0e6da"/><rect x="378" y="246" width="36" height="74" rx="7" fill="#eca870"/><rect x="430" y="200" width="36" height="120" rx="7" fill="#d67030"/><rect x="482" y="228" width="36" height="92" rx="7" fill="#eca870"/><rect x="534" y="170" width="36" height="150" rx="7" fill="#d67030"/><text x="604" y="346" text-anchor="end" font-size="13" fill="#a08e7c" font-family="sans-serif">예시 이미지</text></svg>`;

export function createRoom({ canvas, backend }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c0b04);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);

  // 방: 돔과 바닥은 그림을 그대로 보여준다.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: makeDomeTexture(), side: THREE.BackSide })
  );
  scene.add(dome);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(DOME_R, 64), new THREE.MeshBasicMaterial({ map: makeFloorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const windowPane = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R - 0.04, 12, 12, WINDOW_PHI - 0.24, 0.48, Math.PI / 2 - 0.62, 0.5),
    new THREE.MeshBasicMaterial({ map: makeWindowTexture(), side: THREE.BackSide, color: new THREE.Color(1.5, 1.42, 1.3) })
  );
  scene.add(windowPane);

  scene.add(new THREE.HemisphereLight(0xffcfa0, 0x9a4f22, 1.5));
  const sun = new THREE.DirectionalLight(0xffc48a, 2.3);
  sun.position.copy(toWindow).multiplyScalar(10).setY(6);
  scene.add(sun);

  // 상자와 그 위에 생기는 오브젝트.
  const boxGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.035);
  const gemGeo = new THREE.OctahedronGeometry(0.34, 0);
  const hitGeo = new THREE.SphereGeometry(0.62, 10, 8);
  const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const slots = BOXES.map((box, index) => {
    const { x, z, yaw } = boxAt(box);
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf0b483, roughness: 0.82, emissive: 0xff8a3a, emissiveIntensity: 0 }));
    mesh.scale.set(box.w, box.h, box.d);
    mesh.position.set(x, box.h / 2, z);
    mesh.rotation.y = yaw;
    mesh.userData.slot = index;
    scene.add(mesh);
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color: 0xffd9a8, roughness: 0.3, metalness: 0.1, emissive: 0xff9a4a, emissiveIntensity: 0.8, flatShading: true }));
    gem.position.set(x, box.h + 0.62, z);
    gem.visible = false;
    scene.add(gem);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.copy(gem.position);
    hit.userData.slot = index;
    hit.userData.gem = true;
    hit.visible = false;
    scene.add(hit);
    const label = document.createElement('div');
    label.className = 'room-label';
    label.hidden = true;
    return { index, box, mesh, gem, hit, label, project: null, anchor: new THREE.Vector3(x, box.h, z), phase: index * 2.1, glow: 0, pop: 0 };
  });

  // 공중에 떠다니는 먼지. 빛이 있는 공간처럼 보이게 한다.
  const dust = (() => {
    const n = 140, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399963) % (Math.PI * 2), r = 1.5 + (i * 0.618 % 1) * 7;
      pos.set([Math.cos(a) * r, 0.4 + (i * 0.381 % 1) * 5, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd7a8, size: 0.03, transparent: true, opacity: 0.32, depthWrite: false }));
  })();
  scene.add(dust);

  // 화면 위 요소.
  const labels = document.createElement('div');
  labels.className = 'room-ui';
  labels.hidden = true;
  slots.forEach(slot => labels.appendChild(slot.label));
  const formVeil = document.createElement('div');
  formVeil.className = 'room-ui room-veil';
  formVeil.hidden = true;
  formVeil.innerHTML = `<form class="room-form" role="dialog" aria-modal="true" aria-labelledby="room-form-title" novalidate><h2 id="room-form-title">이 상자에 프로젝트 올리기</h2><p>링크를 넣으면 상자 위에 오브젝트가 생겨요.</p><label>프로젝트 링크<input name="link" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" maxlength="2048"></label><p class="room-error" role="alert"></p><div class="room-actions"><button type="submit" class="room-btn primary">올리기</button><button type="button" class="room-btn" data-cancel>취소</button></div></form>`;
  const card = document.createElement('aside');
  card.className = 'room-ui room-card';
  card.hidden = true;
  card.setAttribute('aria-label', '프로젝트 상세');
  card.innerHTML = `<div class="room-card-top"><div class="room-pager"><button type="button" class="room-icon" data-prev aria-label="이전 프로젝트">${ICON_PREV}</button><span data-count></span><button type="button" class="room-icon" data-next aria-label="다음 프로젝트">${ICON_NEXT}</button></div><button type="button" class="room-icon" data-close aria-label="카드 닫기">${ICON_CLOSE}</button></div><div class="room-shot">${SAMPLE_SHOT}</div><div class="room-author"><span class="room-avatar" data-avatar></span><span data-owner></span></div><h2 data-title></h2><div class="room-link" data-host></div><p class="room-desc">프로젝트 설명이 들어갈 자리예요. 지금은 임시 문구입니다.</p><div class="room-howto"><h3>사용법</h3><ol><li>프로젝트 열기를 눌러 링크로 이동해요.</li><li>안내에 따라 사용해요.</li></ol></div><div class="room-card-actions"><a class="room-btn primary" data-open target="_blank" rel="noopener noreferrer">프로젝트 열기 →</a><button type="button" class="room-btn quiet" data-remove>이 상자 비우기</button></div><p class="room-error" role="alert" data-card-error></p>`;
  document.body.append(labels, formVeil, card);

  const q = selector => card.querySelector(selector);
  const form = formVeil.querySelector('form');
  const linkInput = form.elements.link;
  const formError = form.querySelector('.room-error');
  const submitBtn = form.querySelector('[type=submit]');

  // 시점: 방 가운데를 중심으로 어느 방향으로든 돌 수 있다. 위아래와 거리는 벽을 벗어나지 않게 제한한다.
  const START = { yaw: 3.5, pitch: 0.26, radius: 9 };
  const view = { ...START, targetYaw: START.yaw, targetPitch: START.pitch, targetRadius: START.radius };
  const LIMIT = { pitchMin: 0.12, pitchMax: 0.72, radiusMin: 5, radiusMax: 9.8 };
  const clampView = () => {
    view.targetPitch = THREE.MathUtils.clamp(view.targetPitch, LIMIT.pitchMin, LIMIT.pitchMax);
    view.targetRadius = THREE.MathUtils.clamp(view.targetRadius, LIMIT.radiusMin, LIMIT.radiusMax);
  };
  const focus = new THREE.Vector3(0, 1.15, 0);
  const placeCamera = () => {
    const cp = Math.cos(view.pitch);
    camera.position.set(Math.cos(view.yaw) * cp * view.radius, focus.y + Math.sin(view.pitch) * view.radius, Math.sin(view.yaw) * cp * view.radius);
    camera.lookAt(focus);
  };
  placeCamera();

  let active = false, home = null, isMine = false, ownerName = '', selected = null, formSlot = null, loadToken = 0, removing = false, lastTime = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const screen = new THREE.Vector3();
  const pointers = new Map();
  let dragged = false, pinch = 0, hovered = null;

  const filled = () => slots.filter(slot => slot.project);
  function pick(x, y) {
    const rect = canvas.getBoundingClientRect();
    ndc.set((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = slots.flatMap(slot => (slot.project ? [slot.hit, slot.mesh] : [slot.mesh]));
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? slots[hit.object.userData.slot] : null;
  }
  // 빈 상자는 주인만 누를 수 있다. 채워진 상자는 볼 수 있는 사람 모두 누를 수 있다.
  const clickable = slot => Boolean(slot && (slot.project || isMine));
  function setLabels() {
    for (const slot of slots) {
      const show = Boolean(slot.project) || isMine;
      slot.label.hidden = !show;
      slot.label.textContent = slot.project ? slot.project.title : '링크 넣기';
      slot.label.dataset.empty = String(!slot.project);
      slot.label.dataset.active = String(selected === slot);
    }
  }
  function applyProjects(rows) {
    // 오래된 프로젝트부터 첫 번째 상자에 놓는다.
    const list = rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, slots.length);
    slots.forEach((slot, i) => {
      slot.project = list[i] || null;
      slot.gem.visible = slot.hit.visible = Boolean(slot.project);
      if (slot.project) slot.pop = 1;
    });
    setLabels();
  }
  function renderCard() {
    if (!selected?.project) return closeCard();
    const list = filled(), { project } = selected;
    q('[data-count]').textContent = `${list.indexOf(selected) + 1} / ${list.length}`;
    q('[data-prev]').disabled = q('[data-next]').disabled = list.length < 2;
    q('[data-avatar]').textContent = (ownerName || '?').trim().charAt(0) || '?';
    q('[data-owner]').textContent = ownerName || '수강생';
    q('[data-title]').textContent = project.title;
    q('[data-host]').textContent = hostOf(project.url);
    q('[data-open]').href = normalizeLink(project.url) || '#';
    q('[data-remove]').hidden = !isMine;
    q('[data-remove]').textContent = removing ? '정말 비울까요? 한 번 더 누르면 지워져요' : '이 상자 비우기';
    q('[data-card-error]').textContent = '';
    card.hidden = false;
    setLabels();
  }
  function openCard(slot) {
    selected = slot;
    removing = false;
    renderCard();
  }
  function closeCard() {
    selected = null;
    removing = false;
    card.hidden = true;
    setLabels();
  }
  function stepCard(delta) {
    const list = filled();
    if (list.length < 2 || !selected) return;
    openCard(list[(list.indexOf(selected) + delta + list.length) % list.length]);
  }
  function openForm(slot) {
    formSlot = slot;
    linkInput.value = '';
    formError.textContent = '';
    submitBtn.disabled = false;
    formVeil.hidden = false;
    linkInput.focus();
  }
  function closeForm() {
    formVeil.hidden = true;
    formSlot = null;
  }
  const failText = error => {
    const text = error?.message || '';
    if (/[가-힣]/.test(text)) return text;
    if (/failed to fetch|network/i.test(text)) return '연결을 확인하고 다시 시도해 주세요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  async function load(token) {
    try {
      const rows = await backend.getProjects(home);
      if (token === loadToken) applyProjects(rows);
    } catch (e) {
      // 로그인 전이거나 비공개 이글루면 빈 상자만 보인다.
      if (token === loadToken) applyProjects([]);
      console.warn('프로젝트를 불러오지 못했어요:', e.message);
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const link = normalizeLink(linkInput.value);
    if (!link) {
      formError.textContent = '올바른 링크를 넣어 주세요. 예: https://example.com';
      linkInput.focus();
      return;
    }
    const token = loadToken, slot = formSlot;
    submitBtn.disabled = true;
    formError.textContent = '';
    try {
      const project = await backend.addProject(home, { title: hostOf(link).slice(0, 120), url: link });
      if (token !== loadToken) return;
      const list = filled().map(s => s.project);
      applyProjects([...list, project]);
      closeForm();
      const placed = slots.find(s => s.project?.id === project.id) || slot;
      openCard(placed);
    } catch (error) {
      if (token === loadToken) formError.textContent = failText(error);
    } finally {
      submitBtn.disabled = false;
    }
  });
  formVeil.querySelector('[data-cancel]').onclick = closeForm;
  formVeil.addEventListener('pointerdown', e => { if (e.target === formVeil) closeForm(); });
  q('[data-close]').onclick = closeCard;
  q('[data-prev]').onclick = () => stepCard(-1);
  q('[data-next]').onclick = () => stepCard(1);
  q('[data-remove]').onclick = async () => {
    if (!removing) {
      removing = true;
      renderCard();
      return;
    }
    const slot = selected, token = loadToken, button = q('[data-remove]');
    button.disabled = true;
    try {
      await backend.deleteProject(slot.project.id);
      if (token !== loadToken) return;
      const rest = filled().filter(s => s !== slot).map(s => s.project);
      closeCard();
      applyProjects(rest);
    } catch (error) {
      removing = false;
      q('[data-card-error]').textContent = failText(error);
    } finally {
      button.disabled = false;
    }
  };

  const onKey = e => {
    if (!active || e.key !== 'Escape') return;
    if (!formVeil.hidden) closeForm();
    else if (!card.hidden) closeCard();
  };
  addEventListener('keydown', onKey);

  canvas.addEventListener('pointerdown', e => {
    if (!active) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) dragged = false;
    pinch = 0;
  });
  addEventListener('pointermove', e => {
    if (!active) return;
    const held = pointers.get(e.pointerId);
    if (!held) {
      if (e.pointerType === 'mouse' && e.target === canvas && !pointers.size) {
        hovered = pick(e.clientX, e.clientY);
        canvas.style.cursor = clickable(hovered) ? 'pointer' : 'grab';
      }
      return;
    }
    const dx = e.clientX - held.x, dy = e.clientY - held.y;
    held.x = e.clientX;
    held.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.targetRadius *= pinch / distance;
      pinch = distance;
      dragged = true;
      clampView();
      return;
    }
    if (!dragged && Math.hypot(e.clientX - held.startX, e.clientY - held.startY) < 6) return;
    dragged = true;
    canvas.style.cursor = 'grabbing';
    view.targetYaw += dx * 0.0052;
    view.targetPitch += dy * 0.0032;
    clampView();
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!active || pointers.size) return;
    canvas.style.cursor = 'grab';
    if (dragged || e.type !== 'pointerup') return;
    const slot = pick(e.clientX, e.clientY);
    if (!clickable(slot)) return;
    if (slot.project) openCard(slot);
    else openForm(slot);
  };
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => {
    if (!active) return;
    e.preventDefault();
    view.targetRadius *= Math.exp(e.deltaY * 0.001);
    clampView();
  }, { passive: false });

  return {
    scene, camera,
    setAspect(aspect) {
      camera.aspect = aspect;
      // 세로로 긴 화면에서도 상자가 모두 보이도록 화각을 넓힌다.
      camera.fov = aspect < 1.1 ? 68 : 50;
      camera.updateProjectionMatrix();
    },
    enter({ home: nextHome, isMine: mine, ownerName: name }) {
      active = true;
      home = nextHome;
      isMine = Boolean(mine);
      ownerName = name || '';
      closeForm();
      closeCard();
      Object.assign(view, START, { targetYaw: START.yaw, targetPitch: START.pitch, targetRadius: START.radius });
      placeCamera();
      labels.hidden = false;
      applyProjects([]);
      canvas.style.cursor = 'grab';
      load(++loadToken);
    },
    leave() {
      active = false;
      loadToken++;
      pointers.clear();
      closeForm();
      closeCard();
      labels.hidden = true;
      canvas.style.cursor = '';
    },
    update(t) {
      const dt = lastTime === null ? 0 : Math.min(t - lastTime, 0.1);
      lastTime = t;
      const k = 1 - Math.exp(-dt * 9);
      view.yaw += (view.targetYaw - view.yaw) * k;
      view.pitch += (view.targetPitch - view.pitch) * k;
      view.radius += (view.targetRadius - view.radius) * k;
      placeCamera();
      const still = reduceMotion.matches;
      for (const slot of slots) {
        // 눌러 볼 수 있는 상자와 선택된 상자에만 은은한 빛이 돈다.
        const want = selected === slot ? 0.32 : hovered === slot && clickable(slot) ? 0.2 : 0;
        slot.glow += (want - slot.glow) * (1 - Math.exp(-dt * 10));
        slot.mesh.material.emissiveIntensity = slot.glow;
        if (slot.project) {
          slot.pop = Math.max(slot.pop - dt / 0.35, 0);
          const grow = still ? 1 : 1 - slot.pop * slot.pop * slot.pop;
          slot.gem.scale.setScalar(grow * (selected === slot ? 1.18 : 1));
          slot.gem.rotation.y = still ? 0 : t * 0.7 + slot.phase;
          slot.gem.position.y = slot.box.h + 0.62 + (still ? 0 : Math.sin(t * 1.3 + slot.phase) * 0.05);
        }
        slot.label.style.display = '';
        screen.copy(slot.anchor);
        screen.y += slot.project ? 1.18 : 0.14;
        screen.project(camera);
        if (screen.z >= 1) {
          slot.label.style.display = 'none';
          continue;
        }
        slot.label.style.left = (screen.x * 0.5 + 0.5) * innerWidth + 'px';
        slot.label.style.top = (-screen.y * 0.5 + 0.5) * innerHeight + 'px';
      }
      if (!still) dust.rotation.y = t * 0.012;
    }
  };
}
