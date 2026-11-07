// 지형: 노이즈, 높이 계산, 눈밭 메시. main.js에서 분리(로직 변경 없음).

// 노이즈
export const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
export const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// per를 주면 텍스처가 이어지도록 격자를 반복
export const noise = (x, y, per = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => per ? hash(((a % per) + per) % per, ((b % per) + per) % per) : hash(a, b);
  const top = h(xi, yi) * (1 - u) + h(xi + 1, yi) * u;
  const bot = h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u;
  return top * (1 - v) + bot * v;
};
export const fbm = (x, y, oct) => {
  let sum = 0, amp = 0.5;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    amp *= 0.5;
  }
  return sum;
};
export const ridged = (x, y, oct) => {
  let sum = 0, amp = 0.55;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise(x, y) * 2 - 1);
    sum += amp * n * n;
    x = x * 2.1 + 31.7;
    y = y * 2.1 + 5.3;
    amp *= 0.5;
  }
  return sum;
};

// flat: 평평하게 다질 자리 목록 [{ x, z, y, r0, r1 }]. 높이 함수 heightAt을 돌려준다.
export function createHeightAt(flat) {
  // 지형: 부드럽게 굴곡진 눈밭을 뒤쪽과 옆쪽 산맥이 둘러싼다
  const rawH = (x, z) => {
    const rolling = (fbm(x * 0.045 + 3, z * 0.045 + 8, 4) - 0.47) * 2.1 + (fbm(x * 0.3, z * 0.3, 3) - 0.44) * 0.12;
    const away = Math.max(smooth(-46, -96, z), smooth(55, 112, Math.abs(x)) * smooth(55, -5, z));
    const peaks = Math.pow(ridged(x * 0.017 + 4, z * 0.017 + 2, 6), 1.3) * 44 * away;
    return rolling + peaks;
  };
  const heightAt = (x, z) => {
    let h = rawH(x, z);
    for (const f of flat) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r1) h += (f.y - h) * (1 - smooth(f.r0, f.r1, d));
    }
    const edge = Math.min(150 - Math.abs(x), z + 170, 75 - z);
    return h * smooth(0, 16, edge);
  };
  return heightAt;
}

export function makeSnowBump(THREE, maxAnisotropy) {
  const size = 512, per = 64, c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * per, v = y / size * per;
    const n = noise(u / 4, v / 4, per / 4) * 0.5 + noise(u, v, per) * 0.3 + noise(u * 2, v * 2, per * 2) * 0.14 + noise(u * 4, v * 4, per * 4) * 0.06;
    const b = n * 255, i = (x + y * size) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAnisotropy;
  return t;
}

// 마을 눈밭·뒤쪽 산·바깥 눈밭을 scene에 추가한다. snowBump의 반복 값도 여기서 정한다.
export function addGround(THREE, scene, heightAt, snowBump) {
  const snow = new THREE.Color(0xeaf2f9), hollow = new THREE.Color(0xb5cbe2), rock = new THREE.Color(0x34404d), c = new THREE.Color();
  const warp = (t, a) => a * t + (1 - a) * t * t * t;
  // place는 -1~1 격자 좌표를 실제 위치로 바꾼다
  const buildGround = (segX, segZ, place, y0) => {
    const g = new THREE.PlaneGeometry(2, 2, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv, v2 = new THREE.Vector2();
    for (let i = 0; i < p.count; i++) {
      place(p.getX(i), p.getZ(i), v2);
      p.setXYZ(i, v2.x, heightAt(v2.x, v2.y) + y0, v2.y);
      uv.setXY(i, (v2.x + 150) / 300, (v2.y + 170) / 245);
    }
    g.computeVertexNormals();
    // 가파른 곳은 바위가 드러나고, 움푹한 곳은 푸르스름한 그늘이 진다
    const n = g.attributes.normal, colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const shade = smooth(0.54, 0.34, fbm(x * 0.09, z * 0.09, 3));
      const crag = (1 - smooth(0.62, 0.8, n.getY(i))) * smooth(2.5, 5, y);
      c.copy(snow).lerp(hollow, shade * 0.6).lerp(rock, crag * (0.55 + fbm(x * 0.6, z * 0.6, 2) * 0.6));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  };
  // 마을과 앞쪽 산: 격자를 가운데로 모으고 눈 요철과 그림자까지 그린다
  snowBump.repeat.set(30, 24);
  const NEAR_BACK = -100, NEAR_FRONT = 75, NEAR_MID = (NEAR_BACK + NEAR_FRONT) / 2, NEAR_HALF = (NEAR_FRONT - NEAR_BACK) / 2;
  const near = new THREE.Mesh(
    buildGround(300, 200, (u, w, out) => out.set(warp(u, 0.42) * 150, NEAR_MID + warp(w, 0.8) * NEAR_HALF), 0),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, bumpMap: snowBump, bumpScale: 1.5 })
  );
  near.receiveShadow = true;
  near.castShadow = true;
  scene.add(near);
  // 제일 뒤쪽 산만 격자를 성기게 하고, 눈 요철과 그림자 없이 가벼운 재질로 그린다
  const FAR_BACK = -170, FAR_FRONT = -96, FAR_MID = (FAR_BACK + FAR_FRONT) / 2, FAR_HALF = (FAR_FRONT - FAR_BACK) / 2;
  scene.add(new THREE.Mesh(
    buildGround(180, 50, (u, w, out) => out.set(u * 150, FAR_MID + w * FAR_HALF), -0.03),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  ));

  // 격자 바깥을 채우는 눈밭. 안개 속으로 사라져 끝이 보이지 않는다
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1000, 48), new THREE.MeshStandardMaterial({ color: 0xeaf2f9, roughness: 0.85 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.04;
  scene.add(outer);
}
