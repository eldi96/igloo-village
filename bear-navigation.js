// 곰의 몸 전체와 여유 간격을 고려해 안전한 길을 먼저 만든다.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

export function clearsCharacters(a, b, characters, radius) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return characters.every(c => {
    const t = Math.max(0, Math.min(1, ((c.x-a.x)*dx + (c.z-a.z)*dz) / (dx*dx+dz*dz || 1)));
    return Math.hypot(a.x+t*dx-c.x, a.z+t*dz-c.z) >= radius+c.r;
  });
}

export function createBearNavigation({ obstacles, heightAt, radius, margin = 0.24,
  bounds = { minX: -43, maxX: 43, minZ: -38, maxZ: 27 }, step = 0.7 }) {
  const clearance = radius + margin;
  function isClear(x, z, extra = 0) {
    const r = clearance + extra;
    if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
    for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y > 0.6 || y < -0.6) return false;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const h = heightAt(x + dx, z + dz);
      if (!Number.isFinite(h) || Math.abs(h - y) > 0.26) return false;
    }
    return true;
  }
  function segmentClear(a, b, extra = 0) {
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    for (const o of obstacles) {
      const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / (length2 || 1)));
      if (Math.hypot(a.x + t * dx - o.x, a.z + t * dz - o.z) < o.r + clearance + extra) return false;
    }
    const count = Math.max(1, Math.ceil(Math.sqrt(length2) / 0.4));
    for (let i = 0; i <= count; i++) {
      const p = mix(a, b, i / count);
      if (!isClear(p.x, p.z, extra)) return false;
    }
    return true;
  }
  // 미리 확보한 여유 공간 안에서만 모서리를 둥글게 다듬는다.
  const gridMargin = 0.1, nx = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
  const nz = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
  const cells = new Uint8Array(nx * nz), positions = [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = { x: bounds.minX + x * step, z: bounds.minZ + z * step }, id = z * nx + x;
    positions.push(p);cells[id] = Number(isClear(p.x, p.z, gridMargin));
  }
  // 나무 사이의 작은 막다른 주머니를 출발점으로 고르지 않는다.
  const visited = new Uint8Array(cells.length);
  let largest = [];
  for (let start = 0; start < cells.length; start++) if (cells[start] && !visited[start]) {
    const component = [start];visited[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const id = component[cursor], x = id % nx, z = Math.floor(id / nx);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
        const next = id + dx + dz * nx;
        if (!cells[next] || visited[next] || !segmentClear(positions[id], positions[next], gridMargin)) continue;
        visited[next] = 1;component.push(next);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  cells.fill(0);largest.forEach(id => { cells[id] = 1; });
  function nearest(p) {
    let best = -1, score = Infinity;
    for (let i = 0; i < cells.length; i++) if (cells[i]) {
      const d = distance(p, positions[i]);
      if (d < score) { best = i;score = d; }
    }
    return best;
  }
  function findPath(start, goal, allowSegment) {
    const clear = (a,b,extra) => (!allowSegment || allowSegment(a,b)) && segmentClear(a,b,extra);
    const sid = nearest(start), gid = nearest(goal);
    if (sid < 0 || gid < 0 || !isClear(start.x, start.z) || !isClear(goal.x, goal.z)) return [];
    const costs = new Float64Array(cells.length).fill(Infinity), parents = new Int32Array(cells.length).fill(-1);
    const closed = new Uint8Array(cells.length), heap = [];
    const push = (id, score) => {
      let i = heap.length;heap.push({ id, score });
      while (i > 0) { const p = (i - 1) >> 1;if (heap[p].score <= score) break;heap[i] = heap[p];i = p; }
      heap[i] = { id, score };
    };
    const pop = () => {
      const result = heap[0], end = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
          if (heap[child].score >= end.score) break;heap[i] = heap[child];i = child;
        }
        heap[i] = end;
      }
      return result.id;
    };
    if (!clear(start, positions[sid]) || !clear(positions[gid], goal)) return [];
    costs[sid] = 0;push(sid, distance(positions[sid], positions[gid]));
    while (heap.length) {
      const id = pop();if (closed[id]) continue;closed[id] = 1;
      if (id === gid) break;
      const x = id % nx, z = Math.floor(id / nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
        const next = id + dx + dz * nx;
        if (!cells[next] || closed[next]) continue;
        if (dx && dz && (!cells[id + dx] || !cells[id + dz * nx])) continue;
        const cost = costs[id] + Math.hypot(dx, dz) * step;
        if (cost >= costs[next] || !clear(positions[id], positions[next], gridMargin)) continue;
        costs[next] = cost;parents[next] = id;
        push(next, cost + distance(positions[next], positions[gid]));
      }
    }
    if (!closed[gid]) return [];
    const path = [goal];
    for (let id = gid; id >= 0; id = parents[id]) path.push(positions[id]);
    path.push(start);path.reverse();
    const simple = [path[0]];
    for (let i = 0; i < path.length - 1;) {
      let j = path.length - 1;
      while (j > i + 1 && !clear(path[i], path[j], gridMargin)) j--;
      if (distance(simple[simple.length - 1], path[j]) > 0.001) simple.push(path[j]);
      i = j;
    }
    return simple;
  }
  return { isClear, segmentClear, findPath, nearestPoint(p) { const id = nearest(p);return id >= 0 ? { ...positions[id] } : null; },
    clearance, walkableCells: cells.reduce((n, v) => n + v, 0) };
}

