import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityControl } from './quality.js';

// 약 2초마다 측정값이 들어오는 상황을 흉내 낸다.
function run(control, fps, from, ms) {
  let at = from;
  while (at < from + ms) {
    at += 2000;
    control.sample(fps, at);
  }
  return at;
}

test('startup stutter does not lower quality', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  run(q, 5, 0, 6000);
  assert.equal(q.level, 0);
});

test('one or two slow samples do not lower quality', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  let at = run(q, 60, 0, 10000);
  q.sample(10, at += 2000);
  q.sample(10, at += 2000);
  q.sample(60, at += 2000);
  q.sample(10, at += 2000);
  q.sample(10, at += 2000);
  assert.equal(q.level, 0);
  q.sample(10, at += 2000);
  assert.equal(q.level, 1);
});

test('steady slowness lowers one step at a time and stops at the lightest', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  run(q, 10, 0, 300000);
  assert.equal(q.level, 3);
});

test('quality recovers after staying fast, one step at a time', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  let at = run(q, 10, 0, 60000);
  const low = q.level;
  assert.ok(low >= 2);
  at = run(q, 60, at, 30000);
  assert.equal(q.level, low - 1);
  run(q, 60, at, 300000);
  assert.equal(q.level, 0);
});

test('medium speed neither lowers nor raises quality', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  let at = run(q, 10, 0, 16000);
  const low = q.level;
  assert.ok(low >= 1);
  run(q, 35, at, 300000);
  assert.equal(q.level, low);
});

test('a PC that slows down after each raise waits longer before trying again', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  let at = run(q, 10, 0, 16000);
  assert.equal(q.level, 1);
  const raises = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = at;
    while (q.level === 1) q.sample(60, at += 2000);
    raises.push(at - start);
    while (q.level === 0) q.sample(10, at += 2000);
  }
  assert.ok(raises[1] > raises[0]);
  assert.ok(raises[2] > raises[1]);
});

test('pausing clears progress and waits before measuring again', () => {
  const q = createQualityControl({ maxLevel: 3, now: 0 });
  let at = run(q, 60, 0, 10000);
  q.sample(10, at += 2000);
  q.sample(10, at += 2000);
  q.pause(at);
  q.sample(10, at += 2000);
  q.sample(10, at += 2000);
  assert.equal(q.level, 0);
});
