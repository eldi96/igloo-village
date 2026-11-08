import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createBearNavigation, makeBearLoop } from './bear-navigation.js?v=fine-circuit';

const ANCHORS = [
  { x: -12, z: 14 }, { x: 6, z: 14 }, { x: 24, z: 4 },
  { x: 15, z: -11 }, { x: 1, z: -24 }, { x: -18, z: -18 }, { x: -25, z: 1 }
];
const ROUTE_OPTIONS = [ANCHORS,
  [{ x: -25, z: 22 }, { x: 20, z: 22 }, { x: 36, z: 10 }, { x: 36, z: -21 }, { x: 8, z: -35 }, { x: -27, z: -34 }, { x: -39, z: -8 }],
  [{ x: -18, z: 20 }, { x: 4, z: 22 }, { x: 22, z: 18 }, { x: 30, z: -2 }, { x: 17, z: -19 }, { x: -3, z: -27 }, { x: -19, z: -16 }, { x: -25, z: 2 }]
];

export async function addPolarBear(scene, { obstacles, heightAt, height = 1.12 }) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL('./assets/PolarBear-walk.glb?v=lowtri1', import.meta.url).href);
  const model = gltf.scene, clip = gltf.animations[0];
  if (!clip) throw new Error('북극곰 걷기 모션이 없습니다.');
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  const meshes = [], feet = [];
  model.traverse(object => {
    if (object.isSkinnedMesh) meshes.push(object);
    if (object.isBone && /^(R_)?(front|back)leg2$/.test(object.name)) feet.push(object);
    if (object.isMesh) {
      object.castShadow = false;object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        // 원본의 자체 발광을 낮춰 흰 털도 마을 달빛 아래에서 입체적으로 보이게 한다.
        material.emissiveIntensity = 0.025;material.roughness = 0.9;material.metalness = 0;
        if ('specularIntensity' in material) material.specularIntensity = 0.25;
      }
      // 뼈대가 움직여도 오래된 경계 때문에 확대 화면에서 사라지지 않는다.
      object.frustumCulled = false;
    }
  });
  // 한 보행 주기의 변형을 측정해 발과 코까지 포함한 크기로 충돌을 잡는다.
  const bounds = new THREE.Box3(), frameBounds = new THREE.Box3(), footSamples = feet.map(() => []);
  const cycle = clip.duration / 10, point = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) {
    const time = i / 40 * cycle;
    mixer.setTime(time);model.updateMatrixWorld(true);
    feet.forEach((foot, j) => {
      foot.getWorldPosition(point);footSamples[j].push({ y: point.y, z: point.z });
    });
    if (i % 4 === 0) {
      meshes.forEach(mesh => mesh.computeBoundingBox());
      bounds.union(frameBounds.setFromObject(model, true));
    }
  }
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  if (!(size.y > 0)) throw new Error('북극곰 모델 크기가 올바르지 않습니다.');
  const scale = height / size.y, length = size.z * scale, width = size.x * scale;
  const head = model.getObjectByName('head'), hips = model.getObjectByName('Hips');
  const headZ = head?.getWorldPosition(new THREE.Vector3()).z ?? 1;
  const hipsZ = hips?.getWorldPosition(new THREE.Vector3()).z ?? 0;
  const forwardSign = headZ >= hipsZ ? 1 : -1;
  const stanceSpeeds = [];
  for (const samples of footSamples) {
    const floor = Math.min(...samples.map(p => p.y));
    for (let i = 1; i < samples.length; i++) {
      const speed = (samples[i].z - samples[i - 1].z) / (cycle / 40);
      if (samples[i].y < floor + size.y * 0.07 && speed * forwardSign < -size.y * 0.01) stanceSpeeds.push(Math.abs(speed) * scale);
    }
  }
  stanceSpeeds.sort((a, b) => a - b);
  const gaitSpeed = stanceSpeeds.length ? stanceSpeeds[Math.floor(stanceSpeeds.length / 2)] : length * 0.42;
  mixer.setTime(0);model.updateMatrixWorld(true);
  const body = new THREE.Group();body.scale.setScalar(scale);body.position.y = -bounds.min.y * scale;
  model.position.x -= center.x;model.position.z -= center.z;
  if (forwardSign < 0) model.rotation.y += Math.PI;
  body.add(model);
  const root = new THREE.Group();root.name = 'village-polar-bear';root.rotation.order = 'YXZ';root.add(body);
  const radius = Math.hypot(width, length) / 2;
  const navigation = createBearNavigation({ obstacles, heightAt, radius });
  let route = null, routeScore = 0;
  // 장애물 배치에 따라 너무 작은 골목만 돌지 않도록 넓은 순환 길을 선택한다.
  for (const anchors of ROUTE_OPTIONS) {
    try {
      const candidate = makeBearLoop(navigation, anchors);
      const xs = candidate.samples.map(p => p.x), zs = candidate.samples.map(p => p.z);
      const score = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
      if (score > routeScore) { route = candidate;routeScore = score; }
    } catch { /* 막힌 후보는 버리고 다른 순환 길을 확인한다. */ }
  }
  if (!route) throw new Error('북극곰이 안전하게 순환할 길을 찾지 못했습니다.');
  // 움직이는 곰 때문에 정적 마을 그림자 전체를 다시 그리지 않도록 접지 그림자를 쓴다.
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d'), gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(4,15,27,.48)');gradient.addColorStop(0.45, 'rgba(4,15,27,.25)');gradient.addColorStop(1, 'rgba(4,15,27,0)');
  context.fillStyle = gradient;context.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.7, length * 1.2), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: 0.8
  }));
  shadow.rotation.x = -Math.PI / 2;shadow.position.y = 0.035;root.add(shadow);
  scene.add(root);
  // 처음에는 호수 앞쪽의 안전한 길에서 보여 주고 이후 같은 순환 길을 걷는다.
  let walked = 0, speed = 0.55, along = 0, nearestSpawn = Infinity;
  route.samples.forEach((p, i) => {
    if (i) along += Math.hypot(p.x - route.samples[i - 1].x, p.z - route.samples[i - 1].z);
    const distance = Math.hypot(p.x - 2, p.z - 16);
    if (distance < nearestSpawn) { nearestSpawn = distance;walked = along; }
  });
  const current = {}, ahead = {}, a = {}, b = {}, c = {}, d = {};
  function place(dt) {
    // 굽은 길은 미리 속도를 낮춘다. 좁은 모서리에서도 몸을 휙 돌리지 않는다.
    let curvature = 0;
    for (let look = 0; look <= 1.05; look += 0.15) {
      route.sample(walked + look, a);route.sample(walked + look + 0.35, b);
      route.sample(walked + look + 0.06, c);route.sample(walked + look + 0.41, d);
      const first = Math.atan2(b.x - a.x, b.z - a.z), second = Math.atan2(d.x - c.x, d.z - c.z);
      curvature = Math.max(curvature, Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first))) / 0.06);
    }
    const targetSpeed = Math.min(0.62, 0.7 / Math.max(0.01, curvature));
    speed += (targetSpeed - speed) * (1 - Math.exp(-dt * 3.5));
    const advance = Math.min(dt, 0.1) * speed;
    walked += advance;
    route.sample(walked, current);route.sample(walked + 0.35, ahead);
    root.position.set(current.x, heightAt(current.x, current.z), current.z);
    root.rotation.y = Math.atan2(ahead.x - current.x, ahead.z - current.z);
    const dx = Math.sin(root.rotation.y), dz = Math.cos(root.rotation.y), span = Math.max(0.5, length * 0.4);
    const front = heightAt(current.x + dx * span, current.z + dz * span), back = heightAt(current.x - dx * span, current.z - dz * span);
    const right = heightAt(current.x + dz * width * 0.4, current.z - dx * width * 0.4), left = heightAt(current.x - dz * width * 0.4, current.z + dx * width * 0.4);
    root.rotation.x = -Math.atan2(front - back, span * 2);
    root.rotation.z = Math.atan2(right - left, width * 0.8);
    // 실제 이동 거리로 모션을 진행해 회전할 때도 발 미끄러짐을 줄인다.
    mixer.update(advance / Math.max(0.15, gaitSpeed));
  }
  place(0);
  return { update: place, root, navigation, route,
    metrics: { height, length, width, radius, gaitSpeed, triangles: meshes.reduce((n, m) => n + (m.geometry.index?.count || m.geometry.attributes.position.count) / 3, 0) } };
}
