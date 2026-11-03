import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 등대 전용 내부 시안. 이글루 방과 별개이며 실제 자료·계정 기능은 없다.
export function createLighthouseRoom({ places = [], hub = { x: 0, z: 4.5 }, lighthouse = { x: -33, z: -15 } } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071525);
  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 150);
  const base = new THREE.Vector3(0, 2.3, 5.0);
  const look = new THREE.Vector3(0, 1.9, -2.0);
  camera.position.copy(base);
  camera.lookAt(look);
  scene.add(new THREE.HemisphereLight(0x9bb9d7, 0x55402d, 0.95));
  const windowLight = new THREE.DirectionalLight(0x91b8df, 1.05);
  windowLight.position.set(-3, 5, -8); scene.add(windowLight);
  const roomLight = new THREE.PointLight(0xffc188, 22, 13, 2);
  roomLight.position.set(1.15, 2.4, -2.3); scene.add(roomLight);

  const grain = document.createElement('canvas'); grain.width = grain.height = 512;
  const ctx = grain.getContext('2d');
  const tones = ['#604533', '#654a36', '#59402f', '#6d4e38'];
  for (let row = 0; row < 16; row++) {
    ctx.fillStyle = tones[row % tones.length]; ctx.fillRect(0, row * 32, 512, 32);
    ctx.fillStyle = 'rgba(15,9,5,.38)'; ctx.fillRect(0, row * 32, 512, 1.3);
    ctx.fillRect((row % 3) * 170, row * 32, 1, 32);
    for (let line = 0; line < 8; line++) {
      ctx.strokeStyle = line % 2 ? 'rgba(15,9,5,.08)' : 'rgba(242,210,167,.065)';
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = row * 32 + line * 4 + Math.sin(x * 0.03 + row + line) * 1.3;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const woodMap = new THREE.CanvasTexture(grain);
  woodMap.colorSpace = THREE.SRGBColorSpace;
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  woodMap.repeat.set(2, 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.75 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xc9c3b2, roughness: 0.94, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: 0x57402e, roughness: 0.72 });
  const edgeWood = new THREE.MeshStandardMaterial({ color: 0x302920, roughness: 0.78 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xcfc7b2, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9d7b42, roughness: 0.44, metalness: 0.72 });
  const pages = new THREE.MeshStandardMaterial({ color: 0xc6bb9f, roughness: 0.95 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x263c43, roughness: 0.85 });
  const unitBox = new RoundedBoxGeometry(1, 1, 1, 1, 0.04);
  const batches = new Map(), dummy = new THREE.Object3D();
  const part = (material, x, y, z, sx, sy, sz, yaw = 0, geometry = unitBox) => {
    let group = batches.get(geometry);
    if (!group) batches.set(geometry, group = new Map());
    let matrices = group.get(material);
    if (!matrices) group.set(material, matrices = []);
    dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
  };
  const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); scene.add(m); return m;
  };
  const radius = 5.7, wallHeight = 4.9;
  const floor = mesh(new THREE.CircleGeometry(radius, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = mesh(new THREE.CircleGeometry(radius, 64), plaster, 0, wallHeight, 0);
  ceiling.rotation.x = Math.PI / 2;

  // 창의 아치 윤곽을 따라 벽에 실제 개구부를 만든다.
  const wallPositions = [], wallIndices = [];
  function wallBand(from, to, low, high) {
    const count = Math.max(2, Math.ceil((to - from) * 85));
    const start = wallPositions.length / 3;
    for (let i = 0; i <= count; i++) {
      const a = from + (to - from) * i / count;
      const x = radius * Math.sin(a), z = radius * Math.cos(a);
      wallPositions.push(x, low(a), z, x, high(a), z);
      if (i < count) { const j = start + i * 2; wallIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
  }
  const windows = [Math.PI - 0.52, Math.PI, Math.PI + 0.52];
  const halfAngle = Math.asin(0.65 / radius);
  let previous = 0;
  for (const a of windows) {
    wallBand(previous, a - halfAngle, () => 0, () => wallHeight);
    wallBand(a - halfAngle, a + halfAngle, () => 0, () => 1.12);
    wallBand(a - halfAngle, a + halfAngle, b => 2.95 + Math.sqrt(Math.max(0, 0.65 ** 2 - (radius * Math.sin(b - a)) ** 2)), () => wallHeight);
    previous = a + halfAngle;
  }
  wallBand(previous, Math.PI * 2, () => 0, () => wallHeight);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
  wallGeo.setIndex(wallIndices); wallGeo.computeVertexNormals(); mesh(wallGeo, plaster);
  const panels = mesh(new THREE.CylinderGeometry(radius - 0.04, radius - 0.04, 0.68, 96, 1, true), wood, 0, 0.34, 0);
  panels.material = wood.clone(); panels.material.side = THREE.BackSide;
  for (const y of [0.1, 0.68]) {
    const trim = mesh(new THREE.TorusGeometry(radius - 0.07, y < 0.2 ? 0.055 : 0.032, 6, 96), edgeWood, 0, y, 0);
    trim.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 80; i++) {
    const a = i / 80 * Math.PI * 2;
    part(edgeWood, Math.sin(a) * (radius - 0.06), 0.36, Math.cos(a) * (radius - 0.06), 0.012, 0.56, 0.02, a);
  }
  const archShape = (r, h) => {
    const shape = new THREE.Shape(); shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, h);
    shape.absarc(0, h, r, 0, Math.PI, false); shape.closePath(); return shape;
  };
  const frameShape = archShape(0.81, 1.99), cutout = new THREE.Path();
  cutout.moveTo(-0.65, 0.16); cutout.lineTo(-0.65, 1.99);
  cutout.absarc(0, 1.99, 0.65, Math.PI, 0, true); cutout.lineTo(0.65, 0.16); cutout.closePath();
  frameShape.holes.push(cutout);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 1, curveSegments: 24 });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x739db9, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  for (const a of windows) {
    const window = new THREE.Group(); window.position.set(Math.sin(a) * (radius - 0.1), 0.96, Math.cos(a) * (radius - 0.1)); window.rotation.y = a;
    const frame = new THREE.Mesh(frameGeo, ivory); window.add(frame);
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(archShape(0.65, 1.99), 24), glassMat); glass.position.z = 0.12; window.add(glass);
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.42, 0.045), edgeWood); upright.position.set(0, 1.37, -0.025); window.add(upright);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.035, 0.045), edgeWood); rail.position.set(0, 1.25, -0.025); window.add(rail);
    const sill = new THREE.Mesh(new RoundedBoxGeometry(1.76, 0.1, 0.45, 1, 0.025), ivory); sill.position.set(0, 0.11, -0.07); window.add(sill);
    scene.add(window);
  }
  // 창밖은 조용한 밤바다와 별만 간단하게 그린다.
  const sea = mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshBasicMaterial({ color: 0x102b3d }), 0, -1.5, -30);
  sea.rotation.x = -Math.PI / 2;
  const stars = new Float32Array(360);
  for (let i = 0; i < 120; i++) {
    const a = i * 2.39996, h = 4 + ((i * 7.137) % 30);
    stars.set([Math.sin(a) * 60, h, Math.cos(a) * 60], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9cb8d0, size: 0.085, transparent: true, opacity: 0.65 })));
  mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd2dce1 }), -13, 11, -48);

  // 책상의 모서리, 서랍, 다리를 각각 따로 마감한다.
  part(wood, 0, 0.99, -2.5, 3.25, 0.13, 1.2);
  part(edgeWood, 0, 0.91, -2.5, 3.08, 0.045, 1.06);
  const leg = new THREE.CylinderGeometry(0.038, 0.055, 1, 8);
  for (const x of [-1.35, 1.35]) for (const z of [-2.92, -2.08]) part(wood, x, 0.46, z, 1, 0.92, 1, 0, leg);
  part(wood, -0.95, 0.79, -2.5, 0.62, 0.23, 0.88);
  part(brass, -0.95, 0.79, -2.04, 0.14, 0.022, 0.035);
  const rugMat = new THREE.MeshStandardMaterial({ color: 0x666458, roughness: 1 });
  const rug = mesh(new THREE.CircleGeometry(2.15, 64), rugMat, 0, 0.012, -1.3); rug.rotation.x = -Math.PI / 2; rug.scale.y = 0.76;
  const rugBorder = mesh(new THREE.RingGeometry(2.03, 2.08, 64), new THREE.MeshStandardMaterial({ color: 0x938d78, roughness: 1, side: THREE.DoubleSide }), 0, 0.014, -1.3);
  rugBorder.rotation.x = -Math.PI / 2; rugBorder.scale.y = 0.76;
  // 책상 조명 주변으로 따뜻한 빛이 모이게 한다.
  mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.045, 24), brass, 1.05, 1.08, -2.63);
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.48, 12), brass, 1.05, 1.34, -2.63);
  mesh(new THREE.CylinderGeometry(0.17, 0.36, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x24423d, metalness: 0.45, roughness: 0.6, side: THREE.DoubleSide }), 1.05, 1.64, -2.63);
  mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.28, 0.48), side: THREE.DoubleSide }), 1.05, 1.495, -2.63).rotation.x = Math.PI / 2;
  const deskLight = new THREE.PointLight(0xffc17b, 7, 4.5, 2); deskLight.position.set(1.05, 1.49, -2.63); scene.add(deskLight);
  // 실제 마을의 이글루 위치를 사용한 책상 지도. 발송 화면으로 들어가는 보조 진입점이다.
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = 1024; mapCanvas.height = 640;
  const mapContext = mapCanvas.getContext('2d');
  mapContext.fillStyle = '#c8c1a6'; mapContext.fillRect(0, 0, 1024, 640);
  mapContext.strokeStyle = '#92977b'; mapContext.lineWidth = 2; mapContext.strokeRect(24, 24, 976, 592);
  mapContext.font = '500 23px Georgia, serif'; mapContext.fillStyle = '#4f6657'; mapContext.fillText('IGLOO VILLAGE', 50, 65);
  const mapX = x => 55 + (x + 42) / 84 * 914, mapZ = z => 90 + (z + 39) / 56 * 500;
  mapContext.strokeStyle = '#9caa88'; mapContext.lineWidth = 6; mapContext.lineCap = 'round';
  mapContext.beginPath(); mapContext.ellipse(mapX(hub.x), mapZ(hub.z), 77, 48, 0, 0, Math.PI * 2); mapContext.stroke();
  mapContext.beginPath(); mapContext.moveTo(mapX(0), mapZ(-37)); mapContext.bezierCurveTo(mapX(-3), mapZ(-25), mapX(3), mapZ(-10), mapX(0), mapZ(-1)); mapContext.stroke();
  mapContext.fillStyle = '#8ca9a1'; mapContext.beginPath(); mapContext.ellipse(mapX(hub.x), mapZ(hub.z), 45, 25, 0, 0, Math.PI * 2); mapContext.fill();
  for (const home of places) {
    const x = mapX(home.x), y = mapZ(home.z);
    mapContext.fillStyle = '#5b7461'; mapContext.beginPath(); mapContext.arc(x, y, 10, Math.PI, 0); mapContext.lineTo(x + 10, y + 4); mapContext.lineTo(x - 10, y + 4); mapContext.fill();
    mapContext.fillStyle = '#c8c1a6'; mapContext.fillRect(x - 2, y - 1, 4, 5);
  }
  mapContext.fillStyle = '#806939'; mapContext.fillRect(mapX(lighthouse.x) - 5, mapZ(lighthouse.z) - 18, 10, 24);
  mapContext.font = '20px Georgia, serif'; mapContext.fillStyle = '#5e6e57'; mapContext.fillText('N ↑', 918, 65);
  const mapTexture = new THREE.CanvasTexture(mapCanvas); mapTexture.colorSpace = THREE.SRGBColorSpace;
  const mapMaterial = new THREE.MeshStandardMaterial({ map: mapTexture, roughness: 0.95, emissive: 0xd8bd80, emissiveIntensity: 0 });
  const mapGeometry = new THREE.PlaneGeometry(1.45, 0.82);
  const deskMap = mesh(mapGeometry, mapMaterial, -0.08, 1.069, -2.49);
  deskMap.rotation.set(-Math.PI / 2, 0, -0.08);
  const mapOutline = new THREE.LineSegments(new THREE.EdgesGeometry(mapGeometry), new THREE.LineBasicMaterial({ color: 0xd9bf82, transparent: true, opacity: 0.2 }));
  mapOutline.position.copy(deskMap.position); mapOutline.position.y += 0.002; mapOutline.rotation.copy(deskMap.rotation); scene.add(mapOutline);
  const mapHit = mesh(new THREE.PlaneGeometry(1.72, 1.04), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }), -0.08, 1.09, -2.49);
  mapHit.rotation.copy(deskMap.rotation);
  const mapRay = new THREE.Raycaster();
  part(edgeWood, 0.47, 1.073, -2.3, 0.018, 0.018, 0.38, -0.18);
  const bookMats = [ink, new THREE.MeshStandardMaterial({ color: 0x68433b, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x657061, roughness: 0.9 })];
  for (let i = 0; i < 3; i++) {
    const y = 1.095 + i * 0.085;
    for (const side of [-1, 1]) part(bookMats[i], -1.0, y + side * 0.031, -2.56, 0.5, 0.012, 0.68, i * 0.06 - 0.04);
    part(pages, -1.0, y, -2.548, 0.47, 0.049, 0.65, i * 0.06 - 0.04);
  }
  // 낮은 서가로 작은 서재의 생활감을 더한다.
  const shelfYaw = Math.PI / 2, shelfX = -4.6, shelfZ = -1.7;
  const shelfPart = (material, x, y, z, sx, sy, sz) => part(material, shelfX + z, y, shelfZ - x, sx, sy, sz, shelfYaw);
  shelfPart(edgeWood, 0, 0.88, -0.2, 2.25, 1.63, 0.045);
  for (const x of [-1.12, 1.12]) shelfPart(wood, x, 0.88, 0, 0.08, 1.7, 0.52);
  for (const y of [0.13, 0.85, 1.68]) shelfPart(wood, 0, y, 0, 2.32, 0.075, 0.57);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
    const x = -0.94 + i * 0.19, h = 0.4 + (i % 3) * 0.065;
    shelfPart(bookMats[(i + row) % 3], x, 0.2 + row * 0.73 + h / 2, 0.02, 0.145, h, 0.34);
    shelfPart(brass, x, 0.24 + row * 0.73 + h * 0.55, 0.196, 0.09, 0.012, 0.008);
  }
  // 의자는 책상 앞에 낮게 두어 창을 가리지 않게 한다.
  part(wood, -0.15, 0.49, -1.16, 0.72, 0.105, 0.68);
  for (const x of [-0.43, 0.13]) for (const z of [-1.42, -0.9]) part(edgeWood, x, 0.24, z, 0.055, 0.48, 0.055);
  for (const x of [-0.43, 0.13]) part(wood, x, 0.92, -0.87, 0.05, 0.85, 0.05);
  part(wood, -0.15, 1.24, -0.87, 0.65, 0.18, 0.05);

  for (const [geometry, group] of batches) for (const [material, matrices] of group) {
    const inst = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => inst.setMatrixAt(i, matrix)); inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); scene.add(inst);
  }
  const target = base.clone();
  return {
    scene, camera,
    pickAction(pointer) {
      mapRay.setFromCamera(pointer, camera);
      return mapRay.intersectObject(mapHit, false).length ? 'mail' : null;
    },
    setMapHovered(active) { mapMaterial.emissiveIntensity = active ? 0.12 : 0; mapOutline.material.opacity = active ? 0.7 : 0.2; },
    setAspect(aspect) { camera.aspect = aspect; camera.fov = aspect < 1.1 ? 72 : 56; camera.updateProjectionMatrix(); },
    update(t, mx, my) {
      target.set(base.x + mx * 0.18, base.y + my * 0.08, base.z);
      camera.position.lerp(target, 0.065); camera.lookAt(look);
    }
  };
}
