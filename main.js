import * as THREE from 'three';
import { villageBackend } from './backend/client.js?v=member-mail1';
import { mountAuth } from './auth-ui.js';
import { mountChat } from './chat-ui.js';
import { mountCommentMailbox } from './comment-mailbox.js?v=received-mail1';
import { createQualityControl } from './quality.js';
import { addStatsBuilding } from './stats-building.js?v=hut4';
import { mountAnonymousBoard } from './anonymous-board.js?v=note1';
import { addAnonymousBoardObject } from './board-object.js?v=aframe-sign2';
import { smooth, hash, createHeightAt, makeSnowBump, addGround } from './terrain.js?v=split1';
import { mountTutorial } from './tutorial.js?v=3';

// DB 연결로 화면 렌더링을 기다리게 하지 않는다. 조작의 저장 연동은 로그인 UI 연결 후 진행한다.
window.__iglooBackendStatus = villageBackend.status;
villageBackend.onStatusChange(status => { document.documentElement.dataset.supabase = status.phase; });
villageBackend.connect().catch(error => { console.warn('Supabase 연결을 확인해주세요:', error.message); });
// 동일한 페이지 방문에서 인증 상태 변경으로 중복 기록되지 않도록 관리
let lastTrackedUserId = null;

const auth = mountAuth(villageBackend, {
  onChange: () => {
    if (mode === 'stats') visitDashboard?.refresh();
    syncVillage().catch(error => {
      console.warn('마을 상태 갱신 실패:', error.message);
    });

    const user = auth.user;
    const member = auth.member;

    // 로그아웃하면 기록 상태 초기화
    if (!user) {
      lastTrackedUserId = null;
      return;
    }

    // 승인된 수강생만 방문 기록
    if (!member?.approved || member.role !== 'student') return;

    // 같은 페이지에서 인증 이벤트가 반복되어도 한 번만 호출
    if (lastTrackedUserId === user.id) return;

    lastTrackedUserId = user.id;

    villageBackend.recordVisit().catch(error => {
      console.warn('접속 기록 저장 실패:', error.message);
    });
  }
});
const chat = mountChat(villageBackend);
const commentMailbox = mountCommentMailbox(villageBackend, { canAutoOpen: () => mode === 'map' || mode === 'in', onOpen: projectId => { if (mine) { focusOn(mine); goInside(mine, projectId); } }, onLightChange: () => { renderer.shadowMap.needsUpdate = true; } });

import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 탭이 숨겨진 채로 열리면 창 크기가 0이라 카메라 값이 깨지므로 최소 1로 둔다
const W = () => Math.max(innerWidth, 1), H = () => Math.max(innerHeight, 1);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('fallback').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(W(), H());
// 지형과 건물은 움직이지 않으니 그림자는 필요할 때만 다시 그린다
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

// 매번 같은 마을이 나오도록 난수를 고정
let seed = 20261103;
const rng = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = (a, b) => a + rng() * (b - a);

const scene = new THREE.Scene();
const FOG = 0x12273a;
scene.fog = new THREE.FogExp2(FOG, 0.0058);
const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 1400);

// 지도 시점: 높이 떠서 마을과 오로라를 함께 보다가, 확대할수록 낮게 깔리며 가까워진다
const MIN_DIST = 11;
const START_ZOOM = 0.92;
const CENTER = { x: 0, z: -11 };
const view = { x: CENTER.x, z: CENTER.z, d: 0, maxD: 0 };
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const closeness = () => (view.maxD - view.d) / (view.maxD - MIN_DIST);
const pitch = () => 0.27 - 0.11 * closeness();
const fitMap = () => {
  const far = 66 * Math.max(1, 1.55 / camera.aspect);
  view.d = view.maxD ? view.d / view.maxD * far : far * START_ZOOM;
  view.maxD = far;
};
const applyView = () => {
  const t = closeness();
  // 양옆 끝 이글루도 가운데 쪽으로 끌어올 수 있게 좌우는 다 축소해도 여유를 둔다
  const panX = 14 + 22 * t;
  view.x = Math.min(Math.max(view.x, CENTER.x - panX), CENTER.x + panX);
  view.z = Math.min(Math.max(view.z, CENTER.z - 20 * t), CENTER.z + 20 * t);
  const p = pitch(), lift = 2 + 4 * (1 - t);
  camPos.set(view.x, Math.sin(p) * view.d + lift, view.z + Math.cos(p) * view.d);
  camLook.set(view.x, lift, view.z);
};
fitMap();
applyView();
const lookNow = camLook.clone();
camera.position.copy(camPos);
camera.lookAt(camLook);

// 달빛과, 오로라가 눈에 비치는 은은한 초록빛
scene.add(new THREE.HemisphereLight(0x5f86c4, 0x9fc4d6, 0.72));
const auroraGlow = new THREE.DirectionalLight(0x55d6a8, 0.32);
auroraGlow.position.set(10, 22, -60);
scene.add(auroraGlow);
const moon = new THREE.DirectionalLight(0xcfe0ff, 2.1);
moon.position.set(-34, 21, 12);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 130 });
moon.shadow.bias = -0.0005;
moon.shadow.normalBias = 0.06;
scene.add(moon);

const uTime = { value: 0 };

// 하늘: 지평선은 안개색과 이어지게
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(1000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 p;
      void main(){
        float t = clamp(p.y * 2.4, 0., 1.);
        vec3 low = vec3(.0065, .0204, .0423), high = vec3(.0012, .0035, .011);
        gl_FragColor = vec4(mix(low, high, pow(t, .5)), 1.);
      }`
  })
));

// 별: 크기가 제각각이고 천천히 반짝인다
{
  const n = 1800, a = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const th = rng() * Math.PI * 2, ph = Math.asin(rng() * 0.96 + 0.02);
    a.set([900 * Math.cos(ph) * Math.cos(th), 900 * Math.sin(ph), 900 * Math.cos(ph) * Math.sin(th)], i * 3);
    s[i] = Math.pow(rng(), 3) * 2.6 + 0.8;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  g.setAttribute('size', new THREE.BufferAttribute(s, 1));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { t: uTime },
    vertexShader: `attribute float size; uniform float t; varying float a;
      void main(){ a = .55 + .45 * sin(t * .8 + position.x * .7);
      gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: 'varying float a; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.9, .95, 1.) * a, smoothstep(.5, .2, d)); }'
  })));
}

// 오로라: 노이즈로 일렁이는 빛의 커튼. 아래 경계는 또렷하고 위로 갈수록 옅어진다
const auroraMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { t: uTime },
  vertexShader: `uniform float t; varying vec2 v;
    void main(){ v = uv; vec3 q = position;
    q.z += sin(q.x * .012 + t * .06) * 46. + sin(q.x * .031 - t * .045) * 17.;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.); }`,
  fragmentShader: `uniform float t; varying vec2 v;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
    void main(){
      float wob = fbm(vec2(v.x * 5. + t * .03, t * .05)) * .34;
      float y = v.y - wob;
      float rays = pow(fbm(vec2(v.x * 46. + t * .07, t * .1 + y * .9)), 1.6) * 2.5;
      float band = smoothstep(.02, .09, y) * pow(max(1. - y, 0.), 3.);
      float gaps = smoothstep(.22, .62, fbm(vec2(v.x * 3.4 - t * .02, 3.)));
      float e = smoothstep(0., .1, v.x) * smoothstep(1., .9, v.x);
      vec3 c = mix(vec3(.05, 1., .52), vec3(.42, .22, 1.), smoothstep(.12, .62, y));
      c += vec3(.9, .1, .4) * smoothstep(.01, .05, y) * smoothstep(.1, .04, y) * .14;
      gl_FragColor = vec4(c * band * rays * gaps * e * .62, 1.);
    }`
});
[[-40, 150, -390, -0.12, 1.25], [60, 175, -470, 0.16, 1.5]].forEach(([x, y, z, rot, s]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(760 * s, 300 * s, 180, 1), auroraMat);
  m.position.set(x, y, z);
  m.rotation.y = rot;
  scene.add(m);
});

// 이글루 자리
const R = 1.9;
const HUB = { x: 0, z: 4.5 };
// 앞뒤 열의 x를 엇갈려 앞 이글루가 뒤 이글루를 가리지 않게 한다
// 양옆 끝에 몰리지 않도록 가운데에 모으고, 많아지면 뒤쪽으로 늘린다
const ROWS = [
  [-31, [-32, -19.5, -6.5, 6.5, 19.5, 32]],
  [-23, [-26, -13, 0, 13, 26]],
  [-15, [-19.5, -6.5, 6.5, 19.5, 32]],
  [-7, [-26, -13, 0, 13, 26]],
  [1, [-33, -21, [-8.5, 9.5], 12, 21, 33]],
  [9, [-27, -14.5, 14.5, 27]]
];
const LIGHTHOUSE = { x: -33, z: -15, radius: 2.2 };
// 관측소는 등대 앞 왼쪽에 바짝 붙여(중심 거리 약 4.8) 한 쌍처럼 보이게 하고, 문은 마을 쪽으로 살짝 틀어 둔다.
const STATS_YAW = Math.atan2(-LIGHTHOUSE.x, 45 - LIGHTHOUSE.z) + Math.PI / 9;
const STATS_SITE = { x: LIGHTHOUSE.x - 2.4, z: LIGHTHOUSE.z + 4.15, radius: 2.3, scale: .6, yaw: STATS_YAW };
STATS_SITE.doorX = STATS_SITE.x + (.88 * Math.cos(STATS_YAW) + 3.5 * Math.sin(STATS_YAW)) * STATS_SITE.scale;
STATS_SITE.doorZ = STATS_SITE.z + (-.88 * Math.sin(STATS_YAW) + 3.5 * Math.cos(STATS_YAW)) * STATS_SITE.scale;
// 행에서 벗어나는 이글루는 [x, z]로 직접 적는다
const places = ROWS.flatMap(([z0, xs]) => xs.map(x0 => Array.isArray(x0) ? x0 : [x0, z0])).map(([x0, z0]) => {
  const x = x0 + rand(-0.9, 0.9), z = z0 + rand(-0.9, 0.9);
  // 입구는 대체로 화면 쪽을 보되 조금씩 어긋나게
  const yaw = Math.atan2(-x * 0.3, 44 - z) + rand(-0.2, 0.2);
  return { x, z, yaw, radius: R, doorX: x + Math.sin(yaw) * (R + 2), doorZ: z + Math.cos(yaw) * (R + 2) };
});

// 🌊 호수 중심(HUB)을 -0.75m 깊이로 파내고, 가장자리 반경을 호수 크기에 맞게 설정
const FLAT = [
  { x: HUB.x, z: HUB.z, y: 0.2, r0: 8, r1: 14 },
  { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, y: 0.2, r0: 3.5, r1: 7 },
  ...places.map(p => ({ x: p.x, z: p.z, y: 0.2, r0: 3.2, r1: 7 })),
  { x: STATS_SITE.x, z: STATS_SITE.z, y: .2, r0: 3.4, r1: 4.5 }
];
const heightAt = createHeightAt(FLAT);

