import { analyzeExperiment, isWeekend, weekdayName } from './visit-analysis.js?v=badge1';

const NS = 'http://www.w3.org/2000/svg';
const colors = ['#f5b85c','#88c8d0','#b1a0df','#c0cf94','#de9da8','#84b5e2','#d3c394','#80c6b4','#caa7cf','#c7b39e'];
const AMBER = '#f5b85c', WHITE = '#fbf6ee', SOFT = 'rgba(251,246,238,.45)';
const fmt = value => value.toLocaleString('ko-KR', { maximumFractionDigits:2 });
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md = date => `${Number(date.slice(5,7))}/${Number(date.slice(8))}`;
const fmt1 = v => fmt(Math.round(v * 100) / 100);
const rel = (a, b) => a === null || b === null || !(a > 0) ? null : (b / a - 1) * 100;
const pct = r => r === null || !Number.isFinite(r) ? '—' : `${r >= 0 ? '+' : ''}${fmt(Math.round(r))}%`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 모든 SVG 그래프가 같은 좌표계를 쓴다. 날짜는 띠(band) 가운데에 놓아 막대·선·히트맵의 열이 맞는다.
const W = 900, H = 280, L = 56, R = 876, T = 26, B = 236;

function niceTop(maximum) { const tick = Math.max(1, Math.ceil(maximum / 4)); return { tick, top:tick * 4 }; }
function yGrid(tick, y) { return Array.from({ length:5 }, (_, i) => `<line class="g-grid" x1="${L}" x2="${R}" y1="${y(i*tick)}" y2="${y(i*tick)}"/><text x="${L-12}" y="${y(i*tick)+4}" text-anchor="end">${fmt(i*tick)}</text>`).join(''); }
function xLabels(dates, cx) {
  const every = Math.max(1, Math.ceil(dates.length / 10)), last = dates.length - 1;
  return dates.map((d, i) => (i % every === 0 && (i === last || last - i >= every / 2)) || i === last ? `<text x="${cx(i)}" y="${B+22}" text-anchor="middle">${md(d)}</text>` : '').join('');
}
// 주말을 뺀 날짜열에서 날짜가 건너뛴 자리(금→월). 그 자리에 얇은 구분선을 긋는다.
const gapBreaks = dates => dates.map((d, i) => i && (new Date(`${d}T00:00:00Z`) - new Date(`${dates[i - 1]}T00:00:00Z`)) > 864e5 ? i : -1).filter(i => i > 0);
const gapLines = (dates, band) => gapBreaks(dates).map(i => `<line class="gap-line" x1="${L + band * i}" x2="${L + band * i}" y1="${T}" y2="${B + 6}"/>`).join('');
function roveKey(e, i, n) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return Math.max(0, i - 1);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return Math.min(n - 1, i + 1);
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return n - 1;
  return null;
}
function frame(root, label, animate) {
  root.replaceChildren();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', label);
  if (animate && !reduced()) svg.classList.add('is-entering');
  const sr = document.createElement('p'); sr.className = 'obs-sr'; sr.setAttribute('aria-live', 'polite');
  root.append(svg, sr);
  return svg;
}
// 높이에 맞춰 줄어든 그래프에서도 글자가 화면 기준 약 11px로 보이게 한다.
function fitText(root, svg) {
  const fitted = root.clientHeight > 60 && getComputedStyle(svg).flexGrow !== '0' ? Math.min(root.clientWidth, root.clientHeight * W / H) : root.clientWidth;
  const size = Math.max(11, Math.min(26, 9900 / Math.max(fitted || 900, 320)));
  svg.querySelectorAll('text').forEach(text => { text.style.fontSize = `${size}px`; });
  return size;
}
function tooltip(root) {
  const el = document.createElement('div'); el.className = 'obs-tip'; el.setAttribute('aria-hidden', 'true'); root.append(el);
  return {
    at(html, x, y) {
      el.innerHTML = html; el.classList.add('is-on');
      const w = el.offsetWidth, h = el.offsetHeight, maxX = root.clientWidth - 4;
      let left = x + 16; if (left + w > maxX) left = x - 16 - w;
      el.style.left = `${Math.max(4, left)}px`; el.style.top = `${Math.max(-8, Math.min(root.clientHeight - h + 8, y - h / 2))}px`;
    },
    hide() { el.classList.remove('is-on'); },
  };
}
const tipHead = (title, sub = '') => `<strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}`;
const tipRow = (color, label, value) => `<div class="tip-row"><i style="--c:${color}"></i><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
function svgPoint(root, svg, vx, vy) {
  const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), h = root.getBoundingClientRect(), s = Math.min(r.width / vb.width, r.height / vb.height);
  return { x:r.left - h.left + (r.width - vb.width * s) / 2 + vx * s, y:r.top - h.top + (r.height - vb.height * s) / 2 + vy * s };
}
// SVG 위의 투명한 히트 영역: 마우스·터치·키보드(방향키)로 같은 툴팁과 강조를 쓴다.
function interact(root, svg, n, { hit, label, show, anchor }) {
  const tip = tooltip(root), sr = root.querySelector('.obs-sr');
  const g = document.createElementNS(NS, 'g');
  g.innerHTML = Array.from({ length:n }, (_, i) => `<${hit(i)} data-hit="${i}" class="g-hit" fill="transparent" role="button" tabindex="${i === n - 1 ? 0 : -1}" aria-label="${esc(label(i))}"/>`).join('');
  svg.append(g);
  const items = [...g.children];
  const activate = i => { show(i); sr.textContent = label(i); const a = anchor(i), p = svgPoint(root, svg, a.x, a.y); tip.at(a.html, p.x, p.y); };
  const reset = () => { tip.hide(); show(null); };
  items.forEach((el, i) => {
    el.addEventListener('pointerenter', () => activate(i)); el.addEventListener('focus', () => activate(i));
    el.addEventListener('keydown', e => { const next = roveKey(e, i, n); if (next === null) return; e.preventDefault(); el.setAttribute('tabindex', '-1'); items[next].setAttribute('tabindex', '0'); items[next].focus(); });
  });
  svg.addEventListener('pointerleave', reset);
  g.addEventListener('focusout', e => { if (!g.contains(e.relatedTarget)) reset(); });
}
function spark(values, color) {
  if (values.length < 2) return '';
  const max = Math.max(1, ...values), x = i => i / (values.length - 1) * 116 + 2, y = v => 30 - v / max * 26;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return `<svg class="obs-spark" viewBox="0 0 120 32" aria-hidden="true"><path d="${line} L${x(values.length-1)},32 L2,32 Z" fill="${color}" opacity=".14"/><path class="a-draw" pathLength="1" d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(values.length-1)}" cy="${y(values.at(-1))}" r="2.6" fill="${color}"/></svg>`;
}

// 위 오른쪽 카드: 최근 14일 접속 구성 누적 막대. 기존 5명(호박색) 위에 나머지 사용자(흰색).
// 카드 크기를 그대로 viewBox로 써서 작은 카드에서도 글자가 1:1로 보인다.
function stackBars(root, days, animate, todayDate) {
  root.replaceChildren();
  const recent = days.slice(-14);
  if (!recent.length) { root.textContent = '아직 표시할 날짜가 없어요.'; return; }
  const w = Math.max(260, Math.round(root.clientWidth || 520)), h = Math.max(70, Math.round(root.clientHeight || 150));
  const l = 30, r = w - 4, t = 8, b = h - 18, n = recent.length, band = (r - l) / n, bw = Math.min(22, band * .56), cx = i => l + band * (i + .5);
  const { tick, top } = niceTop(Math.max(1, ...recent.map(d => d.totalDaily))), y = v => b - v / top * (b - t);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', '최근 일별 접속 구성 그래프');
  if (animate && !reduced()) svg.classList.add('is-entering');
  const every = band < 20 ? 2 : 1, rx = Math.min(5, bw / 2);
  svg.innerHTML = `<defs><linearGradient id="obs-mix-other" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient><linearGradient id="obs-mix-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd18c"/><stop offset="1" stop-color="#e8963a"/></linearGradient></defs>`
    + [0, 2, 4].map(k => `<line class="g-grid${k ? '' : ' is-axis'}" x1="${l}" x2="${r}" y1="${y(k * tick)}" y2="${y(k * tick)}"/><text x="${l - 8}" y="${y(k * tick) + 3.5}" text-anchor="end">${fmt(k * tick)}</text>`).join('')
    + `<rect class="col-focus" x="${l}" y="${t}" width="${band}" height="${b - t}" rx="6"/>`
    + recent.map((d, i) => {
      const today = d.date === todayDate, total = Math.max(2, b - y(d.totalDaily)), base = b - y(d.baselineDaily);
      return `<g class="mix-bar a-grow${today ? ' is-today' : ''}" data-bar="${i}" style="--i:${i}"><rect x="${cx(i) - bw / 2}" y="${b - total}" width="${bw}" height="${total}" rx="${rx}" fill="${d.totalDaily ? 'url(#obs-mix-other)' : 'rgba(255,255,255,.12)'}"/>`
        + (base > 0 ? `<rect x="${cx(i) - bw / 2}" y="${b - base}" width="${bw}" height="${base}" rx="${d.baselineDaily === d.totalDaily ? rx : 0}" fill="url(#obs-mix-base)"/>` : '')
        + (today ? `<rect class="mix-today" x="${cx(i) - bw / 2 - 2}" y="${b - total - 2}" width="${bw + 4}" height="${total + 4}" rx="${rx + 2}"/>` : '') + '</g>'
        + ((n - 1 - i) % every === 0 ? `<text class="${today ? 'is-today' : ''}" x="${cx(i)}" y="${h - 4}" text-anchor="middle">${today ? '오늘' : Number(d.date.slice(8))}</text>` : '');
    }).join('');
  const sr = document.createElement('p'); sr.className = 'obs-sr'; sr.setAttribute('aria-live', 'polite');
  root.append(svg, sr);
  const focusRect = svg.querySelector('.col-focus'), bars = [...svg.querySelectorAll('[data-bar]')];
  interact(root, svg, n, {
    hit: i => `rect x="${l + band * i}" y="${t}" width="${band}" height="${h - t}"`,
    label: i => { const d = recent[i]; return `${d.date}${recent[i].date === todayDate ? ' 오늘 진행 중' : ''}, 전체 ${fmt(d.totalDaily)}회, 기존 5명 ${fmt(d.baselineDaily)}회, 나머지 ${fmt(d.totalDaily - d.baselineDaily)}회`; },
    show: i => { svg.classList.toggle('has-focus', i !== null); bars.forEach(g => g.classList.toggle('is-focus', Number(g.dataset.bar) === i)); if (i !== null) focusRect.setAttribute('x', l + band * i); },
    anchor: i => {
      const d = recent[i], share = d.totalDaily ? Math.round(d.baselineDaily / d.totalDaily * 100) : null;
      return { x:cx(i) + bw / 2, y:Math.max(t + 24, y(d.totalDaily)),
        html:tipHead(md(d.date), recent[i].date === todayDate ? '오늘 · 진행 중' : '') + tipRow(WHITE, '전체', `${fmt(d.totalDaily)}회`) + tipRow(AMBER, '기존 5명', `${fmt(d.baselineDaily)}회`) + tipRow(SOFT, '나머지 사용자', `${fmt(d.totalDaily - d.baselineDaily)}회`)
          + `<div class="tip-foot"><span>기존 5명 비중</span><b>${share === null ? '—' : share + '%'}</b></div>` };
    },
  });
}

