// DB bigint는 문자열일 수도 있다. 그래프에서 정밀도를 잃는 값은 표시하지 않는다.
export function visitNumber(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) throw new Error('방문 통계 숫자를 확인해 주세요.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('방문 통계 숫자 범위를 확인해 주세요.');
  return number;
}

export function normalizeVisits(rows) {
  if (!Array.isArray(rows)) throw new Error('방문 통계 응답을 확인해 주세요.');
  const dates = new Set();
  return rows.map(row => {
    const date = row.visit_date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || dates.has(date)) throw new Error('방문 통계 날짜를 확인해 주세요.');
    dates.add(date);
    return { date, baseline: visitNumber(row.baseline_cumulative_visits), total: visitNumber(row.total_cumulative_visits), baselineDaily: visitNumber(row.baseline_daily_visits), totalDaily: visitNumber(row.total_daily_visits), participants: visitNumber(row.total_participants), baselineParticipants: visitNumber(row.baseline_participants), active: visitNumber(row.total_active) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function chartPoints(rows, key, maximum, width = 900, height = 270) {
  return rows.map((row, index) => [58 + index / Math.max(rows.length - 1, 1) * (width - 82), height - 34 - row[key] / maximum * (height - 58)]);
}

export function normalizeExperiment(value) {
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('통계 날짜 오류');
    return value;
  };
  if (!value || !Array.isArray(value.members) || !Array.isArray(value.people_daily) || !Array.isArray(value.baseline_period)) throw new Error('통계 응답 오류');
  const members = value.members.map(m => {
    if (typeof m.key !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(m.key) || typeof m.name !== 'string') throw new Error('사용자 통계 오류');
    return { key:m.key, name:m.name, cohort:visitNumber(m.cohort), joined:date(m.joined), until:m.until ? date(m.until) : null };
  });
  if (new Set(members.map(m => m.key)).size !== members.length) throw new Error('중복 사용자');
  const byKey = new Map(members.map(m => [m.key, m]));
  const series = new Map(members.map(m => [m.key, new Map()]));
  for (const row of value.people_daily) {
    const member = byKey.get(row.participant_key), day = date(row.visit_date);
    if (!member || series.get(member.key).has(day)) throw new Error('사용자 시계열 오류');
    const visits = row.visits === null ? null : visitNumber(row.visits);
    series.get(member.key).set(day, { daily:visits, cumulative:visits === null ? null : visitNumber(row.cumulative) });
  }
  const daily = normalizeVisits(value.daily);
  for (const m of members) for (const day of daily) {
    if (!series.get(m.key).has(day.date)) throw new Error('누락된 사용자 시계열');
  }
  const baseline = value.baseline_period.map(row => ({date:date(row.visit_date), visits:visitNumber(row.visits)})).sort((a,b)=>a.date.localeCompare(b.date));
  const average = n => { if(n===null)return null; const v=Number(n); if(!Number.isFinite(v)||v<0)throw new Error('평균 오류'); return v; };
  return { today:date(value.today), start:value.baseline_start ? date(value.baseline_start) : null, baselineEnd:date(value.baseline_end), expansion:date(value.expansion_date), actualExpansion:value.actual_expansion_date ? date(value.actual_expansion_date) : null, members, daily, baseline, series,
    comparison:{beforeDays:visitNumber(value.comparison.before_days),afterDays:visitNumber(value.comparison.after_days),before:average(value.comparison.before_average),after:average(value.comparison.after_average)} };
}

export function comparisonChange(comparison) {
  if (!comparison.beforeDays || !comparison.afterDays || comparison.before === null || comparison.after === null) return null;
  return { absolute:comparison.after-comparison.before, percent:comparison.before > 0 ? (comparison.after/comparison.before-1)*100 : null };
}