const snowBump = makeSnowBump(THREE, renderer.capabilities.getMaxAnisotropy());
addGround(THREE, scene, heightAt, snowBump);
// 산 쪽에 머무는 얇은 타이포그래피. 한 장의 텍스처만 사용한다.
const mountainTitleAnchor = new THREE.Vector3(0, 22, -82);
const TITLE_DEPTH = 1.08;
const mountainTitle = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1536; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.font = '300 102px "Segoe UI", sans-serif';
  c.textBaseline = 'middle';
  const text = 'IGLOO VILLAGE', tracking = 19;
  const letters = [...text];
  const width = letters.reduce((sum, letter) => sum + c.measureText(letter).width, 0) + (letters.length - 1) * tracking;
  const tint = c.createLinearGradient(0, 76, 0, 180);
  tint.addColorStop(0, '#d7e4e8'); tint.addColorStop(1, '#a0b9c4');
  c.fillStyle = tint;
  let x = (canvas.width - width) / 2;
  for (const letter of letters) {
    c.fillText(letter, x, 128);
    x += c.measureText(letter).width + tracking;
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0.66, depthTest: true, depthWrite: false,
    fog: false, toneMapped: false
  }));
  // 투영 위치와 크기는 유지하면서 글자를 산맥 뒤의 깊이로 보낸다.
  title.position.copy(camera.position).lerp(mountainTitleAnchor, TITLE_DEPTH);
  title.scale.set(90 * TITLE_DEPTH, 15 * TITLE_DEPTH, 1);
  title.renderOrder = 2;
  scene.add(title);
  return title;
})();
// 내리는 눈
{
  const n = 1100, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([(rng() - .5) * 90, rng() * 34, (rng() - .5) * 90], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { t: uTime },
    vertexShader: `uniform float t;
      void main(){ vec3 q = position; q.y = mod(q.y - t * (.7 + fract(position.x) * .6), 34.);
      q.x += sin(t * .4 + position.z) * .8;
      vec4 mv = modelViewMatrix * vec4(q, 1.); gl_PointSize = 95. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(.85, .92, 1., smoothstep(.5, .1, d) * .55); }'
  })));
}

const snowfall = scene.children[scene.children.length - 1];

// 이글루
const blocks = [];
const dummy = new THREE.Object3D();
const pushBlock = (M, tint) => {
  dummy.updateMatrix();
  blocks.push({ m: M.clone().multiply(dummy.matrix), c: tint, home: idx, center: [M.elements[12], M.elements[13], M.elements[14]] });
};
// 안쪽 돔은 블록 틈으로 색만 비치므로 성기게 만들고, 눈더미는 땅 위 절반만 만든다
const domeInner = new THREE.SphereGeometry(R * 0.9, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const moundGeo = new THREE.SphereGeometry(1, 32, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const moundMat = new THREE.MeshStandardMaterial({ color: 0xeaf2f9, roughness: 0.8, bumpMap: snowBump, bumpScale: 1.2 });
// 불 켜진 이글루는 블록 틈으로 따뜻한 빛이 샌다
const litInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const darkInnerMat = new THREE.MeshStandardMaterial({ color: 0x31475a, roughness: 0.9 });
const litDoorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const darkDoorMat = new THREE.MeshBasicMaterial({ color: 0x0c1722 });
const TUNNEL_LIFT = 0.38;
const doorShape = new THREE.Shape();
doorShape.moveTo(-0.74, 0);
doorShape.lineTo(-0.74, TUNNEL_LIFT);
doorShape.absarc(0, TUNNEL_LIFT, 0.74, Math.PI, 0, true);
doorShape.lineTo(0.74, 0);
doorShape.closePath();
const doorGeo = new THREE.ShapeGeometry(doorShape, 16);
// 비공개 이글루를 막는 나무문: 아치 모양에 맞춘 판자 5장과 가로대, 손잡이
const gateGeo = (() => {
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const parts = [];
  const tones = [0x7a5230, 0x85603a, 0x6f4a2a, 0x80593a, 0x74502e];
  // 판자 윗변을 아치 곡선대로 잘라 입구를 빈틈없이 막는다. 가장자리는 터널 벽 속으로 묻힌다
  const GATE_R = 0.8, BOTTOM = 0.12, WIDTH = GATE_R * 2 / 5;
  for (let i = 0; i < 5; i++) {
    const x0 = -GATE_R + i * WIDTH + 0.006, x1 = -GATE_R + (i + 1) * WIDTH - 0.006;
    const plankShape = new THREE.Shape();
    plankShape.moveTo(x0, BOTTOM);
    plankShape.lineTo(x1, BOTTOM);
    for (let s = 0; s <= 8; s++) {
      const x = x1 + (x0 - x1) * s / 8;
      plankShape.lineTo(x, TUNNEL_LIFT + Math.sqrt(Math.max(GATE_R * GATE_R - x * x, 0)));
    }
    plankShape.closePath();
    const plank = new THREE.ExtrudeGeometry(plankShape, { depth: 0.07, bevelEnabled: false });
    plank.translate(0, 0, -0.035);
    parts.push(paint(plank, tones[i]));
  }
  for (const y of [0.5, 0.92]) {
    const bar = new THREE.BoxGeometry(y > 0.8 ? 1.12 : 1.5, 0.1, 0.05);
    bar.translate(0, y, 0.055);
    parts.push(paint(bar.toNonIndexed(), 0x4d331d));
  }
  const handle = new THREE.BoxGeometry(0.07, 0.17, 0.06);
  handle.translate(0.42, 0.7, 0.06);
  parts.push(paint(handle.toNonIndexed(), 0x23262a));
  return mergeGeometries(parts);
})();
const gateMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const tunnelFloorGeo = new THREE.PlaneGeometry(1.5, 2);
const tunnelFloorMat = new THREE.MeshStandardMaterial({ color: 0x8ea9be, roughness: 0.9 });
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
{
  const c = glowCanvas.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,170,85,.95)');
  gr.addColorStop(1, 'rgba(255,170,85,0)');
  c.fillStyle = gr;
  c.fillRect(0, 0, 128, 128);
}
const glowTex = new THREE.CanvasTexture(glowCanvas);
glowTex.colorSpace = THREE.SRGBColorSpace;
// 눈 지형에 붙인 한 장의 메시에서 주변 확산과 입구의 빛을 함께 표현한다.
// 색별 재질은 공유하며 실제 광원·추가 렌더 패스는 만들지 않는다.
function spillMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms:{ spillColor:{value:new THREE.Color(color)}, strength:{value:strength} },
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    vertexShader:`varying vec2 vSpillUv; void main(){vSpillUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform vec3 spillColor; uniform float strength; varying vec2 vSpillUv;
      void main(){
        vec2 p=(vSpillUv-.5)*13.0; p.y=-p.y;
        float r=length(p);
        if(r>3.9||r<1.5)discard;
        // 원형 띠 대신 벽 아래에서 빠르게 약해지는 빛. 중심은 입구 쪽으로 28cm 이동.
        vec2 shifted=p-vec2(0.0,.28);
        float distanceToCenter=length(shifted);
        float forward=shifted.y/max(distanceToCenter,.001);
        float direction=mix(.23,.66,smoothstep(-.3,.9,forward));
        float angle=atan(shifted.y,shifted.x);
        float seams=.88+.08*sin(angle*5.0+.7)+.04*sin(angle*11.0-1.0);
        float wall=exp(-max(distanceToCenter-2.05,0.0)/.58)*direction*seams;
        vec2 doorway=p-vec2(0.0,3.15);
        float porch=exp(-doorway.x*doorway.x/.8-doorway.y*doorway.y/1.1)*.42;
        float edge=1.0-smoothstep(2.85,3.55,distanceToCenter);
        float body=smoothstep(1.65,2.05,r);
        gl_FragColor=vec4(spillColor,(wall+porch)*edge*body*strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}
const warmSpillMaterial=spillMaterial(0xffbd7c,.5);
const lavenderSpillMaterial=spillMaterial(0xd3a0ff,.64);
const mintSpillMaterial=spillMaterial(0x8ff2d2,.6);
const yellowSpillMaterial=spillMaterial(0xffe27a,.55);
function createIglooSpill(group) {
  const geometry=new THREE.PlaneGeometry(13,13,12,12);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position,c=Math.cos(group.rotation.y),s=Math.sin(group.rotation.y);
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i);
    const worldX=group.position.x+c*x+s*z,worldZ=group.position.z-s*x+c*z;
    const moundRadius=R*1.32,r=Math.hypot(x,z);
    const moundHeight=r<moundRadius?group.position.y+.3*Math.sqrt(1-(r/moundRadius)**2):-Infinity;
    positions.setY(i,Math.max(heightAt(worldX,worldZ),moundHeight)+.035-group.position.y);
  }
  // 터널 바닥은 눈보다 높다. 같은 메시 안에 작은 면을 더해 문턱까지 빛을 이어준다.
  const porch=new THREE.PlaneGeometry(1.5,2);
  porch.rotateX(-Math.PI/2);porch.translate(0,.245,R*.72+1);
  const porchPositions=porch.attributes.position,porchUv=porch.attributes.uv;
  for(let i=0;i<porchPositions.count;i++)porchUv.setXY(i,porchPositions.getX(i)/13+.5,.5-porchPositions.getZ(i)/13);
  const combined=mergeGeometries([geometry,porch],false);
  combined.computeBoundingSphere();geometry.dispose();porch.dispose();
  const mesh=new THREE.Mesh(combined,warmSpillMaterial);
  mesh.renderOrder=2;mesh.visible=false;group.add(mesh);
  return mesh;
}

const igloos = [];
const flags = [];
const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const hitGeo = new THREE.SphereGeometry(R * 1.08, 10, 8);
let idx = 0;

// 천과 깃대 자원은 모든 이글루가 공유한다.
// 깃발: 둥근 장대 끝에 두툼하고 모서리가 둥근 긴 깃발(끝은 제비꼬리 모양). 3D 아이콘처럼 말랑하게 보이고 바람에 물결친다.
const FLAG_L = 0.8, FLAG_H = 0.32, FLAG_NOTCH = 0.15;
const flagGeo = (() => {
  // 위·아래 가장자리에 점을 몇 개 두어 물결칠 때 면이 휘게 한다(삼각형 수를 아끼려고 최소한만)
  const shape = new THREE.Shape(), N = 8;
  shape.moveTo(0, -FLAG_H / 2);
  for (let i = 1; i <= N; i++) shape.lineTo(FLAG_L * i / N, -FLAG_H / 2);
  shape.lineTo(FLAG_L - FLAG_NOTCH, 0);
  shape.lineTo(FLAG_L, FLAG_H / 2);
  for (let i = N - 1; i >= 0; i--) shape.lineTo(FLAG_L * i / N, FLAG_H / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.028, bevelSize: 0.026, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0.03, 0, -0.015);
  return geo;
})();
const flagPoleGeo = new THREE.CapsuleGeometry(0.05, 1.4, 1, 6);   // 깃발 끝이 돔 꼭대기 높이쯤 오도록 낮춤
const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0x8e9fb3, roughness: 0.55 });
const flagDeform = `
  uniform float flagTime;
  uniform float flagPhase;
  vec3 flagPoint(vec3 p) {
    float u = clamp(p.x / ${FLAG_L.toFixed(2)}, 0.0, 1.0);
    float t = flagTime;
    p.z += u * sin(u * 5.0 - t * 1.8 + flagPhase) * 0.09;
    p.y += u * sin(u * 4.0 - t * 1.8 + flagPhase) * 0.025;
    return p;
  }
`;
const makeFlag = (ig, color) => {
  const g = new THREE.Group();
  // 돔 뒤쪽 오른편 밑동 바로 바깥(입구 반대쪽, 앞에서 보면 오른쪽 어깨 너머로 깃발이 보인다)
  g.position.set(1.6, 0, -1.35);
  const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
  pole.position.y = 0.75; g.add(pole);
  const time = { value: 0 }, phase = { value: rng() * 6 };
  // 밤 조명에서도 색이 탁해지지 않게 자기 색으로 은은하게 밝힌다
  // 깃발 색은 주인마다 FLAG_COLORS 세 가지 중 하나.
  // 파란 밤 조명에 갈색으로 탁해지지 않게 아주 약하게만 자기 색으로 밝힌다
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.uniforms.flagTime = time; shader.uniforms.flagPhase = phase;
    shader.vertexShader = flagDeform + shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = flagPoint(position);');
  };
  material.customProgramCacheKey = () => 'igloo-puffy-flag-v1';
  const cloth = new THREE.Mesh(flagGeo, material);
  cloth.position.set(0.02, 1.3, 0); g.add(cloth);
  ig.group.add(g);
  flags.push({ time });
  return g;
};
// 이름표: 닫힌 이글루는 자물쇠, 내 이글루는 색을 바꿔 '내 이글루'로 표시한다. 이름은 자르지 않는다.
const LOCK_ICON = '<svg class="label-lock" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><rect x="2.2" y="5.3" width="7.6" height="5.2" rx="1.4"/><path d="M4 5.3V3.9a2 2 0 0 1 4 0v1.4"/></svg>';
function addLabel(ig, text) {
  let el = ig.label;
  if (!el) {
    el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = LOCK_ICON + '<span class="label-name"></span>';
    document.body.appendChild(el);
    ig.label = el;
  }
  el.querySelector('.label-name').textContent = text;
  el.classList.toggle('is-mine', Boolean(ig.mine));
}

