import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// 등대 내부(A안: 서재 확장형). 벽·바닥·가구는 Blender에서 빛을 구운 장면(blender/lighthouse_room.py)을 불러온다.
// 배치(정면 아치창 셋과 책상, 오른쪽 서가, 왼쪽 벽 지도, 왼쪽 앞 의자 둘)와 좌표는 그 파일과 같다. three 좌표 = Blender (x, z, -y).
// 안에서는 이글루 방과 같은 조작으로 걸어다닌다(벽·가구 충돌). 지금 클릭으로 열리는 것은 책상(전체 메일 작성)뿐이다. 서가·지도·의자는 이후 단계에서 연결한다.
const BAKE_VERSION = 6;
const CONTROLS_CSS = `
  .lh-label { position: fixed; left: 0; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 11px; border-radius: 999px;
    background: rgba(249,246,241,.94); box-shadow: 0 8px 22px rgba(70,50,30,.18), inset 0 1px rgba(255,255,255,.9); color: #2e332f;
    font: 500 12px/1.2 'Pretendard', 'Inter', system-ui, sans-serif; letter-spacing: -.005em; pointer-events: none; white-space: nowrap;
    opacity: 0; transform: translate(-50%, calc(-100% + 8px)) scale(.94); filter: blur(2px); transform-origin: 50% 100%;
    transition: opacity 180ms cubic-bezier(.23,1,.32,1), transform 240ms cubic-bezier(.23,1,.32,1), filter 180ms cubic-bezier(.23,1,.32,1); }
  .lh-label.is-on { opacity: 1; transform: translate(-50%, -100%) scale(1); filter: none; }
  .lh-label i { width: 6px; height: 6px; border-radius: 50%; background: #6b7f6e; box-shadow: 0 0 0 3px rgba(107,127,110,.18); }
  .lh-label small { font-size: 9px; font-weight: 600; letter-spacing: .2em; color: #8a8f89; }
  @media (prefers-reduced-motion: reduce) { .lh-label { transform: translate(-50%, -100%); filter: none; transition: opacity 120ms linear; } }
  .lh-controls { position: fixed; z-index: 2; left: 24px; bottom: 80px; box-sizing: border-box; width: 224px; padding: 16px; border: 1px solid rgba(194,224,247,.22); border-radius: 16px; background: linear-gradient(135deg,rgba(120,173,211,.18),rgba(15,36,56,.68)); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 1px rgba(255,255,255,.16),0 8px 28px rgba(4,17,30,.12); color: #dfedf7; pointer-events: none; }
  .lh-controls[hidden] { display: none; }
  .lh-light { position: fixed; z-index: 3; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 10px 12px; border-radius: 999px;
    background: rgba(249,246,241,.96); box-shadow: 0 10px 26px rgba(70,50,30,.2), inset 0 1px rgba(255,255,255,.9); color: #2e332f; font: 500 10px/1 'Pretendard', 'Inter', system-ui, sans-serif;
    opacity: 0; pointer-events: none; transform: translate(-50%, calc(-100% + 10px)) scale(.92); transform-origin: 50% 100%;
    transition: opacity 180ms cubic-bezier(.23,1,.32,1), transform 240ms cubic-bezier(.23,1,.32,1); }
  .lh-light.is-open { opacity: 1; pointer-events: auto; transform: translate(-50%, -100%) scale(1); }
  .lh-light svg { color: #6b7f6e; }
  .lh-light input { writing-mode: vertical-lr; direction: rtl; width: 22px; height: 120px; margin: 0; accent-color: #6b7f6e; cursor: pointer; }
  .lh-light output { font-variant-numeric: tabular-nums; color: #8a8f89; }
  @media (prefers-reduced-motion: reduce) { .lh-light { transform: translate(-50%, -100%); transition: opacity 120ms linear; } }
  .lh-controls h2 { margin: 0 0 12px; font-size: 12px; font-weight: 600; letter-spacing: .03em; color: #eaf6ff; }
  .lh-control-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 11px; line-height: 1.5; }
  .lh-key-grid { display: grid; grid-template-columns: repeat(3,24px); gap: 4px; }
  .lh-key-grid kbd:first-child { grid-column: 2; }
  .lh-key-grid kbd:nth-child(2) { grid-column: 1; }
  .lh-controls kbd { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 24px; height: 24px; padding: 0 5px; border: 1px solid rgba(212,235,251,.35); border-bottom-width: 2px; border-radius: 5px; background: rgba(220,239,255,.08); color: #f0f8ff; font: 600 11px/1 system-ui; }
  .lh-controls kbd.is-held { background: rgba(187,228,255,.38); border-color: #c3e9ff; box-shadow: 0 0 12px rgba(138,208,255,.25); }
  .lh-controls small { font-size: 10px; color: #b3cadc; }
  .lh-controls-divider { height: 1px; margin: 12px 0 4px; background: rgba(202,228,247,.13); }
  .lh-controls-touch { display: none; font-size: 12px; line-height: 1.8; }
  @media (pointer: coarse) { .lh-controls-desktop { display:none; } .lh-controls-touch { display:block; } .lh-controls { width:auto; max-width:210px; padding:12px 14px; } }
  @media (max-width: 720px) { .lh-controls { left:12px; bottom:88px; } }
  @media (max-height: 560px) { .lh-controls { bottom:66px; padding:10px 12px; } .lh-controls h2 { margin-bottom:5px; } .lh-control-row { margin-top:6px; } }
`;
// 조명 스위치 자리: blender on_wall(51)·높이 1.4. 오른쪽 창틀에서 손 한 뼘 이상 떨어뜨린다.
const SW = { x: 3.97 * Math.cos(51 * Math.PI / 180), y: 1.4, z: -3.97 * Math.sin(51 * Math.PI / 180) };
const DESK = { x: 0, y: 0.6, z: -3.0, w: 1.6, h: 1.2, d: 0.8 };