export function makeBearLoop(navigation, anchors, minimumLength = 25) {
  const points = anchors.map(p => navigation.nearestPoint(p)).filter(Boolean);
  if (points.length < 3) throw new Error('북극곰이 다닐 안전한 공간이 부족합니다.');
  const route = [points[0]];
  for (const goal of [...points.slice(1), points[0]]) {
    const part = navigation.findPath(route[route.length - 1], goal);
    if (part.length) route.push(...part.slice(1));
  }
  if (distance(route[route.length - 1], route[0]) > 0.01 || route.length < 4) throw new Error('북극곰의 순환 경로를 연결하지 못했습니다.');
  route.pop();
  // 목적지를 찍고 같은 골목을 되짚는 가지는 제거해 갑자기 180도 돌지 않는다.
  const area = polygon => Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];return sum + p.x * q.z - p.z * q.x;
  }, 0));
  const cross = (ax, az, bx, bz) => ax * bz - az * bx;
  const intersection = (a, b, c, d) => {
    const ax = b.x - a.x, az = b.z - a.z, bx = d.x - c.x, bz = d.z - c.z;
    const denominator = cross(ax, az, bx, bz);
    if (Math.abs(denominator) < 0.00001) {
      const on = (p, u, v) => distance(u, p) + distance(p, v) < distance(u, v) + 0.0001;
      return [a, b, c, d].find(p => on(p, a, b) && on(p, c, d)) || null;
    }
    const t = cross(c.x - a.x, c.z - a.z, bx, bz) / denominator;
    const u = cross(c.x - a.x, c.z - a.z, ax, az) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? mix(a, b, t) : null;
  };
  for (let pass = 0; pass < 120; pass++) {
    let changed = false;
    for (let i = 0; i < route.length && route.length > 3; i++) {
      const prev = route[(i + route.length - 1) % route.length], p = route[i], next = route[(i + 1) % route.length];
      const cosine = ((p.x - prev.x) * (next.x - p.x) + (p.z - prev.z) * (next.z - p.z)) / (distance(prev, p) * distance(p, next) || 1);
      if ((distance(prev, p) < 0.01 || cosine < -0.85) && navigation.segmentClear(prev, next)) {
        route.splice(i, 1);changed = true;break;
      }
    }
    if (changed) continue;
    outer: for (let i = 0; i < route.length; i++) for (let j = i + 2; j < route.length; j++) {
      if (i === 0 && j === route.length - 1) continue;
      const p = intersection(route[i], route[(i + 1) % route.length], route[j], route[(j + 1) % route.length]);
      if (!p) continue;
      const first = [p, ...route.slice(i + 1, j + 1)], second = [p, ...route.slice(j + 1), ...route.slice(0, i + 1)];
      const keep = area(first) > area(second) ? first : second;
      if (keep.length < 3 || keep.length >= route.length) continue;
      route.splice(0, route.length, ...keep);changed = true;break outer;
    }
    if (!changed) break;
  }
  const corners = route.map((p, i) => {
    const prev = route[(i + route.length - 1) % route.length], next = route[(i + 1) % route.length];
    const before = distance(prev, p), after = distance(p, next);
    let cut = Math.min(1.8, before * 0.4, after * 0.4);
    while (cut > 0.04) {
      const entry = mix(p, prev, cut / before), exit = mix(p, next, cut / after), curve = [entry];
      for (let j = 1; j <= 18; j++) { const t = j / 18;curve.push(mix(mix(entry, p, t), mix(p, exit, t), t)); }
      if (curve.every((q, j) => !j || navigation.segmentClear(curve[j - 1], q))) return { entry, exit, curve };
      cut *= 0.65;
    }
    return { entry: p, exit: p, curve: [p] };
  });
  const samples = [];
  const append = p => { if (!samples.length || distance(samples[samples.length - 1], p) > 0.0001) samples.push(p); };
  for (let i = 0; i < corners.length; i++) {
    const current = corners[i], prev = corners[(i + corners.length - 1) % corners.length];
    const count = Math.max(1, Math.ceil(distance(prev.exit, current.entry) / 0.16));
    for (let j = 0; j <= count; j++) append(mix(prev.exit, current.entry, j / count));
    current.curve.forEach(append);
  }
  append(samples[0]);
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    if (!navigation.segmentClear(samples[i - 1], samples[i])) throw new Error('안전하지 않은 북극곰 경로를 차단했습니다.');
    lengths.push(lengths[i - 1] + distance(samples[i - 1], samples[i]));
  }
  const total = lengths[lengths.length - 1];
  if (total <= 0 || total < minimumLength) throw new Error('북극곰 산책 경로가 너무 짧습니다.');
  function sample(d, target = {}) {
    d = ((d % total) + total) % total;
    let low = 0, high = lengths.length - 1;
    while (low + 1 < high) { const mid = (low + high) >> 1;if (lengths[mid] <= d) low = mid;else high = mid; }
    const t = (d - lengths[low]) / (lengths[high] - lengths[low] || 1);
    target.x = samples[low].x + (samples[high].x - samples[low].x) * t;
    target.z = samples[low].z + (samples[high].z - samples[low].z) * t;
    return target;
  }
  return { total, sample, samples };
}