// 집마다 같은 부품은 한 번에 그려 드로우 콜을 줄인다. null을 넣으면 그 집의 부품을 숨긴다
const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const partSet = (geometry, material, { cast = false, receive = false } = {}) => {
  const mesh = new THREE.InstancedMesh(geometry, material, places.length);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.frustumCulled = false;
  for (let i = 0; i < places.length; i++) mesh.setMatrixAt(i, hiddenMatrix);
  scene.add(mesh);
  return (i, matrix, color = null) => {
    mesh.setMatrixAt(i, matrix || hiddenMatrix);
    mesh.instanceMatrix.needsUpdate = true;
    if (color) { mesh.setColorAt(i, color); mesh.instanceColor.needsUpdate = true; }
  };
};
const setDarkInner = partSet(domeInner, darkInnerMat);
const setLitInner = partSet(domeInner, litInnerMat);
const setDarkDoor = partSet(doorGeo, darkDoorMat);
const setLitDoor = partSet(doorGeo, litDoorMat);
const setMound = partSet(moundGeo, moundMat, { receive: true });
const setFloor = partSet(tunnelFloorGeo, tunnelFloorMat, { receive: true });
const setGate = partSet(gateGeo, gateMat, { cast: true });

places.forEach(({ x, z, yaw }) => {
  const group = new THREE.Group();
  group.position.set(x, 0.14, z);
  group.rotation.y = yaw;
  scene.add(group);
  group.updateMatrixWorld();
  const M = group.matrixWorld.clone();

  const home = idx;
  const placePart = (px, py, pz, sx = 1, sy = 1, sz = 1, rotX = 0) => {
    dummy.position.set(px, py, pz);
    dummy.rotation.set(rotX, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return M.clone().multiply(dummy.matrix);
  };
  setDarkInner(home, M);
  setMound(home, placePart(0, 0, 0, R * 1.32, 0.3, R * 1.32));

  const rings = 8, top = Math.PI / 2 * 0.94;
  for (let r = 0; r < rings; r++) {
    const phi = (r + 0.5) / rings * top, ry = R * Math.sin(phi), rr = R * Math.cos(phi);
    const n = Math.max(5, Math.round(Math.PI * 2 * rr / 0.66));
    const w = Math.PI * 2 * rr / n * 0.92, h = R * top / rings * 0.9;
    for (let i = 0; i < n; i++) {
      const th = (i + (r % 2) * 0.5) / n * Math.PI * 2;
      // 터널이 들어오는 자리의 블록은 빼서 입구를 뚫는다
      const bx = rr * Math.sin(th);
      if (rr * Math.cos(th) > 0 && Math.abs(bx) < 0.74 && ry < TUNNEL_LIFT + Math.sqrt(0.74 * 0.74 - bx * bx)) continue;
      dummy.position.set(rr * Math.sin(th), ry, rr * Math.cos(th));
      dummy.rotation.set(0, 0, 0);
      dummy.lookAt(dummy.position.clone().multiplyScalar(2));
      // 손으로 쌓은 듯 블록마다 살짝 다르게
      dummy.rotateZ(rand(-0.035, 0.035));
      dummy.scale.set(w * rand(0.95, 1.03), h * rand(0.95, 1.03), 0.3 * rand(0.92, 1.1));
      pushBlock(M, rng());
    }
  }
  for (let k = 0; k < 3; k++) {
    const tz = R * 0.92 + k * 0.5;
    for (let s = 0; s < 7; s++) {
      const a = (s + 0.5) / 7 * Math.PI;
      dummy.position.set(Math.cos(a) * 0.86, TUNNEL_LIFT + Math.sin(a) * 0.86, tz);
      dummy.rotation.set(0, 0, a - Math.PI / 2);
      dummy.scale.set(0.37, 0.25, 0.46);
      pushBlock(M, rng());
    }
    // 아치를 받치는 옆벽
    for (const side of [-1, 1]) {
      dummy.position.set(side * 0.86, TUNNEL_LIFT / 2 + 0.03, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.25, TUNNEL_LIFT + 0.08, 0.46);
      pushBlock(M, rng());
    }
  }

  // 문은 돔 안쪽으로 넣어 터널 깊이가 보이게 하고, 터널 바닥은 눈더미 위로 깐다
  const doorMatrix = placePart(0, 0.2, R * 0.72);
  setDarkDoor(home, doorMatrix);
  setFloor(home, placePart(0, 0.23, R * 0.72 + 1, 1, 1, 1, -Math.PI / 2));
  const gateMatrix = placePart(0, 0, R * 0.92 + 1.12);
  setGate(home, gateMatrix);
  const gate = { set visible(show) { setGate(home, show ? gateMatrix : null); } };
  const glow = createIglooSpill(group);

  // 클릭 판정 전용이라 그리지 않는다. 숨겨도 레이캐스트에는 잡힌다
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = 1;
  hit.userData.i = idx;
  hit.visible = false;
  group.add(hit);

  // gate.visible을 끄면 공개 이글루처럼 입구가 열린다
  const ig = { group, home, matrix: M, doorMatrix, gate, glow, hit, owner: null, mine: false, flag: null, label: null, labelAnchor: new THREE.Vector3(0, R + 0.18, 0).applyMatrix4(M) };
  igloos.push(ig);
  idx++;
});
// 새 프로젝트가 등록된 이글루에 일정 시간 빛기둥을 세운다.
const BEAM_MS = 30 * 60 * 1000;
const projectBeams = [];
let projectBeamGeometry = null, projectBeamMaterial = null;
let lavenderBeamMaterial = null;
const tintedBeams = {};
function beamMaterialFor(home) { return tintedBeams[home.lightColor] ?? projectBeamMaterial; }
function addProjectBeam(homeIndex) {
  const home = igloos[homeIndex];
  if (!home || home.house) return null;
  if (!projectBeamMaterial) {
    projectBeamGeometry = new THREE.PlaneGeometry(3.2, 16);
projectBeamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { t: uTime, baseColor: { value: new THREE.Color(1.7, 1.12, .48) }, tipColor: { value: new THREE.Color(1.35, 1.3, 1.13) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float t;
      uniform vec3 baseColor;
      uniform vec3 tipColor;
      varying vec2 vUv;
      void main() {
        float x = vUv.x - 0.5;
        float y = vUv.y;
        float core = exp(-pow(x / (0.055 + y * 0.04), 2.0));
        float halo = exp(-pow(x / (0.19 + y * 0.17), 2.0) * 3.0);
        float foot = smoothstep(0.0, 0.035, y);
        float fade = pow(1.0 - y, 1.65) * (1.0 - smoothstep(0.72, 1.0, y));
        float breath = 0.9 + 0.1 * sin(t * 1.3);
        float alpha = (core * 0.24 + halo * 0.19) * foot * fade * breath;
        vec3 color = mix(baseColor, tipColor, smoothstep(0.0, 0.6, y));
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
});
    // 두 색상의 재질을 공유해 이글루별 재질 생성을 피한다.
    lavenderBeamMaterial = projectBeamMaterial.clone();
    lavenderBeamMaterial.uniforms.t = uTime;
    lavenderBeamMaterial.uniforms.baseColor.value.setRGB(1.45, .78, 1.9);
    lavenderBeamMaterial.uniforms.tipColor.value.setRGB(1.35, 1.2, 1.6);
    tintedBeams.blue = lavenderBeamMaterial;
    // 민트·노랑 조명도 같은 방식으로 빛기둥 색을 맞춘다.
    for (const [name, base, tip] of [['mint', [.55, 1.75, 1.3], [1.1, 1.6, 1.45]], ['yellow', [1.9, 1.55, .45], [1.7, 1.55, 1.0]]]) {
      const m = projectBeamMaterial.clone(); m.uniforms.t = uTime;
      m.uniforms.baseColor.value.setRGB(...base); m.uniforms.tipColor.value.setRGB(...tip); tintedBeams[name] = m;
    }
  }
  const beam = new THREE.Mesh(projectBeamGeometry, beamMaterialFor(home));
  beam.position.set(home.group.position.x, home.group.position.y + R - 0.12 + 8, home.group.position.z);
  beam.renderOrder = 1;
  beam.userData.home = homeIndex;
  scene.add(beam);
  projectBeams.push(beam);
  return beam;
}
// 등록한 지 BEAM_MS가 지나지 않은 이글루에만 빛기둥을 남긴다. 등록 시간은 DB가 기록한다.
const latestProjectAt = new Map();
function updateProjectBeams() {
  const now = Date.now();
  const wanted = new Set();
  latestProjectAt.forEach((at, home) => { if (now - at < BEAM_MS) wanted.add(home); });
  for (let i = projectBeams.length - 1; i >= 0; i--) {
    const beam = projectBeams[i];
    if (wanted.delete(beam.userData.home)) {
      beam.material = beamMaterialFor(igloos[beam.userData.home]);
      continue;
    }
    scene.remove(beam);
    projectBeams.splice(i, 1);
  }
  wanted.forEach(addProjectBeam);
}
// 아무 변화가 없어도 시간이 지나면 꺼지게 한다.
setInterval(updateProjectBeams, 60000);
// 등대는 강사님 집. 탑은 village.js가 그리고, 여기서는 입구와 클릭만 맡는다
{
  const { x, z, radius } = LIGHTHOUSE;
  const group = new THREE.Group();
  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = Math.atan2(-x, 45 - z);
  scene.add(group);
  const archShape = (r, h) => {
    const s = new THREE.Shape();
    s.moveTo(-r, 0);
    s.lineTo(-r, h);
    s.absarc(0, h, r, Math.PI, 0, true);
    s.lineTo(r, 0);
    s.closePath();
    return s;
  };
  const FRONT = radius + 0.75;
  const porch = new THREE.Mesh(
    new THREE.ExtrudeGeometry(archShape(1.08, 1), { depth: 1.5, bevelEnabled: false, curveSegments: 16 }),
    new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.85 })
  );
  porch.position.z = FRONT - 1.5;
  porch.castShadow = true;
  porch.receiveShadow = true;
  group.add(porch);
  const frame = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.84, 0.92), 16), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }));
  frame.position.z = FRONT + 0.01;
  group.add(frame);
  const opening = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.68, 0.86), 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.62, 0.22) }));
  opening.position.z = FRONT + 0.02;
  group.add(opening);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.2, FRONT + 1.6);
  group.add(glow);

  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.scale.set(1.3, 4.2, 1.3);
  hit.position.y = 7;
  hit.userData.i = idx++;
  group.add(hit);
  group.updateMatrixWorld();
  const house = { group, hit, owner: '강사님', house: true, mine: false, flag: null, label: null, bottom: new THREE.Vector3(0, -0.1, FRONT + 1.2).applyMatrix4(group.matrixWorld) };
  igloos.push(house);
}
const statsBuilding = addStatsBuilding(scene, STATS_SITE, heightAt);
statsBuilding.hit.userData.i = igloos.length;
igloos.push(statsBuilding);
const exteriorColors = {
  warm: {inner:new THREE.Color(3.2,1.65,.55),door:new THREE.Color(3.4,1.8,.6),ground:warmSpillMaterial},
  // 저장된 선택값 blue는 유지하고, 그 보상 색상을 라벤더로 교체한다.
  blue: {inner:new THREE.Color(1.65,.38,2.8),door:new THREE.Color(1.9,.5,3.2),ground:lavenderSpillMaterial},
  mint: {inner:new THREE.Color(.55,2.6,1.75),door:new THREE.Color(.65,2.9,1.95),ground:mintSpillMaterial},
  yellow: {inner:new THREE.Color(3.0,2.45,.5),door:new THREE.Color(3.2,2.65,.6),ground:yellowSpillMaterial}
};
function lightUp(ig, choice = 'warm') {
  const color = exteriorColors[choice] ? choice : 'warm';
  if (ig.lightColor === color && ig.glow.visible) return;
  ig.lightColor = color;
  const tint = exteriorColors[color];
  setDarkDoor(ig.home, null);
  setLitDoor(ig.home, ig.doorMatrix, tint.door);
  setDarkInner(ig.home, null);
  setLitInner(ig.home, ig.matrix, tint.inner);
  ig.glow.material = tint.ground;
  ig.glow.visible = true;
}