// 벽 액자 그림: 사용자가 보낸 참고 이미지(파스텔 대시보드 구성)를 그대로 옮긴 그림. 누르면 대시보드가 열린다는 표시.
// 좌표는 참고 이미지(735×410) 기준으로 적고 캔버스 크기에 맞춰 늘린다.
export function drawMapArtCanvas() {
  const W = 1024, H = 683, S = W / 735, OY = (H - 410 * S) / 2;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const X = x => x * S, Y = y => OY + y * S;
  const shadow = (blur = 14, y = 6, a = 0.16) => { c.shadowColor = `rgba(150,105,85,${a})`; c.shadowBlur = blur * S; c.shadowOffsetY = y * S; };
  const none = () => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; };
  const lin = (x0, y0, x1, y1, a, b) => { const g = c.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1)); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const box = (x0, y0, x1, y1, r, fill, sh) => {
    if (sh) shadow(...sh);
    c.beginPath(); c.roundRect(X(x0), Y(y0), X(x1) - X(x0), Y(y1) - Y(y0), r * S); c.fillStyle = fill; c.fill(); none();
  };
  const ball = (cx, cy, r, light, dark, sh = [16, 8, 0.18]) => {
    shadow(...sh);
    const g = c.createRadialGradient(X(cx - r * 0.35), Y(cy - r * 0.4), r * 0.1 * S, X(cx), Y(cy), r * S);
    g.addColorStop(0, light); g.addColorStop(1, dark);
    c.beginPath(); c.arc(X(cx), Y(cy), r * S, 0, Math.PI * 2); c.fillStyle = g; c.fill(); none();
  };
  const line = (x0, y, x1, col = 'rgba(160,125,105,.35)', w = 2) => { c.strokeStyle = col; c.lineWidth = w * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(X(x0), Y(y)); c.lineTo(X(x1), Y(y)); c.stroke(); };

  // 바탕과 바닥
  c.fillStyle = lin(0, 0, 0, 410, '#e9d7ca', '#e3cfc1'); c.fillRect(0, 0, W, H);
  c.fillStyle = lin(0, 340, 0, 410, '#eadbd0', '#efe3da'); c.fillRect(0, Y(345), W, H - Y(345));
  c.fillStyle = 'rgba(150,110,95,.45)'; c.font = `500 ${7 * S}px Georgia, serif`; c.textAlign = 'center';
  c.fillText('PROFESSIONAL GRAPHIC DESIGN', X(366), Y(37));

  // 분홍 나뭇가지(왼쪽 위)
  const branch = [[214, 215, 150, 120], [205, 190, 120, 95], [190, 160, 135, 140], [175, 140, 112, 118]];
  c.strokeStyle = '#d9a7a3'; c.lineWidth = 1.4 * S;
  branch.forEach(([x0, y0, x1, y1]) => { c.beginPath(); c.moveTo(X(x0), Y(y0)); c.quadraticCurveTo(X((x0 + x1) / 2 + 8), Y((y0 + y1) / 2), X(x1), Y(y1)); c.stroke(); });
  let t = 5; const rnd = () => ((t = (t * 9301 + 49297) % 233280) / 233280);
  branch.forEach(([x0, y0, x1, y1]) => {
    for (let k = 0; k < 26; k++) {
      const u = rnd(), x = x0 + (x1 - x0) * u + (rnd() - 0.5) * 12, y = y0 + (y1 - y0) * u + (rnd() - 0.5) * 12;
      c.fillStyle = rnd() < 0.5 ? 'rgba(240,170,180,.85)' : 'rgba(250,200,205,.85)';
      c.beginPath(); c.arc(X(x), Y(y), (1.2 + rnd() * 1.8) * S, 0, Math.PI * 2); c.fill();
    }
  });

  // 오른쪽 뒤 큰 판들
  box(530, 185, 672, 345, 10, lin(530, 185, 672, 345, '#f1ecf1', '#ddd5e0'), [24, 10, 0.12]);
  // 가운데 큰 복숭아 판
  box(200, 65, 522, 370, 10, lin(200, 65, 522, 370, '#f6dfcd', '#efcdb7'), [30, 14, 0.18]);
  line(228, 72, 258, 'rgba(120,90,75,.45)', 2.2); line(272, 72, 284); line(296, 72, 308); line(320, 72, 332);
  box(458, 66, 481, 77, 6, '#fbf2ea', [6, 2, 0.12]); box(484, 66, 507, 77, 6, '#fbf2ea', [6, 2, 0.12]);
  // 검색창
  box(284, 97, 416, 117, 10, '#fbf6f2', [10, 4, 0.14]);
  c.strokeStyle = '#7fbf9d'; c.lineWidth = 1.6 * S; c.beginPath(); c.arc(X(295), Y(107), 4 * S, 0, Math.PI * 2); c.stroke();
  line(306, 104, 380, 'rgba(160,125,105,.3)', 1.6); line(306, 110, 360, 'rgba(160,125,105,.22)', 1.6);
  // 세로 카드 둘
  box(281, 127, 323, 196, 9, lin(281, 127, 323, 196, '#f8e3d3', '#f1d1bc'), [10, 5, 0.12]);
  box(334, 127, 376, 238, 9, lin(334, 127, 376, 238, '#f8e3d3', '#f1d1bc'), [10, 5, 0.12]);
  [140, 152, 164].forEach(y => line(292, y, 312)); [140, 160, 175, 190].forEach(y => line(345, y, 365));
  ball(352, 222, 3.2, '#c6ead8', '#79c39a', [3, 1, 0.1]);
  // 작은 흰 카드(노란 막대)
  box(385, 125, 461, 156, 7, '#fbf3ec', [10, 4, 0.14]);
  line(392, 132, 410, 'rgba(120,90,75,.45)', 1.6); box(393, 140, 444, 150, 5, '#f8ecd4');
  ball(399, 145, 3, '#fff3c4', '#e8c35d', [2, 1, 0.1]);
  // 그래프 카드
  box(386, 171, 466, 239, 7, '#f6f2f1', [12, 5, 0.15]);
  line(394, 179, 425, 'rgba(120,90,75,.45)', 1.6);
  c.save(); c.beginPath(); c.roundRect(X(392), Y(186), X(460) - X(392), Y(234) - Y(186), 4 * S); c.clip();
  c.fillStyle = lin(392, 186, 460, 234, '#f6dfc1', '#efc8a4'); c.fillRect(X(392), Y(186), X(68) * 1, Y(234) - Y(186));
  const wave = (pts, fill) => { c.beginPath(); c.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let k = 1; k < pts.length; k += 2) c.quadraticCurveTo(X(pts[k][0]), Y(pts[k][1]), X(pts[k + 1][0]), Y(pts[k + 1][1])); c.lineTo(X(460), Y(234)); c.lineTo(X(392), Y(234)); c.closePath(); c.fillStyle = fill; c.fill(); };
  wave([[392, 220], [402, 196], [416, 208], [430, 222], [446, 200], [452, 192], [460, 206]], '#c9d2ee');
  wave([[392, 230], [410, 214], [424, 226], [440, 236], [452, 196], [456, 190], [460, 214]], '#9fd8c4');
  c.restore();
  // 왼쪽 민트 사각형(판 밖으로 튀어나옴)
  box(195, 118, 272, 199, 9, lin(195, 118, 272, 199, '#a9dccf', '#8fcfc0'), [18, 9, 0.18]);
  // 아래 복숭아 카드
  box(277, 205, 328, 250, 8, lin(277, 205, 328, 250, '#f8e3d3', '#f0cfba'), [10, 5, 0.12]);
  line(287, 216, 307); c.fillStyle = 'rgba(120,90,75,.35)'; c.font = `600 ${7 * S}px Georgia, serif`; c.textAlign = 'left'; c.fillText('DESIGN', X(286), Y(237));
  // 반투명 민트 유리판
  c.globalAlpha = 0.72; box(192, 215, 258, 290, 8, lin(192, 215, 258, 290, '#cfece6', '#9fd0c6'), [16, 8, 0.12]); c.globalAlpha = 1;
  box(268, 268, 309, 283, 7, '#dfe8fb', [8, 3, 0.12]); line(276, 275.5, 298, 'rgba(110,130,180,.45)', 1.6);
  // 아이콘 타일 셋
  [[333, '#bfe5dd', '#93d0c3'], [388, '#f8e6c9', '#efd0a3'], [440, '#f9dbdc', '#efbcc0']].forEach(([x, a, b]) => {
    box(x, 255, x + 41, 297, 9, lin(x, 255, x + 41, 297, a, b), [12, 6, 0.16]);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.5 * S; c.beginPath(); c.arc(X(x + 20.5), Y(276), 8 * S, 0, Math.PI * 2); c.stroke();
  });
  // 아래 알약 버튼 셋
  box(277, 311, 370, 328, 9, '#fbf6f2', [8, 3, 0.14]); line(298, 319.5, 330, 'rgba(160,125,105,.4)', 1.6); ball(287, 319.5, 3, '#ffd8b8', '#f0a878', [1, 0, 0]);
  box(377, 311, 422, 328, 9, '#fbf6f2', [8, 3, 0.14]); box(427, 311, 463, 328, 9, '#fbf6f2', [8, 3, 0.14]);
  [388, 400, 410, 438, 450].forEach((x, k) => ball(x, 319.5, k % 2 ? 1.6 : 2.6, '#e8c9b5', '#c49a83', [1, 0, 0]));
  // 판 위 공들
  ball(489, 110, 22, '#c4ece2', '#93d2c4');
  ball(476, 168, 21, '#fbe6d4', '#efc6a8');
  // 오른쪽 위 큰 민트 공
  ball(555, 98, 43, '#d2f0e7', '#93cfc0', [26, 12, 0.18]);
  // 오른쪽 아래 복숭아 카드와 큐브들
  box(503, 268, 590, 370, 8, lin(503, 268, 590, 370, '#fbe3cf', '#f2cdb1'), [18, 8, 0.16]);
  box(474, 324, 520, 372, 6, lin(474, 324, 520, 372, '#f9dcd8', '#efc0bb'), [12, 6, 0.16]);
  box(506, 328, 556, 375, 6, lin(506, 328, 556, 375, '#ffffff', '#e9e6ea'), [14, 7, 0.18]);
  // 왼쪽 아래 큰 흰 반구, 민트 공, 분홍 받침대
  shadow(26, 12, 0.16);
  let g = c.createRadialGradient(X(150), Y(250), 10 * S, X(178), Y(300), 80 * S); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8e2e3');
  c.beginPath(); c.ellipse(X(178), Y(298), 72 * S, 82 * S, 0, 0, Math.PI * 2); c.fillStyle = g; c.fill(); none();
  ball(155, 345, 29, '#c9ede3', '#8ccbbb');
  [[195, 310, 348, 362, '#f6d2cf'], [205, 300, 336, 350, '#f9dcd8'], [214, 290, 326, 340, '#f6d2cf']].forEach(([x0, x1, y0, y1, col]) => box(x0, y0, x1, y1, 6, col, [8, 3, 0.12]));
  box(240, 318, 266, 330, 3, '#f8e9dc', [4, 2, 0.1]);
  c.fillStyle = 'rgba(232,215,175,.8)'; c.fillRect(X(250), Y(285), 2 * S, 33 * S);
  // 바닥의 작은 공들
  ball(451, 357, 16, '#fbe6cf', '#efc69e', [10, 5, 0.16]);
  ball(664, 359, 13, '#f3eef6', '#d2c8dc', [8, 4, 0.14]);
  return canvas;
}

