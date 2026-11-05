import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 우편함 외형. 읽지 않은 댓글 알림이 있는 우편함은 모든 화면에서 점등한다.
export function addMailboxes(scene, { places, heightAt }) {
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
  const mailLightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.65, 1.4, .95), toneMapped: false });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d');
  // 정사각 텍스처 안쪽에서 완전히 사라지게 해 평면의 네 변이 드러나지 않도록 한다.
  const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 52);
  gradient.addColorStop(0, 'rgba(255,242,206,.68)');
  gradient.addColorStop(0.3, 'rgba(255,220,161,.32)');
  gradient.addColorStop(0.7, 'rgba(255,220,161,.07)');
  gradient.addColorStop(1, 'rgba(255,220,161,0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 128, 128);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  const mailGlowMat = new THREE.MeshBasicMaterial({
    map: glowMap, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending
  });
  const glowGeometry = new THREE.PlaneGeometry(0.72, 0.34);
  // 멀리서도 둥근 점 대신 가느다란 투입구와 낮은 농도의 광륜이 함께 보인다.
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 256;
  const haloContext = haloCanvas.getContext('2d');
  const haloGradient = haloContext.createRadialGradient(128, 128, 0, 128, 128, 112);
  haloGradient.addColorStop(0, 'rgba(255,237,201,.42)');
  haloGradient.addColorStop(.25, 'rgba(255,226,180,.22)');
  haloGradient.addColorStop(.6, 'rgba(255,217,149,.07)');
  haloGradient.addColorStop(1, 'rgba(255,196,119,0)');
  haloContext.fillStyle = haloGradient; haloContext.fillRect(0, 0, 256, 256);
  haloContext.save();haloContext.translate(128,128);haloContext.scale(1,.34);
  const slotGradient=haloContext.createRadialGradient(0,0,0,0,0,40);
  slotGradient.addColorStop(0,'rgba(255,250,232,.98)');
  slotGradient.addColorStop(.4,'rgba(255,243,216,.9)');
  slotGradient.addColorStop(.7,'rgba(255,226,179,.28)');
  slotGradient.addColorStop(1,'rgba(255,226,179,0)');
  haloContext.fillStyle=slotGradient;haloContext.fillRect(-44,-44,88,88);haloContext.restore();
  const haloMap = new THREE.CanvasTexture(haloCanvas); haloMap.colorSpace = THREE.SRGBColorSpace;


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

  const batches = new Map(), indicators = [], meshes = new Map();
  const transform = new THREE.Object3D();
  let currentParts = [];
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
    const matrix = transform.matrix.clone(), index = matrices.length;
    matrices.push(matrix);
    if (!matrices.homes) matrices.homes = [];
    matrices.homes.push(places.indexOf(home));
    const ref = { geometry, material, index, matrix, x, y, z, sx, sy, sz, front: Math.abs(x) < .3 && z >= .31 };
    if (y >= .76) currentParts.push(ref);
    return ref;
  };
  for (const [homeIndex, home] of places.entries()) {
    currentParts = [];
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
    // 같은 인스턴스의 행렬만 바꿔 알림 표시를 올리고 투입구를 밝힌다.
    part(home, origin, smallBox, bodyMat, 0.333, 1.015, 0, 0.042, 0.07, 0.07);
    const on = [
      part(home, origin, smallBox, brassMat, 0.356, 1.18, 0, 0.025, 0.33, 0.03),
      part(home, origin, smallBox, brassMat, 0.356, 1.31, 0.05, 0.028, 0.12, 0.14),
      part(home, origin, smallBox, mailLightMat, 0, 1.101, 0.339, 0.274, 0.02, 0.009),
      part(home, origin, glowGeometry, mailGlowMat, 0, 1.101, 0.378)
    ];
    const off = [
      part(home, origin, smallBox, brassMat, 0.356, 1.015, 0.165, 0.025, 0.03, 0.33),
      part(home, origin, smallBox, brassMat, 0.356, 0.965, 0.295, 0.028, 0.14, 0.12)
    ];
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: new THREE.Color(1.5, 1.28, .92), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    halo.position.set(origin.x+s*.378, origin.y+1.101, origin.z+c*.378);
    halo.visible = false; halo.raycast = () => {};
    root.add(halo);
    indicators.push({ homeIndex, home, origin, parts: currentParts, on, off, halo, anchor: halo.position.clone(), unread: null, lift: 0, open: 0 });

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
      if (material === mailLightMat || material === mailGlowMat) {
        for (let i = 0; i < matrices.length; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      mesh.castShadow = material !== mailLightMat && material !== mailGlowMat;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += .22;
      mesh.userData.mailboxHomes = matrices.homes;
      if (!meshes.has(geometry)) meshes.set(geometry, new Map());
      meshes.get(geometry).set(material, mesh);
      root.add(mesh);
    }
  }
  root.userData.mailboxCount = places.length;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  root.userData.setUnreadHomes = homes => {
    const unread = new Set(homes);
    for (const state of indicators) {
      const enabled = unread.has(state.homeIndex);
      if (state.unread === enabled) continue;
      state.unread = enabled;
      state.needsPose = true;
      if (!enabled) state.halo.visible = false;
      for (const [refs, visible] of [[state.on, enabled], [state.off, !enabled]]) {
        for (const ref of refs) {
          const mesh = meshes.get(ref.geometry).get(ref.material);
          mesh.setMatrixAt(ref.index, visible ? ref.matrix : hidden);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  };
  let hoveredHome = null, previousTime = null;
  root.userData.setHoveredHome = home => { hoveredHome = home; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const lightColor = new THREE.Color(), towardCamera = new THREE.Vector3(), cameraSpace = new THREE.Vector3();
  root.userData.update = (camera, viewportHeight, timeSeconds) => {
    const dt = previousTime === null ? 1 / 60 : Math.min(.05, Math.max(0, timeSeconds - previousTime));
    previousTime = timeSeconds;
    const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 8);
    const pixels = Math.max(1, viewportHeight);
    for (const state of indicators) {
      const target = hoveredHome === state.homeIndex ? 1 : 0;
      const openTarget = target && state.unread ? 1 : 0;
      const lift = state.lift + (target - state.lift) * ease;
      const open = state.open + (openTarget - state.open) * ease;
      const nextLift = Math.abs(lift - target) < .001 ? target : lift;
      const nextOpen = Math.abs(open - openTarget) < .001 ? openTarget : open;
      if (state.needsPose || nextLift !== state.lift || nextOpen !== state.open) {
        state.needsPose = false;
        state.lift = nextLift; state.open = nextOpen;
        const angle = nextOpen * .16, ca = Math.cos(angle), sa = Math.sin(angle);
        const c = Math.cos(state.home.yaw), s = Math.sin(state.home.yaw);
        for (const ref of state.parts) {
          const mesh = meshes.get(ref.geometry).get(ref.material);
          const visible = state.on.includes(ref) ? state.unread : state.off.includes(ref) ? !state.unread : true;
          if (!visible) continue;
          const y = ref.front ? .825 + ca * (ref.y - .825) - sa * (ref.z - .31) : ref.y;
          const z = ref.front ? .31 + sa * (ref.y - .825) + ca * (ref.z - .31) : ref.z;
          transform.position.set(state.origin.x + c * ref.x + s * z, state.origin.y + y + nextLift * .03, state.origin.z - s * ref.x + c * z);
          transform.rotation.set(ref.front ? angle : 0, state.home.yaw, 0, 'YXZ');
          const glow = ref.material === mailLightMat || ref.material === mailGlowMat;
          transform.scale.set(ref.sx * (glow ? 1 + nextOpen * .12 : 1), ref.sy * (glow ? 1 + nextOpen * .8 : 1), ref.sz);
          transform.updateMatrix(); mesh.setMatrixAt(ref.index, transform.matrix); mesh.instanceMatrix.needsUpdate = true;
        }
        const ay = .825 + ca * (1.101 - .825) - sa * (.378 - .31);
        const az = .31 + sa * (1.101 - .825) + ca * (.378 - .31);
        state.anchor.set(state.origin.x + s * az, state.origin.y + ay + nextLift * .03, state.origin.z + c * az);
      }
      if (!state.unread) continue;
      towardCamera.copy(camera.position).sub(state.anchor);
      const distance = towardCamera.length();
      const far = THREE.MathUtils.smoothstep(distance, 12, 34);
      // 투입구의 화면상 위치는 유지하며 원거리 광륜이 본체에 잘리는 것만 방지한다.
      state.halo.position.copy(state.anchor).addScaledVector(towardCamera.normalize(), .018+far*.16);
      // 화면 가장자리에서도 크기가 부풀지 않도록 거리 대신 카메라 깊이로 픽셀 크기를 맞춘다.
      cameraSpace.copy(state.anchor).applyMatrix4(camera.matrixWorldInverse);
      const depth = -cameraSpace.z;
      const worldPerPixel = 2 * Math.max(.1,depth) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / pixels;
      state.halo.scale.setScalar(Math.max(.6, 24 * worldPerPixel));
      state.halo.material.opacity = far * (.9 + state.open * .12);
      state.halo.visible = far > .001 && depth > 0;
      const brightness = (1 - far) * (1 + state.open * .35);
      lightColor.setRGB(brightness, brightness, brightness);
      for (let i = 2; i < state.on.length; i++) {
        const ref = state.on[i];
        const mesh = meshes.get(ref.geometry).get(ref.material);
        mesh.setColorAt(ref.index, lightColor);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  };
  root.userData.pickHome = ray => {
    const hit = ray.intersectObjects(root.children.filter(mesh => mesh.userData.mailboxHomes), false)[0];
    return hit ? hit.object.userData.mailboxHomes[hit.instanceId] : null;
  };
  root.userData.setUnreadHomes([]);
  scene.add(root);
  return root;
}