// 빈 이글루의 블록만 살짝 벌어진다. 매 프레임에는 집별 강도만 GPU로 전달한다.
const iceHover = { value: new Float32Array(places.length) };
const iglooLod = [];
let showIglooFar = () => {};
// 이 거리 안쪽에서 블록으로 보인다. 경계에서 깜빡이지 않게 나갈 때는 조금 더 멀어야 돌아간다
const LOD_NEAR = 30, LOD_FAR = 34;
// 집별 진행도. 0이면 블록이 돔 안에 잠겨 있고, 1이면 완전히 드러난다
const iceEmerge = { value: new Float32Array(places.length) };
function updateIglooLod(dt) {
  iglooLod.forEach((lod, home) => {
    const d = camera.position.distanceTo(igloos[home].group.position);
    lod.near = d < (lod.near ? LOD_FAR : LOD_NEAR);
    const was = iceEmerge.value[home], target = lod.near ? 1 : 0;
    if (was === target) return;
    const t = was + Math.sign(target - was) * Math.min(dt / 1.1, Math.abs(target - was));
    iceEmerge.value[home] = t;
    lod.blocks.visible = t > 0;
    // 돔은 블록이 올라오는 동안 서서히 안으로 줄어들고, 다 올라오면 치운다
    showIglooFar(home, t < 1, 1 - 0.09 * t);
  });
}
{
  const blockBase = new RoundedBoxGeometry(1, 1, 1, 1, 0.1);
  const blockMat = new THREE.MeshStandardMaterial({ roughness: 0.42, bumpMap: snowBump, bumpScale: 0.5 });
  const cold = new THREE.Color(0xbcdcef), white = new THREE.Color(0xf6fbff), c = new THREE.Color();
  // 블록은 집마다 따로 묶어, 멀리 있는 집은 통째로 그리지 않을 수 있게 한다
  places.forEach((_, home) => {
    const own = blocks.filter(b => b.home === home);
    const geometry = new THREE.BufferGeometry();
    geometry.index = blockBase.index;
    for (const name of ['position', 'normal', 'uv']) geometry.setAttribute(name, blockBase.attributes[name]);
    const homes = new Float32Array(own.length * 4);
    own.forEach((b, i) => homes.set([...b.center, b.home], i * 4));
    geometry.setAttribute('iceHome', new THREE.InstancedBufferAttribute(homes, 4));
    const inst = new THREE.InstancedMesh(geometry, blockMat, own.length);
    own.forEach((b, i) => {
      inst.setMatrixAt(i, b.m);
      inst.setColorAt(i, c.copy(cold).lerp(white, b.c));
    });
    inst.receiveShadow = true;
    inst.visible = false;
    scene.add(inst);
    iglooLod[home] = { blocks: inst, near: false };
  });
  blockMat.onBeforeCompile = shader => {
    shader.uniforms.iceHover = iceHover;
    shader.uniforms.iceEmerge = iceEmerge;
    shader.vertexShader = `
      attribute vec4 iceHome;
      uniform float iceHover[${places.length}];
      uniform float iceEmerge[${places.length}];
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 outward = normalize(instanceMatrix[3].xyz - iceHome.xyz);
        // 블록마다 시작 시점을 달리해 한꺼번에 움직이지 않게 한다
        float delay = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 0.45;
        float emerge = smoothstep(delay, delay + 0.55, iceEmerge[int(iceHome.w)]);
        vec3 shift = outward * (0.065 * iceHover[int(iceHome.w)] - 0.24 * (1.0 - emerge));
        // 블록을 통째로 옮겨 모양과 법선을 유지한다.
        vec3 a = instanceMatrix[0].xyz;
        vec3 b = instanceMatrix[1].xyz;
        vec3 c = instanceMatrix[2].xyz;
        transformed += vec3(dot(shift, a) / dot(a, a), dot(shift, b) / dot(b, b), dot(shift, c) / dot(c, c));
      #endif
    `);
  };
  blockMat.customProgramCacheKey = () => 'empty-igloo-hover-v1';

  // 멀리 있는 집은 블록 무늬를 그린 돔과 터널 한 벌로 대신한다. 그림자도 이 모양으로 굽는다
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5f7f97';
  g.fillRect(0, 0, 1024, 256);
  const ROWS_LOW = 8, rowH = 256 / ROWS_LOW;
  for (let r = 0; r < ROWS_LOW; r++) {
    const phi = (r + 0.5) / ROWS_LOW * Math.PI / 2 * 0.94;
    const n = Math.max(5, Math.round(Math.PI * 2 * R * Math.cos(phi) / 0.66)), w = 1024 / n;
    for (let i = 0; i <= n; i++) {
      c.copy(cold).lerp(white, hash(i + 3, r + 7));
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect((i + (r % 2) * 0.5 - 1) * w + 2, 256 - (r + 1) * rowH + 2, w - 4, rowH - 4);
    }
  }
  const lowTex = new THREE.CanvasTexture(canvas);
  lowTex.colorSpace = THREE.SRGBColorSpace;
  lowTex.wrapS = THREE.RepeatWrapping;
  lowTex.anisotropy = 4;
  const lowDome = new THREE.SphereGeometry(R + 0.12, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const outer = new THREE.Shape();
  outer.moveTo(-0.98, 0);
  outer.lineTo(-0.98, TUNNEL_LIFT);
  outer.absarc(0, TUNNEL_LIFT, 0.98, Math.PI, 0, true);
  outer.lineTo(0.98, 0);
  outer.closePath();
  outer.holes.push(doorShape);
  const lowTunnel = new THREE.ExtrudeGeometry(outer, { depth: 1.46, bevelEnabled: false, curveSegments: 8 });
  const setLowDome = partSet(lowDome, new THREE.MeshStandardMaterial({ map: lowTex, roughness: 0.46 }), { cast: true, receive: true });
  const setLowTunnel = partSet(lowTunnel, new THREE.MeshStandardMaterial({ color: 0xd8e9f5, roughness: 0.46 }), { cast: true, receive: true });
  const tunnelOffset = new THREE.Matrix4().makeTranslation(0, 0, R * 0.92 - 0.23);
  const domeScale = new THREE.Matrix4();
  showIglooFar = (home, far, shrink = 1) => {
    const m = far ? igloos[home].matrix : null;
    setLowDome(home, m && m.clone().multiply(domeScale.makeScale(shrink, shrink, shrink)));
    setLowTunnel(home, m && m.clone().multiply(tunnelOffset));
  };
  places.forEach((_, home) => showIglooFar(home, true));
}

