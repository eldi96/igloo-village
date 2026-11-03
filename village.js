import * as THREE from 'three';
import { addMailboxes } from './mailboxes.js';

export function addVillage(scene, ctx) {
  const { places, hub, heightAt, rng, lighthouse, mailPreviewHome = null } = ctx;
  const root = new THREE.Group();
  root.name = 'village';
  scene.add(root);
  const TAU = Math.PI * 2, roads = [], occupied = [], flames = [];
  const rand = (a, b) => a + (b - a) * rng();
  const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const snow = mat(0xc2d4df), wood = mat(0x49372c), bark = mat(0x302e2b);
  const ice = mat(0x6f9aaf, 0.23, { metalness: 0.12 });
  const stone = mat(0x48515a), metal = mat(0x292f36, 0.46, { metalness: 0.65 });
  const lamp = mat(0xffae50, 0.3, { emissive: new THREE.Color(3.8, 1.55, 0.35), emissiveIntensity: 1 });
  const dummy = new THREE.Object3D();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const sphere = new THREE.SphereGeometry(1, 8, 5);
  const batches = new Map();
  function instance(geometry, material, x, y, z, sx, sy, sz, yaw = 0, rz = 0) {
    let byMaterial = batches.get(geometry);
    if (!byMaterial) batches.set(geometry, byMaterial = new Map());
    let list = byMaterial.get(material);
    if (!list) byMaterial.set(material, list = []);
    dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    list.push(dummy.matrix.clone());
  }
  const dist = (x, z, a, b) => Math.hypot(x - a, z - b);
  function segmentDistance(x, z, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return dist(x, z, a.x + t * dx, a.z + t * dz);
  }
  function iglooClear(x, z, r) {
    for (const p of places) {
      if (dist(x, z, p.x, p.z) < p.radius + 1.2 + r || dist(x, z, p.doorX, p.doorZ) < 1.5 + r) return false;
      const fx = p.x + Math.cos(p.yaw) * (p.radius + 1), fz = p.z - Math.sin(p.yaw) * (p.radius + 1);
      if (dist(x, z, fx, fz) < 1.5 + r) return false;
    }
    return true;
  }
  function doorClear(x, z, r) {
    for (const p of places) {
      const dx = p.doorX - p.x, dz = p.doorZ - p.z, len = Math.hypot(dx, dz) || 1;
      const along = ((x - p.x) * dx + (z - p.z) * dz) / len;
      const across = Math.abs((x - p.x) * dz - (z - p.z) * dx) / len;
      if (along > -r && along < 10 + r && across < 2.5 + r) return false;
    }
    return true;
  }
  function flatSnow(x, z, r = 0) {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (Math.abs(x + dx) > 53 || z + dz < -43 || z + dz > 42 || heightAt(x + dx, z + dz) > 0.35) return false;
    }
    return true;
  }
  const pondDistance = (x, z) => Math.hypot((x - hub.x) / 4.5, (z - hub.z) / 3.5);
  function available(x, z, r, roadside = false) {
    if (lighthouse && dist(x, z, lighthouse.x, lighthouse.z) < lighthouse.radius + 1.2 + r) return false;
    if (!flatSnow(x, z, r) || !doorClear(x, z, r) || !iglooClear(x, z, r) || pondDistance(x, z) < 1.2 + r / 3) return false;
    for (const road of roads) for (let j = 1; j < road.points.length; j++) {
      if (segmentDistance(x, z, road.points[j - 1], road.points[j]) < road.width + (roadside ? 0.25 : 1) + r) return false;
    }
    for (const o of occupied) if (dist(x, z, o.x, o.z) < r + o.r + 0.25) return false;
    return true;
  }
  // Merge roads into one mask so intersections keep the same snow color.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const ink = canvas.getContext('2d'), px = x => (x + 70) * 2048 / 140, pz = z => (z + 52) * 2048 / 104;
  function clearRoad(q, owner, margin = 1.1) {
    if (Math.abs(q.x) > 63 || q.z < -46 || q.z > 37 || heightAt(q.x, q.z) > 0.6) return false;
    if (lighthouse && dist(q.x, q.z, lighthouse.x, lighthouse.z) < lighthouse.radius + margin) return false;
    if (Math.hypot((q.x - hub.x) / 5.1, (q.z - hub.z) / 4.1) < 1) return false;
    return places.every(p => {
      if (p !== owner) return dist(q.x, q.z, p.x, p.z) >= p.radius + margin;
      // Keep the house solid, with access only in front of its door.
      const dx = p.doorX - p.x, dz = p.doorZ - p.z, len = Math.hypot(dx, dz) || 1;
      const along = ((q.x - p.x) * dx + (q.z - p.z) * dz) / len;
      const across = Math.abs((q.x - p.x) * dz - (q.z - p.z) * dx) / len;
      return dist(q.x, q.z, p.x, p.z) >= p.radius + margin || (along >= len - 0.1 && across < 0.65);
    });
  }
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  function clearSegment(a, b, owner, margin = 1.1) {
    const n = Math.max(1, Math.ceil(dist(a.x, a.z, b.x, b.z) / 0.22));
    for (let i = 0; i <= n; i++) if (!clearRoad(mix(a, b, i / n), owner, margin)) return false;
    return true;
  }
  // Route around houses, simplify clear sections, then round the corners.
  function route(start, goal, owner = null) {
    if (clearSegment(start, goal, owner)) {
      const middle = mix(start, goal, 0.5), dx = goal.x - start.x, dz = goal.z - start.z, len = Math.hypot(dx, dz) || 1;
      const bend = Math.min(0.65, len * 0.12);
      middle.x -= dz / len * bend; middle.z += dx / len * bend;
      if (clearSegment(start, middle, owner) && clearSegment(middle, goal, owner)) return [start, middle, goal];
      return [start, goal];
    }
    const step = 0.65, nx = 195, nz = 129;
    const idAt = p => Math.round((p.z + 46) / step) * nx + Math.round((p.x + 63) / step);
    const point = id => ({ x: id % nx * step - 63, z: Math.floor(id / nx) * step - 46 });
    const sid = idAt(start), gid = idAt(goal), heap = [], costs = new Float32Array(nx * nz).fill(Infinity);
    const parent = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    function push(id, score) {
      let i = heap.length; heap.push({ id, score });
      while (i) { const j = (i - 1) >> 1; if (heap[j].score <= score) break; heap[i] = heap[j]; i = j; }
      heap[i] = { id, score };
    }
    function pop() {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let j = i * 2 + 1; if (j + 1 < heap.length && heap[j + 1].score < heap[j].score) j++;
          if (last.score <= heap[j].score) break; heap[i] = heap[j]; i = j;
        }
        heap[i] = last;
      }
      return first.id;
    }
    costs[sid] = 0; push(sid, 0);
    while (heap.length) {
      const id = pop(); if (closed[id]) continue; closed[id] = 1; if (id === gid) break;
      const x = id % nx, z = Math.floor(id / nx), a = id === sid ? start : point(id);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
        const next = (z + dz) * nx + x + dx, b = next === gid ? goal : point(next);
        if (closed[next] || !clearSegment(a, b, owner)) continue;
        const cost = costs[id] + dist(a.x, a.z, b.x, b.z);
        if (cost >= costs[next]) continue;
        costs[next] = cost; parent[next] = id; push(next, cost + dist(b.x, b.z, goal.x, goal.z));
      }
    }
    if (parent[gid] < 0) return [];
    const path = [goal];
    for (let id = parent[gid]; id >= 0 && id !== sid; id = parent[id]) path.push(point(id));
    path.push(start); path.reverse();
    const short = [start];
    for (let i = 0; i < path.length - 1;) {
      let j = path.length - 1; while (j > i + 1 && !clearSegment(path[i], path[j], owner, 1.18)) j--;
      short.push(path[j]); i = j;
    }
    return short;
  }
  function rounded(points, owner = null) {
    if (points.length < 2) return points;
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
    const dense = curve.getPoints(Math.max(16, Math.ceil(curve.getLength() / 0.15))).map(p => ({ x: p.x, z: p.z }));
    if (dense.every((p, i) => !i || clearSegment(dense[i - 1], p, owner, 0.8))) return dense;
    let result = points;
    for (let pass = 0; pass < 4; pass++) {
      const next = [result[0]];
      for (let i = 1; i < result.length - 1; i++) {
        const q = mix(result[i], result[i - 1], 0.25), r = mix(result[i], result[i + 1], 0.25);
        if (clearSegment(q, r, owner, 0.8)) next.push(q, r); else next.push(result[i]);
      }
      next.push(result[result.length - 1]); result = next;
    }
    return result;
  }
  function drawRoad(points, width, fade = false, doorway = null) {
    if (points.length < 2) return null;
    const dense = [points[0]], lengths = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], n = Math.max(1, Math.ceil(dist(a.x, a.z, b.x, b.z) / 0.12));
      for (let j = 1; j <= n; j++) { const q = mix(a, b, j / n), prev = dense[dense.length - 1]; lengths.push(lengths[lengths.length - 1] + dist(q.x, q.z, prev.x, prev.z)); dense.push(q); }
    }
    const total = lengths[lengths.length - 1], road = { points: dense, width: width / 2, fade, lengths, total };
    roads.push(road); ink.lineCap = ink.lineJoin = 'round'; ink.strokeStyle = '#fff';
    for (let i = 1; i < dense.length; i++) {
      const taper = fade ? THREE.MathUtils.smoothstep(total - lengths[i], 0, Math.min(7, total * 0.4)) : 1;
      // 문턱 근처만 통로 폭에 맞춰 부드럽게 넓힌다.
      const approach = doorway ? 1 - THREE.MathUtils.smoothstep(dist(dense[i].x, dense[i].z, doorway.x, doorway.z), 0, 1.1) : 0;
      const localWidth = width + (1.02 - width) * approach;
      ink.globalAlpha = taper; ink.lineWidth = Math.max(0.01, localWidth * 2048 / 140 * taper);
      ink.beginPath(); ink.moveTo(px(dense[i - 1].x), pz(dense[i - 1].z)); ink.lineTo(px(dense[i].x), pz(dense[i].z)); ink.stroke();
    }
    ink.globalAlpha = 1; return road;
  }
  const ring = [];
  // 호수 둘레는 작은 굴곡만 섞고 시작점과 끝점을 정확히 이어준다.
  const pondLoopPoint = a => {
    const wobble = 1 + 0.025 * Math.sin(a * 3 + 0.6) + 0.012 * Math.sin(a * 5 - 0.8);
    return { x: hub.x + Math.cos(a) * 7 * wobble, z: hub.z + Math.sin(a) * 5.6 * wobble };
  };
  for (let i = 0; i <= 160; i++) ring.push(pondLoopPoint(i / 160 * TAU));
  drawRoad(ring, 1.1);
  for (const controls of [
    [[0, -5.6], [-3, -14], [2, -25], [-2, -43]],
    [[-7, 0], [-16, -2], [-26, 1], [-48, 4]],
    [[7, 0], [17, -3], [28, -9], [51, -7]],
    [[0, 5.6], [3, 14], [-2, 23], [1, 31]]
  ]) {
    const points = [pondLoopPoint(Math.atan2(controls[0][1] / 5.6, controls[0][0] / 7))];
    for (let i = 1; i < controls.length; i++) {
      const start = points[points.length - 1], goal = { x: hub.x + controls[i][0], z: hub.z + controls[i][1] };
      let end = start;
      for (let j = 1; j <= 100; j++) {
        const q = mix(start, goal, j / 100);
        if (Math.abs(q.x) > 60 || q.z < -44 || q.z > 36 || heightAt(q.x, q.z) > 0.55) break;
        end = q;
      }
      const part = route(start, end); if (!part.length) break; points.push(...part.slice(1));
      if (dist(end.x, end.z, goal.x, goal.z) > 0.1) break;
    }
    drawRoad(rounded(points), 1.2, true);
  }
  function nearest(p) {
    let best = Infinity, target = null;
    for (const road of roads) for (let i = 1; i < road.points.length; i++) {
      if (road.fade && road.total - road.lengths[i] < Math.min(7, road.total * 0.4)) continue;
      const a = road.points[i - 1], b = road.points[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((p.doorX - a.x) * dx + (p.doorZ - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const q = mix(a, b, t), d = dist(p.doorX, p.doorZ, q.x, q.z);
      if (d < best && clearRoad(q, p)) { best = d; target = q; }
    }
    return { best, target };
  }
  const pending = places.slice();
  while (pending.length) {
    pending.sort((a, b) => nearest(a).best - nearest(b).best);
    const p = pending.shift(), { target } = nearest(p);
    if (target) {
      const branch = rounded(route({ x: p.doorX, z: p.doorZ }, target, p), p);
      if (branch.length < 2) continue;
      // doorX/Z는 문보다 약 1m 앞의 탐색 지점. 실제 문턱까지 직선으로 이어준다.
      const forward = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
      const threshold = { x: p.x + forward.x * (p.radius * 0.92 + 1.13), z: p.z + forward.z * (p.radius * 0.92 + 1.13) };
      const landing = { x: p.x + forward.x * (p.radius + 1.45), z: p.z + forward.z * (p.radius + 1.45) };
      drawRoad([threshold, landing, ...branch], 0.55, false, threshold);
    }
  }
  const softened = document.createElement('canvas'); softened.width = softened.height = 2048;
  const soft = softened.getContext('2d');
  if ('filter' in soft) { soft.filter = 'blur(2px)'; soft.drawImage(canvas, 0, 0); }
  else { soft.globalCompositeOperation = 'lighter'; soft.globalAlpha = 1 / 9; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) soft.drawImage(canvas, x, y); }
  ink.clearRect(0, 0, 2048, 2048); ink.drawImage(softened, 0, 0); ink.globalCompositeOperation = 'destination-out';
  function erase(x, z, rx, rz = rx) {
    ink.save(); ink.translate(px(x), pz(z)); ink.scale(rx * 2048 / 140, rz * 2048 / 104);
    const gradient = ink.createRadialGradient(0, 0, 0.92, 0, 0, 1.04); gradient.addColorStop(0, '#fff'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ink.fillStyle = gradient; ink.beginPath(); ink.arc(0, 0, 1.04, 0, TAU); ink.fill(); ink.restore();
  }
  for (const p of places) erase(p.x, p.z, p.radius + 0.5);
  erase(hub.x, hub.z, 4.8, 3.8); if (lighthouse) erase(lighthouse.x, lighthouse.z, lighthouse.radius + 0.6);
  ink.clearRect(0, 0, 2048, 8); ink.clearRect(0, 2040, 2048, 8); ink.clearRect(0, 0, 8, 2048); ink.clearRect(2040, 0, 8, 2048);
  const ground = new THREE.PlaneGeometry(140, 104, 140, 104); ground.rotateX(-Math.PI / 2);
  const vertices = ground.attributes.position;
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, heightAt(vertices.getX(i), vertices.getZ(i)) + 0.14);
  ground.computeVertexNormals();
  const surface = new THREE.Mesh(ground, mat(0x7f97ac, 1, { map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  surface.receiveShadow = true; surface.renderOrder = 1; root.add(surface);
  let beacon = null;
  if (lighthouse) {
    const { x, z, radius } = lighthouse, tower = new THREE.Group(); tower.position.set(x, heightAt(x, z), z); root.add(tower);
    function part(geometry, material, y) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; tower.add(mesh); return mesh;
    }
    part(new THREE.CylinderGeometry(radius + 0.25, radius + 0.4, 0.5, 32), stone, 0.25);
    part(new THREE.CylinderGeometry(radius + 0.2, radius + 0.28, 0.12, 32), snow, 0.54);
    const white = mat(0xd7d5c8), red = mat(0x7b282d), profile = [];
    const towerRadius = h => radius * (1 - 0.48 * h / 11.8) - 0.13 * Math.sin(h / 11.8 * Math.PI);
    for (let i = 0; i <= 48; i++) { const h = i / 48 * 11.8; profile.push(new THREE.Vector2(towerRadius(h), h + 0.55)); }
    part(new THREE.LatheGeometry(profile, 40), white, 0);
    for (const base of [3.1, 7.2]) {
      const band = []; for (let i = 0; i <= 8; i++) { const h = base + i / 8 * 1.25; band.push(new THREE.Vector2(towerRadius(h) + 0.015, h + 0.55)); }
      part(new THREE.LatheGeometry(band, 40), red, 0);
    }
    part(new THREE.CylinderGeometry(1.8, 1.65, 0.22, 32), metal, 12.35);
    for (const h of [12.65, 13.15]) { const rail = part(new THREE.TorusGeometry(1.68, 0.045, 5, 40), metal, h); rail.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, post = part(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 5), metal, 12.78); post.position.x = Math.cos(a) * 1.68; post.position.z = Math.sin(a) * 1.68; }
    part(new THREE.CylinderGeometry(1.13, 1.13, 1.55, 16, 1, true), mat(0xa6c6cc, 0.15, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), 13.25);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, post = part(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 5), metal, 13.25); post.position.x = Math.cos(a) * 1.14; post.position.z = Math.sin(a) * 1.14; }
    part(new THREE.SphereGeometry(0.43, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.1, 2.7) }), 13.3);
    part(new THREE.ConeGeometry(1.65, 1.25, 32), metal, 14.5); part(new THREE.SphereGeometry(0.12, 8, 6), metal, 15.2);
    beacon = new THREE.Group(); beacon.position.y = 13.3; tower.add(beacon);
    const beamCanvas = document.createElement('canvas'); beamCanvas.width = 256; beamCanvas.height = 64;
    const beamInk = beamCanvas.getContext('2d'), pixels = beamInk.createImageData(256, 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 256; i++) {
      const k = (j * 256 + i) * 4, across = Math.max(0, 1 - Math.abs(j / 63 * 2 - 1));
      pixels.data[k] = 220; pixels.data[k + 1] = 231; pixels.data[k + 2] = 240;
      pixels.data[k + 3] = Math.round(34 * Math.pow(1 - i / 255, 1.8) * across * across * Math.min(1, i / 12));
    }
    beamInk.putImageData(pixels, 0, 0);
    const beamMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (const angle of [0, Math.PI]) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.1, 29, 0, -2.2, 29, 0, 2.2, 0, 0, 0.1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const beam = new THREE.Mesh(g, beamMaterial); beam.rotation.y = angle; beacon.add(beam);
    }
  }

  const pondPos = [hub.x, heightAt(hub.x, hub.z) + 0.055, hub.z], pondIndices = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * TAU, wobble = 1 + 0.07 * Math.sin(a * 3 + 0.8) + 0.035 * Math.sin(a * 7);
    const x = hub.x + Math.cos(a) * 4 * wobble, z = hub.z + Math.sin(a) * 3 * wobble;
    pondPos.push(x, heightAt(x, z) + 0.055, z);
    pondIndices.push(0, (i + 1) % 64 + 1, i + 1);
    instance(sphere, snow, x, heightAt(x, z) - 0.015, z, 0.43, 0.14, 0.32, a);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pondPos, 3)); pg.setIndex(pondIndices); pg.computeVertexNormals();
  const pond = new THREE.Mesh(pg, mat(0x3f8ca6, 0.14, { metalness: 0.1, emissive: 0x0d3f46 })); pond.receiveShadow = true; root.add(pond);
  function findSpot(radius, min = 7, max = 22) {
    for (let i = 0; i < 1600; i++) { const a = rand(0, TAU), d = rand(min, max), x = hub.x + Math.cos(a) * d, z = hub.z + Math.sin(a) * d; if (available(x, z, radius)) { occupied.push({ x, z, r: radius }); return { x, z }; } }
    return null;
  }
  function drift(x, z, r = 0.6) { instance(sphere, snow, x, heightAt(x, z) - 0.08, z, r, r * 0.28, r * 0.74, rand(0, TAU)); }
  const fireSpot = findSpot(1.4, 6.3, 9.5) || findSpot(1.4, 7, 28);
  let fireLight = null;
  if (fireSpot) {
    const { x, z } = fireSpot, y = heightAt(x, z);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; instance(sphere, stone, x + Math.cos(a) * 0.68, y + 0.13, z + Math.sin(a) * 0.68, 0.2, 0.16, 0.17, a); }
    for (let i = 0; i < 3; i++) instance(box, wood, x, y + 0.19 + i * 0.065, z, 1.05, 0.16, 0.17, i * 2.1);
    for (let i = 0; i < 5; i++) {
      const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, i % 2 ? 1.15 : 2.15, 0.12), transparent: true, opacity: 0.83, depthWrite: false });
      const f = new THREE.Mesh(cone, fm), a = i * 2.4;
      f.position.set(x + Math.cos(a) * 0.18, y + 0.63, z + Math.sin(a) * 0.18); f.scale.set(0.19, 0.8, 0.19); root.add(f);
      flames.push({ mesh: f, phase: i * 1.73, base: y });
    }
    fireLight = new THREE.PointLight(0xffa34b, 5, 9, 2); fireLight.position.set(x, y + 0.85, z); root.add(fireLight);
    drift(x + 0.95, z, 0.45);
  }
  const foliage = mat(0x203f3e);
  const minX = Math.min(...places.map(p => p.x - p.radius)), maxX = Math.max(...places.map(p => p.x + p.radius));
  const backZ = Math.min(...places.map(p => p.z - p.radius));
  const left = Math.max(-49, minX - 7), right = Math.min(49, maxX + 7), back = Math.max(-39, backZ - 5);
  const clusters = Array.from({ length: 24 }, (_, i) => {
    if (i % 3 === 0) return { x: rand(left, right), z: back + rand(-1, 3) };
    return { x: (i % 3 === 1 ? left : right) + rand(-2, 2), z: rand(back, 19) };
  });
  let treeCount = 0;
  for (let attempt = 0; attempt < 16000 && treeCount < 140; attempt++) {
    const c = clusters[Math.floor(rng() * clusters.length)];
    const a = rand(0, TAU), d = Math.sqrt(rng()) * 7;
    const scattered = attempt % 6 === 0;
    const x = scattered ? rand(left - 3, right + 3) : c.x + Math.cos(a) * d;
    const z = scattered ? rand(back - 2, 22) : c.z + Math.sin(a) * d;
    const s = rand(0.65, 1.4), radius = s * 0.82;
    if (z > 21 + x * x / 60) continue;
    if (!available(x, z, radius)) continue;
    occupied.push({ x, z, r: radius }); treeCount++;
    const y = heightAt(x, z), yaw = rand(0, TAU), tiers = rng() < 0.3 ? 2 : 3;
    instance(box, bark, x, y + s * 0.44, z, s * 0.19, s * 0.9, s * 0.19, yaw);
    for (let tier = 0; tier < tiers; tier++) {
      const r = (0.83 - tier * 0.2) * s, h = (1.4 - tier * 0.13) * s, cy = y + (1.15 + tier * 0.63) * s;
      const ox = rand(-0.07, 0.07) * s, oz = rand(-0.07, 0.07) * s;
      instance(cone, foliage, x + ox, cy, z + oz, r, h, r, yaw + tier);
      instance(cone, snow, x + ox, cy + h * 0.145, z + oz, r * 0.79, h * 0.74, r * 0.79, yaw + tier);
    }
    drift(x, z, s * 0.65);
  }
  function localPart(p, yaw, ox, oy, oz, sx, sy, sz, material, geometry = box) {
    const x = p.x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, z = p.z - Math.sin(yaw) * ox + Math.cos(yaw) * oz;
    instance(geometry, material, x, heightAt(p.x, p.z) + oy, z, sx, sy, sz, yaw);
  }
  for (let i = 0; i < 3; i++) {
    const p = findSpot(1.3, 8, 23); if (!p) continue;
    const yaw = rand(0, TAU);
    for (const side of [-1, 1]) localPart(p, yaw, side * 0.36, 0.15, 0, 0.09, 0.13, 1.65, wood);
    for (let j = 0; j < 5; j++) localPart(p, yaw, 0, 0.34, (j - 2) * 0.27, 0.92, 0.1, 0.2, wood);
    localPart(p, yaw, -0.18, 0.64, 0.12, 0.48, 0.5, 0.66, wood);
    localPart(p, yaw, 0.26, 0.52, -0.4, 0.36, 0.27, 0.38, ice);
    localPart(p, yaw, -0.18, 0.91, 0.12, 0.5, 0.05, 0.68, snow);
    drift(p.x + 0.85, p.z, 0.45);
  }
  for (let i = 0; i < 2; i++) {
    const p = findSpot(1.65, 9, 24); if (!p) continue;
    const yaw = rand(0, TAU);
    for (const side of [-1, 1]) {
      localPart(p, yaw, side * 1.05, 1, 0, 0.13, 2, 0.13, wood);
      localPart(p, yaw, side * 1.05, 0.13, 0, 0.22, 0.15, 1.05, wood);
    }
    localPart(p, yaw, 0, 1.95, 0, 2.35, 0.13, 0.16, wood);
    localPart(p, yaw, 0, 2.035, 0, 2.4, 0.06, 0.19, snow);
    for (let j = 0; j < 4; j++) localPart(p, yaw, (j - 1.5) * 0.42, 1.45, 0, 0.08, 0.86, 0.09, bark);
    drift(p.x, p.z + 0.55, 0.65);
  }
  for (let i = 0; i < 5; i++) {
    const p = findSpot(1.15, 8, 25); if (!p) continue;
    const yaw = rand(0, TAU);
    for (let layer = 0; layer < 2; layer++) for (let j = 0; j < 3 - layer; j++) localPart(p, yaw, (j - (2 - layer) / 2) * 0.55, 0.22 + layer * 0.4, 0, 0.51, 0.38, 0.6, ice);
    drift(p.x, p.z + 0.6, 0.55);
  }
  // Walk every road by distance, then spread posts over the whole village.
  const lanternCandidates = [];
  for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
    const road = roads[roadIndex];
    let walked = 0, station = 1;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], len = dist(a.x, a.z, b.x, b.z);
      if (len < 0.0001) continue;
      while (station <= walked + len) {
        const t = (station - walked) / len, q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const fading = road.fade && road.total - station < Math.min(7, road.total * 0.4);
        if (!fading) for (const side of [-1, 1]) {
          const x = q.x - (b.z - a.z) / len * 1.65 * side, z = q.z + (b.x - a.x) / len * 1.65 * side;
          if (z <= 16 && available(x, z, 0.4, true)) lanternCandidates.push({ x, z, side, roadIndex, station });
        }
        station += 1;
      }
      walked += len;
    }
  }
  // Keep several layouts so an early choice cannot crowd out a later district.
  let layouts = [{ posts: [], score: 0 }], lanterns = [];
  for (let count = 0; count < 14; count++) {
    const next = [], side = count % 2 ? 1 : -1;
    for (const layout of layouts) {
      const choices = [];
      for (const p of lanternCandidates) {
        if (p.side !== side) continue;
        // Reserve the first ten places equally for the two outer halves.
        if (count < 10 && (count % 2 ? p.x <= 5 : p.x >= -5)) continue;
        let nearest = Infinity, along = Infinity;
        for (const q of layout.posts) {
          nearest = Math.min(nearest, dist(p.x, p.z, q.x, q.z));
          if (p.roadIndex === q.roadIndex) along = Math.min(along, Math.abs(p.station - q.station));
        }
        if (nearest < 9) continue;
        const left = layout.posts.filter(q => q.x < -5).length, right = layout.posts.filter(q => q.x > 5).length;
        const back = layout.posts.filter(q => q.z < -8).length, front = layout.posts.length - back;
        const district = layout.posts.filter(q => (q.x < 0) === (p.x < 0) && (q.z < -8) === (p.z < -8)).length;
        const balance = (p.z < -8 ? front - back : back - front) * 5;
        const lateral = p.x < -5 ? right - left : p.x > 5 ? left - right : 0;
        const spacing = Math.min(nearest, 22) + Math.min(along, 18) * 0.15;
        const score = layout.score + spacing + balance + lateral * 3 - district * 6;
        choices.push({ posts: [...layout.posts, p], score });
      }
      choices.sort((a, b) => b.score - a.score); next.push(...choices.slice(0, 6));
    }
    if (!next.length) break;
    next.sort((a, b) => b.score - a.score);
    // Distinct occupied stations retain useful alternatives to the leading layout.
    const seen = new Set(); layouts = [];
    for (const layout of next) {
      const key = layout.posts.map(p => p.roadIndex + ':' + p.station + ':' + p.side).sort().join(',');
      if (seen.has(key)) continue; seen.add(key); layouts.push(layout);
      if (layouts.length === 80) break;
    }
    lanterns = layouts[0].posts;
  }
  for (const { x, z } of lanterns) {
    occupied.push({ x, z, r: 0.4 });
    const y = heightAt(x, z);
    instance(box, wood, x, y + 0.94, z, 0.12, 1.88, 0.12);
    instance(box, metal, x, y + 2.01, z, 0.34, 0.48, 0.34);
    instance(box, lamp, x, y + 2.01, z, 0.25, 0.33, 0.35);
    instance(box, lamp, x, y + 2.01, z, 0.35, 0.33, 0.25);
    instance(cone, metal, x, y + 2.33, z, 0.31, 0.2, 0.31);
    instance(cone, snow, x, y + 2.39, z, 0.28, 0.15, 0.28);
    drift(x, z, 0.36);
  }
  addMailboxes(scene, { places, heightAt, previewHomeIndex: mailPreviewHome });
  for (const [geometry, byMaterial] of batches) for (const [material, matrices] of byMaterial) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = material !== lamp; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); root.add(mesh);
  }
  return {
    update(timeSeconds) {
      if (beacon) beacon.rotation.y = timeSeconds * 0.12;
      const flicker = 0.86 + 0.09 * Math.sin(timeSeconds * 11.7) + 0.05 * Math.sin(timeSeconds * 23.1);
      if (fireLight) fireLight.intensity = 5 * flicker;
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i], pulse = Math.sin(timeSeconds * 7.3 + f.phase);
        f.mesh.scale.y = 0.7 + pulse * 0.16;
        f.mesh.position.y = f.base + 0.3 + f.mesh.scale.y * 0.5;
        f.mesh.rotation.z = Math.sin(timeSeconds * 4.1 + f.phase) * 0.13;
      }
    }
  };
}