// 증감 분석: 전체 접속(뒤 면) · 고른 그룹의 접속(앞 막대) · 유입 차수선 · 구간별 평일 평균선.
// 주말(빗금)·유입 당일·오늘은 평균과 %에서 뺀다. %는 그 그룹이 처음 관찰된 구간의 평일 평균 대비.
function ratioChart(root, days, A, groupId, layers, animate) {
  if (!days.length) { root.textContent = '아직 표시할 날짜가 없어요.'; return; }
  const g = A.groups.find(x => x.id === groupId) ?? A.groups[0];
  const svg = frame(root, `유입자 접속과 ${g.label} 접속 비교 그래프`, animate);
  const others = A.groups.filter(x => x.id !== g.id).flatMap(x => x.members);
  const n = days.length, band = (R - L) / n, cx = i => L + band * (i + .5), bw = Math.min(30, band * .5);
  const vals = days.map(d => A.groupDaily(g, d.date)), rest = days.map((d, i) => d.totalDaily - vals[i].total);
  const segs = A.segments.filter(sg => sg.index >= g.id).map(sg => ({ ...sg, stat:A.groupStats(g, sg.usable) })).filter(sg => sg.stat.days);
  const base = segs[0]?.stat.total ?? null, rate = v => base > 0 ? (v / base - 1) * 100 : null;
  const maximum = Math.max(1, ...days.map((d, i) => Math.max(layers.total ? rest[i] : 0, layers.base ? vals[i].total : 0)), ...(layers.avg ? segs.map(sg => sg.stat.total) : []));
  const { tick, top } = niceTop(maximum), y = v => B - v / top * (B - T);
  const xAt = date => { if (date === null) return R; const i = days.findIndex(d => d.date >= date); return i < 0 ? R : L + band * i; };
  const kind = date => isWeekend(date) ? 'is-weekend' : A.waveSet.has(date) ? 'is-wave' : A.usable(date) ? '' : 'is-today';
  const tag = date => ({ 'is-weekend':'주말 · 비교 제외', 'is-wave':'유입 당일 · 비교 제외', 'is-today':'오늘 · 진행 중', '':'평일' })[kind(date)];
  let out = `<defs><linearGradient id="obs-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient><linearGradient id="obs-barfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd794"/><stop offset="1" stop-color="#e8963a"/></linearGradient><pattern id="obs-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="7" fill="#fff" opacity=".08"/></pattern></defs>`;
  let prevWeekend = false;
  days.forEach((d, i) => { const wk = isWeekend(d.date); if (wk) out += `<rect x="${L + band * i}" y="${T}" width="${band}" height="${B - T}" fill="url(#obs-hatch)"/>`; prevWeekend = wk; });
  const inRange = d => d >= days[0].date && d <= days[n - 1].date;
  A.waveDates.forEach(d => { if (inRange(d)) { const x = xAt(d); out += `<line class="zone-line" x1="${x}" x2="${x}" y1="${T - 6}" y2="${B}"/>`; } });
  if (!A.waveDates.length && A.planned && inRange(A.planned)) { const x = xAt(A.planned); out += `<line class="zone-line" x1="${x}" x2="${x}" y1="${T - 6}" y2="${B}"/><text class="zone-label is-after" x="${Math.min(x + 8, R - 64)}" y="${T + 14}">유입 예정</text>`; }
  out += yGrid(tick, y) + gapLines(days.map(d => d.date), band) + `<rect class="col-focus" x="${L}" y="${T}" width="${band}" height="${B - T}" rx="10"/>`;
  if (layers.total) {
    const ridge = days.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${y(rest[i])}`).join(' ');
    out += `<path class="a-fade" d="${ridge} L${cx(n-1)},${B} L${cx(0)},${B} Z" fill="url(#obs-area)"/><path class="a-draw" pathLength="1" d="${ridge}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  if (layers.base) {
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(root.clientWidth / 72))));
    out += days.map((d, i) => {
      const v = vals[i]; if (!v.n) return '';
      const h = Math.max(2, B - y(v.total)), r = rate(v.total), label = A.usable(d.date) && r !== null && i % every === 0;
      return `<rect class="bar a-grow ${kind(d.date)}" data-bar="${i}" style="--i:${i}" x="${cx(i) - bw / 2}" y="${B - h}" width="${bw}" height="${h}" rx="${Math.min(6, bw / 2)}" fill="url(#obs-barfill)"/>`
        + (label ? `<text class="ratio-pct a-fade${r < 0 ? ' is-down' : ''}" style="--i:${i}" x="${cx(i)}" y="${B - h - 8}" text-anchor="middle">${pct(r)}</text>` : '');
    }).join('');
  }
  if (layers.avg) segs.forEach((sg, k) => {
    const x1 = Math.max(L, xAt(sg.from)), x2 = xAt(sg.to); if (x2 - x1 < 4) return;
    const yy = y(sg.stat.total);
    out += `<line class="avg-line${k ? ' is-after' : ''} a-fade" x1="${x1}" x2="${x2}" y1="${yy}" y2="${yy}"/>`;
  });
  svg.innerHTML = out + xLabels(days.map(d => d.date), cx);
  const size = fitText(root, svg);
  const focusRect = svg.querySelector('.col-focus'), bars = [...svg.querySelectorAll('[data-bar]')];
  const visitedOthers = date => others.filter(m => (A.memberDaily(m.key, date) ?? 0) > 0).map(m => m.name);
  interact(root, svg, n, {
    hit: i => `rect x="${L + band * i}" y="${T - 6}" width="${band}" height="${B - T + 32}"`,
    label: i => { const d = days[i], v = vals[i]; return `${d.date} ${weekdayName(d.date)}요일 ${tag(d.date)}, ${g.label} ${v.n ? fmt(v.total) + '회' : '가입 전'}, 그 밖 사용자 ${fmt(rest[i])}회`; },
    show: i => {
      svg.classList.toggle('has-focus', i !== null); bars.forEach(b => b.classList.toggle('is-focus', Number(b.dataset.bar) === i));
      if (i !== null) focusRect.setAttribute('x', L + band * i);
    },
    anchor: i => {
      const d = days[i], v = vals[i], r = A.usable(d.date) && v.n ? rate(v.total) : null;
      return { x:cx(i) + bw / 2, y:Math.max(T + 30, y(Math.max(rest[i], v.total))),
        html:tipHead(`${md(d.date)} (${weekdayName(d.date)})`, tag(d.date))
          + tipRow(AMBER, g.label, v.n ? `${fmt(v.total)}회` : '가입 전') + tipRow(WHITE, '그 밖 사용자(유입자)', `${fmt(rest[i])}회`)
          + `<div class="tip-foot"><span>첫 구간 평일 평균 대비</span><b class="${r !== null && r < 0 ? 'is-down' : ''}">${pct(r)}</b></div><div class="tip-foot"><span>${esc(g.label)} 1인당</span><b>${v.n ? fmt1(v.total / v.n) + '회' : '—'}</b></div>`
          + (() => { const who = visitedOthers(d.date); return who.length ? `<small class="tip-sub">이날 들어온 그 밖 사용자 ${who.length}명</small><div class="tip-names">${who.slice(0, 8).map(w => `<span>${esc(w)}</span>`).join('')}${who.length > 8 ? `<span>외 ${who.length - 8}명</span>` : ''}</div>` : ''; })() };
    },
  });
  // 설명을 실제 CSS 글자 크기로 배치해 SVG 축/막대 수치와 겹치지 않게 한다.
  const annotations=document.createElement('div'); annotations.className='ratio-annotations';
  if(layers.avg) segs.forEach((sg,k)=>{
    const label=document.createElement('span'); label.className='ratio-average-key';
    label.style.setProperty('--c',k?AMBER:WHITE);
    label.textContent=`${md(sg.from)}~${sg.to?md(sg.to):'현재'} 평일 평균 ${fmt1(sg.stat.total)}회`;
    annotations.append(label);
  });
  A.waveDates.forEach((wd,k)=>{
    if(!inRange(wd))return;
    const grp=A.groups[k+1],label=document.createElement('span'); label.className='ratio-wave-key';
    label.textContent=`${md(wd)} · ${k+1}차 유입 ${grp.members.length}명`;
    label.title=grp.members.map(m=>m.name).join(', '); label.tabIndex=0;
    annotations.append(label);
  });
  if(annotations.childNodes.length)root.prepend(annotations);
}