// 호버한 건물에만 두 개의 가벼운 파동을 번갈아 표시한다.
const ring = new THREE.Group();
const rippleGeo = new THREE.RingGeometry(1, 1.02, 96);
const rippleBasis = rippleGeo.attributes.position.array.slice();
for (let i = 0; i < 2; i++) {
  const ripple = new THREE.Mesh(rippleGeo.clone(), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, fog: false, depthWrite: false
  }));
  ripple.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  ripple.frustumCulled = false;
  ring.add(ripple);
}

ring.visible = false;
scene.add(ring);
let rippleStart = 0;
// 지형 계산은 호버 대상이 바뀔 때만 하고 매 프레임에는 보간만 한다.
function fitRipples(ig) {
  const yaw = ig.group.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
  const baseRadius = ig.house ? 3.05 : 2.65;
  const porch = ig.house ? 1.15 : 0.65;
  const start = new Float32Array(rippleBasis.length), end = new Float32Array(rippleBasis.length);
  for (let j = 0; j < rippleBasis.length; j += 3) {
    const bx = rippleBasis[j], bz = rippleBasis[j + 1], len = Math.hypot(bx, bz);
    const ux = bx / len, uz = bz / len;
    const dx = c * ux + s * uz, dz = -s * ux + c * uz;
    // 입구의 돌출 부분을 피해 가는 가는 선을 바깥쪽으로만 넓힌다.
    const radius = baseRadius + porch * Math.pow(Math.max(uz, 0), 6) + (len > 1.01 ? 0.04 : 0);
    for (const [positions, offset] of [[start, 0], [end, 0.32]]) {
      const x = dx * (radius + offset), z = dz * (radius + offset);
      positions[j] = x;
      positions[j + 1] = heightAt(ig.group.position.x + x, ig.group.position.z + z) + 0.16;
      positions[j + 2] = z;
    }
  }
  for (const ripple of ring.children) ripple.userData = { start, end };
}

// 마을 소품은 별도 파일. 없어도 장면은 그대로 뜬다
let village = null;
let santa = null;
let updateWavingSanta = null;
// 주인이 있는 이글루 번호. 마을 모듈이 늦게 불러와져도 우편함을 맞게 세운다.
let ownedHomeIds = [];
let polarBear = null;
import('./village.js?v=wave-grandpa1')
  .then(m => {
    // 모닥불은 관측소를 옮기기 전 자리(도로 오른쪽)에 고정한다. 난수 배치에 맡기면 다른 건물을 옮길 때마다 산타·게시판까지 함께 움직인다.
    village = m.addVillage(scene, { places, hub: HUB, heightAt, rng, lighthouse: LIGHTHOUSE, statsSite: STATS_SITE, fireSpot: { x: 5.4, z: 12.01 } });
    commentMailbox.setWorld(village);
    village.setOwnedMailboxes(ownedHomeIds);
    // 게시판은 모닥불 왼쪽 앞(옛 벤치 자리)에 세우고, 정면에서 오른쪽(모닥불 쪽)으로 약 10° 돌린다.
    // 게시판은 모닥불 바로 왼쪽(화면 기준)에 둔다. 모닥불 자리가 없으면 예전 벤치 자리.
    const signSpot = village.fireSpot ? { x: village.fireSpot.x - 2.1, z: village.fireSpot.z + 0.2 } : village.boardSpot;
    if (signSpot) boardObject.place(signSpot.x, signSpot.z, Math.PI / 14);
    if (village.wavingSantaSpot) {
      import('./waving-santa.js?v=coat1')
        .then(({ addWavingSanta }) => addWavingSanta(scene, village.wavingSantaSpot, heightAt, camera))
        .then(update => { updateWavingSanta = update; })
        .catch(error => console.warn('인사하는 산타를 불러오지 못했어요', error));
    }
    import('./polar-bear.js?v=pet2')
      .then(({ addPolarBear }) => addPolarBear(scene, { obstacles: village.walkingObstacles, heightAt }))
      .then(bear => { polarBear = bear; })
      .catch(error => console.warn('북극곰을 불러오지 못했어요:', error));
    renderer.shadowMap.needsUpdate = true;
    import('./santa.js?v=shorewalk1')
      .then(({ addSanta }) => addSanta(scene, { fireSpot: village.fireSpot, lakesideHome: places.reduce((nearest, home) =>
        Math.hypot(home.x-HUB.x, home.z-HUB.z) < Math.hypot(nearest.x-HUB.x, nearest.z-HUB.z) ? home : nearest), obstacles: [...village.walkingObstacles, {...signSpot,r:.75}], bearPosition: () => polarBear?.root.position, heightAt, height: R * 0.8 }))
      .then(character => { santa = character; renderer.shadowMap.needsUpdate = true; })
      .catch(error => console.warn('산타 모델을 불러오지 못했어요:', error));
  })
  .catch(() => {});
renderer.shadowMap.needsUpdate = true;

// 후처리
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.3, 0.7, 0.9);
// 빛 번짐은 흐릿한 효과라 절반 해상도로 계산해도 차이가 거의 없다
const setBloomSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => setBloomSize(Math.ceil(w / 2), Math.ceil(h / 2));
bloom.setSize(W(), H());
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());

// 프레임이 계속 낮으면 품질을 내리고, 다시 빨라지면 올린다. 단계를 정하는 규칙은 quality.js에 있다
const BASE_RATIO = renderer.getPixelRatio();
const QUALITY_LEVELS = 3;
const applyQuality = level => {
  const ratio = level === 0 ? BASE_RATIO : level < 3 ? 1 : 0.8;
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  bloom.enabled = level < 2;
  snowfall.visible = level < 3;
};
const quality = createQualityControl({ maxLevel: QUALITY_LEVELS, now: performance.now() });
const perfEl = document.getElementById('perf');
const stats = { fps: 0, level: 0, triangles: 0, calls: 0 };
window.__iglooStats = stats;
let statFrames = 0, statStart = performance.now(), statLast = statStart;
const watchSpeed = () => {
  const now = performance.now(), gap = now - statLast;
  statLast = now;
  // 탭이 숨겨져 멈췄던 구간은 느린 기기로 오해하지 않게 건너뛴다
  if (document.hidden || gap > 3000) { statFrames = 0; statStart = now; quality.pause(now); return; }
  statFrames++;
  if (now - statStart < 2000) return;
  stats.fps = Math.round(statFrames / ((now - statStart) / 1000));
  statFrames = 0;
  statStart = now;
  const level = quality.sample(stats.fps, now);
  if (level !== stats.level) applyQuality(stats.level = level);
  // 시험용 표시. 공개할 때는 이 줄과 #perf를 지운다
  perfEl.textContent = `${stats.fps} FPS · 품질 ${QUALITY_LEVELS - stats.level}/${QUALITY_LEVELS} · 삼각형 ${Math.round(stats.triangles / 10000)}만`;
};

// 인터랙션
const bar = document.getElementById('bar'), count = document.getElementById('count');
const uiReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let barMotion = null;
const setBar = (text, buttons = [], kind = buttons.length ? 'actions' : 'notice') => {
  const previousKind = bar.dataset.kind;
  if (barMotion) barMotion.cancel();
  bar.textContent = '';
  bar.dataset.kind = kind;
  const message = document.createElement('span');
  message.className = 'bar-message';
  message.textContent = text;
  bar.appendChild(message);
  if (buttons.length) {
    const actions = document.createElement('div');
    actions.className = 'bar-actions';
    buttons.forEach(([text, action, primary]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      if (primary) button.className = 'primary';
      button.onclick = action;
      actions.appendChild(button);
    });
    bar.appendChild(actions);
  }
  if (kind === 'actions' && previousKind !== 'actions' && !uiReducedMotion.matches) {
    barMotion = bar.animate([
      { opacity: 0, transform: 'translate(-50%, 4px)' },
      { opacity: 1, transform: 'translate(-50%, 0)' }
    ], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
};
const IDLE = '스크롤로 확대 · 드래그로 이동';
const updateCount = () => {
  const homes = igloos.filter(i => !i.house), f = homes.filter(i => i.owner || i.mine).length;
  count.textContent = `깃발 ${f}개 · 빈 이글루 ${homes.length - f}채`;
};
updateCount();
setBar(IDLE, [], 'hint');

const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(2, 2), hits = igloos.map(i => i.hit);
let mode = 'map', hovered = null, mine = null, mx = 0, my = 0, raising = null;
// 게시판이 열려 있을 때 마우스가 칸 밖(마을이 보이는 곳)에 있으면 카메라가 마우스를 따라 조금 움직인다.
let overBoard = true;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// 작은 표지판 게시판. 자리는 마을 배치(village.boardSpot)가 끝난 뒤 정한다.
const boardObject = addAnonymousBoardObject(THREE, scene, { heightAt });
const homeIgloo = id => igloos.find(ig => ig.home === id && !ig.house && !ig.stats);
// 튜토리얼이 빛 고리를 그릴 자리. 이글루는 발밑, 게시판은 표지판 앞.
const tutorialSpot = (x, z, r) => ({ x, z, y: heightAt(x, z), r });
// 우편함 설명에 쓸 이글루: 내 이글루, 없으면 광장에서 가까운 다른 사람 이글루를 예시로 쓴다.
const mailboxIgloo = () => mine || igloos.filter(ig => !ig.house && !ig.stats && ig.owner)
  .sort((a, b) => Math.hypot(a.group.position.x - HUB.x, a.group.position.z - HUB.z) - Math.hypot(b.group.position.x - HUB.x, b.group.position.z - HUB.z))[0] || null;
const tutorial = mountTutorial({
  THREE, scene, camera,
  getMode: () => mode,
  hasMine: () => Boolean(mine),
  // 우편함 단계: 카메라를 우편함이 보이는 입구 앞으로 옮기고 투입구 빛을 미리 켠다.
  onFocus: (kind, on) => {
    if (kind !== 'mine') return;
    const ig = mailboxIgloo();
    if (on && ig) { focusOn(ig); village?.setMailboxPreview(ig.home); }
    else { village?.setMailboxPreview(null); if (mode === 'in') leave(); }
  },
  getTargets: kind => {
    const homes = igloos.filter(ig => !ig.house && !ig.stats);
    const list = kind === 'empty' ? homes.filter(ig => !ig.owner && !ig.mine)
      : kind === 'occupied' ? homes.filter(ig => ig.owner)
      : [];
    if (kind === 'mine') {
      const ig = mailboxIgloo(), spot = ig && village?.mailboxSpot(ig.home);
      return spot ? [tutorialSpot(spot.x, spot.z, 0.75)] : [];
    }
    if (kind === 'board') return boardObject.placed ? [(p => tutorialSpot(p.x, p.z, 1.7))(boardObject.focusTarget())] : [];
    return list.map(ig => tutorialSpot(ig.group.position.x, ig.group.position.z, R + 0.7));
  }
});
const anonymousBoard = mountAnonymousBoard(villageBackend, {
  getMember: () => auth.member,
  getOwnerName: id => homeIgloo(id)?.owner || '',
  // 보드의 '보러 가기'·'피드백 남기기'는 해당 이글루 앞으로 이동한다.
  onVisitProject: id => { const ig = homeIgloo(id); if (ig) enter(ig); }
});
function closeVillageBoard() {
  mode = 'map';
  applyView();
  bar.hidden = false;
  count.hidden = false;
  chat.setHidden(false);
  setBar(mapHintText(), [], 'hint');
  canvas.style.cursor = '';
}
function openVillageBoard() {
  if (mode !== 'map' || !boardObject.placed) return;
  mode = 'board';
  ring.visible = false;
  hovered = null;
  canvas.style.cursor = '';
  camPos.copy(boardObject.focusPosition());
  camLook.copy(boardObject.focusTarget());
  bar.hidden = true;
  count.hidden = true;
  chat.setHidden(true);
  anonymousBoard.open(closeVillageBoard);
}

// 확대하면 자리 선택을 안내하고, 끝까지 축소했을 때 조작 설명으로 돌아간다.
let choosingHint = false;
const mapHintText = () => {
  const zoom = closeness();
  if (zoom >= 0.3) choosingHint = true;
  else if (zoom <= 0.001) choosingHint = false;
  return choosingHint ? mine ? '내 이글루를 눌러 둘러보세요' : '내 자리를 정해 보세요' : IDLE;
};


const pick = () => {
  ray.setFromCamera(pointer, camera);
  const h = ray.intersectObjects(hits, false)[0];
  return h ? igloos[h.object.userData.i] : null;
};
const canvas = renderer.domElement;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
const groundAt = (cx, cy) => {
  ray.setFromCamera(new THREE.Vector2(cx / W() * 2 - 1, -(cy / H()) * 2 + 1), camera);
  return ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
};
// 커서 아래 지점을 붙잡은 채로 확대·축소
const zoomAt = (cx, cy, factor) => {
  const next = Math.min(Math.max(view.d * factor, MIN_DIST), view.maxD);
  const at = groundAt(cx, cy);
  if (at) {
    const s = 1 - next / view.d;
    view.x += (at.x - view.x) * s;
    view.z += (at.z - view.z) * s;
  }
  view.d = next;
  applyView();
};
let scrollReturnTime = -Infinity;
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!e.deltaY) return;
  const now = performance.now();
  if (mode === 'in') {
    if (e.deltaY > 0) {
      leave();
      scrollReturnTime = now;
    }
    return;
  }
  // 복귀에 쓴 휠/트랙패드 동작의 나머지 이벤트로 갑자기 확대되지 않게 한다.
  if (now - scrollReturnTime < 180) {
    scrollReturnTime = now;
    return;
  }
  if (mode === 'map') zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0013));
}, { passive: false });

