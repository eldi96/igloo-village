import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./visit-data.js', import.meta.url), 'utf8');
const { normalizeVisits, visitNumber, chartPoints, normalizeExperiment, comparisonChange } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const row = (date, total = '13') => ({ visit_date: date, baseline_cumulative_visits: '8', total_cumulative_visits: total, baseline_daily_visits: '2', total_daily_visits: '3', total_participants: 7, baseline_participants: 5, total_active: 2 });

test('bigint strings retain cumulative values from before the selected period', () => {
  const rows = normalizeVisits([row('2026-11-06', '16'), row('2026-11-05')]);
  assert.deepEqual(rows.map(r => [r.date, r.total, r.totalDaily]), [['2026-11-05', 13, 3], ['2026-11-06', 16, 3]]);
});
test('rejects malformed, negative, fractional and unsafe counters', () => {
  for (const value of [null, '', '-1', -1, 1.2, '9007199254740993', Infinity]) assert.throws(() => visitNumber(value));
  assert.equal(visitNumber('0'), 0);
});
test('rejects duplicate and invalid dates, allows an empty response', () => {
  assert.throws(() => normalizeVisits([row('2026-11-05'), row('2026-11-05')]));
  assert.throws(() => normalizeVisits([row('2026-02-30')]));
  assert.deepEqual(normalizeVisits([]), []);
});
test('zero and single-day charts have finite coordinates', () => {
  const rows = normalizeVisits([row('2026-11-05', '0')]);
  assert.deepEqual(chartPoints(rows, 'total', 1), [[58, 236]]);
  assert.ok(chartPoints(rows, 'baseline', 8).flat().every(Number.isFinite));
});
const experiment = () => ({today:'2026-11-07',baseline_start:'2026-11-05',baseline_end:'2026-11-05',expansion_date:'2026-11-06',actual_expansion_date:'2026-11-06',
  members:[{key:'a',name:'기존',cohort:1,joined:'2026-11-05'},{key:'b',name:'신규',cohort:2,joined:'2026-11-06'}],
  daily:[row('2026-11-05'),row('2026-11-06')],
  people_daily:[{visit_date:'2026-11-05',participant_key:'a',visits:'2',cumulative:'2'},{visit_date:'2026-11-06',participant_key:'a',visits:'3',cumulative:'5'},{visit_date:'2026-11-05',participant_key:'b',visits:null,cumulative:'0'},{visit_date:'2026-11-06',participant_key:'b',visits:'4',cumulative:'4'}],
  baseline_period:[{visit_date:'2026-11-05',visits:'2'}],comparison:{before_days:1,after_days:1,before_average:'2',after_average:'3'}});
test('baseline period survives selected window; new users are not zero before joining',()=>{
  const data=normalizeExperiment(experiment());
  assert.equal(data.baseline[0].visits,2);
  assert.equal(data.series.get('b').get('2026-11-05').daily,null);
  assert.equal(data.members.filter(m=>m.cohort===1).length,1);
  assert.equal(data.series.get('a').get('2026-11-06').cumulative,5);
});
test('before-after change waits for completed days and does not divide by zero',()=>{
  assert.equal(comparisonChange({beforeDays:1,afterDays:0,before:2,after:null}),null);
  assert.deepEqual(comparisonChange({beforeDays:1,afterDays:1,before:0,after:3}),{absolute:3,percent:null});
  assert.deepEqual(comparisonChange(normalizeExperiment(experiment()).comparison),{absolute:1,percent:50});
});
test('missing or duplicate individual series is rejected',()=>{
  const a=experiment();a.people_daily.pop();assert.throws(()=>normalizeExperiment(a));
  const b=experiment();b.people_daily.push(b.people_daily[0]);assert.throws(()=>normalizeExperiment(b));
});