// 주말 접속: 주말 날짜마다 그룹별(처음 5명 / n차 유입) 누적 막대 + 평일 하루 평균선.
const groupColors = [AMBER, '#88c8d0', '#b1a0df', '#c0cf94', '#de9da8'];
function weekendChart(root, A, data, animate) {
  const days = A.weekend.days;
  if (!days.length) { root.textContent = '조회 기간에 주말이 없어요.'; return; }
  const svg = frame(root, '주말 날짜별 그룹 접속 그래프', animate);
  const n = days.length, band = (R - L) / n, cx = i => L + band * (i + .5), bw = Math.min(56, band * .5);
  const stacks = days.map(d => A.groups.map(g => A.groupDaily(g, d).total)), totals = stacks.map(st => st.reduce((s, v) => s + v, 0));
  const avg = A.weekend.weekdayAverage;
  const { tick, top } = niceTop(Math.max(1, ...totals, avg ?? 0)), y = v => B - v / top * (B - T), unit = (B - T) / top;
  let out = yGrid(tick, y) + gapLines(days, band) + `<rect class="col-focus" x="${L}" y="${T}" width="${band}" height="${B - T}" rx="10"/>`;
  out += days.map((d, i) => {
    let acc = 0;
    const segs = stacks[i].map((v, k) => { if (!v) return ''; const h = v * unit, seg = `<rect x="${cx(i) - bw / 2}" y="${B - acc - h}" width="${bw}" height="${h}" fill="${groupColors[k % groupColors.length]}"/>`; acc += h; return seg; }).join('');
    const body = totals[i] ? segs : `<rect class="wk-empty" x="${cx(i) - bw / 2}" y="${B - 3}" width="${bw}" height="3" rx="1.5"/>`;
    return `<g class="mix-bar a-grow${d === data.today ? ' is-today' : ''}" data-bar="${i}" style="--i:${i}">${body}</g><text class="ratio-pct a-fade" style="--i:${i}" x="${cx(i)}" y="${y(totals[i]) - 8}" text-anchor="middle">${fmt(totals[i])}회</text>`;
  }).join('');
  if (avg !== null) out += `<line class="avg-line a-fade" x1="${L}" x2="${R}" y1="${y(avg)}" y2="${y(avg)}"/><text class="avg-label a-fade" x="${R - 6}" y="${y(avg) - 7}" text-anchor="end">평일 하루 평균 ${fmt1(avg)}회</text>`;
  out += days.map((d, i) => `<text x="${cx(i)}" y="${B + 22}" text-anchor="middle">${md(d)} (${weekdayName(d)})</text>`).join('');
  svg.innerHTML = out; fitText(root, svg);
  const focusRect = svg.querySelector('.col-focus'), bars = [...svg.querySelectorAll('[data-bar]')];
  const visitors = d => data.members.filter(m => (data.series.get(m.key)?.get(d)?.daily ?? 0) > 0).map(m => m.name);
  interact(root, svg, n, {
    hit: i => `rect x="${L + band * i}" y="${T - 6}" width="${band}" height="${B - T + 32}"`,
    label: i => `${days[i]} ${weekdayName(days[i])}요일, 전체 ${fmt(totals[i])}회, ${A.groups.map((g, k) => `${g.label} ${fmt(stacks[i][k])}회`).join(', ')}`,
    show: i => { svg.classList.toggle('has-focus', i !== null); bars.forEach(b => b.classList.toggle('is-focus', Number(b.dataset.bar) === i)); if (i !== null) focusRect.setAttribute('x', L + band * i); },
    anchor: i => {
      const who = visitors(days[i]);
      return { x:cx(i) + bw / 2, y:Math.max(T + 30, y(totals[i])),
        html:tipHead(`${md(days[i])} (${weekdayName(days[i])})`, days[i] === data.today ? '오늘 · 진행 중' : '주말')
          + A.groups.map((g, k) => tipRow(groupColors[k % groupColors.length], g.label, `${fmt(stacks[i][k])}회`)).join('')
          + `<div class="tip-foot"><span>평일 평균 대비</span><b>${avg ? `${fmt(Math.round(totals[i] / avg * 100))}%` : '—'}</b></div>`
          + `<div class="tip-foot"><span>들어온 사람</span><b>${who.length ? esc(who.slice(0, 4).join(', ') + (who.length > 4 ? ` 외 ${who.length - 4}명` : '')) : '없음'}</b></div>` };
    },
  });
}

// 상관 관계: x = 나머지 사용자 접속(기존 5명 제외, 자기 자신과의 상관을 피함), y = 기존 5명 접속. 완료된 날만.
function scatter(root, days, A, animate) {
  const firstWave = A.waveDates[0] ?? A.planned;
  const points = days.filter(d => A.usable(d.date)).map(d => ({ d, x:d.totalDaily - d.baselineDaily, y:d.baselineDaily, after:Boolean(firstWave && d.date >= firstWave) }));
  if (points.length < 2) { root.textContent = '완료된 평일이 2일 이상 쌓이면 상관 관계를 그려요.'; return null; }
  const svg = frame(root, '나머지 사용자 접속과 기존 5명 접속의 상관 관계', animate);
  const xs = niceTop(Math.max(1, ...points.map(p => p.x))), ys = niceTop(Math.max(1, ...points.map(p => p.y)));
  const X = v => L + v / xs.top * (R - L), Y = v => B - v / ys.top * (B - T);
  const n = points.length, mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0; points.forEach(p => { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; });
  const slope = sxx > 0 ? sxy / sxx : null, r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  let out = `<clipPath id="obs-scatter-clip"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}"/></clipPath>` + yGrid(ys.tick, Y)
    + Array.from({ length:5 }, (_, i) => `<line class="g-grid is-v" x1="${X(i * xs.tick)}" x2="${X(i * xs.tick)}" y1="${T}" y2="${B}"/><text x="${X(i * xs.tick)}" y="${B + 22}" text-anchor="middle">${fmt(i * xs.tick)}</text>`).join('')
    + `<text class="axis-title" x="${L + 8}" y="${T - 10}">↑ 기존 5명 접속</text><text class="axis-title" x="${R}" y="${B - 10}" text-anchor="end">나머지 사용자 접속 →</text>`;
  if (slope !== null && n >= 3) { const b = my - slope * mx; out += `<line class="trend-line a-fade" clip-path="url(#obs-scatter-clip)" x1="${X(0)}" y1="${Y(b)}" x2="${X(xs.top)}" y2="${Y(b + slope * xs.top)}"/>`; }
  out += points.map((p, i) => `<circle class="dot-pt a-pop${p.after ? ' is-after' : ''}${i === n - 1 ? ' is-latest' : ''}" data-pt="${i}" style="--i:${i}" cx="${X(p.x)}" cy="${Y(p.y)}" r="7"/>`).join('');
  svg.innerHTML = out; fitText(root, svg);
  const dots = [...svg.querySelectorAll('[data-pt]')];
  interact(root, svg, n, {
    hit: i => `circle cx="${X(points[i].x)}" cy="${Y(points[i].y)}" r="18"`,
    label: i => `${points[i].d.date}, 나머지 사용자 ${fmt(points[i].x)}회, 기존 5명 ${fmt(points[i].y)}회`,
    show: i => { svg.classList.toggle('has-focus', i !== null); dots.forEach(dot => dot.classList.toggle('is-focus', Number(dot.dataset.pt) === i)); },
    anchor: i => ({ x:X(points[i].x) + 8, y:Y(points[i].y), html:tipHead(md(points[i].d.date), points[i].after ? '유입 후' : '유입 전') + tipRow(SOFT, '나머지 사용자', `${fmt(points[i].x)}회`) + tipRow(AMBER, '기존 5명', `${fmt(points[i].y)}회`) }),
  });
  return { n, slope, r };
}