const touches = new Map();
let dragged = false, pinch = 0;
canvas.addEventListener('pointerdown', e => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  dragged = false;
  pinch = 0;
});
const release = e => {
  touches.delete(e.pointerId);
  pinch = 0;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
addEventListener('pointermove', e => {
  pointer.set(e.clientX / W() * 2 - 1, -(e.clientY / H()) * 2 + 1);
  mx = pointer.x; my = pointer.y;
  overBoard = e.pointerType !== 'mouse' || Boolean(e.target?.closest?.('.ab-tile, .ab-top button'));
  const held = touches.get(e.pointerId);
  if (!held || mode !== 'map') return;
  const dx = e.clientX - held.x, dy = e.clientY - held.y;
  if (touches.size === 2) {
    held.x = e.clientX;
    held.y = e.clientY;
    const [a, b] = [...touches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch / dist);
    pinch = dist;
    dragged = true;
    return;
  }
  if (!dragged && Math.hypot(dx, dy) < 5) return;
  dragged = true;
  held.x = e.clientX;
  held.y = e.clientY;
  const unit = 2 * view.d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / H();
  view.x -= dx * unit;
  view.z -= dy * unit / Math.max(Math.sin(pitch()), 0.3);
  applyView();
});
canvas.addEventListener('click', e => {
  if (dragged) return;
  pointer.set(e.clientX / W() * 2 - 1, -(e.clientY / H()) * 2 + 1);
  if (mode === 'bear') {   // 곰을 또 누르면 하트 하나 더, 다른 곳을 누르면 바로 지도로 돌아간다
    ray.setFromCamera(pointer, camera);
    if (polarBear?.hit(ray)) polarBear.pet(camPos); else leave();
    return;
  }
  // 마을 지도에서 나무 게시판을 누르면 익명 메모 UI를 연다.
  if (mode === 'map') {
    ray.setFromCamera(pointer, camera);
    if (ray.intersectObjects(boardObject.targets, false).length) {
      openVillageBoard();
      return;
    }
    // 북극곰을 누르면 가까이 날아가 보여 주고, 곰은 멈춰서 돌아보며 하트를 띄운다.
    if (polarBear?.hit(ray)) { showBear(); return; }
  }
  if (mode === 'room' && room === lighthouseRoom) {
    if (lighthouseRoom.consumeDrag()) return;
    const action = lighthouseRoom.pickAction(pointer);
    if (action === 'mail') openLighthouseMail();
    // 책장: 자료보관함(누구나 보기, 강사·자료 담당은 올리기).
    else if (action === 'archive') archive?.open();
    else if (action === 'light') lighthouseRoom.toggleLight();
    // 왼쪽 벽 액자: 업로드 현황 대시보드(강사·자료 담당만 내용이 보임).
    else if (action === 'dashboard') dashboard?.open();
    return;
  }
  if (mode === 'map' || mode === 'in') {
    ray.setFromCamera(pointer, camera);
    const home = village?.pickMailbox(ray);
    if (mine && home === mine.home) { commentMailbox.open(); return; }
  }
  if (mode !== 'map') return;
  const ig = pick();
  if (!ig) return;
  if (ig.owner || ig.mine) return enter(ig);
  // 구경은 누구나 할 수 있고, 자리를 정할 때만 로그인과 승인이 필요하다
  if (!auth.user) return auth.open();
  if (!auth.member?.approved) return auth.openJoin();
  if (auth.member.role !== 'student') return setBar('수강생만 이글루를 정할 수 있어요');
  if (mine) return setBar('이글루는 한 사람당 하나예요');
  focusOn(ig);
  setBar('이 이글루를 선택할까요?', [['깃발 꽂기', () => claim(ig), true], ['취소', leave]]);
});
// 입구 정면 눈높이로 카메라를 옮긴다. 다른 이글루에 막히면 입구가 보이는 범위에서만 비켜 선다
function focusOn(ig) {
  mode = 'in';
  ring.visible = false;
  hovered = null;
  canvas.style.cursor = '';
  const { x, z } = ig.group.position, yaw = ig.group.rotation.y, DIST = ig.stats ? 10 : ig.house ? 17 : 8.5;
  let best = null;
  for (const off of [0, 0.25, -0.25, 0.5, -0.5]) {
    const a = yaw + off, cx = x + Math.sin(a) * DIST, cz = z + Math.cos(a) * DIST;
    const room = places.reduce((min, p) => {
      if (p.x === x && p.z === z) return min;
      const dx = cx - x, dz = cz - z;
      const t = Math.min(Math.max(((p.x - x) * dx + (p.z - z) * dz) / (dx * dx + dz * dz), 0), 1);
      return Math.min(min, Math.hypot(p.x - x - dx * t, p.z - z - dz * t));
    }, Infinity);
    if (!best || room > best.room) best = { room, cx, cz };
    if (room > R * 1.15) break;
  }
  camPos.set(best.cx, 2.6, best.cz);
  camLook.set(x, ig.stats ? 2 : ig.house ? 5.5 : 1.5, z);
}
// 화면은 항상 DB 응답을 따른다. 저장에 성공한 뒤에만 깃발을 세운다.
async function claim(ig) {
  setBar('자리를 정하는 중이에요');
  try {
    await villageBackend.claimIgloo(ig.home);
    await syncVillage(ig.home);
    setBar('내 이글루로 설정했어요', [['안으로 들어가기', () => goInside(ig), true], ['마을로 돌아가기', leave]]);
  } catch (error) {
    console.warn('이글루를 정하지 못했어요:', error.message);
    await syncVillage().catch(() => {});
    const text = ig.owner ? '방금 다른 사람이 먼저 정했어요' : mine ? '이글루는 한 사람당 하나예요' : '자리를 정하지 못했어요. 다시 시도해 주세요';
    setBar(text, [['마을로 돌아가기', leave, true]]);
  }
}
// 사람마다 깃발 색이 달라지되, 누가 봐도 같은 색이 되도록 계정 ID에서 뽑는다
// 깃발 색은 세 가지 중 하나. 누가 봐도 같은 색이 되도록 계정 ID에서 고른다
// 등불 금빛(가로등·문틈 불빛), 코랄(따뜻한 짝), 오로라 민트(하늘 오로라와 같은 계열). 파란 밤 마을에서 모두 또렷하다
const FLAG_COLORS = [0xf0b45a, 0xee8f7a, 0x86cdb8];
const flagColorOf = id => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FLAG_COLORS[h % FLAG_COLORS.length];
};
let syncing = null, syncAgain = false;
// DB의 입주 상태를 마을에 반영한다. raiseHome은 깃발을 올리는 연출을 보여줄 집이다.
async function syncVillage(raiseHome = null) {
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    const homes = await villageBackend.getMap();
    const approved = auth.member?.approved;
    const names = approved ? await villageBackend.getMemberNames() : [];
    const nameOf = new Map(names.map(m => [m.id, m.display_name]));
    mine = null;
    latestProjectAt.clear();
    for (const { id, owner_id: ownerId, is_public: isPublic, latest_project_at: latest, exterior_light: exteriorLight } of homes) {
      const ig = igloos[id];
      ig.isPublic = Boolean(isPublic);
      if (!ownerId) continue;
      if (latest) latestProjectAt.set(id, new Date(latest).getTime());
      ig.mine = ownerId === auth.user?.id;
      if (ig.mine) mine = ig;
      ig.owner = ig.mine ? null : nameOf.get(ownerId) || '수강생';
      lightUp(ig, exteriorLight);
      if (!ig.flag) {
        ig.flag = makeFlag(ig, flagColorOf(ownerId));
        if (id === raiseHome) {
          ig.flag.scale.y = 0.001;
          raising = { g: ig.flag, t: 0 };
        }
        renderer.shadowMap.needsUpdate = true;
      }
      const label = ig.mine ? '내 이글루' : nameOf.get(ownerId) || null;
      if (label) addLabel(ig, label);
      else if (ig.label) {
        ig.label.remove();
        ig.label = null;
      }
    }
    igloos.forEach(ig => { if (!ig.house && !homes.find(h => h.id === ig.home)?.owner_id) ig.mine = false; });
    ownedHomeIds = homes.filter(h => h.owner_id).map(h => h.id);
    village?.setOwnedMailboxes(ownedHomeIds, raiseHome);
    renderer.shadowMap.needsUpdate = true;
    if (mode === 'room' && currentRoomIg && !currentRoomIg.house && !currentRoomIg.mine && !currentRoomIg.isPublic) goOutside(currentRoomIg);
    updateCount();
    updateProjectBeams();
    chat.setAccess({ user: auth.user, member: auth.member });
    anonymousBoard.refreshAccess();
    commentMailbox.setAccess(auth.member, mine?.home ?? null);
    tutorial.sync({ user: auth.user, member: auth.member, hasIgloo: Boolean(mine) });
  })();
  try {
    await syncing;
  } finally {
    syncing = null;
    if (syncAgain) {
      syncAgain = false;
      syncVillage().catch(() => {});
    }
  }
}
// 다른 사람이 깃발을 꽂으면 새로고침 없이 바로 보이게 한다
villageBackend.subscribeMap(() => syncVillage().catch(() => {})).catch(() => {});
syncVillage().catch(error => console.warn('마을 상태를 불러오지 못했어요:', error.message));
// 이글루 창밖 풍경: 들어가기 직전, 그 이글루 바로 앞에서 광장 쪽을 바라본 실제 마을을 한 장 찍어 창 너머 배경으로 쓴다.
let windowViewTarget = null;
function captureWindowView(ig) {
  windowViewTarget ??= new THREE.WebGLRenderTarget(1280, 720, { samples: 4 });
  const from = ig.group.position;
  const out = new THREE.Vector3(HUB.x - from.x, 0, HUB.z - from.z);
  if (out.lengthSq() < 0.01) out.set(0, 0, 1);
  out.normalize();
  const eye = from.clone().addScaledVector(out, R + 0.35);
  eye.y = heightAt(eye.x, eye.z) + 1.1;
  const look = from.clone().addScaledVector(out, 30);
  look.y = heightAt(look.x, look.z) + 1.6;
  const shot = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1400);
  shot.position.copy(eye);
  shot.lookAt(look);
  const wasVisible = ig.group.visible;
  ig.group.visible = false;
  renderer.setRenderTarget(windowViewTarget);
  renderer.render(scene, shot);
  renderer.setRenderTarget(null);
  ig.group.visible = wasVisible;
  return windowViewTarget.texture;
}

