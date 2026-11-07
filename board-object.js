// 모닥불 옆의 작은 나무 표지판 게시판. 메모 UI는 클릭하면 화면 가운데 홀로그램 카드로 연다.
// 위치는 마을 배치가 끝난 뒤 place()로 정한다. 그 전에는 보이지도, 눌리지도 않는다.
export function addAnonymousBoardObject(THREE, scene, { heightAt }) {
  const root = new THREE.Group();
  root.visible = false;
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 0.93 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8d6d52, roughness: 0.88 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xdceafb, roughness: 0.95 });
  function block(w, h, d, x, y, z, material, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.rotation.z = rz;
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); return mesh;
  }
  // 높이 약 2.1m: 기둥 두 개, 판 1.6 × 0.95m, 작은 박공 지붕과 눈.
  block(.13, 2.0, .13, -.72, 1.0, -.04, wood);
  block(.13, 2.0, .13, .72, 1.0, -.04, wood);
  block(1.62, .96, .08, 0, 1.36, 0, wood);
  block(1.74, .09, .12, 0, 1.87, .01, trim);
  block(1.74, .09, .12, 0, .85, .01, trim);
  block(.98, .07, .5, -.43, 2.07, 0, trim, .38);
  block(.98, .07, .5, .43, 2.07, 0, trim, -.38);
  block(.92, .07, .44, -.43, 2.12, 0, snow, .38);
  block(.92, .07, .44, .43, 2.12, 0, snow, -.38);
  block(.5, .1, .5, 0, .06, 0, snow);

  // 판 앞면: 나무결 위에 새긴 글씨.
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 304;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#6f4f37' : '#765539';
    ctx.fillRect(0, i * 76, 512, 76);
    ctx.fillStyle = '#4b3324'; ctx.fillRect(0, i * 76 + 74, 512, 2);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#3a271b'; ctx.font = 'bold 74px sans-serif'; ctx.fillText('익명 메모', 258, 140);
  ctx.fillStyle = '#f2e3c8'; ctx.fillText('익명 메모', 256, 137);
  ctx.fillStyle = '#e4cfae'; ctx.font = '34px sans-serif'; ctx.fillText('눌러서 읽고 남기기', 256, 214);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .89), new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }));
  face.position.set(0, 1.36, .042); root.add(face);

  // 오른쪽 기둥의 작은 청록 불빛. 새 광원 없이 블룸으로만 빛난다.
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.9, 2.1) }));
  glow.position.set(.72, 2.08, .1); root.add(glow);
  block(.04, .14, .04, .72, 1.96, .1, trim);

  scene.add(root);
  const targets = [];
  const point = (px, py, pz) => root.localToWorld(new THREE.Vector3(px, py, pz));
  return {
    root, targets,
    get placed() { return root.visible; },
    place(x, z, rotation = 0) {
      root.position.set(x, heightAt(x, z), z);
      root.rotation.y = rotation;
      root.visible = true;
      root.updateMatrixWorld(true);
      targets.length = 0;
      root.traverse(object => { if (object.isMesh) targets.push(object); });
    },
    focusTarget() { root.updateMatrixWorld(true); return point(0, 1.2, 0); },
    // 게시판과 모닥불이 함께 보이도록 조금 떨어진 정면 위에서 바라본다.
    focusPosition() { root.updateMatrixWorld(true); return point(.6, 3.2, 7.2); }
  };
}
