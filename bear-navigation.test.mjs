import test from 'node:test';
import assert from 'node:assert/strict';
import { createBearNavigation, makeBearLoop } from './bear-navigation.js';

const flat = () => 0;
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
test('곰의 몸과 여유 간격이 호수나 건물에 닿는 경로를 차단한다', () => {
  const nav = createBearNavigation({ obstacles: [{ x: 0, z: 0, r: 4 }], heightAt: flat, radius: 1, bounds });
  assert.equal(nav.isClear(5, 0), false);
  assert.equal(nav.isClear(5.4, 0), true);
  assert.equal(nav.segmentClear({ x: -10, z: 0 }, { x: 10, z: 0 }), false);
  const path = nav.findPath({ x: -10, z: 0 }, { x: 10, z: 0 });
  assert.ok(path.length > 2);
  assert.ok(path.slice(1).every((p, i) => nav.segmentClear(path[i], p)));
});
test('막힌 구역을 지나거나 모서리를 대각선으로 뚫지 않는다', () => {
  const obstacles = Array.from({ length: 23 }, (_, i) => ({ x: 0, z: i * 2 - 22, r: 1.1 }));
  const nav = createBearNavigation({ obstacles, heightAt: flat, radius: 0.8, bounds });
  assert.deepEqual(nav.findPath({ x: -10, z: 0 }, { x: 10, z: 0 }), []);
});
test('급경사와 산 지형에 진입하지 않는다', () => {
  const nav = createBearNavigation({ obstacles: [], heightAt: (x, z) => x > 3 ? 2 : 0, radius: 1, bounds });
  assert.equal(nav.isClear(4, 0), false);
  assert.equal(nav.isClear(2.8, 0), false);
});
test('둥근 순환 길 전체가 안전하며 여러 바퀴를 연속 샘플링할 수 있다', () => {
  const nav = createBearNavigation({ obstacles: [{ x: 0, z: 0, r: 4 }, { x: 8, z: -2, r: 2 }], heightAt: flat, radius: 1, bounds });
  const loop = makeBearLoop(nav, [{ x: -12, z: 10 }, { x: 12, z: 10 }, { x: 12, z: -12 }, { x: -12, z: -12 }]);
  assert.ok(loop.total > 70);
  let prev = loop.sample(0);
  for (let d = 0.08; d < loop.total * 4; d += 0.08) {
    const p = loop.sample(d);
    assert.ok(nav.isClear(p.x, p.z));
    assert.ok(nav.segmentClear(prev, p));
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 0.081);
    prev = p;
  }
  assert.deepEqual(loop.sample(loop.total), loop.sample(0));
});
test('이동 가능한 공간이 없으면 곰을 겹쳐 놓는 대신 로딩을 중단한다', () => {
  const nav = createBearNavigation({ obstacles: [{ x: 0, z: 0, r: 50 }], heightAt: flat, radius: 1, bounds });
  assert.equal(nav.walkableCells, 0);
  assert.throws(() => makeBearLoop(nav, [{ x: 0, z: 0 }]), /안전한 공간/);
});
test('목적지를 되짚는 가지를 지워 제자리 180도 회전을 피한다', () => {
  const nav = createBearNavigation({ obstacles: [], heightAt: flat, radius: 1, bounds });
  const loop = makeBearLoop(nav, [{ x: -12, z: 10 }, { x: 0, z: 10 }, { x: -10, z: 10 },
    { x: 12, z: 10 }, { x: 12, z: -12 }, { x: -12, z: -12 }]);
  let previous = null;
  for (let d = 0; d < loop.total; d += 0.03) {
    const p = loop.sample(d), q = loop.sample(d + 0.35), yaw = Math.atan2(q.x - p.x, q.z - p.z);
    if (previous !== null) assert.ok(Math.abs(Math.atan2(Math.sin(yaw - previous), Math.cos(yaw - previous))) < 0.2);
    previous = yaw;
  }
});
