import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBuckets, reactionSlices, ago } from './lighthouse-dashboard.js';

const now = Date.parse('2026-11-08T12:00:00');

test('7일 칸 나누기: 오늘이 마지막 칸, 범위 밖은 버림', () => {
  const data = { projects: [{ created_at: '2026-11-08T09:00:00' }, { created_at: '2026-10-01T09:00:00' }], comments: [{ created_at: '2026-11-02T10:00:00' }], reactions: [] };
  const { buckets } = buildBuckets(data, 7, now);
  assert.equal(buckets.length, 7);
  assert.equal(buckets[6].uploads, 1);
  assert.equal(buckets[0].comments, 1);
  assert.equal(buckets.reduce((a, b) => a + b.uploads, 0), 1);
});

test('전체 기간은 주 단위 칸', () => {
  const data = { projects: [{ created_at: '2026-10-01T09:00:00' }], comments: [], reactions: [] };
  const { buckets, step } = buildBuckets(data, null, now);
  assert.equal(step, 7 * 86400000);
  assert.equal(buckets.reduce((a, b) => a + b.uploads, 0), 1);
});

test('리액션 많은 순, 나머지는 기타로 묶음', () => {
  const slices = reactionSlices([{ project_id: 'a', emoji: '👍' }, { project_id: 'a', emoji: '❤️' }, { project_id: 'b', emoji: '👍' }], [{ id: 'a', title: 'A' }], 1);
  assert.deepEqual(slices.map(s => [s.id, s.total, s.like, s.heart]), [['a', 2, 1, 1], ['rest', 1, 1, 0]]);
});

test('상대 시간', () => {
  assert.equal(ago('2026-11-08T10:00:00', now), '2시간 전');
  assert.equal(ago('2026-11-07T08:00:00', now), '어제');
});
