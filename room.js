import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 이글루 안쪽 방. 마을과 별도의 장면이라, 안에 있을 때는 마을을 그리지 않아 가볍다
export function createRoom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120a06);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 60);
  const BASE = new THREE.Vector3(0, 2.1, 7.2), LOOK = new THREE.Vector3(0, 1.75, -2);
  camera.position.copy(BASE);
  camera.lookAt(LOOK);

  // 불에서 먼 곳은 푸른 눈 색이 남도록 주변광은 차갑게, 불빛은 거리에 따라 빨리 줄어들게 한다
  const FIRE = 95;
  scene.add(new THREE.HemisphereLight(0xa9c6e6, 0x9a8f8c, 1.05));
  const fireLight = new THREE.PointLight(0xffa862, FIRE, 40, 2);
  fireLight.position.set(0, 1.5, 0);
  scene.add(fireLight);

  // 돔: 마을 이글루와 같은 둥근 블록을 크게 쌓는다
  const R = 9, rings = 9, top = Math.PI / 2 * 0.93;
  const blocks = [];
  const d = new THREE.Object3D();
  for (let r = 0; r < rings; r++) {
    const phi = (r + 0.5) / rings * top, ry = R * Math.sin(phi), rr = R * Math.cos(phi);
    const n = Math.max(6, Math.round(Math.PI * 2 * rr / 2));
    const w = Math.PI * 2 * rr / n * 0.965, h = R * top / rings * 0.95;
    for (let i = 0; i < n; i++) {
      const th = (i + (r % 2) * 0.5) / n * Math.PI * 2;
      d.position.set(rr * Math.sin(th), ry, rr * Math.cos(th));
      d.rotation.set(0, 0, 0);
      d.lookAt(d.position.clone().multiplyScalar(2));
      d.scale.set(w, h, 0.8);
      d.updateMatrix();
      blocks.push(d.matrix.clone());
    }
  }
  const dome = new THREE.InstancedMesh(
    new RoundedBoxGeometry(1, 1, 1, 2, 0.14),
    new THREE.MeshStandardMaterial({ roughness: 0.72 }),
    blocks.length
  );
  const warm = new THREE.Color(0xf4ece4), cool = new THREE.Color(0xd5e2ec), tone = new THREE.Color();
  blocks.forEach((m, i) => {
    dome.setMatrixAt(i, m);
    // 블록 색을 고정된 규칙으로 조금씩 달리한다
    dome.setColorAt(i, tone.copy(warm).lerp(cool, (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.55));
  });
  scene.add(dome);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R + 0.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0x1c110b, side: THREE.BackSide }));
  scene.add(shell);

  // 얼음 바닥
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 64), new THREE.MeshStandardMaterial({ color: 0x8fb4cc, roughness: 0.22, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const canvasGlow = (paint) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    paint(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const addFloorGlow = (map, sx, sz, x, z, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
    return m;
  };
  // 불빛이 바닥에 둥글게 퍼지는 빛과, 카메라 쪽으로 길게 비친 반사
  const round = canvasGlow(g => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,170,90,.95)');
    gr.addColorStop(0.5, 'rgba(255,140,70,.3)');
    gr.addColorStop(1, 'rgba(255,130,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  const floorGlow = addFloorGlow(round, 12, 12, 0, 0, 0.3);
  const streak = canvasGlow(g => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,190,110,.8)');
    gr.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  addFloorGlow(streak, 2.2, 8, 0, 3.6, 0.3);

  // 모닥불: 둘러놓은 돌, 장작, 불꽃
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: 0x6d6a68, roughness: 0.9 }), 14);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    d.position.set(Math.cos(a) * 1.25, 0.16, Math.sin(a) * 1.25);
    d.rotation.set(i * 1.3, i * 2.1, i * 0.7);
    d.scale.set(1.05, 0.72, 0.95);
    d.updateMatrix();
    stones.setMatrixAt(i, d.matrix);
  }
  scene.add(stones);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  const logGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.7, 10);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(logGeo, wood);
    log.position.y = 0.28;
    log.rotation.set(Math.PI / 2 - 0.3, 0, i * Math.PI * 2 / 5, 'YXZ');
    log.rotation.y = i * Math.PI * 2 / 5;
    log.rotation.z = 0;
    scene.add(log);
  }
  const flames = [];
  const flameGeo = new THREE.ConeGeometry(0.5, 1, 14, 1, true);
  flameGeo.translate(0, 0.5, 0);
  [[1, 1.9, 0, 0, 1.5, 0.42, 0.05], [0.72, 1.3, 0.22, 0.1, 1.7, 0.5, 0.06], [0.72, 1.25, -0.2, -0.12, 1.7, 0.46, 0.06], [0.55, 1.65, 0.03, 0.2, 1.8, 0.75, 0.12], [0.38, 1.05, -0.05, -0.02, 1.7, 1.05, 0.34]].forEach(([s, h, x, z, r, g, b], i) => {
    const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, 0.32, z);
    m.scale.set(s, h, s);
    scene.add(m);
    flames.push({ m, s, h, x, z, phase: i * 1.7 });
  });

  // 불티
  const SPARKS = 46, sparkPos = new Float32Array(SPARKS * 3), sparkSeed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) sparkSeed[i] = (i * 0.61803) % 1;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(4, 1.9, 0.6), size: 0.055, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  // 불을 향한 벤치 두 개
  const furMat = new THREE.MeshStandardMaterial({ color: 0xcdbba8, roughness: 1 });
  const seatGeo = new RoundedBoxGeometry(3.1, 0.24, 0.92, 2, 0.08), legGeo = new RoundedBoxGeometry(0.34, 0.56, 0.74, 2, 0.06), furGeo = new RoundedBoxGeometry(1.6, 0.13, 1.08, 3, 0.06);
  [[-4.9, 1.4, 1.15], [4.9, 1.4, -1.15]].forEach(([x, z, yaw]) => {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = yaw;
    const seat = new THREE.Mesh(seatGeo, wood);
    seat.position.y = 0.66;
    b.add(seat);
    for (const lx of [-1.15, 1.15]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(lx, 0.28, 0);
      b.add(leg);
    }
    const fur = new THREE.Mesh(furGeo, furMat);
    fur.position.set(0.5, 0.82, 0);
    b.add(fur);
    scene.add(b);
  });

  const look = LOOK.clone(), cam = BASE.clone();
  return {
    scene,
    camera,
    setAspect(a) {
      camera.aspect = a;
      // 세로로 좁은 화면에서는 뒤로 물러나 방이 잘리지 않게 한다
      camera.fov = a < 1.3 ? 68 : 52;
      camera.updateProjectionMatrix();
    },
    update(t, mx, my) {
      const flicker = 0.86 + 0.09 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1 + 1.2);
      fireLight.intensity = FIRE * flicker;
      fireLight.position.x = Math.sin(t * 5.1) * 0.12;
      fireLight.position.z = Math.cos(t * 4.3) * 0.12;
      floorGlow.material.opacity = 0.3 * flicker;
      for (const f of flames) {
        const w = Math.sin(t * 8 + f.phase);
        f.m.scale.set(f.s * (0.92 + w * 0.08), f.h * (0.9 + 0.14 * Math.sin(t * 9.4 + f.phase * 1.3)), f.s * (0.92 - w * 0.08));
        f.m.position.x = f.x + Math.sin(t * 6 + f.phase) * 0.04;
        f.m.rotation.z = Math.sin(t * 4.4 + f.phase) * 0.07;
        f.m.rotation.x = Math.cos(t * 3.9 + f.phase) * 0.06;
      }
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkSeed[i], life = (t * (0.18 + s * 0.2) + s) % 1, a = s * 40 + t * 0.4;
        sparkPos[i * 3] = Math.cos(a) * (0.1 + life * 0.7);
        sparkPos[i * 3 + 1] = 0.6 + life * 5.2;
        sparkPos[i * 3 + 2] = Math.sin(a) * (0.1 + life * 0.7);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      cam.set(BASE.x + mx * 0.55, BASE.y + my * 0.2, BASE.z);
      camera.position.lerp(cam, 0.06);
      camera.lookAt(look);
    }
  };
}
