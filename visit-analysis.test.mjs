import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExperiment, isWeekend } from './visit-analysis.js';

// 11/4(수)~11/12(목). 처음 5명 → 11/6(금) 1차 3명 → 11/11(수) 2차 3명. 11/8(일)에 1차 한 명 늦게 합류.
function sample() {
  const dates = ['2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12'];
  const members = [
    ...['a','b','c','d','e'].map(k => ({ key:k, name:k, cohort:1, joined:'2026-11-01' })),
    ...['f','g','h'].map(k => ({ key:k, name:k, cohort:2, joined:'2026-11-06' })),
    { key:'late', name:'late', cohort:2, joined:'2026-11-08' },
    ...['i','j','k'].map(k => ({ key:k, name:k, cohort:2, joined:'2026-11-11' })),
  ];
  const visits = (m, d) => {
    if (d < m.joined) return null;
    if (isWeekend(d)) return m.key === 'a' ? 1 : 0;
    if (m.cohort === 1) return d < '2026-11-06' ? 1 : 2;
    return 1;
  };
  const series = new Map(members.map(m => [m.key, new Map(dates.map(d => [d, { daily:visits(m, d) }]))]));
  const daily = dates.map(date => { const v = members.map(m => visits(m, date)).filter(x => x !== null); return { date, totalDaily:v.reduce((s, x) => s + x, 0), baselineDaily:members.filter(m => m.cohort === 1).reduce((s, m) => s + visits(m, date), 0) }; });
  return { daily, members, series, today:'2026-11-12', start:'2026-11-04', expansion:'2026-11-06' };
}

test('waves come from join dates; stragglers stay in the previous wave', () => {
  const a = analyzeExperiment(sample());
  assert.deepEqual(a.waveDates, ['2026-11-06', '2026-11-11']);
  assert.deepEqual(a.groups.map(g => g.label), ['처음 5명', '1차 유입 4명', '2차 유입 3명']);
});

test('comparisons use weekdays only and skip wave days and today', () => {
  const a = analyzeExperiment(sample());
  const [w1, w2] = a.waves;
  assert.deepEqual(w1.before.usable, ['2026-11-04', '2026-11-05']);
  assert.deepEqual(w1.after.usable, ['2026-11-09', '2026-11-10']);
  assert.equal(w1.all.before.perPerson, 1);
  assert.equal(w1.all.after.perPerson, 2);
  // 2차의 기존 사용자 = 처음 5명 + 1차 4명. 2차 이후 완료된 평일이 아직 없다(11/11 유입일, 11/12 오늘).
  assert.equal(w2.all.group.label, '기존 9명');
  assert.equal(w2.rows.length, 2);
  assert.equal(w2.after.usable.length, 0);
  assert.equal(w2.all.after.days, 0);
});

test('weekend visits are classified separately', () => {
  const a = analyzeExperiment(sample());
  assert.deepEqual(a.weekend.days, ['2026-11-07', '2026-11-08']);
  assert.equal(a.weekend.average, 1);
  assert.deepEqual(a.weekend.visitors.map(m => m.key), ['a']);
});

test('no newcomers yet: no waves, planned date kept', () => {
  const s = sample(); s.members = s.members.filter(m => m.cohort === 1);
  const a = analyzeExperiment(s);
  assert.equal(a.waves.length, 0);
  assert.equal(a.planned, '2026-11-06');
  assert.equal(a.segments.length, 1);
});