// 등대 창밖 풍경: 들어가기 직전, 등대 꼭대기 높이에서 광장 쪽 마을을 내려다본 사진 한 장(실시간 아님).
let lighthouseViewTarget = null;
function captureLighthouseView() {
  if (!village) return null;
  lighthouseViewTarget ??= new THREE.WebGLRenderTarget(1600, 667, { samples: 4 });
  const out = new THREE.Vector3(HUB.x - LIGHTHOUSE.x, 0, HUB.z - LIGHTHOUSE.z).normalize();
  const eye = new THREE.Vector3(LIGHTHOUSE.x, 0, LIGHTHOUSE.z).addScaledVector(out, 4);
  eye.y = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z) + 11;
  const look = new THREE.Vector3(HUB.x, heightAt(HUB.x, HUB.z), HUB.z).addScaledVector(out, 6);
  const shot = new THREE.PerspectiveCamera(58, 1600 / 667, 0.1, 1400);
  shot.position.copy(eye); shot.lookAt(look);
  renderer.setRenderTarget(lighthouseViewTarget);
  renderer.render(scene, shot);
  renderer.setRenderTarget(null);
  return lighthouseViewTarget.texture;
}

async function enter(ig) {
  if (ig.stats) {
    focusOn(ig);
    const userId = auth.user?.id;
    setBar('출입 권한을 확인하고 있어요.');
    let allowed = false;
    try { allowed = await villageBackend.canViewObservatory(); } catch {}
    if (mode !== 'in' || auth.user?.id !== userId) return;
    if (!allowed) return setBar('개발팀 전용 공간입니다.', [['마을로 돌아가기', leave]]);
    return setBar('마을 관측소', [['방문 통계 보기', openVisitDashboard, true], ['마을로 돌아가기', leave]]);
  }
  if (!ig.house && !ig.mine && !ig.isPublic) return setBar('이글루가 닫혔습니다. 외부인이 들어오지 못합니다.', [['마을로 돌아가기', leave, true]]);
  focusOn(ig);
  if (ig.house) return setBar('등대 입구', [['안으로 들어가기', () => goInside(ig), true], ['마을로 돌아가기', leave]]);
  setBar(ig.house ? '등대 입구' : `${ig.mine ? '내' : ig.owner + '의'} 이글루 앞이에요`, [['안으로 들어가기', () => goInside(ig), true], ['마을로 돌아가기', leave]]);
}
// 이글루 안으로 들어가기. 화면을 잠깐 어둡게 덮은 사이에 장면을 바꾼다
let room = null, iglooRoom = null, lighthouseRoom = null;
let visitDashboard = null, openingStats = false;
async function openVisitDashboard() {
  if (openingStats || mode !== 'in') return;
  openingStats = true;
  try {
    const userId = auth.user?.id;
    if (!await villageBackend.canViewObservatory()) return setBar('개발팀 전용 공간입니다.', [['마을로 돌아가기', leave]]);
    if (mode !== 'in' || auth.user?.id !== userId) return;
    if (!visitDashboard) {
      const { createVisitDashboard } = await import('./visit-dashboard.js?v=clear2');
      visitDashboard = createVisitDashboard(villageBackend, { getMember: () => auth.member, onExit: closeVisitDashboard });
    }
    if (mode !== 'in') return;
    fadeThrough(() => {
      mode = 'stats';
      canvas.style.visibility = 'hidden';
      bar.hidden = true; count.hidden = true; chat.setHidden(true); commentMailbox.close();
      visitDashboard.open();
    });
  } catch {
    setBar('통계 화면을 열지 못했어요.', [['다시 열기', openVisitDashboard, true], ['마을로 돌아가기', leave]]);
  } finally { openingStats = false; }
}
function closeVisitDashboard() {
  if (mode !== 'stats') return;
  visitDashboard.close();
  mode = 'in'; canvas.style.visibility = ''; bar.hidden = false; count.hidden = false; chat.setHidden(false);
  quality.pause(performance.now());
  setBar('마을 관측소', [['방문 통계 보기', openVisitDashboard, true], ['마을로 돌아가기', leave]]);
  bar.querySelector('button')?.focus();
}
let mailComposer = null, archive = null, dashboard = null;
let currentRoomIg = null;
const openLighthouseMail = () => {
  if (mode === 'room' && room === lighthouseRoom && mailComposer) mailComposer.open();
};
function showRoomActions(ig) {
  if (ig.house) setBar('등대 안쪽', [['마을에 보내기', openLighthouseMail, true], ['밖으로 나가기', () => goOutside(ig)]]);
  else if (ig.mine) setBar('내 이글루 안이에요', [['밖으로 나가기', () => goOutside(ig), true], ['이름 바꾸기', e => auth.openRename(e)]]);
  else setBar(`${ig.owner}의 이글루 안이에요`, [['밖으로 나가기', () => goOutside(ig), true]]);
}