// 활동 히트맵: 행 = 사용자(기존 5명 먼저), 열 = 날짜. 가입 전은 빗금.
function heatmap(root, members, dates, series, animate) {
  root.replaceChildren();
  if (!dates.length || !members.length) { root.textContent = '표시할 기록이 없어요.'; return; }
  const ordered = [...members.filter(m => m.cohort === 1), ...members.filter(m => m.cohort !== 1)];
  const maximum = Math.max(1, ...ordered.flatMap(m => dates.map(d => series.get(m.key).get(d)?.daily ?? 0)));
  const grid = document.createElement('div'); grid.className = `obs-heat${animate && !reduced() ? ' is-entering' : ''}`;
  grid.style.setProperty('--cols', dates.length); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', '사용자별 날짜 접속 히트맵');
  const tip = tooltip(root), cell = (text, cls, role) => { const el = document.createElement('div'); el.className = cls; if (role) el.setAttribute('role', role); el.textContent = text; return el; };
  const every = Math.max(1, Math.ceil(dates.length / 10));
  const head = cell('', 'heat-row', 'row'); head.append(cell('', 'heat-corner')); dates.forEach((d, i) => head.append(cell(i % every === 0 || i === dates.length - 1 ? md(d) : '', `heat-date${i === dates.length - 1 ? ' is-today' : ''}`, 'columnheader')));
  grid.append(head);
  const cells = [];
  ordered.forEach((m, r) => {
    if (r > 0 && m.cohort !== 1 && ordered[r - 1].cohort === 1) grid.append(cell('신규 사용자', 'heat-split'));
    const row = cell('', 'heat-row', 'row'), name = cell(m.name, 'heat-name', 'rowheader');
    name.style.setProperty('--c', colors[members.indexOf(m) % colors.length]); name.title = m.name; row.append(name);
    cells[r] = dates.map((d, c) => {
      const v = series.get(m.key).get(d)?.daily ?? null, el = cell('', `heat-cell${v === null ? ' is-null' : v === 0 ? ' is-zero' : ''}`, 'gridcell');
      el.style.setProperty('--a', v ? (.25 + .75 * v / maximum).toFixed(3) : 0); el.style.setProperty('--i', c); el.tabIndex = r === 0 && c === dates.length - 1 ? 0 : -1;
      const text = `${m.name}, ${d}, ${v === null ? '가입 전' : `${fmt(v)}회`}`; el.setAttribute('aria-label', text);
      const show = () => { const b = el.getBoundingClientRect(), h = root.getBoundingClientRect(); grid.querySelectorAll('.is-focus').forEach(x => x.classList.remove('is-focus')); el.classList.add('is-focus'); tip.at(tipHead(m.name, m.cohort === 1 ? '기존 5명' : `신규 · ${md(m.joined)} 가입`) + tipRow(AMBER, md(d), v === null ? '가입 전' : `${fmt(v)}회`), b.right - h.left, b.top - h.top + b.height / 2); };
      el.addEventListener('pointerenter', show); el.addEventListener('focus', show);
      el.addEventListener('keydown', e => {
        let nr = r, nc = c;
        if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1); else if (e.key === 'ArrowRight') nc = Math.min(dates.length - 1, c + 1);
        else if (e.key === 'ArrowUp') nr = Math.max(0, r - 1); else if (e.key === 'ArrowDown') nr = Math.min(ordered.length - 1, r + 1);
        else if (e.key === 'Home') nc = 0; else if (e.key === 'End') nc = dates.length - 1; else return;
        e.preventDefault(); el.tabIndex = -1; cells[nr][nc].tabIndex = 0; cells[nr][nc].focus();
      });
      row.append(el); return el;
    });
    grid.append(row);
  });
  const reset = () => { tip.hide(); grid.querySelectorAll('.is-focus').forEach(x => x.classList.remove('is-focus')); };
  grid.addEventListener('pointerleave', reset); grid.addEventListener('focusout', e => { if (!grid.contains(e.relatedTarget)) reset(); });
  root.append(grid);
}

