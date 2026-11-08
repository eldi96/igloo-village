// 관측소 분석 규칙. DB는 cohort 1(처음 5명)과 2(그 뒤 전원)만 구분하므로,
// 신규 사용자의 가입일(joined)로 유입 차수를 나눈다. 같은 날 minWave명 이상 합류한 날 = 한 차수.
// 비교에는 평일만 쓴다. 주말·유입 당일·진행 중인 오늘은 비교에서 빼고 주말은 따로 본다.

export const isWeekend = date => { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day === 0 || day === 6; };
export const weekdayName = date => '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];
const mean = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

export function analyzeExperiment(data, { minWave = 3 } = {}) {
  const dates = data.daily.filter(d => !data.start || d.date >= data.start).map(d => d.date);
  const fresh = data.members.filter(m => m.cohort !== 1 && m.joined <= data.today);
  const byDay = new Map();
  fresh.forEach(m => byDay.set(m.joined, (byDay.get(m.joined) || 0) + 1));
  const waveDates = [...byDay].filter(([, count]) => count >= minWave).map(([date]) => date).sort();
  if (!waveDates.length && fresh.length) waveDates.push(fresh.map(m => m.joined).sort()[0]);
  const waveSet = new Set(waveDates);
  // 차수 사이에 혼자 합류한 사람은 직전 차수에 넣는다. 1차 전에 합류했다면 1차로 본다.
  const groupOf = m => { if (m.cohort === 1) return 0; let g = 1; waveDates.forEach((d, i) => { if (m.joined >= d) g = i + 1; }); return g; };
  const groups = [{ id:0, members:data.members.filter(m => m.cohort === 1) }];
  waveDates.forEach((date, i) => groups.push({ id:i + 1, date, members:data.members.filter(m => m.cohort !== 1 && groupOf(m) === i + 1) }));
  groups.forEach(g => { g.keys = g.members.map(m => m.key); g.label = g.id === 0 ? `처음 ${g.members.length}명` : `${g.id}차 유입 ${g.members.length}명`; });

  const usable = date => !isWeekend(date) && !waveSet.has(date) && date < data.today;
  const bounds = [dates[0], ...waveDates.filter(d => !dates[0] || d > dates[0])];
  const segments = bounds.map((from, i) => {
    const to = bounds[i + 1] ?? null, days = dates.filter(d => d >= from && (to === null || d < to));
    return { index:i, from, to, days, usable:days.filter(usable) };
  });

  // 그룹의 하루 접속: 가입 전(null)인 사람은 빼고 센다. n = 그날 집계 대상 인원.
  const groupDaily = (group, date) => {
    let total = 0, n = 0;
    group.keys.forEach(k => { const v = data.series.get(k)?.get(date)?.daily; if (v !== null && v !== undefined) { total += v; n += 1; } });
    return { total, n };
  };
  const groupStats = (group, days) => {
    const rows = days.map(d => groupDaily(group, d)).filter(r => r.n);
    return { days:rows.length, total:mean(rows.map(r => r.total)), perPerson:mean(rows.map(r => r.total / r.n)) };
  };
  const merge = list => ({ id:-1, label:list.map(g => g.label).join(' + '), keys:list.flatMap(g => g.keys), members:list.flatMap(g => g.members) });

  const waves = waveDates.map((date, i) => {
    const before = segments[i], after = segments[i + 1] ?? { index:i + 1, from:date, to:null, days:[], usable:[] };
    const prior = groups.filter(g => g.id <= i), all = merge(prior);
    const pair = g => ({ group:g, before:groupStats(g, before.usable), after:groupStats(g, after.usable) });
    return { n:i + 1, date, newcomers:groups[i + 1].members.length, before, after, all:{ ...pair(all), group:{ ...all, label:i === 0 ? prior[0].label : `기존 ${all.members.length}명` } }, rows:prior.map(pair) };
  });

  const weekendDays = dates.filter(isWeekend);
  const weekdayTotals = data.daily.filter(d => dates.includes(d.date) && usable(d.date)).map(d => d.totalDaily);
  const weekendRows = data.daily.filter(d => weekendDays.includes(d.date));
  const weekendDone = weekendRows.filter(d => d.date < data.today);
  const visitors = data.members.filter(m => weekendDays.some(d => (data.series.get(m.key)?.get(d)?.daily ?? 0) > 0));
  const weekend = { days:weekendDays, completed:weekendDone.length, average:mean(weekendDone.map(d => d.totalDaily)), weekdayAverage:mean(weekdayTotals), visitors, totalVisits:weekendRows.reduce((s, d) => s + d.totalDaily, 0) };

  const memberDaily = (key, date) => data.series.get(key)?.get(date)?.daily ?? null;
  return { memberDaily, dates, waveDates, waveSet, groups, segments, waves, usable, groupDaily, groupStats, weekend, planned:waveDates.length ? null : data.expansion };
}
