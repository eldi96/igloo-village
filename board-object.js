// 눈 마을의 익명 게시판: 표면은 WebGL 안에 남고, 입력 UI는 투영된 표면 위에 표시한다.
export function addAnonymousBoardObject(THREE, scene, { x, z, heightAt, rotation = 0 }) {
  const root = new THREE.Group();
  root.position.set(x, heightAt(x, z) + 0.12, z);
  root.rotation.y = rotation;
  const wood = new THREE.MeshStandardMaterial({ color: 0x624532, roughness: 0.93 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x94765c, roughness: 0.87 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xece2ca, roughness: 0.97 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xdceafb, roughness: 0.95 });
  function block(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); return mesh;
  }
  // 게시판은 이글루보다 높은 9.8 × 6.2m 판으로, 멀리서도 알아볼 수 있다.
  block(9.8, 6.2, .30, 0, 4.15, 0, wood);
  block(9.05, 5.42, .06, 0, 4.15, .184, paper);
  block(10.05, .28, .43, 0, 7.39, .04, trim);
  block(10.05, .27, .43, 0, .92, .04, trim);
  block(.28, 6.55, .43, -4.93, 4.15, .04, trim);
  block(.28, 6.55, .43, 4.93, 4.15, .04, trim);
  block(.42, 1.65, .42, -3.85, .20, -.14, wood);
  block(.42, 1.65, .42, 3.85, .20, -.14, wood);
  block(10.22, .17, .53, 0, 7.59, .01, snow);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(8.95, 5.36),
    new THREE.MeshBasicMaterial({ color: 0xf1e8d5, side: THREE.DoubleSide, transparent: true, opacity: .96 }));
  face.position.set(0, 4.15, .23); root.add(face);
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 1024; titleCanvas.height = 512;
  const ctx = titleCanvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 512);
  ctx.fillStyle = '#795a47'; ctx.textAlign = 'center';
  ctx.font = 'bold 77px sans-serif'; ctx.fillText('익명 메모 게시판', 512, 211);
  ctx.font = '42px sans-serif'; ctx.fillText('가까이 눌러서 읽어보세요', 512, 317);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 3.86),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(titleCanvas), transparent: true, depthWrite: false }));
  title.position.set(0, 4.15, .242); root.add(title);
  scene.add(root); root.updateMatrixWorld(true);
  const targets = [];
  root.traverse(object => { if (object.isMesh) targets.push(object); });
  const point = (px, py, pz = .26) => root.localToWorld(new THREE.Vector3(px, py, pz));
  return {
    root, targets,
    // UI가 게시판 종이 안쪽으로 투영되도록 좌상/우하 월드 좌표를 반환한다.
    faceCorners() { root.updateMatrixWorld(true); return [point(-4.46, 6.76), point(4.46, 1.54)]; },
    focusTarget() { root.updateMatrixWorld(true); return point(0, 4.15, 0); },
    focusPosition() {
      root.updateMatrixWorld(true);
      // 전면(+Z) 방향에서 바라보는 카메라. y는 표면 중심보다 조금 높게 둔다.
      return point(0, 4.3, 8.9);
    }
  };
}