// 사용자 추이: 사용자별 선. 가입 전은 null로 선을 끊는다.
function lines(root, dates, series, { marker, markerLabel, unit = '회', animate }) {
  if (!dates.length) { root.textContent = '아직 표시할 날짜가 없어요.'; return; }
  if (!series.length) { root.textContent = '왼쪽 목록에서 그래프에 표시할 사람이나 합계를 골라 주세요.'; return; }
  const svg = frame(root, `사용자별 그래프. 단위 ${unit}`, animate);
  const n = dates.length, band = (R - L) / n, cx = i => L + band * (i + .5);
  const { tick, top } = niceTop(Math.max(1, ...series.flatMap(s => s.values.filter(v => v !== null)))), y = v => B - v / top * (B - T);
  const path = values => { let on = false, d = ''; values.forEach((v, i) => { if (v === null) { on = false; return; } d += `${on ? 'L' : 'M'}${cx(i)},${y(v)} `; on = true; }); return d; };
  const mi = marker && marker >= dates[0] ? dates.findIndex(d => d >= marker) : -1, mx = mi >= 0 ? L + band * mi : null;
  let out = (mx !== null ? `<rect class="zone-after" x="${mx}" y="${T}" width="${R - mx}" height="${B - T}"/><line class="zone-line" x1="${mx}" x2="${mx}" y1="${T - 6}" y2="${B}"/><text class="zone-label is-after" x="${mx + 10}" y="${T + 16}">${markerLabel}</text>` : '')
    + yGrid(tick, y) + gapLines(dates, band) + `<line class="col-line" x1="${cx(n - 1)}" x2="${cx(n - 1)}" y1="${T}" y2="${B}"/>`;
  out += series.map(s => `<g class="series" data-key="${s.key}"><path class="${s.dashed ? 'a-fade' : 'a-draw'}" d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="6 5"' : 'pathLength="1"'}/>`
    + s.values.map((v, i) => v === null ? '' : `<circle class="a-fade" style="--i:${i}" cx="${cx(i)}" cy="${y(v)}" r="${n > 35 ? 1.6 : 3}" fill="${s.color}"/>`).join('') + '</g>').join('');
  svg.innerHTML = out + xLabels(dates, cx); fitText(root, svg);
  const crosshair = svg.querySelector('.col-line');
  interact(root, svg, n, {
    hit: i => `rect x="${L + band * i}" y="${T - 6}" width="${band}" height="${B - T + 32}"`,
    label: i => `${dates[i]}, ${series.map(s => `${s.name} ${s.values[i] === null ? '집계 대상 아님' : fmt(s.values[i]) + unit}`).join(', ')}`,
    show: i => { svg.classList.toggle('has-focus', i !== null); if (i !== null) { crosshair.setAttribute('x1', cx(i)); crosshair.setAttribute('x2', cx(i)); } },
    anchor: i => {
      const rows = series.map(s => ({ s, v:s.values[i] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
      return { x:cx(i), y:T + (B - T) / 2, html:tipHead(md(dates[i]), unit === '회' ? '접속' : '') + rows.slice(0, 8).map(({ s, v }) => tipRow(s.color, s.name, v === null ? '—' : `${fmt(v)}${unit}`)).join('') + (rows.length > 8 ? `<small>외 ${rows.length - 8}개</small>` : '') };
    },
  });
}

// 분석 보고서: 같은 데이터에서 규칙으로 문장을 만든다(AI 사용 안 함). 오늘은 진행 중이라 계산에서 뺀다.
function correlation(points) {
  const n = points.length; if (n < 2) return { n, slope:null, r:null };
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0; points.forEach(p => { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; });
  return { n, slope:sxx > 0 ? sxy / sxx : null, r:sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, mx, my };
}
const mean = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

function buildReport(data, A) {
  const waves = A.waves, w = waves.at(-1), g0 = A.groups[0], last = data.daily.at(-1);
  const b = w?.all.before, a = w?.all.after, minDays = w ? Math.min(b.days, a.days) : 0;
  const level = !w || !b.days || !a.days ? 'wait' : minDays < 3 ? 'early' : minDays < 7 ? 'trend' : 'solid';
  const levelText = { wait:'비교 대기', early:'초기 단계', trend:'경향 관찰', solid:'신뢰 가능' }[level];
  const moved = r => r === null ? '변했어요' : r >= 10 ? '늘었어요' : r <= -10 ? '줄었어요' : '거의 그대로예요';
  const waveLine = x => `${x.n}차(${md(x.date)}) 뒤 ${x.all.group.label}의 평일 1인당 하루 접속은 ${fmt1(x.all.before.perPerson)}회 → ${fmt1(x.all.after.perPerson)}회(${pct(rel(x.all.before.perPerson, x.all.after.perPerson))})`;
  let headline;
  if (!w) {
    const st = A.groupStats(g0, A.segments[0]?.usable ?? []);
    headline = `아직 신규 유입 전이에요. 지금 ${g0.label}의 평일 1인당 하루 접속은 ${st.days ? fmt1(st.perPerson) + '회' : '집계 대기'}예요.`;
  } else if (!a.days || !b.days) {
    const prev = waves.slice(0, -1).filter(x => x.all.before.days && x.all.after.days).at(-1);
    headline = `${w.n}차 유입(${md(w.date)}) 뒤 완료된 평일이 아직 없어요. 다음 평일 기록이 쌓이면 ${w.all.group.label}을 유입 전과 비교할게요.` + (prev ? ` 직전 결과: ${waveLine(prev)}.` : '');
  } else {
    const r = rel(b.perPerson, a.perPerson);
    headline = `${w.n}차 유입 뒤 ${w.all.group.label}의 평일 1인당 하루 접속이 ${fmt1(b.perPerson)}회에서 ${fmt1(a.perPerson)}회로 ${moved(r)}(${pct(r)}). `
      + (level === 'early' ? `다만 비교한 평일이 ${minDays}일뿐이라 아직 판단하기 일러요.` : level === 'trend' ? `비교한 평일이 ${minDays}일이라 경향을 보는 정도로 읽어 주세요.` : `양쪽 모두 평일 ${minDays}일 이상 쌓여 어느 정도 믿을 만해요.`);
  }
  const fresh = data.members.filter(m => m.cohort !== 1 && m.joined <= data.today).length, we = A.weekend;
  const metrics = [
    [`${w ? w.n + '차 ' : ''}유입 전 1인당`, b?.days ? `${fmt1(b.perPerson)}회` : '—', `평일 ${b?.days ?? 0}일`],
    [`${w ? w.n + '차 ' : ''}유입 후 1인당`, a?.days ? `${fmt1(a.perPerson)}회` : '—', `평일 ${a?.days ?? 0}일`],
    ['주말 하루 평균', we.completed ? `${fmt1(we.average)}회` : '—', we.completed && we.weekdayAverage ? `평일의 ${fmt(Math.round(we.average / we.weekdayAverage * 100))}%` : '주말 기록 대기'],
    ['신규 유입', `${fresh}명`, `${waves.length}차까지 · 집계 ${last ? fmt(last.participants) : 0}명`],
  ];
  const findings = [];
  const done = waves.filter(x => x.all.before.days && x.all.after.days);
  if (done.length > 1) findings.push(`차수별 결과: ${done.map(x => `<strong>${x.n}차</strong> ${fmt1(x.all.before.perPerson)} → ${fmt1(x.all.after.perPerson)}회(${pct(rel(x.all.before.perPerson, x.all.after.perPerson))})`).join(' · ')}`);
  if (w && w.rows.length > 1 && a.days) findings.push(`${w.n}차 유입 뒤 그룹별로 보면 ${w.rows.map(r => `<strong>${esc(r.group.label)}</strong> ${r.before.days ? fmt1(r.before.perPerson) : '—'} → ${r.after.days ? fmt1(r.after.perPerson) : '—'}회`).join(', ')}예요. 처음 사용자와 지난 차수 사용자가 함께 늘었는지 확인할 수 있어요.`);
  if (w && a.days && b.days) {
    const pick = (key, list) => { const v = list.map(d => data.series.get(key)?.get(d)?.daily).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((s2, x) => s2 + x, 0) / v.length : null; };
    const people = w.all.group.members.map(m => ({ name:m.name, before:pick(m.key, w.before.usable), after:pick(m.key, w.after.usable) })).filter(p => p.before !== null && p.after !== null).map(p => ({ ...p, diff:p.after - p.before }));
    if (people.length) {
      const up = people.filter(p => p.diff > 0).length, topP = [...people].sort((x, y2) => y2.diff - x.diff)[0], sum = people.reduce((s2, p) => s2 + p.diff, 0);
      findings.push(`${w.all.group.label} 중 <strong>${up}명</strong>이 유입 뒤 평일에 더 자주 들어왔어요. 가장 많이 늘어난 사람은 <strong>${esc(topP.name)}</strong>(하루 ${fmt1(topP.before)} → ${fmt1(topP.after)}회)예요.` + (sum > 0 && topP.diff / sum >= .6 && people.length > 1 ? ' 증가분의 대부분이 이 한 명에게서 나와서 일반화하기는 조심스러워요.' : ''));
    }
  }
  const corr = correlation(data.daily.filter(d => A.dates.includes(d.date) && A.usable(d.date)).map(d => ({ x:d.totalDaily - d.baselineDaily, y:d.baselineDaily })));
  if (corr.n >= 3 && corr.r !== null) {
    const ab = Math.abs(corr.r), strength = ab >= .7 ? '강한' : ab >= .4 ? '중간 정도의' : ab >= .2 ? '약한' : '거의 없는';
    findings.push(`평일 기준으로 다른 사용자가 많이 온 날과 처음 5명의 접속 사이에는 <strong>${strength} ${corr.r >= 0 ? '같은 방향' : '반대 방향'} 관계</strong>(r = ${fmt(Math.round(corr.r * 100) / 100)}, ${corr.n}일)가 보여요.`);
  } else findings.push('상관 관계는 완료된 평일이 3일 이상 쌓여야 계산할 수 있어요.');
  if (we.days.length) findings.push(we.totalVisits ? `주말 ${we.days.length}일 동안 <strong>${fmt(we.visitors.length)}명</strong>이 들어왔어요${we.visitors.length ? `(${we.visitors.slice(0, 4).map(m => esc(m.name)).join(', ')}${we.visitors.length > 4 ? ' 외' : ''})` : ''}. 주말 접속은 평일 비교와 따로 봐요.` : `주말 ${we.days.length}일 동안 접속한 사람은 없어요. 수업이 없는 날의 자발적 방문은 아직 없다는 뜻이에요.`);
  const cautions = [
    '평일만 비교해요. 주말과 유입 당일(공지·행사 효과), 진행 중인 오늘은 뺐어요.',
    w ? `비교 표본이 유입 전 평일 ${b.days}일 · 후 ${a.days}일이에요. 최소 5일씩은 쌓여야 요일·우연의 영향이 줄어요.` : '유입 전 기준 기록이 길수록 비교가 단단해져요.',
    '유입 직후에는 새로움 효과가 섞일 수 있어요. 2주 뒤에도 유지되는지 봐야 해요.',
    '접속이 함께 늘었다는 것만으로 신규 사용자 때문이라고 단정할 수 없어요(인과관계 아님).',
  ];
  const next = [];
  if (w && a.days < 5) next.push(`${w.n}차 유입 뒤 평일 기록 ${5 - a.days}일 더 모으기`);
  if (waves.length === 1) next.push('2차 유입은 1차 뒤 평일 3~5일이 쌓인 다음 화·수요일에 하기');
  if (waves.length > 1) next.push(`${waves.length}차 유입 효과를 처음 사용자와 지난 차수 사용자로 나눠 계속 보기`);
  next.push('주말 접속 탭에서 자발적 방문이 생기는지 보기');
  return { level, levelText, headline, metrics, findings, cautions, next, today:data.today };
}

function renderReport(root, data, A, animate) {
  const rp = buildReport(data, A);
  root.className = `obs-report${animate && !reduced() ? ' is-entering' : ''}`;
  root.innerHTML = `<section class="rp-card rp-main" style="--i:0"><div class="rp-top"><span class="rp-level is-${rp.level}">${rp.levelText}</span><span class="rp-date">${esc(rp.today)} 기준 · 자동 작성</span></div><p class="rp-headline">${esc(rp.headline)}</p><dl class="rp-metrics">${rp.metrics.map(([k, v, n]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd><small>${esc(n)}</small></div>`).join('')}</dl></section>
    <section class="rp-card" style="--i:1"><h3>관찰한 것</h3><ol class="rp-list">${rp.findings.map(f => `<li>${f}</li>`).join('')}</ol></section>
    <section class="rp-card" style="--i:2"><h3>읽을 때 주의할 점</h3><ul class="rp-list is-caution">${rp.cautions.map(t => `<li>${esc(t)}</li>`).join('')}</ul><h3>다음에 할 일</h3><ul class="rp-list is-next">${rp.next.map(t => `<li>${esc(t)}</li>`).join('')}</ul><button type="button" class="rp-copy">보고서 텍스트 복사</button></section>`;
  const copy = root.querySelector('.rp-copy');
  copy.onclick = async () => {
    const plain = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const text = [`[마을 성장 실험 보고서] ${rp.today} 기준 · ${rp.levelText}`, '', rp.headline, '', ...rp.metrics.map(([k, v, n]) => `- ${k}: ${v} (${n})`), '', '관찰한 것', ...rp.findings.map((f, i) => `${i + 1}. ${plain(f)}`), '', '주의할 점', ...rp.cautions.map(t => `- ${t}`), '', '다음에 할 일', ...rp.next.map(t => `- ${t}`)].join('\n');
    try { await navigator.clipboard.writeText(text); copy.textContent = '복사했어요'; } catch { copy.textContent = '복사하지 못했어요'; }
    setTimeout(() => { copy.textContent = '보고서 텍스트 복사'; }, 1600);
  };
}

const tabs = [
  ['ratio','증감 분석','Ratio','유입자가 들어온 뒤 기존 사용자는 더 자주 올까?'],
  ['scatter','상관 관계','Correlation','다른 사용자가 많이 온 날, 기존 5명도 많이 왔을까?'],
  ['heat','활동 히트맵','Heatmap','누가, 언제 들어왔을까?'],
  ['users','사용자 추이','User Trend','사용자별 접속 추이'],
  ['table','수치 표','Raw Numbers','사용자별 날짜 수치'],
  ['weekend','주말 접속','Weekend','수업이 없는 주말에도 들어올까?'],
  ['report','분석 보고서','Report','지금까지의 데이터로 본 실험 결과'],
];
export const experimentTabs = tabs.map(([key, label]) => ({ key, label }));

export function mountExperimentView(root, { gauge: gaugeHost = null, gaugeCaption = null, onTab = null } = {}) {
  root.innerHTML = `<div class="obs-bento">
  <section class="obs-card span-6" data-section="compare"><div class="obs-card-head"><div><p class="obs-eyebrow">Before &amp; After · 평일</p><h2 data-compare-title>기존 사용자 1인당 하루 접속</h2></div><div class="obs-head-right"><div class="obs-tabs obs-wave-tabs" role="group" aria-label="유입 차수 고르기" data-wave-tabs hidden></div><span class="obs-chip" data-change-chip>비교 대기</span></div></div><div class="experiment-comparison"></div><div class="obs-breakdown" data-breakdown></div><p class="experiment-caption" title="평일만 비교합니다. 주말, 유입 당일(공지·행사 효과), 진행 중인 오늘은 뺍니다. 유입 차수는 같은 날 3명 이상 합류한 날로 나눕니다. 접속 증가만으로 인과관계가 입증되지는 않아요.">평일만 비교 · 유입 당일·오늘 제외 · 주말은 주말 접속 탭에서</p></section>
  <section class="obs-card span-6"><div class="obs-card-head"><div><p class="obs-eyebrow">Daily Mix</p><h2>최근 일별 접속 구성</h2></div><span class="obs-key"><i class="k-base"></i>기존 5명<i class="k-other"></i>나머지</span></div><div class="obs-bars-host" data-bars></div></section>
  <article class="obs-card obs-kpi span-3"><p>집계 사용자</p><strong data-population>—</strong><small data-active></small><span data-spark-population></span></article><article class="obs-card obs-kpi span-3"><p>기존 5명 · 오늘 접속</p><strong data-baseline-today>—</strong><small data-average></small><span data-spark-baseline></span></article><article class="obs-card obs-kpi span-3"><p>유입 전후 변화</p><strong data-change>—</strong><small data-change-note></small></article><article class="obs-card obs-kpi span-3"><p>내 누적 접속</p><strong data-mine>—</strong><small>개발팀은 집계 제외</small></article>
  <section class="obs-card obs-tabcard span-12" data-section="detail"><div class="obs-chart-head"><div><p class="obs-eyebrow" data-tab-eyebrow></p><h2 data-tab-title></h2></div><div class="obs-tabs" role="tablist" aria-label="상세 통계">${tabs.map(([key, label], i) => `<button type="button" role="tab" id="obs-tab-${key}" data-tab="${key}" aria-controls="obs-panel-${key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}</div></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-ratio" aria-labelledby="obs-tab-ratio" data-panel="ratio"><div class="obs-panel-bar"><div class="obs-tabs" role="group" aria-label="막대로 볼 그룹" data-ratio-groups></div><div class="obs-layer-toggles" role="group" aria-label="그래프 요소 켜고 끄기"><button type="button" data-layer="total" aria-pressed="true"><i class="lg-area"></i>그 밖 사용자(유입자)</button><button type="button" data-layer="base" aria-pressed="true"><i class="lg-bar"></i><span data-base-label>기존 5명</span></button><button type="button" data-layer="avg" aria-pressed="true"><i class="lg-avg"></i>구간 평균</button></div><span class="experiment-caption obs-inline">배지에 마우스를 올리면 유입자 명단 · % = 첫 구간 평일 평균 대비 · 주말 제외</span></div><div class="obs-plot" data-ratio-plot></div></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-scatter" aria-labelledby="obs-tab-scatter" data-panel="scatter" hidden><div class="obs-panel-bar"><div class="obs-stats" data-scatter-stats></div><span class="experiment-caption obs-inline">점 하나 = 완료된 평일(주말·유입 당일 제외) · <b class="k-dot is-after"></b>유입 후 <b class="k-dot"></b>유입 전 · 가로축에서 처음 5명은 뺐어요</span></div><div class="obs-plot" data-scatter-plot></div></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-heat" aria-labelledby="obs-tab-heat" data-panel="heat" hidden><div class="obs-panel-bar"><div class="heat-scale" aria-hidden="true"><span>적음</span><i></i><span>많음</span><b></b><span>가입 전</span></div><span class="experiment-caption obs-inline">칸에 마우스를 올리거나 방향키로 이동하세요</span></div><div class="obs-plot obs-heat-host" data-heat></div></div>
   <div class="obs-panel obs-users" role="tabpanel" id="obs-panel-users" aria-labelledby="obs-tab-users" data-panel="users" hidden><aside class="obs-userlist" aria-label="그래프에 표시할 사용자"><div class="obs-userlist-filters"><div class="obs-tabs" aria-label="사용자 표시 범위"><button type="button" data-scope="baseline" aria-pressed="true">기존 5명</button><button type="button" data-scope="all" aria-pressed="false">전체</button></div><div class="obs-tabs" aria-label="사용자 그래프 집계 방식"><button type="button" data-metric="daily" aria-pressed="true">일별</button><button type="button" data-metric="cumulative" aria-pressed="false">누적</button></div></div><div class="obs-userlist-actions"><button type="button" data-select-all>모두 켜기</button><button type="button" data-select-none>모두 끄기</button></div><div class="experiment-toggles" aria-label="사용자별 그래프 표시 (기존 5명은 고정 표본)"></div><p class="experiment-caption obs-arrivals" data-arrivals></p></aside><div class="obs-plot" data-users-plot></div></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-table" aria-labelledby="obs-tab-table" data-panel="table" hidden><p class="experiment-caption">사용자 추이 탭에서 고른 범위(기존 5명/전체)와 집계 방식(일별/누적)을 따릅니다.</p><div class="obs-table"><div class="obs-table-wrap"><table><thead></thead><tbody></tbody></table></div></div><p class="obs-note" title="한국 시간 기준 · 30분 중복 방지 규칙으로 인정된 접속 횟수입니다. 관측소 통계는 개발팀과 강사만 조회할 수 있어요. 가입 전은 0회 대신 집계 대상 아님(—)으로 표시합니다. 누적값에는 조회 기간 이전 기록도 포함됩니다.">한국 시간 기준 · 30분 중복 방지 규칙으로 인정된 접속 횟수입니다. 관측소 통계는 개발팀과 강사만 조회할 수 있어요. 가입 전은 0회 대신 집계 대상 아님(—)으로 표시합니다. 누적값에는 조회 기간 이전 기록도 포함됩니다.</p></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-weekend" aria-labelledby="obs-tab-weekend" data-panel="weekend" hidden><div class="obs-panel-bar"><div class="obs-stats" data-weekend-stats></div><span class="obs-key" data-weekend-key></span><span class="experiment-caption obs-inline">주말은 평일 비교에서 빼고 여기서만 봐요</span></div><div class="obs-plot" data-weekend-plot></div></div>
   <div class="obs-panel" role="tabpanel" id="obs-panel-report" aria-labelledby="obs-tab-report" data-panel="report" hidden><div class="obs-report" data-report></div></div>
  </section></div>`;
  const q = s => root.querySelector(s);
  let A = null, waveIndex = null, ratioGroup = 0, data = null, mine = null, scope = 'baseline', metric = 'daily', selected = new Set(), aggregate = true, initialized = false, active = 'ratio', signature = '';
  const layers = { total:true, base:true, avg:true };
  const tabButtons = [...root.querySelectorAll('[data-tab]')];
  const baselineSize = () => data.members.filter(m => m.cohort === 1).length;
  const shownMembers = () => data.members.filter(m => scope === 'all' || m.cohort === 1);
  const visibleDays = () => data.daily.filter(d => !data.start || d.date >= data.start);
  // 평일 그래프는 주말 날짜를 뺀다. 주말은 주말 접속 탭, 원본은 수치 표에서 본다.
  const weekdayDays = () => visibleDays().filter(d => !isWeekend(d.date));
  const markerLabel = () => data.actualExpansion ? '신규 유입 시작' : '유입 예정일';

  function selectTab(key, focus = false) {
    const meta = tabs.find(t => t[0] === key); if (!meta) return; active = key;
    tabButtons.forEach(b => { const on = b.dataset.tab === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    root.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== key; });
    q('[data-tab-eyebrow]').textContent = meta[2]; q('[data-tab-title]').textContent = meta[3];
    if (data) paintPanel(true);
    onTab?.(key);
  }
  tabButtons.forEach((b, i) => {
    b.onclick = () => selectTab(b.dataset.tab);
    b.onkeydown = e => { let n = i; if (e.key === 'ArrowRight') n = (i + 1) % tabButtons.length; else if (e.key === 'ArrowLeft') n = (i - 1 + tabButtons.length) % tabButtons.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabButtons.length - 1; else return; e.preventDefault(); selectTab(tabButtons[n].dataset.tab, true); };
  });
  root.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => {
    const key = b.dataset.layer; layers[key] = !layers[key];
    if (!layers.total && !layers.base) layers[key === 'total' ? 'base' : 'total'] = true;
    root.querySelectorAll('[data-layer]').forEach(x => x.setAttribute('aria-pressed', String(layers[x.dataset.layer])));
    paintPanel(false);
  });

  function paintUsers(animate) {
    const members = shownMembers(), allDays = visibleDays(), days = allDays.filter(d => !isWeekend(d.date)), dates = days.map(d => d.date), lastDay = allDays.at(-1);
    const toggles = q('.experiment-toggles'); toggles.replaceChildren();
    function toggle(key, label, color, on, handler, sub = '') {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.key = key;
      const name = document.createElement('span'); name.className = 'tg-name'; name.textContent = label;
      const note = document.createElement('span'); note.className = 'tg-sub'; note.textContent = sub;
      button.append(name); button.title = sub; button.setAttribute('aria-label', `${label}, ${sub}`); button.setAttribute('aria-pressed', String(on)); button.style.setProperty('--series-color', color);
      button.onclick = () => { const index = [...toggles.children].indexOf(button); handler(); toggles.children[index]?.focus({ preventScroll:true }); };
      toggles.append(button);
    }
    toggle('sum', scope === 'baseline' ? '5명 합계' : '전체 합계', '#e9e8d9', aggregate, () => { aggregate = !aggregate; paintUsers(false); }, lastDay ? `오늘 ${fmt(scope === 'baseline' ? lastDay.baselineDaily : lastDay.totalDaily)}회 · 점선` : '점선');
    members.forEach(m => {
      const i = data.members.indexOf(m), v = lastDay && data.series.get(m.key).get(lastDay.date);
      toggle(m.key, m.name, colors[i % colors.length], selected.has(m.key), () => { if (selected.has(m.key)) selected.delete(m.key); else selected.add(m.key); paintUsers(false); }, !v || v.daily === null ? '가입 전 · 집계 대상 아님' : `오늘 ${fmt(v.daily)}회 · 누적 ${fmt(v.cumulative)}회`);
    });
    const series = members.filter(m => selected.has(m.key)).map(m => ({ key:m.key, name:m.name, color:colors[data.members.indexOf(m) % colors.length], values:dates.map(date => data.series.get(m.key).get(date)?.[metric] ?? null) }));
    if (aggregate) series.unshift({ key:'sum', name:scope === 'baseline' ? '5명 합계' : '전체 합계', color:'#e9e8d9', dashed:true, values:days.map(d => scope === 'baseline' ? (metric === 'daily' ? d.baselineDaily : d.baseline) : (metric === 'daily' ? d.totalDaily : d.total)) });
    if (active === 'users') lines(q('[data-users-plot]'), dates, series, { marker:data.expansion, markerLabel:markerLabel(), animate });
    // 목록에서 이름에 마우스를 올리거나 포커스하면 그래프에서 그 선만 강조한다.
    const highlight = key => {
      const svg = q('[data-users-plot] svg'); if (!svg) return;
      const hit = key && svg.querySelector(`.series[data-key="${key}"]`);
      svg.classList.toggle('has-series-focus', Boolean(hit));
      svg.querySelectorAll('.series').forEach(g => g.classList.toggle('is-hl', g === hit));
    };
    toggles.onpointerover = e => highlight(e.target.closest('button')?.dataset.key);
    toggles.onpointerleave = () => highlight(null);
    toggles.onfocusin = e => highlight(e.target.closest('button')?.dataset.key);
    toggles.onfocusout = e => { if (!toggles.contains(e.relatedTarget)) highlight(null); };
    root.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === scope)));
    root.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === metric)));
    const arrivals = data.members.filter(m => m.cohort !== 1 && m.joined <= data.today), future = data.members.filter(m => m.cohort !== 1 && m.joined > data.today);
    const arrivalsEl = q('[data-arrivals]');
    arrivalsEl.textContent = arrivals.length ? `신규 유입 기록: ${arrivals.map(m => `${m.joined} ${m.name}`).join(' · ')}` : `신규 사용자는 아직 없어요. ${data.expansion}에 5명 유입 예정이며 승인된 수강생은 자동으로 집계합니다.${future.length ? ' 예약된 집계 대상 ' + future.length + '명.' : ''}`;
    arrivalsEl.title = arrivalsEl.textContent;
    const head = document.createElement('tr');
    const dateHead=document.createElement('th'); dateHead.scope='col'; dateHead.textContent='날짜'; head.append(dateHead);
    const tablePanel=q('[data-panel=table]'); tablePanel.querySelector('.obs-tip')?.remove();
    const nameTip=tooltip(tablePanel);
    members.forEach(m=>{
      const th=document.createElement('th'); th.scope='col'; th.setAttribute('aria-label',m.name);
      const key=document.createElement('button'); key.type='button'; key.className='obs-member-key';
      key.setAttribute('aria-label',m.name); key.title=m.name;
      const dot=document.createElement('i'); dot.style.background=colors[data.members.indexOf(m)%colors.length]; dot.setAttribute('aria-hidden','true'); key.append(dot);
      const show=()=>{const b=key.getBoundingClientRect(),p=tablePanel.getBoundingClientRect();nameTip.at(tipHead(m.name),b.left-p.left+b.width/2,b.bottom-p.top+18);};
      key.onpointerenter=show; key.onfocus=show; key.onclick=show;
      key.onpointerleave=()=>nameTip.hide(); key.onblur=()=>nameTip.hide();
      th.append(key); head.append(th);
    });
    q('table').style.minWidth=(140+members.length*48)+'px';
    q('thead').replaceChildren(head);
    q('tbody').replaceChildren(...allDays.map(d => d.date).reverse().map(date => { const tr = document.createElement('tr'); for (const value of [date, ...members.map(m => data.series.get(m.key).get(date)?.[metric])]) { const td = document.createElement('td'); td.textContent = value == null ? '—' : typeof value === 'number' ? fmt(value) : value; if (value === 0) td.className = 'is-zero'; tr.append(td); } return tr; }));
  }
  root.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; paintUsers(false); });
  root.querySelectorAll('[data-metric]').forEach(b => b.onclick = () => { metric = b.dataset.metric; paintUsers(true); });
  q('[data-select-all]').onclick = () => { shownMembers().forEach(m => selected.add(m.key)); aggregate = true; paintUsers(false); };
  q('[data-select-none]').onclick = () => { shownMembers().forEach(m => selected.delete(m.key)); aggregate = false; paintUsers(false); };

  function paintPanel(animate) {
    if (!data) return;
    const days = visibleDays();
    if (active === 'ratio') {
      if (!A.groups.some(g => g.id === ratioGroup)) ratioGroup = 0;
      const box = q('[data-ratio-groups]'); box.replaceChildren(); box.hidden = A.groups.length < 2;
      A.groups.forEach(g => { const b = document.createElement('button'); b.type = 'button'; b.textContent = g.label; b.setAttribute('aria-pressed', String(g.id === ratioGroup)); b.onclick = () => { ratioGroup = g.id; paintPanel(true); }; box.append(b); });
      q('[data-base-label]').textContent = (A.groups.find(g => g.id === ratioGroup) ?? A.groups[0]).label;
      ratioChart(q('[data-ratio-plot]'), weekdayDays(), A, ratioGroup, layers, animate);
    }
    if (active === 'scatter') {
      const stats = scatter(q('[data-scatter-plot]'), days, A, animate), box = q('[data-scatter-stats]');
      box.replaceChildren();
      const chip = (label, value, note = '') => { const el = document.createElement('span'); el.className = 'obs-stat'; el.title = note; const s = document.createElement('small'); s.textContent = label; const b = document.createElement('b'); b.textContent = value; el.append(s, b); box.append(el); };
      if (stats) {
        chip('기울기', stats.slope === null || stats.n < 3 ? '—' : `${stats.slope >= 0 ? '+' : ''}${fmt(Math.round(stats.slope * 100) / 10)}회`, '나머지 사용자 접속이 10회 늘 때 기존 5명 접속의 평균 변화');
        chip('상관계수 r', stats.r === null || stats.n < 3 ? '—' : fmt(Math.round(stats.r * 100) / 100), '1에 가까울수록 함께 늘고, -1에 가까울수록 반대로 움직여요');
        chip('표본', `평일 ${stats.n}일${stats.n < 10 ? ' · 참고용' : ''}`, '완료된 평일 수(주말·유입 당일 제외). 10일 미만이면 우연의 영향이 커요');
      }
    }
    if (active === 'heat') heatmap(q('[data-heat]'), data.members, weekdayDays().map(d => d.date), data.series, animate);
    if (active === 'users' || active === 'table') paintUsers(animate);
    if (active === 'report') renderReport(q('[data-report]'), data, A, animate);
    if (active === 'weekend') {
      const we = A.weekend, box = q('[data-weekend-stats]'); box.replaceChildren();
      const chip = (label, value, note = '') => { const el = document.createElement('span'); el.className = 'obs-stat'; el.title = note; const s2 = document.createElement('small'); s2.textContent = label; const b = document.createElement('b'); b.textContent = value; el.append(s2, b); box.append(el); };
      chip('주말 하루 평균', we.completed ? `${fmt1(we.average)}회` : '—', '끝난 주말 날짜의 전체 접속 평균');
      chip('평일 대비', we.completed && we.weekdayAverage ? `${fmt(Math.round(we.average / we.weekdayAverage * 100))}%` : '—', '평일(유입 당일 제외) 하루 평균 접속과 비교');
      chip('주말 접속자', `${we.visitors.length}명`, we.visitors.map(m => m.name).join(', ') || '아직 없어요');
      chip('주말 누적', `${fmt(we.totalVisits)}회`, '조회 기간 안의 주말 접속 합계(오늘 포함)');
      const key = q('[data-weekend-key]'); key.replaceChildren();
      A.groups.forEach((g, k) => { const i = document.createElement('i'); i.style.background = groupColors[k % groupColors.length]; key.append(i, g.label); });
      weekendChart(q('[data-weekend-plot]'), A, data, animate);
    }
  }

  function paintTop(animate) {
    const last = data.daily.at(-1), size = baselineSize(), days = visibleDays(), c = data.comparison;
    q('[data-population]').textContent = last ? `${fmt(last.participants)}명` : '—';
    q('[data-active]').textContent = last ? `오늘 활동 ${fmt(last.active)}명 · 개발팀 제외` : '개발팀 4명 제외';
    q('[data-baseline-today]').textContent = last ? `${fmt(last.baselineDaily)}회` : '—';
    q('[data-average]').textContent = last && size ? `1인당 ${fmt(last.baselineDaily / size)}회 · 오늘 진행 중` : '기존 표본 기록 대기';
    q('[data-mine]').textContent = mine === null ? '—' : `${fmt(mine)}회`;
    q('[data-spark-population]').innerHTML = spark(days.map(d => d.participants), '#9bc6cf');
    q('[data-spark-baseline]').innerHTML = spark(days.map(d => d.baselineDaily), AMBER);
    root.querySelectorAll('.obs-kpi').forEach(card => card.classList.toggle('is-entering', animate && !reduced()));
    const g0 = A.groups[0], ref = A.groupStats(g0, A.segments[0]?.usable ?? []);
    gauge(gaugeHost, gaugeCaption, last ? last.baselineDaily : null, ref.days ? ref.total : null);
    stackBars(q('[data-bars]'), weekdayDays(), animate, data.today);
    paintCompare();
  }

  // 비교 카드: 고른 유입 차수(기본은 최근 차수)의 기존 사용자 평일 1인당 접속. 그룹이 둘 이상이면 그룹별 줄도 보여 준다.
  function paintCompare() {
    const waves = A.waves, w = waves[waveIndex ?? waves.length - 1] ?? null, tabsEl = q('[data-wave-tabs]');
    tabsEl.replaceChildren(); tabsEl.hidden = waves.length < 2;
    waves.forEach((x, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = `${x.n}차 · ${md(x.date)}`; b.setAttribute('aria-pressed', String(x === w)); b.onclick = () => { waveIndex = i; paintCompare(); }; tabsEl.append(b); });
    let before, after, title;
    if (!w) { const g0 = A.groups[0]; before = { label:'지금(유입 전)', stat:A.groupStats(g0, A.segments[0]?.usable ?? []) }; after = { label:'유입 후', stat:{ days:0, perPerson:null, total:null } }; title = `${g0.label} 1인당 하루 접속`; }
    else { before = { label:`${w.n}차 유입 전`, stat:w.all.before }; after = { label:`${w.n}차 유입 후`, stat:w.all.after }; title = `${w.all.group.label} 1인당 하루 접속`; }
    q('[data-compare-title]').textContent = title;
    const change = before.stat.days && after.stat.days ? rel(before.stat.perPerson, after.stat.perPerson) : null;
    q('[data-change-chip]').textContent = change === null ? '비교 대기' : `${pct(change)} 변화`;
    q('[data-change]').textContent = change === null ? '비교 대기' : pct(change);
    q('[data-change-note]').textContent = change === null ? (w ? `${w.n}차 뒤 완료된 평일이 필요해요` : '아직 유입 전이에요') : `${w.n}차 · 평일 1인당 · 기존 ${w.all.group.members.length}명`;
    const comparison = q('.experiment-comparison'); comparison.replaceChildren();
    const max = Math.max(.0001, before.stat.perPerson ?? 0, after.stat.perPerson ?? 0);
    for (const [side, color] of [[before, 'rgba(255,255,255,.55)'], [after, AMBER]]) {
      const item = document.createElement('div'); item.className = 'experiment-average';
      const head = document.createElement('p'); head.textContent = `${side.label} · 평일 ${side.stat.days}일`;
      const strong = document.createElement('strong'); strong.textContent = side.stat.days ? `${fmt1(side.stat.perPerson)}회 / 인` : '평일 기록 대기';
      const track = document.createElement('div'); track.className = 'experiment-track';
      const bar = document.createElement('div'); bar.className = 'experiment-bar'; bar.style.width = `${side.stat.days ? side.stat.perPerson / max * 100 : 0}%`; bar.style.background = color; track.append(bar);
      const note = document.createElement('small'); note.textContent = side.stat.days ? `그룹 전체 하루 ${fmt1(side.stat.total)}회` : side === after && w ? '유입 뒤 완료된 평일이 필요해요' : '완료된 평일이 필요해요';
      item.append(head, strong, track, note); comparison.append(item);
    }
    const rows = q('[data-breakdown]'); rows.replaceChildren();
    if (w && w.rows.length > 1) w.rows.forEach(r => {
      const row = document.createElement('div'); row.className = 'obs-break-row';
      const name = document.createElement('span'); name.textContent = r.group.label;
      const value = document.createElement('span'); value.textContent = `${r.before.days ? fmt1(r.before.perPerson) : '—'} → ${r.after.days ? fmt1(r.after.perPerson) : '—'}회 / 인`;
      const delta = document.createElement('b'); const d = r.before.days && r.after.days ? rel(r.before.perPerson, r.after.perPerson) : null; delta.textContent = pct(d); if (d !== null && d < 0) delta.className = 'is-down';
      row.append(name, value, delta); rows.append(row);
    });
  }

  const view = {
    selectTab,
    clear() { A = null; waveIndex = null; data = null; selected.clear(); initialized = false; signature = ''; gauge(gaugeHost, gaugeCaption, null, null); },
    // 처음 열 때·기간을 바꿀 때만 등장 애니메이션을 쓴다. 1분 자동 갱신은 조용히 다시 그린다.
    paint(next, myTotal) {
      data = next; mine = myTotal; A = analyzeExperiment(data);
      if (!initialized) { data.members.forEach(m => selected.add(m.key)); initialized = true; }
      const sig = `${data.daily[0]?.date}|${data.daily.length}`, animate = sig !== signature; signature = sig;
      paintTop(animate); paintPanel(animate);
    },
  };
  selectTab(active);
  return view;
}