const fade = document.getElementById('fade');
const fadeThrough = change => {
  fade.style.opacity = 1;
  setTimeout(() => {
    change();
    fade.style.opacity = 0;
  }, 470);
};
async function goInside(ig, projectId = null) {
  commentMailbox.close();
  setBar('들어가는 중이에요');
  if (!ig.house) {
    try {
      const homes = await villageBackend.getMap();
      const home = homes.find(h => h.id === ig.home);
      const mineNow = Boolean(auth.user && home?.owner_id === auth.user.id);
      ig.isPublic = Boolean(home?.is_public);
      if (!home?.owner_id || (!mineNow && !ig.isPublic)) {
        leave();
        setBar('이글루가 닫혔습니다. 외부인이 들어오지 못합니다.');
        return;
      }
    } catch {
      setBar('이글루 상태를 확인하지 못했어요. 다시 시도해 주세요.', [['마을로 돌아가기', leave]]);
      return;
    }
  }
  if (ig.house) {
    if (!lighthouseRoom) lighthouseRoom = (await import('./lighthouse-room.js?v=lh-cat1')).createLighthouseRoom({ renderer, isBlocked: () => Boolean(mailComposer?.isOpen() || archive?.isOpen() || dashboard?.isOpen()), places, hub: HUB, lighthouse: LIGHTHOUSE });
    // 책장을 누르면 여는 자료보관함. 강사 계정이면 올리기·수정·삭제가 더 보인다.
    if (!archive) archive = (await import('./lighthouse-archive.js?v=category-width2')).createLighthouseArchive({
      backend: villageBackend, getMember: () => auth.member,
      onOpen: () => { bar.hidden = true; canvas.style.cursor = ''; lighthouseRoom.setMapHovered(false); },
      onClose: () => { bar.hidden = false; }
    });
    if (!dashboard) dashboard = (await import('./lighthouse-dashboard.js?v=close8')).createLighthouseDashboard({
      backend: villageBackend, getOwner: id => homeIgloo(Number(id)),
      // 최근 프로젝트를 누르면 등대를 나와 그 이글루의 해당 프로젝트로 바로 들어간다.
      onGoProject: (iglooId, projectId) => {
        const target = homeIgloo(Number(iglooId)); if (!target) return;
        lighthouseRoom?.setMapHovered(false); lighthouseRoom?.leave();
        if (currentRoomIg?.gate) currentRoomIg.gate.visible = true;
        focusOn(target); goInside(target, projectId);
      },
      onOpen: () => { bar.hidden = true; canvas.style.cursor = ''; lighthouseRoom.setMapHovered(false); },
      onClose: () => { bar.hidden = false; }
    });
    if (!mailComposer) mailComposer = (await import('./lighthouse-mail.js?v=write-only2')).createLighthouseMail({
      backend: villageBackend,
      getHomes: async () => {
        const [homes, names] = await Promise.all([villageBackend.getMap(), villageBackend.getMemberNames()]);
        const byId = new Map(names.map(member => [member.id, member.display_name]));
        return homes.map(home => ({ ...places[home.id], id: home.id, recipientId: home.owner_id,
          owner: home.owner_id && byId.has(home.owner_id) ? byId.get(home.owner_id) : null }));
      },
      hub: HUB, lighthouse: LIGHTHOUSE,
      onOpen: () => { bar.hidden = true; canvas.style.cursor = ''; lighthouseRoom.setMapHovered(false); },
      onClose: () => { bar.hidden = false; }
    });
    room = lighthouseRoom;
  } else {
    if (!iglooRoom) iglooRoom = (await import('./room.js?v=mintyellow1')).createRoom({ canvas, renderer, backend: villageBackend, onRoomPublicChange: value => { if (currentRoomIg) currentRoomIg.isPublic = value; }, onNotificationsRead: () => commentMailbox.refresh(), onExteriorLightChange: () => syncVillage().catch(() => {}) });
    room = iglooRoom;
  }
  room.setAspect?.(W() / H());
  const windowView = room === iglooRoom ? captureWindowView(ig) : null;
  if (room === lighthouseRoom) lighthouseRoom.setWindowView(captureLighthouseView());
  if (ig.gate) ig.gate.visible = false;
  fadeThrough(() => {
    mode = 'room';
    currentRoomIg = ig;
    chat.setHidden(true);
    count.hidden = true;
    if (room === lighthouseRoom) room.enter();
    if (room === iglooRoom) room.enter({ home: ig.home, isMine: ig.mine, isPublic: ig.isPublic, projectId, ownerName: ig.mine ? auth.member?.display_name : ig.owner, windowView, lightColor: ig.lightColor });
    renderPass.scene = room.scene;
    renderPass.camera = room.camera;
    showRoomActions(ig);
    tutorial.enterRoom(room === iglooRoom && ig.mine);
  });
}
function goOutside(ig) {
  mailComposer?.close();
  archive?.close();
  dashboard?.close();
  lighthouseRoom?.setMapHovered(false);
  canvas.style.cursor = '';
  fadeThrough(() => {
    if (ig.gate) ig.gate.visible = true;
    iglooRoom?.leave();
    lighthouseRoom?.leave();
    tutorial.leaveRoom();
    renderPass.scene = scene;
    renderPass.camera = camera;
    mode = 'in';
    currentRoomIg = null;
    chat.setHidden(false);
    count.hidden = false;
    setBar(ig.house ? '등대 입구' : `${ig.mine ? '내' : ig.owner + '의'} 이글루 앞이에요`, [['안으로 들어가기', () => goInside(ig), true], ['마을로 돌아가기', leave]]);
  });
}
// 곰 가까이 보기: 지금 보는 방향 그대로 곰 앞 약 4m로 다가갔다가, 쓰다듬기가 끝나면 원래 지도 시점으로 돌아간다.
let bearTimer = 0;
function showBear() {
  const p = polarBear.root.position;
  const dx = camera.position.x - p.x, dz = camera.position.z - p.z, len = Math.hypot(dx, dz) || 1;
  camPos.set(p.x + dx / len * 4.2, p.y + 1.9, p.z + dz / len * 4.2);
  camLook.set(p.x, p.y + 0.55, p.z);
  mode = 'bear';
  ring.visible = false;
  hovered = null;
  canvas.style.cursor = '';
  polarBear.pet(camPos, 0.9);   // 카메라가 거의 다 다가온 뒤(약 0.9초)에 돌아보고 뛴다
  clearTimeout(bearTimer);
  bearTimer = setTimeout(() => { if (mode === 'bear') leave(); }, 3900);
}
function leave() {
  clearTimeout(bearTimer);
  mode = 'map';
  applyView();
  setBar(mapHintText(), [], 'hint');
}
addEventListener('keydown', e => { if (e.key === 'Escape' && (mode === 'in' || mode === 'bear')) leave(); }); // 익명 게시판 Escape는 anonymous-board.js에서 처리

const v = new THREE.Vector3();
const clock = new THREE.Clock();
let lastLabelScale = '', lastLabelAlpha = '';
renderer.info.autoReset = false;
function frame() {
  // 프레임이 낮은 기기에서도 카메라 이동 시간이 늘어지지 않게 상한을 넉넉히 둔다
  const dt = Math.min(clock.getDelta(), 0.25), t = clock.elapsedTime;
  tutorial.update(dt);
  if (mode === 'stats') {
    igloos.forEach(ig => { if (ig.label) ig.label.style.display = 'none'; });
    requestAnimationFrame(frame);
    return;
  }
  if (mode === 'room') {
    igloos.forEach(ig => { if (ig.label) ig.label.style.display = 'none'; });
    const writingMail = mailComposer?.isOpen() || archive?.isOpen() || dashboard?.isOpen();
    room.update(t, writingMail ? 0 : mx, writingMail ? 0 : my);
    renderer.info.reset();
    composer.render();
    stats.triangles = renderer.info.render.triangles;
    stats.calls = renderer.info.render.calls;
    watchSpeed();
    requestAnimationFrame(frame);
    return;
  }
  uTime.value = t;
  // 확대하거나 입구로 이동하면 배경 제목을 차분하게 지운다.
  const titleOpacity = mode === 'map' ? 0.66 * (1 - smooth(0.22, 0.62, closeness())) : 0;
  mountainTitle.material.opacity = titleOpacity;
  mountainTitle.visible = titleOpacity > 0.01;
  if (village) village.update(t, camera, H());
  if (updateWavingSanta) updateWavingSanta(dt);
  if (santa) santa.update(dt);
  if (polarBear) polarBear.update(dt);

  flags.forEach(f => { f.time.value = t; });
  if (village?.mailboxRising) renderer.shadowMap.needsUpdate = true;
  if (raising) {
    raising.t = Math.min(raising.t + dt / 0.7, 1);
    raising.g.scale.y = 1 - Math.pow(1 - raising.t, 3);
    if (raising.t === 1) raising = null;
  }

  const k = 1 - Math.exp(-dt * (mode === 'map' ? 7 : 2.4));
  const still = mode !== 'map' || touches.size > 0;
  // 게시판 옆으로 마우스를 빼면 마을이 살짝(좌우 약 0.8m, 상하 약 0.4m) 따라 움직이고, 칸 위로 돌아오면 천천히 제자리로 간다.
  const boardPeek = mode === 'board' && !overBoard && touches.size === 0 && !reduceMotion.matches;
  const px = boardPeek ? mx * 0.8 : still ? 0 : mx * 0.025 * view.d, py = boardPeek ? my * 0.4 : still ? 0 : my * 0.012 * view.d;
  camera.position.lerp(v.set(camPos.x + px, camPos.y + py, camPos.z), k);
  lookNow.lerp(camLook, k);
  camera.lookAt(lookNow);
  if (mode === 'board') {
    // 카메라가 게시판 앞에 거의 도착하면 홀로그램 카드를 띄운다.
    anonymousBoard.setArrived(camera.position.distanceTo(boardObject.focusPosition()) < 3.5);
  }
  mountainTitle.position.copy(camera.position).lerp(mountainTitleAnchor, TITLE_DEPTH);
  projectBeams.forEach(beam => {
    beam.visible = mode === 'map' || mode === 'in' || mode === 'bear';
    beam.rotation.y = Math.atan2(camera.position.x - beam.position.x, camera.position.z - beam.position.z);
  });

  let mailboxHover = null;
  if ((mode === 'map' || mode === 'in') && mine && touches.size === 0) {
    ray.setFromCamera(pointer, camera);
    const hitHome = village?.pickMailbox(ray);
    if (hitHome === mine.home) mailboxHover = hitHome;
  }
  village?.setMailboxHovered(mailboxHover);
  if (mode === 'in') canvas.style.cursor = mailboxHover !== null ? 'pointer' : '';
  if (mode === 'map') {
    const hint = mapHintText();
    if (bar.dataset.kind === 'hint' && bar.textContent !== hint) setBar(hint, [], 'hint');
    const ig = mailboxHover !== null ? null : pick();
    canvas.style.cursor = mailboxHover !== null || ig ? 'pointer' : '';
    if (ig !== hovered) {
      hovered = ig;
      ring.visible = !!ig && !ig.stats;
      rippleStart = t;
      canvas.style.cursor = mailboxHover !== null || ig ? 'pointer' : '';
      if (ig) {
        ring.position.set(ig.group.position.x, 0, ig.group.position.z);
        fitRipples(ig);
      }
    }
  }

  igloos.forEach((ig, i) => {
    if (ig.house) return;
    const target = mode === 'map' && hovered === ig && !ig.owner && !ig.mine ? 1 : 0;
    const amount = iceHover.value[i];
    const next = amount + (target - amount) * (1 - Math.exp(-dt * 8));
    iceHover.value[i] = Math.abs(next - target) < 0.001 ? target : next;
  });
  updateIglooLod(dt);
  if (ring.visible) {
    const duration = 1.8;
    ring.children.forEach((ripple, i) => {
      const age = t - rippleStart - i * duration / 2;
      ripple.visible = age >= 0;
      if (age < 0) return;
      const phase = (age % duration) / duration;
      const spread = 1 - Math.pow(1 - phase, 2);
      const positions = ripple.geometry.attributes.position;
      const { start, end } = ripple.userData;
      for (let j = 0; j < positions.array.length; j++) {
        positions.array[j] = start[j] + (end[j] - start[j]) * spread;
      }
      positions.needsUpdate = true;
      const fadeIn = Math.min(phase / 0.1, 1);
      ripple.material.opacity = 0.46 * fadeIn * Math.pow(1 - phase, 1.7);
    });
  }
  // 멀리 볼수록 이름표를 조금만 작게 한다. 멀리서도 읽혀야 해서 흐리게 하지는 않는다.
  if (mode === 'map') {
    const near = closeness();
    const labelScale = (0.92 + 0.08 * near).toFixed(3), labelAlpha = '1';
    if (labelScale !== lastLabelScale) { document.documentElement.style.setProperty('--label-scale', labelScale); lastLabelScale = labelScale; }
    if (labelAlpha !== lastLabelAlpha) { document.documentElement.style.setProperty('--label-alpha', labelAlpha); lastLabelAlpha = labelAlpha; }
  }
  igloos.forEach(ig => {
    if (!ig.label) return;
    const closed = !ig.isPublic;
    if (ig.labelClosed !== closed) { ig.labelClosed = closed; ig.label.classList.toggle('is-closed', closed); }
    v.copy(ig.labelAnchor).project(camera);
    const show = mode === 'map' && v.z < 1;
    ig.label.style.display = show ? '' : 'none';
    if (show) {
      ig.label.style.left = (v.x * .5 + .5) * W() + 'px';
      ig.label.style.top = (-v.y * .5 + .5) * H() + 'px';
    }
  });

  renderer.info.reset();
  composer.render();
  stats.triangles = renderer.info.render.triangles;
  stats.calls = renderer.info.render.calls;
  watchSpeed();
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = W() / H();
  camera.updateProjectionMatrix();
  fitMap();
  if (mode === 'map') applyView();
  room?.setAspect?.(W() / H());
  renderer.setSize(W(), H());
  composer.setSize(W(), H());
});