function drawMapArt() {
  const texture = new THREE.CanvasTexture(drawMapArtCanvas());
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 8;
  return texture;
}

// 렌즈 모형 유리: 빛이 없는 장면이라 가장자리일수록 밝고 가운데는 비치게 보이는 간단한 유리 표현.
function lensMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(vec3(0.75, 0.86, 0.95) * (0.05 + 0.55 * f), 1.0); }'
  });
}

function addOutside(scene) {
  // 창밖: 밤바다, 별, 달, 그리고 등대 꼭대기에서 천천히 도는 불빛 한 줄기(벽에 가려 창으로만 보인다).
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 400), new THREE.MeshBasicMaterial({ color: 0x0a2030 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -9, -180); scene.add(sea);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(10, 150), new THREE.MeshBasicMaterial({ color: 0x9fb6c8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  glint.rotation.x = -Math.PI / 2; glint.position.set(-20, -8.9, -95); scene.add(glint);
  const stars = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) {
    const a = -Math.PI * 0.9 + (i * 2.39996) % (Math.PI * 0.8), h = 6 + ((i * 7.137) % 70);
    stars.set([Math.cos(a) * 150, h, Math.sin(a) * 150], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xb4c8de, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.75 })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.MeshBasicMaterial({ color: 0xe6edf2, toneMapped: false }));
  moon.position.set(-28, 46, -160); scene.add(moon);
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -9, -3, -160, 9, -3, -160]), 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const pivot = new THREE.Group(); pivot.position.set(0, 9, 0); pivot.add(beam); scene.add(pivot);
  // 창밖 마을 풍경 판: 들어갈 때 main.js가 등대 꼭대기에서 실제 마을을 한 장 찍어 붙인다(실시간 아님, 가벼움).
  const view = new THREE.Mesh(new THREE.PlaneGeometry(40, 16.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  view.position.set(0, 2.6, -34); view.visible = false; scene.add(view);
  const night = [sea, glint, moon, scene.children.find(o => o.isPoints)];
  return { pivot, view, night };
}

export function createLighthouseRoom({ renderer, isBlocked = () => false, places = [], hub = { x: 0, z: 4.5 }, lighthouse = { x: -33, z: -15 } } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x061220);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const base = new THREE.Vector3(0, 1.5, 3.05), look = new THREE.Vector3(0, 1.2, -2);
  camera.position.copy(base); camera.lookAt(look);
  const outside = addOutside(scene), beamPivot = outside.pivot;

  // 누를 수 있는 물건(책상·책장). 마우스를 올리면 따뜻한 빛이 번지고 이름표가 뜬다(터치 화면에는 없음).
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  const gc = glowCanvas.getContext('2d'), grad = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,1)'); grad.addColorStop(1, 'rgba(255,214,150,0)');
  gc.fillStyle = grad; gc.fillRect(0, 0, 128, 128);
  const glowMap = new THREE.CanvasTexture(glowCanvas), screenPos = new THREE.Vector3();
  const hotspot = ({ action, label, kicker = '', center, size, yaw = 0, glowSize, glowAt, faceUp, anchor }) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    hit.position.set(...center); hit.rotation.y = yaw; scene.add(hit);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(...glowSize), new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(...glowAt);
    if (faceUp) glow.rotation.x = -Math.PI / 2; else glow.lookAt(0, glowAt[1], 0);
    scene.add(glow);
    const tag = document.createElement('div'); tag.className = 'lh-label'; tag.setAttribute('aria-hidden', 'true');
    tag.innerHTML = `<i></i><small>${kicker}</small><span>${label}</span>`;
    document.body.append(tag);
    return { action, hit, glow, tag, anchor: new THREE.Vector3(...anchor), target: 0 };
  };
  const SHELF = { x: 3.064, z: -2.145, yaw: THREE.MathUtils.degToRad(-55) };   // blender on_wall(35, 3.74)
  const shelfFront = new THREE.Vector3(-SHELF.x, 0, -SHELF.z).normalize().multiplyScalar(0.32);
  const HOTSPOTS = [
    hotspot({ action: 'mail', kicker: 'LETTER', label: '전체 메일 쓰기', center: [DESK.x, DESK.y, DESK.z], size: [DESK.w, DESK.h, DESK.d],
      glowSize: [2.0, 1.2], glowAt: [DESK.x, 0.83, DESK.z], faceUp: true, anchor: [DESK.x, 1.45, DESK.z] }),
    hotspot({ action: 'archive', kicker: 'ARCHIVE', label: '자료보관함', center: [SHELF.x, 0.98, SHELF.z], size: [1.3, 1.95, 0.5], yaw: SHELF.yaw,
      glowSize: [1.9, 2.4], glowAt: [SHELF.x + shelfFront.x, 1.0, SHELF.z + shelfFront.z], anchor: [SHELF.x, 2.2, SHELF.z] }),
    // 왼쪽 벽 액자(blender on_wall(145, 3.95), 높이 1.75): 업로드 현황 대시보드 자리. 빛 대신 그림이 살짝 밝아진다.
    hotspot({ action: 'light', kicker: 'LIGHT', label: '조명 밝기', center: [SW.x, SW.y, SW.z], size: [0.4, 0.45, 0.25], yaw: THREE.MathUtils.degToRad(-39),
      glowSize: [0.01, 0.01], glowAt: [SW.x, SW.y, SW.z], anchor: [SW.x, SW.y + 0.3, SW.z] }),
    hotspot({ action: 'dashboard', kicker: 'DASHBOARD', label: '업로드 현황', center: [-3.236, 1.75, -2.266], size: [1.6, 1.15, 0.25], yaw: THREE.MathUtils.degToRad(55),
      glowSize: [0.01, 0.01], glowAt: [-3.236, 1.75, -2.266], anchor: [-3.236, 2.42, -2.266] })
  ];
  let mapArt = null, mapLight = 0, switchLight = 0; const mapBase = new THREE.Color(0xe0d0c4), mapLit = new THREE.Color(0xffffff);
  // 책장에 마우스를 올리면 가운데 칸의 책 한 권이 앞으로 살짝 뽑힌다.
  let pullBook = null, pullHome = null, pullAmount = 0;
  const pullDir = shelfFront.clone().normalize();
  const hitTest = r => HOTSPOTS.find(h => r.intersectObject(h.hit, false).length) || null;

  const bakedMats = [];   // 구운 벽·바닥·가구 재질(조명 슬라이더가 밝기를 곱한다)
  if (renderer) {
    const small = matchMedia('(pointer: coarse)').matches || Math.min(window.screen.width, window.screen.height) < 820;
    const ktx2 = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/').detectSupport(renderer);
    const loadMap = name => ktx2.loadAsync(`./assets/lighthouse-${name}-${small ? 'mobile' : 'desktop'}.ktx2?v=${BAKE_VERSION}`)
      .then(map => { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; return map; });
    Promise.all([new GLTFLoader().loadAsync(`./assets/lighthouse-room.glb?v=${BAKE_VERSION}`), loadMap('shell'), loadMap('floor'), loadMap('props'), loadMap('book')])
      .then(([gltf, shellMap, floorMap, propsMap, bookMap]) => {
        const baked = { LhShell: shellMap, LhFloor: floorMap, LhProps: propsMap, LhBook: bookMap };
        gltf.scene.traverse(mesh => {
          if (!mesh.isMesh) return;
          mesh.material.dispose();
          const name = Object.keys(baked).find(key => mesh.name.startsWith(key));
          if (name) { mesh.material = new THREE.MeshBasicMaterial({ map: baked[name] }); bakedMats.push(mesh.material); applyLight(); }
          if (name === 'LhBook') { pullBook = mesh; pullHome = mesh.position.clone(); }
          else if (mesh.name.startsWith('LhMap')) { mesh.material = new THREE.MeshBasicMaterial({ map: drawMapArt(), color: 0xe0d0c4 }); mapArt = mesh.material; }
          else if (mesh.name.startsWith('LhPanes')) mesh.material = new THREE.MeshBasicMaterial({ color: 0x9fc3dd, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
          else if (mesh.name.startsWith('LhLens')) mesh.material = lensMaterial();
        });
        scene.add(gltf.scene);
        ktx2.dispose();
      })
      .catch(error => console.warn('등대 내부를 불러오지 못했습니다.', error));
  }

  // ---------- 걸어다니기: 이글루 방과 같은 조작(WASD·왼쪽 끌기 시선·휠, 휴대폰은 끌기·두 손가락) ----------
  const canvas = renderer?.domElement;
  const style = document.createElement('style');
  style.textContent = CONTROLS_CSS;
  document.head.append(style);
  const controls = document.createElement('section');
  controls.className = 'lh-controls'; controls.hidden = true; controls.setAttribute('aria-label', '등대 안 조작 안내');
  controls.innerHTML = '<h2>등대 안 둘러보기</h2><div class="lh-controls-desktop"><div class="lh-control-row"><span class="lh-key-grid"><kbd data-key="KeyW">W</kbd><kbd data-key="KeyA">A</kbd><kbd data-key="KeyS">S</kbd><kbd data-key="KeyD">D</kbd></span><span>앞뒤 · 좌우 이동</span></div><div class="lh-controls-divider"></div><div class="lh-control-row"><kbd data-mouse="0">왼쪽 누른 채 이동</kbd><span>시선 회전</span></div></div><div class="lh-controls-touch">한 손가락 드래그 · 둘러보기<br>두 손가락 벌리기 · 이동</div>';
  document.body.append(controls);
  // 조명 스위치(창문 오른쪽 벽): 누르면 세로 슬라이더가 뜨고, 구운 그림에 곱하는 밝기만 바꾼다(다시 굽지 않음, 가벼움).
  // 고른 값은 이 브라우저에만 기억한다.
  const lightBox = document.createElement('div');
  lightBox.className = 'lh-light';
  lightBox.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg><input type="range" min="30" max="140" step="5" aria-label="조명 밝기"><output></output>';
  document.body.append(lightBox);
  const lightInput = lightBox.querySelector('input'), lightOut = lightBox.querySelector('output');
  let light = 100, lightOpen = false;
  try { light = Math.min(140, Math.max(30, Number(localStorage.getItem('lh-light')) || 100)); } catch { /* 저장소를 못 쓰면 기본값 */ }
  function applyLight() { lightInput.value = light; lightOut.textContent = `${light}%`; bakedMats.forEach(m => m.color.setScalar(light / 100)); }
  lightInput.addEventListener('input', () => { light = Number(lightInput.value); applyLight(); try { localStorage.setItem('lh-light', String(light)); } catch { /* 무시 */ } });
  const setLightOpen = open => { lightOpen = open; lightBox.classList.toggle('is-open', open); if (open) lightInput.focus({ preventScroll: true }); else if (document.activeElement === lightInput) lightInput.blur(); };
  // 3D 스위치: 점토 질감처럼 둥근 흰 판 + 안쪽 테 + 세이지 로커 + 작은 나사 둘.
  // 장면에 조명이 없어서, 부드러운 명암을 담은 매트캡 그림으로 입체감을 낸다.
  const capCanvas = document.createElement('canvas'); capCanvas.width = capCanvas.height = 128;
  const cc = capCanvas.getContext('2d'), cg = cc.createRadialGradient(46, 40, 6, 64, 64, 66);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.55, '#e9e4dc'); cg.addColorStop(1, '#a89f94');
  cc.fillStyle = cg; cc.fillRect(0, 0, 128, 128);
  const matcap = new THREE.CanvasTexture(capCanvas); matcap.colorSpace = THREE.SRGBColorSpace;
  const SWITCH = new THREE.Vector3(SW.x, SW.y, SW.z);
  const switchGroup = new THREE.Group(); switchGroup.position.copy(SWITCH); switchGroup.lookAt(0, SWITCH.y, 0); scene.add(switchGroup);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.22, 0.03, 4, 0.022), new THREE.MeshMatcapMaterial({ matcap, color: 0xfbf7f1 }));
  plate.position.z = 0.012; switchGroup.add(plate);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(0.092, 0.15, 0.012, 3, 0.014), new THREE.MeshMatcapMaterial({ matcap, color: 0xe4ddd2 }));
  rim.position.z = 0.03; switchGroup.add(rim);
  const toggleMat = new THREE.MeshMatcapMaterial({ matcap, color: 0x6b7f6e });
  const toggle = new THREE.Mesh(new RoundedBoxGeometry(0.066, 0.118, 0.03, 4, 0.016), toggleMat);
  toggle.position.set(0, 0, 0.042); toggle.rotation.x = -0.16; switchGroup.add(toggle);
  const notch = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.006, 0.004, 2, 0.002), new THREE.MeshBasicMaterial({ color: 0xf4efe6 }));
  notch.position.set(0, 0.035, 0.058); notch.rotation.x = -0.16; switchGroup.add(notch);
  for (const y of [0.088, -0.088]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), new THREE.MeshMatcapMaterial({ matcap, color: 0xcfc6ba }));
    screw.rotation.x = Math.PI / 2; screw.position.set(0, y, 0.029); switchGroup.add(screw);
  }
  const toggleBase = new THREE.Color(0x6b7f6e), toggleHot = new THREE.Color(0x9bb59e);
  applyLight();
  const controlKeys = [...controls.querySelectorAll('[data-key]')], controlMouse = [...controls.querySelectorAll('[data-mouse]')];
  const keys = new Set(), pointers = new Map();
  const paintKeys = () => controlKeys.forEach(key => key.classList.toggle('is-held', keys.has(key.dataset.key)));
  const START = { x: base.x, z: base.z, yaw: 0, pitch: Math.atan2(look.y - base.y, base.z - look.z) };
  const pos = new THREE.Vector3(), view = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let active = false, dragged = false, justDragged = false, pinch = 0, lastTime = null, hovered = null;
  const typing = () => document.activeElement?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  const blocked = () => typing() || isBlocked();

  // 충돌: 둥근 벽 안쪽과 가구(Blender 배치 그대로, 좌표는 Blender 기준으로 적고 three로 바꾼다).
  const WALL_LIMIT = 3.55, MARGIN = 0.3;
  const rect = (bx, by, deg, lx, ly, w, d) => {
    const a = THREE.MathUtils.degToRad(deg), c = Math.cos(a), s = Math.sin(a);
    return { x: bx + lx * c - ly * s, z: -(by + lx * s + ly * c), c, s: -s, hw: w / 2 + MARGIN, hd: d / 2 + MARGIN };
  };
  const wallAt = (deg, r) => [r * Math.cos(THREE.MathUtils.degToRad(deg)), r * Math.sin(THREE.MathUtils.degToRad(deg))];
  const [sx, sy] = wallAt(35, 3.74), [px, py] = wallAt(54, 3.5);
  const RECTS = [
    rect(0.05, 2.75, 0, 0, 0, 1.55, 1.25),       // 책상과 의자
    rect(sx, sy, -55, 0, 0, 1.25, 0.42),         // 책장
    rect(-2.6, -0.2, 165.3, 0, 0, 0.86, 0.8),    // 안락의자 둘(blender TEA·SEATS와 같게)
    rect(-1.45, 1.25, 299.1, 0, 0, 0.86, 0.8)
  ];
  const CIRCLES = [{ x: -2.35, z: -0.75, r: 0.34 + MARGIN }, { x: px, z: -py, r: 0.22 + MARGIN }];  // 찻잔 탁자, 화분 스툴
  const resolve = () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const o of RECTS) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const u = dx * o.c + dz * o.s, v = -dx * o.s + dz * o.c;   // 가구의 가로·세로 방향 좌표
        if (Math.abs(u) >= o.hw || Math.abs(v) >= o.hd) continue;
        let nu = u, nv = v;
        if (o.hw - Math.abs(u) < o.hd - Math.abs(v)) nu = Math.sign(u || 1) * o.hw; else nv = Math.sign(v || 1) * o.hd;
        pos.x = o.x + nu * o.c - nv * o.s; pos.z = o.z + nu * o.s + nv * o.c;
      }
      for (const o of CIRCLES) {
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
        if (!d) pos.x = o.x + o.r;
        else if (d < o.r) { pos.x = o.x + dx * o.r / d; pos.z = o.z + dz * o.r / d; }
      }
      const r = Math.hypot(pos.x, pos.z);
      if (r > WALL_LIMIT) { pos.x *= WALL_LIMIT / r; pos.z *= WALL_LIMIT / r; }
    }
  };
  const move = (dx, dz) => { pos.x += dx; pos.z += dz; resolve(); };
  const clampView = () => { view.targetPitch = THREE.MathUtils.clamp(view.targetPitch, -1.2, 1.2); };
  const place = () => { camera.position.copy(pos); camera.quaternion.setFromEuler(euler.set(view.pitch, view.yaw, 0)); };
  const reset = () => {
    pos.set(START.x, base.y, START.z);
    Object.assign(view, { yaw: START.yaw, targetYaw: START.yaw, pitch: START.pitch, targetPitch: START.pitch });
    place();
  };
  reset();
  const clearInput = () => { keys.clear(); paintKeys(); controlMouse.forEach(k => k.classList.remove('is-held')); pointers.clear(); pinch = 0; dragged = false; };
  const pick = (x, y) => {
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    return hitTest(ray);
  };

  addEventListener('keydown', e => { if (lightOpen && e.key === 'Escape') setLightOpen(false); });
  addEventListener('keydown', e => {
    if (!active || blocked() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
    e.preventDefault(); keys.add(e.code); paintKeys();
  });
  addEventListener('keyup', e => { keys.delete(e.code); paintKeys(); });
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  canvas?.addEventListener('pointerdown', e => {
    if (lightOpen && !(e.target.closest && e.target.closest('.lh-light'))) { const hit = pick(e.clientX, e.clientY); if (hit?.action !== 'light') setLightOpen(false); }
    if (!active || blocked() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    controlMouse.forEach(k => k.classList.add('is-held'));
    pointers.set(e.pointerId, { touch: e.pointerType !== 'mouse', x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) { dragged = false; justDragged = false; }
    pinch = 0;
  });
  addEventListener('pointermove', e => {
    if (!active) return;
    const held = pointers.get(e.pointerId);
    if (!held) {
      if (e.pointerType === 'mouse' && e.target === canvas && !pointers.size) {
        hovered = blocked() ? null : pick(e.clientX, e.clientY);
        HOTSPOTS.forEach(h => { h.target = h === hovered ? 0.55 : 0; });
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
      }
      return;
    }
    const dx = e.clientX - held.x, dy = e.clientY - held.y;
    held.x = e.clientX; held.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { forward.set(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)); move(forward.x * (distance - pinch) * 0.01, forward.z * (distance - pinch) * 0.01); }
      pinch = distance; dragged = true;
      return;
    }
    if (!dragged && Math.hypot(e.clientX - held.startX, e.clientY - held.startY) < 6) return;
    dragged = true;
    canvas.style.cursor = 'grabbing';
    view.targetYaw -= dx * 0.0032; view.targetPitch -= dy * 0.002; clampView();
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId); pinch = 0;
    controlMouse.forEach(k => k.classList.remove('is-held'));
    if (!pointers.size) { justDragged = dragged; if (canvas && active) canvas.style.cursor = 'grab'; }
  };
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);
  canvas?.addEventListener('wheel', e => {
    if (!active || blocked()) return;
    e.preventDefault();
    const step = THREE.MathUtils.clamp(-e.deltaY * 0.003, -0.45, 0.45);
    forward.set(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)); move(forward.x * step, forward.z * step);
  }, { passive: false });

  const ray = new THREE.Raycaster();
  return {
    scene, camera,
    enter() { active = true; clearInput(); justDragged = false; reset(); lastTime = null; controls.hidden = false; if (canvas) canvas.style.cursor = 'grab'; },
    leave() { active = false; clearInput(); controls.hidden = true; setLightOpen(false); HOTSPOTS.forEach(h => { h.target = 0; h.tag.classList.remove('is-on'); }); if (canvas) canvas.style.cursor = ''; },
    // 끌어서 시선을 돌린 직후의 클릭은 책상 클릭으로 치지 않는다.
    consumeDrag() { const was = justDragged; justDragged = false; return was; },
    pickAction(pointer) {
      ray.setFromCamera(pointer, camera);
      return hitTest(ray)?.action || null;
    },
    setMapHovered(active) { if (!active) HOTSPOTS.forEach(h => { h.target = 0; }); },
    // 마을 사진이 있으면 밤바다 대신 보여 준다. 없으면(마을 로딩 전 등) 밤바다 그대로.
    setWindowView(texture) {
      outside.view.material.map = texture || null; outside.view.material.needsUpdate = true;
      outside.view.visible = Boolean(texture); outside.night.forEach(o => { if (o) o.visible = !texture; });
      beamPivot.visible = !texture;
    },
    toggleLight() { setLightOpen(!lightOpen); },
    setAspect(aspect) { camera.aspect = aspect; camera.fov = aspect < 1.1 ? 76 : 60; camera.updateProjectionMatrix(); },
    update(t) {
      const dt = lastTime === null ? 0 : Math.min(t - lastTime, 0.1);
      lastTime = t;
      const k = 1 - Math.exp(-dt * 9);
      view.yaw += (view.targetYaw - view.yaw) * k; view.pitch += (view.targetPitch - view.pitch) * k;
      if (active && !blocked() && keys.size) {
        forward.set(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)); right.set(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
        const f = Number(keys.has('KeyW')) - Number(keys.has('KeyS')), s = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
        const len = Math.hypot(f, s);
        if (len) move((forward.x * f + right.x * s) / len * dt * 2.6, (forward.z * f + right.z * s) / len * dt * 2.6);
      }
      place();
      for (const h of HOTSPOTS) {
        const g = h.glow.material; g.opacity += ((h.action === 'mail' ? h.target : 0) * 0.6 - g.opacity) * Math.min(1, k * 2.5);   // 빛은 책상만, 책장은 책 뽑힘, 액자는 밝아짐
        if (h.action === 'dashboard' && mapArt) { mapLight += ((h.target ? 1 : 0) - mapLight) * Math.min(1, k * 2.5); mapArt.color.lerpColors(mapBase, mapLit, mapLight); }
        const on = active && h.target > 0 && !(h.action === 'light' && lightOpen);
        h.tag.classList.toggle('is-on', on);
        if (!on) continue;   // 사라질 때는 마지막 자리에서 부드럽게 흐려진다
        screenPos.copy(h.anchor).project(camera);
        h.tag.style.left = `${(screenPos.x * 0.5 + 0.5) * innerWidth}px`; h.tag.style.top = `${(-screenPos.y * 0.5 + 0.5) * innerHeight}px`;
      }
      if (pullBook) {
        const want = HOTSPOTS[1].target ? 1 : 0;
        pullAmount += (want - pullAmount) * Math.min(1, k * 2.2);
        pullBook.position.copy(pullHome).addScaledVector(pullDir, pullAmount * 0.14);
        pullBook.position.y = pullHome.y + pullAmount * 0.03;
      }
      // 스위치: 마우스를 올리면 토글이 밝아지고 살짝 커진다. 슬라이더는 스위치 위에 따라 붙는다.
      const hotSwitch = HOTSPOTS.find(h => h.action === 'light').target > 0 || lightOpen;
      switchLight += ((hotSwitch ? 1 : 0) - switchLight) * Math.min(1, k * 2.5);
      toggleMat.color.lerpColors(toggleBase, toggleHot, switchLight); switchGroup.scale.setScalar(1.25 * (1 + switchLight * 0.08));   // 멀리서도 알아보게 실제보다 조금 크게
      if (lightOpen) {
        screenPos.copy(SWITCH).project(camera);
        if (screenPos.z > 1) setLightOpen(false);
        lightBox.style.left = `${(screenPos.x * 0.5 + 0.5) * innerWidth}px`; lightBox.style.top = `${(-screenPos.y * 0.5 + 0.5) * innerHeight - 24}px`;
      }
      beamPivot.rotation.y = t * 0.35;
    }
  };
}