// 원형 게이지: 오늘 기존 5명 접속. 흰 점(유입 전 하루 평균)이 눈금 가운데에 오도록 최대값을 평균의 2배로 잡는다.
function gauge(host, caption, value, reference) {
  if (!host) return;
  const r = 86, full = 2 * Math.PI * r, arc = full * .75;
  const maximum = Math.max(1, value ?? 0, (reference ?? 0) * 2), ratio = value === null ? 0 : Math.min(1, value / maximum);
  const at = t => { const angle = (135 + 270 * t) * Math.PI / 180; return [110 + r * Math.cos(angle), 110 + r * Math.sin(angle)]; };
  const ticks = Array.from({ length:41 }, (_, i) => { const a = (135 + 270 * i / 40) * Math.PI / 180, inner = i % 10 ? 104 : 100; return `<line x1="${110 + inner * Math.cos(a)}" y1="${110 + inner * Math.sin(a)}" x2="${110 + 108 * Math.cos(a)}" y2="${110 + 108 * Math.sin(a)}" stroke="#fff" stroke-opacity="${i / 40 <= ratio ? .55 : .16}" stroke-width="1.2"/>`; }).join('');
  const [mx, my] = reference ? at(Math.min(1, reference / maximum)) : [0, 0];
  host.innerHTML = `<svg viewBox="0 0 220 220" role="img" aria-label="오늘 기존 5명 접속 ${value === null ? '집계 전' : fmt(value) + '회'}">
    <defs><linearGradient id="obs-gauge-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e8963a"/><stop offset="1" stop-color="#ffd794"/></linearGradient></defs>
    ${ticks}<circle cx="110" cy="110" r="${r}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="10" stroke-linecap="round" stroke-dasharray="${arc} ${full}" transform="rotate(135 110 110)"/>
    <circle data-arc cx="110" cy="110" r="${r}" fill="none" stroke="url(#obs-gauge-grad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${Math.max(.01, arc * ratio)} ${full}" transform="rotate(135 110 110)"/>
    ${reference ? `<circle cx="${mx}" cy="${my}" r="4" fill="#fff"/>` : ''}
    <text class="g-label" x="110" y="78" text-anchor="middle">오늘 기존 5명</text>
    <text x="110" y="128" text-anchor="middle"><tspan class="g-value">${value === null ? '—' : fmt(value)}</tspan><tspan class="g-unit" dx="3">회</tspan></text>
    <text class="g-label" x="110" y="160" text-anchor="middle">접속 · 진행 중</text></svg>`;
  if (caption) caption.textContent = reference === null ? '유입 전 평균 집계 대기' : `흰 점 = 유입 전 하루 평균 ${fmt(reference)}회`;
}
