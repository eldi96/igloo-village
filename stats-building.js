import * as THREE from 'three';

// 등대 옆 마을 관측소: 시안 이미지의 눈 덮인 나무 오두막.
// 박공 앞면(+z)에 나무 문, 왼쪽 옆벽에 서버 불빛 창, 회색 금속 모서리·바닥 띠, 두꺼운 눈 지붕, 지붕 위 안테나와 접시.
// 문 위치(로컬 x=.88, 앞면)는 마을 길 계산과 맞춰 둔다. 조명·애니메이션 없음.
export function addStatsBuilding(scene, site, heightAt) {
  const group = new THREE.Group();
  group.name = 'visitor-observatory';
  group.position.set(site.x, heightAt(site.x, site.z), site.z);
  group.scale.setScalar(site.scale ?? 1);
  group.rotation.y = site.yaw ?? 0;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
  const wood = material(0xcf9d68), seam = material(0xa8784a), door = material(0xd9aa75), metal = material(0x5d636a, { metalness: .3, roughness: .6 });
  const snow = material(0xf3f5f7, { roughness: .95 }), rock = material(0xc9ced3, { roughness: .9, flatShading: true }), pale = material(0xe6e9ec, { roughness: .5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xf6a64f }), screen = new THREE.MeshBasicMaterial({ color: 0x3b2a22 });
  const ledA = new THREE.MeshBasicMaterial({ color: 0xffc977 }), ledT = new THREE.MeshBasicMaterial({ color: 0x6fe3c9 });
  const unlit = new Set([glow, screen, ledA, ledT]);
  function box(x, y, z, sx, sy, sz, mat) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = !unlit.has(mat); mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }
  const W = 3.4, D = 4.2, base = .3, Hw = 2.3, front = D / 2, top = base + Hw, rise = 1.25;

  // 눈 바닥판과 바위
  box(0, .07, .3, W + 2.4, .14, D + 2.2, snow);
  [[-W / 2 - .7, .3, -.2, .55], [-W / 2 - .3, .2, .55, .28], [-W / 2 - .05, .16, .85, .18], [W / 2 + .75, .2, .9, .3]].forEach(([x, y, z, r]) => {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock);
    stone.position.set(x, y, z); stone.rotation.set(r * 3, r * 5, 0); stone.castShadow = true; stone.receiveShadow = true; group.add(stone);
  });

  // 벽: 밝은 나무 몸체 + 가로 판자 이음선
  box(0, base + Hw / 2, 0, W, Hw, D, wood);
  for (let y = base + .3; y < top; y += .3) {
    box(0, y, front + .012, W, .03, .025, seam);
    box(-W / 2 - .012, y, 0, .025, .03, D, seam);
    box(W / 2 + .012, y, 0, .025, .03, D, seam);
  }
  // 회색 금속: 바닥 띠(굵게), 네 모서리 기둥, 앞면 위 가로 띠
  box(0, base / 2 + .06, 0, W + .2, base + .08, D + .2, metal);
  for (const x of [-W / 2, W / 2]) for (const z of [-front, front]) box(x, base + Hw / 2, z, .2, Hw, .2, metal);
  box(0, top - .08, front + .03, W + .2, .16, .12, metal);
  box(0, top - .08, -front - .03, W + .2, .16, .12, metal);

  // 박공 벽: 세로 판자 느낌의 줄
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2, 0); gable.lineTo(W / 2, 0); gable.lineTo(0, rise); gable.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: D, bevelEnabled: false });
  const ends = new THREE.Mesh(gableGeo, wood);
  ends.position.set(0, top, -front); ends.castShadow = true; ends.receiveShadow = true; group.add(ends);
  for (let x = -W / 2 + .38; x < W / 2 - .2; x += .38) {
    const h = rise * (1 - Math.abs(x) / (W / 2)) - .05;
    if (h > .1) box(x, top + h / 2, front + .012, .03, h, .025, seam);
  }

  // 지붕: 박공 앞 나무 처마판 + 두껍고 둥근 눈
  const angle = Math.atan2(rise, W / 2), slope = Math.hypot(W / 2, rise);
  for (const side of [-1, 1]) {
    const fascia = box(side * W / 4, top + rise / 2 + .06, front + .42, slope + .5, .2, .14, door); fascia.rotation.z = -side * angle;
    const cap = box(side * (W / 4 + .08), top + rise / 2 + .32, -.05, slope + .62, .55, D + 1.0, snow); cap.rotation.z = -side * angle;
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, D + 1.0, 14), snow);
  ridge.rotation.x = Math.PI / 2; ridge.position.set(0, top + rise + .3, -.05); ridge.castShadow = true; group.add(ridge);

  // 앞면(박공 쪽) 나무 문
  box(.88, base + 1.02, front + .04, 1.06, 2.04, .1, seam);
  box(.88, base + 1, front + .08, .9, 1.94, .08, door);
  for (const dx of [-.22, .22]) box(.88 + dx, base + 1, front + .125, .025, 1.9, .02, seam);
  box(1.2, base + .95, front + .14, .07, .2, .06, seam);
  box(.88, .19, front + .45, 1.2, .1, .7, metal);

  // 왼쪽 옆벽: 서버 불빛 창
  const wx = -W / 2 - .04;
  box(wx, base + 1.35, .45, .12, 1.0, 1.3, seam);
  box(wx - .03, base + 1.35, .45, .04, .82, 1.12, glow);
  box(wx - .05, base + 1.35, .45, .03, .66, .9, screen);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(wx - .07, base + 1.1 + r * .16, .2 + c * .25, .02, .05, .1, (r + c) % 3 ? ledA : ledT);
  box(wx - .1, base + .8, .45, .3, .08, 1.4, snow);

  // 지붕 위: 뒤쪽 안테나 기둥, 앞쪽 작은 접시
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .9, 8), metal);
  mast.position.set(0, top + rise + .9, -front + .4); mast.castShadow = true; group.add(mast);
  box(.12, top + rise + .95, -front + .4, .2, .14, .1, metal);
  const dishGroup = new THREE.Group();
  dishGroup.position.set(.75, top + rise * .55 + .55, front - .5); dishGroup.rotation.set(-.6, .9, 0);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 8, 0, Math.PI * 2, 0, .9), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: .5, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI; dish.position.y = .5; dish.castShadow = true; dishGroup.add(dish);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .45, 6), metal); arm.position.y = .26; dishGroup.add(arm);
  const feed = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), pale); feed.position.y = .48; dishGroup.add(feed);
  group.add(dishGroup);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .4, 8), metal); stand.position.set(.75, top + rise * .55 + .4, front - .5); group.add(stand);

  // 박공 앞면 간판 '마을 관측소'(문 위)
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 128;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#5d636a'; ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 20); ctx.fill();
  ctx.fillStyle = '#fff4e2'; ctx.font = '700 62px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('마을 관측소', 256, 68);
  const texture = new THREE.CanvasTexture(signCanvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .48), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  sign.position.set(0, top + .38, front + .05); group.add(sign);

  const hit = box(0, 2, 0, W + .8, 4.2, D + 1, metal); hit.visible = false;
  // 반복되는 상자 부품은 재질별 한 번에 그린다.
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
    mesh.castShadow = !unlit.has(mat); mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group); group.updateMatrixWorld(true);
  return { group, hit, house: true, stats: true, owner: '마을 관측소', mine: false, label: null };
}
