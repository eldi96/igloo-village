import * as THREE from 'three';

// 등대 옆 작은 관측소. 조명·애니메이션 없이 재질과 창빛만으로 표현한다.
export function addStatsBuilding(scene, site, heightAt) {
  const group = new THREE.Group();
  group.name = 'visitor-observatory';
  group.position.set(site.x, heightAt(site.x, site.z), site.z);
  group.scale.setScalar(site.scale ?? 1);
  group.rotation.y = site.yaw ?? 0;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
  const wall = material(0x53656a), trim = material(0x253b43), timber = material(0x514136);
  const snow = material(0xd6e5ec), brass = material(0x9b8053, { metalness: .55, roughness: .4 });
  const window = new THREE.MeshBasicMaterial({ color: 0xe6be7b });
  function box(x, y, z, sx, sy, sz, mat, rx = 0) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.x = rx;
    mesh.castShadow = mat !== window; mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }
  box(0, .18, 0, 4.8, .36, 4.5, trim);
  box(0, 1.7, 0, 4.4, 3, 4, wall);
  // 가로 외벽 이음선과 모서리 마감은 작은 요철만 준다.
  for (let y = .5; y < 3.1; y += .27) {
    box(0, y, 2.012, 4.4, .025, .028, trim);
    box(-2.212, y, 0, .028, .025, 4, trim);
    box(2.212, y, 0, .028, .025, 4, trim);
  }
  for (const x of [-2.16, 2.16]) for (const z of [-1.98, 1.98]) box(x, 1.7, z, .14, 3.1, .14, timber);
  const gable = new THREE.Shape();
  gable.moveTo(-2.2, 0); gable.lineTo(2.2, 0); gable.lineTo(0, 1.35); gable.closePath();
  const end = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 4, bevelEnabled: false }), wall);
  end.position.set(0, 3.2, -2); end.castShadow = true; group.add(end);
  const angle = Math.atan2(1.35, 2.2), roofWidth = Math.hypot(2.2, 1.35) + .38;
  for (const side of [-1, 1]) {
    const roof = box(side * 1.1, 3.87, 0, roofWidth, .18, 4.8, trim);
    roof.rotation.z = -side * angle;
    const cap = box(side * 1.1, 4, 0, roofWidth + .06, .16, 4.85, snow);
    cap.rotation.z = -side * angle;
  }
  box(0, 4.62, 0, .18, .12, 4.9, snow);
  // 입구의 문틀·황동 손잡이·두 단의 디딤돌.
  box(.88, 1.45, 2.04, 1.18, 2.55, .14, trim);
  box(.88, 1.4, 2.13, .96, 2.35, .08, timber);
  box(.88, 1.95, 2.18, .65, .75, .035, window);
  box(1.22, 1.2, 2.21, .055, .28, .08, brass);
  box(.88, .15, 2.6, 1.55, .3, 1.1, trim);
  box(.88, .06, 3.22, 1.9, .12, .4, snow);
  box(-.95, 1.8, 2.05, 1.52, 1.42, .14, trim);
  box(-.95, 1.8, 2.135, 1.25, 1.13, .035, window);
  box(-.95, 1.8, 2.17, .07, 1.2, .04, timber);
  box(-.95, 1.8, 2.17, 1.3, .07, .04, timber);
  box(-.95, 1.08, 2.2, 1.7, .12, .3, snow);
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 100;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#253b43'; ctx.fillRect(0, 0, 512, 100);
  ctx.fillStyle = '#e4d5b4'; ctx.font = '500 38px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('마을 관측소', 256, 64);
  const texture = new THREE.CanvasTexture(signCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.25, .44), new THREE.MeshBasicMaterial({ map: texture }));
  sign.position.set(0, 3.35, 2.04); group.add(sign);
  const hit = box(0, 2.2, 0, 4.7, 4.4, 4.4, trim); hit.visible = false;
  // 반복되는 외벽 부품은 재질별 한 번에 그린다.
  const batches = new Map();
  for (const part of [...group.children]) {
    if (part.geometry !== geometry || part === hit) continue;
    part.updateMatrix();
    if (!batches.has(part.material)) batches.set(part.material, []);
    batches.get(part.material).push(part.matrix.clone()); group.remove(part);
  }
  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mat !== window; mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group); group.updateMatrixWorld(true);
  return { group, hit, house: true, stats: true, owner: '마을 관측소', mine: false, label: null };
}
