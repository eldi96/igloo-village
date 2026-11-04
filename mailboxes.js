import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 우편함 외형과 도착 표시 미리보기. 실제 발송·읽음·권한 기능은 아직 연결하지 않는다.
export function addMailboxes(scene, { places, heightAt, previewHomeIndex = null }) {
  const root = new THREE.Group();
  root.name = 'mailboxes';
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x33494c, metalness: 0.55, roughness: 0.58 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3f5556, metalness: 0.5, roughness: 0.6 });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x142125, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x574737, roughness: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9f8150, metalness: 0.72, roughness: 0.48 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xe0eaf1, roughness: 0.91 });
  const box = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
  // 투입구, 손잡이처럼 작은 부품은 둥근 모서리가 보이지 않으니 일반 상자로 그린다.
  const smallBox = new THREE.BoxGeometry(1, 1, 1);
  const mailLightMat = new THREE.MeshBasicMaterial({ color: 0xe9b570, toneMapped: false });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128; glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  const gradient = glowContext.createRadialGradient(64, 32, 0, 64, 32, 64);
  gradient.addColorStop(0, 'rgba(255,205,135,.42)');
  gradient.addColorStop(0.35, 'rgba(255,184,100,.15)');
  gradient.addColorStop(1, 'rgba(255,184,100,0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 128, 64);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  const mailGlowMat = new THREE.MeshBasicMaterial({
    map: glowMap, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending
  });
  const glowGeometry = new THREE.PlaneGeometry(0.62, 0.16);

  const arch = (radius, sideHeight) => {
    const shape = new THREE.Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(radius, 0);
    shape.lineTo(radius, sideHeight);
    shape.absarc(0, sideHeight, radius, 0, Math.PI, false);
    shape.lineTo(-radius, 0);
    return shape;
  };
  const extrude = (shape, depth, bevel = 0.008) => new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: bevel > 0, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 1, curveSegments: 8
  });
  const body = extrude(arch(0.3, 0.2), 0.58);
  body.translate(0, 0, -0.29);
  const gasket = extrude(arch(0.275, 0.18), 0.012, 0.003);
  const door = extrude(arch(0.255, 0.17), 0.016, 0.004);
  // 아치 지붕 위에만 얇게 쌓인 눈. 옆면을 덮지 않는다.
  const capShape = new THREE.Shape();
  const a0 = Math.PI * 0.09, a1 = Math.PI * 0.91;
  capShape.absarc(0, 0.2, 0.34, a0, a1, false);
  capShape.lineTo(Math.cos(a1) * 0.3, 0.2 + Math.sin(a1) * 0.3);
  capShape.absarc(0, 0.2, 0.3, a1, a0, true);
  capShape.closePath();
  const snowCap = extrude(capShape, 0.61, 0.009);
  snowCap.translate(0, 0, -0.305);

  const batches = new Map();
  const transform = new THREE.Object3D();
  const part = (home, origin, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const c = Math.cos(home.yaw), s = Math.sin(home.yaw);
    transform.position.set(origin.x + c * x + s * z, origin.y + y, origin.z - s * x + c * z);
    transform.rotation.set(0, home.yaw, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    let byMaterial = batches.get(geometry);
    if (!byMaterial) batches.set(geometry, byMaterial = new Map());
    let matrices = byMaterial.get(material);
    if (!matrices) byMaterial.set(material, matrices = []);
    matrices.push(transform.matrix.clone());
  };
  for (const [homeIndex, home] of places.entries()) {
    // 입구 왼쪽에 두어 진입로, 오른쪽 깃발, 돔의 눈더미를 피한다.
    const ox = -1.48, oz = home.radius + 0.95;
    const c = Math.cos(home.yaw), s = Math.sin(home.yaw);
    const x = home.x + c * ox + s * oz, z = home.z - s * ox + c * oz;
    const origin = { x, y: heightAt(x, z), z };
    part(home, origin, box, woodMat, 0, 0.4, 0, 0.11, 0.8, 0.11);
    part(home, origin, box, bodyMat, 0, 0.09, 0, 0.15, 0.18, 0.15);
    part(home, origin, box, woodMat, 0, 0.76, 0, 0.37, 0.065, 0.45);
    part(home, origin, body, bodyMat, 0, 0.79, 0);
    part(home, origin, gasket, seamMat, 0, 0.807, 0.296);
    part(home, origin, door, doorMat, 0, 0.825, 0.31);
    part(home, origin, snowCap, snowMat, 0, 0.79, 0);
    // 투입구와 빗물 가림턱, 작은 손잡이.
    part(home, origin, smallBox, seamMat, 0, 1.101, 0.331, 0.28, 0.025, 0.008);
    part(home, origin, smallBox, bodyMat, 0, 1.125, 0.341, 0.32, 0.018, 0.045);
    part(home, origin, smallBox, brassMat, 0, 0.956, 0.352, 0.095, 0.026, 0.036);
    // 알림 표시의 경첩과 레버. 테스트 대상으로 지정한 한 곳만 올린다.
    const unread = homeIndex === previewHomeIndex;
    part(home, origin, smallBox, bodyMat, 0.333, 1.015, 0, 0.042, 0.07, 0.07);
    if (unread) {
      part(home, origin, smallBox, brassMat, 0.356, 1.18, 0, 0.025, 0.33, 0.03);
      part(home, origin, smallBox, brassMat, 0.356, 1.31, 0.05, 0.028, 0.12, 0.14);
      part(home, origin, smallBox, mailLightMat, 0, 1.101, 0.339, 0.274, 0.02, 0.009);
      part(home, origin, glowGeometry, mailGlowMat, 0, 1.101, 0.364);
    } else {
      part(home, origin, smallBox, brassMat, 0.356, 1.015, 0.165, 0.025, 0.03, 0.33);
      part(home, origin, smallBox, brassMat, 0.356, 0.965, 0.295, 0.028, 0.14, 0.12);
    }

    for (const side of [-1, 1]) {
      part(home, origin, smallBox, brassMat, side * 0.19, 0.846, 0.334, 0.036, 0.018, 0.017);
    }
  }
  // 우편함 31개를 부품별로 묶어 드로 콜을 줄인다.
  for (const [geometry, byMaterial] of batches) {
    for (const [material, matrices] of byMaterial) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = material !== mailLightMat && material !== mailGlowMat;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  root.userData.mailboxCount = places.length;
  root.userData.previewUnreadHomes = Number.isInteger(previewHomeIndex) && places[previewHomeIndex] ? [previewHomeIndex] : [];
  scene.add(root);
  return root;
}
