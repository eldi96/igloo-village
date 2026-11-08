// 등대 왼쪽 벽 액자를 누르면 여는 업로드 현황 대시보드(강사·자료 담당 전용).
// 맥 창 모양 + 연한 파스텔. 최근 프로젝트·활약도·리액션별 프로젝트는 실제 데이터,
// 강의실 좌석·면담 요청은 아직 DB가 없어 예시 화면(배지로 표시)이다.
const css = `
.ldb { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 40px 32px;
  background: rgba(84, 62, 54, .34); backdrop-filter: blur(12px) saturate(.8); opacity: 0; transition: opacity .22s cubic-bezier(.23,1,.32,1);
  --ink:#33393f; --sub:#8a7f78; --faint:#d8d0ca; --line:rgba(120,100,90,.08);
  --peach:#f6c9b0; --peach2:#fbe3d6; --blush:#f3c4c8; --blush2:#fae3e4; --mint:#b5ddd3; --mint2:#e0f1ec;
  --butter:#f6e0a8; --butter2:#fbf0d6; --lilac:#d7cdea; --base:#dcb497;
  --up: 0 22px 34px -14px rgba(38,48,52,.45), 0 6px 12px -4px rgba(38,48,52,.18);
  --up-s: 0 10px 18px -8px rgba(38,48,52,.42), 0 2px 5px rgba(38,48,52,.12);
  --up-xs: 0 4px 8px -3px rgba(38,48,52,.4), 0 1px 2px rgba(38,48,52,.12);
  --in: inset 0 4px 10px rgba(38,48,52,.22), inset 0 1px 2px rgba(38,48,52,.12);
  --in-s: inset 0 2px 6px rgba(38,48,52,.2);
  font-family: Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: var(--ink); }
.ldb, .ldb * { box-sizing: border-box; }
.ldb.is-in { opacity: 1; }
.ldb[hidden], .ldb [hidden] { display: none !important; }
.ldb :where(button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.ldb-win { width: min(1240px, 100%); height: min(760px, 100%); border-radius: 26px; overflow: hidden;
  background: linear-gradient(160deg, #e2bea2 0%, #d8ae8f 55%, #cfa383 100%);
  box-shadow: 0 60px 100px -36px rgba(30,38,42,.65), 0 0 0 1px rgba(255,255,255,.25) inset;
  display: grid; grid-template-rows: 54px 1fr; transform: translateY(14px) scale(.985);
  transition: transform .26s cubic-bezier(.23,1,.32,1); }
.ldb.is-in .ldb-win { transform: none; }
.ldb-bar { display: flex; align-items: center; gap: 14px; padding: 0 22px; }
.ldb-lights { display: flex; gap: 7px; }
.ldb-lights i, .ldb-lights button { width: 13px; height: 13px; border-radius: 50%; display: block; box-shadow: var(--up-xs); }
.ldb-lights button { background: #f4a9a0; position: relative; transition: transform .16s ease-out; }
.ldb-lights button:active { transform: scale(.85); }
.ldb-lights button::after { content: '×'; position: absolute; inset: 0; display: grid; place-items: center; font-size: 10px; line-height: 1; color: rgba(110,40,30,.7); opacity: 0; transition: opacity .15s; }
.ldb-lights:hover button::after, .ldb-lights button:focus-visible::after { opacity: 1; }
.ldb-lights i:nth-of-type(1) { background: #f3d39a; } .ldb-lights i:nth-of-type(2) { background: #aed8c4; }
.ldb-bar b { font-size: 12.5px; font-weight: 600; margin-left: 4px; color: #3b2f28; }
.ldb-bar > span { font-size: 11.5px; color: rgba(59,47,40,.6); }
.ldb-seg { margin-left: auto; display: flex; gap: 2px; padding: 4px; border-radius: 999px; background: rgba(59,47,40,.12); box-shadow: var(--in-s); }
.ldb-seg button { color: rgba(59,47,40,.7) !important; font-size: 11px; padding: 5px 14px; border-radius: 999px; color: var(--sub); transition: background .18s, color .18s, transform .12s ease-out; }
.ldb-seg button:active { transform: scale(.96); }
.ldb-seg button.is-on { color: #fff !important; background: #3b4249; color: #fff; box-shadow: var(--up-xs); }
.ldb-grid { display: grid; grid-template-columns: 1fr 1.28fr .92fr; grid-template-rows: 1fr 1.12fr; gap: 26px; padding: 8px 28px 30px; min-height: 0;
  grid-template-areas: "recent act req" "seats react req"; }
.ldb-a-recent { grid-area: recent; --panel: #f0e3d4; } .ldb-a-act { grid-area: act; --panel: #ebeae7; } .ldb-req { grid-area: req; --panel: #e9c9ab; }
.ldb-a-seats { grid-area: seats; --panel: #95d1c5; } .ldb-a-react { grid-area: react; --panel: #ebeae7; }
.ldb-a-seats .ldb-sub, .ldb-a-seats .ldb-front { color: #2f6f63; }
.ldb-a-seats .ldb-s { background: #f4fbf9; color: #3c8a7b; }
.ldb-a-seats .ldb-desk { background: rgba(47,111,99,.14); }
.ldb-card { border-radius: 22px; background: var(--panel, #ebeae7); --base: var(--panel, #ebeae7); padding: 20px 22px; display: flex; flex-direction: column; min-height: 0; position: relative;
  box-shadow: var(--up); }
.ldb-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ldb-head h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.02em; }
.ldb-head small { font-size: 11px; color: var(--sub); font-variant-numeric: tabular-nums; }
.ldb-sub { margin: 3px 0 0; font-size: 11px; color: var(--sub); }
.ldb-demo { font-size: 10px !important; padding: 3px 9px; border-radius: 999px; background: #fbf6f0; color: #b0703e !important; box-shadow: var(--up-xs); }
.ldb-empty { margin: auto; font-size: 12px; color: var(--sub); text-align: center; line-height: 1.6; }
/* 최근 프로젝트 */
.ldb-proj { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; padding: 4px 8px 14px; margin-left: -8px; margin-right: -8px; overflow: hidden; flex: 1; min-height: 0; -webkit-mask-image: linear-gradient(#000 80%, transparent); mask-image: linear-gradient(#000 80%, transparent); }
.ldb-p { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 8px 10px; flex: none; background: #fbf6f0; box-shadow: var(--up-s); border-radius: 12px; text-align: left; transition: background .18s, transform .12s ease-out; }
.ldb-p:first-child { background: #e0875a; color: #fff; }
.ldb-p:first-child em, .ldb-p:first-child time { color: rgba(255,255,255,.8); }
.ldb-p:active { box-shadow: var(--in-s); }
.ldb-p:active { transform: scale(.98); }
.ldb-th { width: 34px; height: 34px; border-radius: 10px; box-shadow: var(--up-xs); background-size: cover; background-position: center; }
.ldb-p b { font-size: 12.5px; font-weight: 600; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ldb-p em { font-style: normal; font-size: 11px; color: var(--sub); }
.ldb-p time { font-size: 10.5px; color: var(--sub); font-variant-numeric: tabular-nums; }
/* 활약도 */
.ldb-legend { display: flex; gap: 14px; margin-top: 12px; font-size: 11px; color: var(--sub); }
.ldb-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; box-shadow: var(--up-xs); }
.ldb-legend b { color: var(--ink); font-weight: 600; margin-left: 4px; font-variant-numeric: tabular-nums; }
.ldb-chart { flex: 1; position: relative; margin-top: 10px; min-height: 80px; border-radius: 16px; background: #f7f6f3; box-shadow: var(--in); overflow: hidden; }
.ldb-chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ldb-chart .ldb-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ldb-draw .7s cubic-bezier(.23,1,.32,1) forwards; }
.ldb-chart .ldb-fill { opacity: 0; transform: translateY(10px); animation: ldb-rise .55s cubic-bezier(.23,1,.32,1) forwards; }
@keyframes ldb-rise { to { opacity: 1; transform: none; } }
@keyframes ldb-draw { to { stroke-dashoffset: 0; } }
@keyframes ldb-fade { to { opacity: 1; } }
.ldb-tip { position: absolute; top: 2px; background: #fff; border-radius: 10px; padding: 7px 10px; font-size: 10.5px; line-height: 1.6; pointer-events: none; white-space: nowrap;
  box-shadow: 0 6px 16px -8px rgba(150,110,95,.55); font-variant-numeric: tabular-nums; }
.ldb-tip span { color: var(--sub); }
.ldb-xl { display: flex; justify-content: space-between; font-size: 10px; color: var(--sub); margin-top: 6px; font-variant-numeric: tabular-nums; }
/* 리액션별 프로젝트 */
.ldb-dwrap { flex: 1; display: flex; gap: 20px; align-items: center; margin-top: 8px; min-height: 0; overflow: hidden; }
.ldb-donut { width: clamp(130px, 13vw, 180px); aspect-ratio: 100 / 85; position: relative; flex: none; }
.ldb-slice { transition: transform .25s cubic-bezier(.23,1,.32,1), opacity .15s; }
.ldb-slice.is-hot { transform: translate(var(--dx), var(--dy)); }
.ldb-donut svg { width: 100%; height: 100%; overflow: visible; }
.ldb-donut div { position: absolute; inset: 0 0 16% 0; z-index: 1; pointer-events: none; display: grid; place-content: center; text-align: center; }
.ldb-donut b { font-size: 20px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.ldb-donut small { font-size: 10.5px; color: var(--sub); }
.ldb-rlist { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; max-height: 100%; overflow: hidden; }
.ldb-r { display: grid; grid-template-columns: 8px minmax(0,1fr) auto; gap: 10px; align-items: center; font-size: 12px; text-align: left; border-radius: 8px; transition: opacity .15s; }
.ldb-r > i { width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff 0, var(--c) 55%, color-mix(in srgb, var(--c) 75%, #7a4e3e) 100%); box-shadow: 1px 2px 3px rgba(62,74,76,.35); }
.ldb-r span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ldb-r p { margin: 1px 0 0; font-size: 10.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ldb-r b { font-variant-numeric: tabular-nums; font-weight: 600; }
.ldb-rlist.is-dim .ldb-r:not(.is-hot) { opacity: .4; }
/* 강의실 좌석 */
.ldb-seats { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; margin-top: 8px; }
.ldb-front { align-self: center; font-size: 10px; color: var(--sub); padding: 4px 22px; border-radius: 999px; box-shadow: var(--in-s); margin-bottom: 4px; letter-spacing: .1em; }
.ldb-rows { display: grid; grid-template-columns: 3fr 4fr; gap: 7px 22px; }
.ldb-desk { display: grid; gap: 5px; padding: 5px; border-radius: 12px; background: rgba(38,48,52,.06); box-shadow: var(--in-s); }
.ldb-desk.l { grid-template-columns: repeat(3,1fr); } .ldb-desk.r { grid-template-columns: repeat(4,1fr); }
.ldb-s { height: 26px; border-radius: 8px; background: #fbf6f0; display: grid; place-items: center; font-size: 9.5px; color: var(--sub); font-variant-numeric: tabular-nums; box-shadow: var(--up-xs); }
/* 면담 요청 */

.ldb-tabs { display: flex; gap: 4px; margin-top: 14px; padding: 4px; border-radius: 999px; background: rgba(59,47,40,.1); box-shadow: var(--in-s); align-self: flex-start; }
.ldb-tabs button { font-size: 11px; padding: 5px 11px; border-radius: 999px; color: #7a6555; transition: box-shadow .18s, color .18s, transform .12s ease-out; }
.ldb-tabs button:active { transform: scale(.96); }
.ldb-tabs button.is-on { background: #3b4249; color: #fff; box-shadow: var(--up-xs); }
.ldb-rq { display: flex; flex-direction: column; gap: 14px; margin: 12px -10px 0; padding: 6px 10px 16px; overflow: auto; min-height: 0; }
.ldb-q { padding: 13px 15px; border-radius: 16px; background: #fbf4ec; box-shadow: var(--up-s); }
.ldb-q .top { display: flex; align-items: center; gap: 10px; }
.ldb-av { width: 28px; height: 28px; border-radius: 50%; box-shadow: var(--up-xs); display: grid; place-items: center; font-size: 11px; font-weight: 600; color: #7a6a60; flex: none; }
.ldb-q b { font-size: 12.5px; font-weight: 600; }
.ldb-kind { margin-left: auto; font-size: 10px; padding: 3px 8px; border-radius: 999px; }
.ldb-k1 { background: #d3ece6; color: #2f8a79; } .ldb-k2 { background: #f6ddd0; color: #c0663a; }
.ldb-q p { margin: 8px 0 0; font-size: 11.5px; color: #7e746e; line-height: 1.5; }
.ldb-q .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 9px; font-size: 10.5px; color: var(--sub); }
.ldb-q .foot span { padding: 5px 12px; border-radius: 999px; background: #3b4249; color: #fff; box-shadow: var(--up-xs); }
.ldb-q.is-done { opacity: .55; }
.ldb-q.is-done .foot span { background: none; color: var(--sub); padding: 0; box-shadow: none; }
.ldb-q.is-done { box-shadow: none; background: rgba(251,244,236,.5); }
.ldb-note { position: absolute; inset: 0; display: grid; place-items: center; font-size: 13px; color: var(--sub); }
@media (hover: hover) and (pointer: fine) {
  .ldb-p:hover { box-shadow: 7px 8px 16px rgba(62,74,76,.3), -5px -5px 12px rgba(255,255,255,.95); }
  .ldb-seg button:not(.is-on):hover, .ldb-tabs button:not(.is-on):hover { color: var(--ink); }
}
@media (max-width: 980px) {
  .ldb { padding: 12px; }
  .ldb-win { height: 100%; }
  .ldb-grid { grid-template-columns: 1fr; grid-template-rows: none; overflow: auto; }
  .ldb-grid { grid-template-areas: none; } .ldb-grid > * { grid-area: auto !important; }
  .ldb-card { min-height: 260px; }
  .ldb-bar > span { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ldb, .ldb-win, .ldb-slice { transition: none; }
  .ldb-chart .ldb-draw, .ldb-chart .ldb-fill { animation: none; stroke-dashoffset: 0; opacity: 1; }
}`;

const SERIES = [
  { key: 'uploads', label: '업로드', line: '#2f353b', fill: '#3b4249' },
  { key: 'comments', label: '댓글', line: '#c86d40', fill: '#e0875a' },
  { key: 'reactions', label: '리액션', line: '#3c9887', fill: '#4fb0a0' }
];
const DONUT = ['#e0875a', '#4fb0a0', '#3b4249', '#e8c39a', '#9fd6c8', '#d6c8ba'];
const THUMBS = ['linear-gradient(135deg,#eea47c,#d0703f)', 'linear-gradient(135deg,#6cc4b4,#3c9887)', 'linear-gradient(135deg,#f0d1ad,#d9a774)', 'linear-gradient(135deg,#59626a,#2f353b)'];
const PERIODS = [{ id: '7', label: '7일', days: 7 }, { id: '30', label: '30일', days: 30 }, { id: 'all', label: '전체', days: null }];
// 예시(면담 요청 DB가 생기면 교체).
const DEMO_REQUESTS = [
  { name: '윤채원', kind: 1, text: '챗봇 배포가 자꾸 실패해요. 구조를 같이 봐 주실 수 있을까요?', when: '오늘 10:24' },
  { name: '강민호', kind: 2, text: '진로 상담을 받고 싶어요.', when: '어제' },
  { name: '오세린', kind: 1, text: '포트폴리오 주제를 정하는 중인데 의견 부탁드려요.', when: '11월 6일' },
  { name: '서지훈', kind: 2, text: '11월 7일 오후 3시 면담 완료', when: '11월 5일', done: true }
];
const AV = ['var(--peach2)', 'var(--blush2)', 'var(--mint2)', 'var(--butter2)'];

const shade = (hex, t) => {   // t>0 밝게(흰색 쪽), t<0 어둡게(갈색 그림자 쪽)
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const to = t > 0 ? [255, 255, 255] : [40, 48, 52], k = Math.abs(t);
  return '#' + c.map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const DAY = 86400000;
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const md = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
export function ago(iso, now = Date.now()) {
  const diff = now - Date.parse(iso);
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))}분 전`;
  if (diff < DAY) return `${Math.round(diff / 3600000)}시간 전`;
  const days = Math.round((startOfDay(now) - startOfDay(Date.parse(iso))) / DAY);
  if (days <= 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return md(Date.parse(iso));
}

// 기간에 맞게 칸을 나눈다. 7·30일은 하루씩, 전체는 일주일씩(최대 26칸).
export function buildBuckets(data, days, now = Date.now()) {
  const today = startOfDay(now);
  let start, step;
  if (days) { start = today - (days - 1) * DAY; step = DAY; }
  else {
    const times = [...data.projects, ...data.comments, ...data.reactions].map(r => Date.parse(r.created_at)).filter(Number.isFinite);
    const first = times.length ? startOfDay(Math.min(...times)) : today - 6 * DAY;
    step = 7 * DAY;
    const weeks = Math.min(26, Math.max(2, Math.ceil((today - first + DAY) / step)));
    start = today + DAY - weeks * step;
  }
  const n = Math.round((today + DAY - start) / step);
  const buckets = Array.from({ length: n }, (_, i) => ({ t: start + i * step, uploads: 0, comments: 0, reactions: 0 }));
  const put = (rows, key) => rows.forEach(r => {
    const i = Math.floor((Date.parse(r.created_at) - start) / step);
    if (i >= 0 && i < n) buckets[i][key]++;
  });
  put(data.projects, 'uploads'); put(data.comments, 'comments'); put(data.reactions, 'reactions');
  return { buckets, step };
}

// 리액션이 많은 프로젝트 5개 + 나머지는 '기타'.
export function reactionSlices(reactions, projects, top = 5) {
  const byId = new Map();
  reactions.forEach(r => {
    const s = byId.get(r.project_id) || { id: r.project_id, total: 0, like: 0, heart: 0 };
    s.total++; if (r.emoji === '❤️') s.heart++; else s.like++;
    byId.set(r.project_id, s);
  });
  const titles = new Map(projects.map(p => [p.id, p]));
  const sorted = [...byId.values()].sort((a, b) => b.total - a.total);
  const slices = sorted.slice(0, top).map(s => ({ ...s, project: titles.get(s.id) || null }));
  const rest = sorted.slice(top);
  if (rest.length) slices.push({ id: 'rest', total: rest.reduce((a, s) => a + s.total, 0), like: rest.reduce((a, s) => a + s.like, 0), heart: rest.reduce((a, s) => a + s.heart, 0), project: null, count: rest.length });
  return slices;
}

// 부드러운 곡선(Catmull-Rom → 베지어).
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const k = 4.5, c1 = [p1[0] + (p2[0] - p0[0]) / k, p1[1] + (p2[1] - p0[1]) / k];
    const c2 = [p2[0] - (p3[0] - p1[0]) / k, p2[1] - (p3[1] - p1[1]) / k];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function createLighthouseDashboard({ backend, getOwner, onGoProject, onOpen, onClose }) {
  if (!document.getElementById('ldb-style')) {
    const style = document.createElement('style'); style.id = 'ldb-style'; style.textContent = css; document.head.append(style);
  }
  const veil = document.createElement('div');
  veil.className = 'ldb'; veil.hidden = true;
  veil.innerHTML = `
    <div class="ldb-win" role="dialog" aria-modal="true" aria-labelledby="ldb-title">
      <div class="ldb-bar">
        <div class="ldb-lights"><button type="button" data-act="close" aria-label="닫기"></button><i></i><i></i></div>
        <b id="ldb-title">업로드 현황</b><span>등대 · 강사 전용</span>
        <div class="ldb-seg" role="group" aria-label="기간">${PERIODS.map(p => `<button type="button" data-period="${p.id}">${p.label}</button>`).join('')}</div>
      </div>
      <div class="ldb-grid">
        <section class="ldb-card ldb-a-recent"><div class="ldb-head"><h2>최근 프로젝트</h2><small data-out="recent-n"></small></div><p class="ldb-sub">새로 올라온 순</p><div class="ldb-proj" data-out="recent"></div></section>
        <section class="ldb-card ldb-a-act"><div class="ldb-head"><h2>활약도</h2><small data-out="range"></small></div><p class="ldb-sub">업로드 · 댓글 · 리액션</p><div class="ldb-legend" data-out="legend"></div><div class="ldb-chart" data-out="chart"></div><div class="ldb-xl" data-out="xl"></div></section>
        <section class="ldb-card ldb-req"><div class="ldb-head"><h2>면담 요청</h2><small class="ldb-demo">예시</small></div><p class="ldb-sub">프로젝트 · 개인 면담</p>
          <div class="ldb-tabs" role="group" aria-label="면담 종류"><button type="button" data-req="all" class="is-on">전체</button><button type="button" data-req="1">프로젝트</button><button type="button" data-req="2">개인</button></div>
          <div class="ldb-rq" data-out="req"></div></section>
        <section class="ldb-card ldb-a-seats"><div class="ldb-head"><h2>강의실</h2><small class="ldb-demo">계정 연결 예정</small></div><p class="ldb-sub">자리를 누르면 그 이글루로</p>
          <div class="ldb-seats"><span class="ldb-front">앞</span><div class="ldb-rows" data-out="seats"></div></div></section>
        <section class="ldb-card ldb-a-react"><div class="ldb-head"><h2>리액션별 프로젝트</h2><small data-out="r-n"></small></div><p class="ldb-sub">리액션이 많은 프로젝트</p><div class="ldb-dwrap" data-out="donut"></div></section>
      </div>
      <p class="ldb-note" data-out="note" hidden></p>
    </div>`;
  document.body.append(veil);
  const $ = name => veil.querySelector(`[data-out="${name}"]`);
  let open = false, period = '7', reqFilter = 'all', data = null, loadId = 0, buckets = [];

  // 강의실: 보내 준 배치도대로 왼쪽 3석·오른쪽 4석 책상 5줄(35석). 좌석 번호만, 계정은 나중에 연결.
  $('seats').innerHTML = Array.from({ length: 5 }, (_, row) => {
    const base = row * 7;
    const seat = n => `<i class="ldb-s">${n}</i>`;
    return `<div class="ldb-desk l">${[1, 2, 3].map(i => seat(base + i)).join('')}</div><div class="ldb-desk r">${[4, 5, 6, 7].map(i => seat(base + i)).join('')}</div>`;
  }).join('');

  function renderRequests() {
    const list = DEMO_REQUESTS.filter(r => reqFilter === 'all' || String(r.kind) === reqFilter);
    $('req').innerHTML = list.map((r, i) => `<div class="ldb-q${r.done ? ' is-done' : ''}"><div class="top"><div class="ldb-av" style="background:${AV[i % AV.length]}">${esc(r.name[0])}</div><b>${esc(r.name)}</b><span class="ldb-kind ldb-k${r.kind}">${r.kind === 1 ? '프로젝트' : '개인'}</span></div><p>${esc(r.text)}</p><div class="foot"><time>${esc(r.when)}</time><span>${r.done ? '완료' : '시간 잡기'}</span></div></div>`).join('');
    veil.querySelectorAll('[data-req]').forEach(b => { const on = b.dataset.req === reqFilter; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  }

  function renderRecent() {
    const rows = data.recent;
    $('recent-n').textContent = rows.length ? `전체 ${data.projects.length}개` : '';
    if (!rows.length) { $('recent').innerHTML = '<p class="ldb-empty">아직 올라온 프로젝트가 없어요</p>'; return; }
    $('recent').innerHTML = rows.map((p, i) => {
      const owner = getOwner(p.igloo_id)?.owner || '';
      const bg = p.image_url ? `url('${encodeURI(p.image_url)}')` : THUMBS[i % THUMBS.length];
      return `<button type="button" class="ldb-p" data-go="${esc(p.id)}" data-igloo="${esc(p.igloo_id)}"><span class="ldb-th" style="background-image:${bg}"></span><span><b>${esc(p.title)}</b><em>${esc(owner)}</em></span><time datetime="${esc(p.created_at)}">${ago(p.created_at)}</time></button>`;
    }).join('');
  }

  function renderChart(animate) {
    const days = PERIODS.find(p => p.id === period).days;
    const since = days ? startOfDay(Date.now()) - (days - 1) * DAY : -Infinity;
    const inRange = rows => rows.filter(r => Date.parse(r.created_at) >= since);
    const scoped = { projects: inRange(data.projects), comments: data.comments, reactions: data.reactions };
    ({ buckets } = buildBuckets(scoped, days));
    const total = key => buckets.reduce((a, b) => a + b[key], 0);
    $('legend').innerHTML = SERIES.map(s => `<span><i style="background:radial-gradient(circle at 35% 30%, #fff 0, ${s.fill} 55%, ${s.line} 100%)"></i>${s.label}<b>${total(s.key)}</b></span>`).join('');
    $('range').textContent = buckets.length ? `${md(buckets[0].t)} – 오늘` : '';
    const box = $('chart'), W = box.clientWidth || 460, H = box.clientHeight || 150, pad = 8;
    const max = Math.max(1, ...buckets.flatMap(b => SERIES.map(s => b[s.key])));
    const x = i => buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W;
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const fill = animate ? ' ldb-fill' : '';
    const grid = [0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" stroke="rgba(120,100,90,.07)"/>`).join('');
    // 큰 값(리액션)을 뒤에, 작은 값(업로드)을 앞에 깐다.
    const layers = [...SERIES].reverse().map(s => {
      const pts = buckets.map((b, i) => [x(i), y(b[s.key])]);
      const line = smooth(pts);
      return `<defs><linearGradient id="ldb-g-${s.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(s.fill, .35)}"/><stop offset=".35" stop-color="${s.fill}"/><stop offset="1" stop-color="${shade(s.fill, -.1)}"/></linearGradient></defs>
        <path class="${fill}" d="${line} L${W} ${H} L0 ${H}Z" fill="url(#ldb-g-${s.key})" filter="url(#ldb-ash)"/>
        <path class="${fill}" d="${line}" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.6" stroke-linecap="round"/>`;
    }).join('');
    const shadowDef = `<defs><filter id="ldb-ash" x="-5%" y="-30%" width="110%" height="160%"><feDropShadow dx="0" dy="-4" stdDeviation="5" flood-color="#3e4a4c" flood-opacity=".3"/></filter></defs>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${shadowDef}${grid}${layers}<g data-out="cursor" opacity="0"><line y1="0" y2="${H}" stroke="rgba(74,69,66,.2)" stroke-dasharray="3 3"/>${SERIES.map(s => `<circle r="4" fill="#fff" stroke="${s.line}" stroke-width="2" data-k="${s.key}"/>`).join('')}</g></svg><div class="ldb-tip" hidden></div>`;
    box.dataset.w = W; box.dataset.h = H; box.dataset.max = max;
    const labels = buckets.length <= 7 ? buckets : buckets.filter((_, i) => i % Math.ceil(buckets.length / 6) === 0);
    $('xl').innerHTML = labels.map((b, i) => `<span>${b === buckets[buckets.length - 1] && days ? '오늘' : md(b.t)}</span>`).join('');
  }

  function moveCursor(event) {
    const box = $('chart'); if (!buckets.length) return;
    const rect = box.getBoundingClientRect(), W = +box.dataset.w, H = +box.dataset.h, max = +box.dataset.max, pad = 8;
    const i = Math.max(0, Math.min(buckets.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (buckets.length - 1))));
    const b = buckets[i], cx = buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W;
    const g = box.querySelector('[data-out="cursor"]'); g.setAttribute('opacity', 1);
    g.querySelector('line').setAttribute('x1', cx); g.querySelector('line').setAttribute('x2', cx);
    g.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', cx); c.setAttribute('cy', H - pad - (b[c.dataset.k] / max) * (H - pad * 2)); });
    const tip = box.querySelector('.ldb-tip'); tip.hidden = false;
    const step = PERIODS.find(p => p.id === period).days ? '' : ' 주';
    tip.innerHTML = `<b>${md(b.t)}${step}</b><br><span>업로드 ${b.uploads} · 댓글 ${b.comments} · 리액션 ${b.reactions}</span>`;
    const left = (cx / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, left + (left > rect.width / 2 ? -tip.offsetWidth - 12 : 12)))}px`;
  }
  function hideCursor() {
    const box = $('chart'); box.querySelector('[data-out="cursor"]')?.setAttribute('opacity', 0);
    const tip = box.querySelector('.ldb-tip'); if (tip) tip.hidden = true;
  }

  function renderDonut() {
    const slices = reactionSlices(data.reactions, data.projects);
    const total = slices.reduce((a, s) => a + s.total, 0);
    $('r-n').textContent = total ? `리액션 ${total}개` : '';
    if (!total) { $('donut').innerHTML = '<p class="ldb-empty">이 기간에는 리액션이 없어요</p>'; return; }
    const C = 50, RO = 42, RI = 20, GAP = slices.length > 1 ? 0.03 : 0, DEPTH = 9, TILT = 0.74;
    const pt = (r, a) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
    const arc = (a0, a1) => {
      if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M${pt(RO, -Math.PI / 2)} A${RO} ${RO} 0 1 1 ${pt(RO, Math.PI * 1.5 - 1e-3)} Z M${pt(RI, -Math.PI / 2)} A${RI} ${RI} 0 1 0 ${pt(RI, Math.PI * 1.5 - 1e-3)} Z`;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      return `M${pt(RO, a0)} A${RO} ${RO} 0 ${big} 1 ${pt(RO, a1)} L${pt(RI, a1)} A${RI} ${RI} 0 ${big} 0 ${pt(RI, a0)} Z`;
    };
    let a = -Math.PI / 2;
    const defs = [], sides = [], tops = [];
    slices.forEach((s, i) => {
      const span = (s.total / total) * Math.PI * 2, a0 = a + GAP / 2, a1 = a + span - GAP / 2, mid = a + span / 2;
      a += span;
      const col = DONUT[i];
      defs.push(`<linearGradient id="ldb-dg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(col, .38)}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, -.12)}"/></linearGradient>`);
      const d = arc(a0, Math.max(a0 + 0.01, a1));
      const dx = (Math.cos(mid) * 3).toFixed(2), dy = (Math.sin(mid) * 3).toFixed(2);
      const wall = Array.from({ length: DEPTH }, (_, k) => `<path d="${d}" fill="${shade(col, -.18 - (DEPTH - k) * .025)}" transform="translate(0 ${DEPTH - k})"/>`).join('');
      sides.push(`<g class="ldb-slice" data-i="${i}" style="--dx:${dx}px;--dy:${(dy * TILT).toFixed(2)}px">${wall}</g>`);
      tops.push(`<g class="ldb-slice" data-i="${i}" style="--dx:${dx}px;--dy:${dy}px"><path d="${d}" fill="url(#ldb-dg${i})" stroke="rgba(255,255,255,.55)" stroke-width=".6"/></g>`);
    });
    const legend = slices.map((s, i) => {
      const name = s.id === 'rest' ? `기타 ${s.count}개` : (s.project?.title || '볼 수 없는 프로젝트');
      const owner = s.id === 'rest' || !s.project ? '' : (getOwner(s.project.igloo_id)?.owner || '');
      return `<div class="ldb-r" data-i="${i}"><i style="--c:${DONUT[i]}"></i><div><span>${esc(name)}</span><p>${owner ? `${esc(owner)} · ` : ''}👍 ${s.like} · ❤️ ${s.heart}</p></div><b>${s.total}</b></div>`;
    }).join('');
    const tilt = `translate(0 ${C}) scale(1 ${TILT}) translate(0 ${-C})`;
    $('donut').innerHTML = `<div class="ldb-donut"><svg viewBox="0 ${C - RO * TILT - 4} 100 ${RO * TILT * 2 + DEPTH + 14}" aria-hidden="true"><defs>${defs.join('')}
      <filter id="ldb-dsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="2" dy="7" stdDeviation="4.5" flood-color="#3e4a4c" flood-opacity=".32"/></filter>
      <radialGradient id="ldb-gloss" cx=".32" cy=".26" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="ldb-hole" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#f6e9e3"/><stop offset=".8" stop-color="#ecdad2"/><stop offset="1" stop-color="#dcc3b8"/></radialGradient></defs>
      <g filter="url(#ldb-dsh)"><g transform="${tilt}">${sides.join('')}</g><g transform="${tilt}">${tops.join('')}</g></g>
      <g transform="${tilt}" pointer-events="none"><circle cx="${C}" cy="${C}" r="${RO}" fill="url(#ldb-gloss)"/>
      <circle cx="${C}" cy="${C}" r="${RI - .5}" fill="url(#ldb-hole)"/></g></svg>
      <div><b>${total}</b><small>리액션</small></div></div><div class="ldb-rlist">${legend}</div>`;
  }

  function hotSlice(i) {
    const list = $('donut').querySelector('.ldb-rlist'); if (!list) return;
    list.classList.toggle('is-dim', i !== null);
    list.querySelectorAll('.ldb-r').forEach(r => r.classList.toggle('is-hot', r.dataset.i === String(i)));
    $('donut').querySelectorAll('.ldb-slice').forEach(g => { const on = g.dataset.i === String(i); g.classList.toggle('is-hot', on); g.style.opacity = i === null || on ? 1 : 0.45; });
  }

  function setNote(text) { const n = $('note'); n.textContent = text; n.hidden = !text; veil.querySelector('.ldb-grid').style.visibility = text ? 'hidden' : ''; }

  async function load(animate = true) {
    const id = ++loadId;
    veil.querySelectorAll('[data-period]').forEach(b => { const on = b.dataset.period === period; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    const days = PERIODS.find(p => p.id === period).days;
    const since = days ? new Date(startOfDay(Date.now()) - (days - 1) * DAY).toISOString() : null;
    try {
      const next = await backend.getDashboardData(since);
      if (id !== loadId || !open) return;
      data = next; setNote('');
      renderRecent(); renderChart(animate); renderDonut();
    } catch (error) {
      if (id !== loadId) return;
      console.warn('업로드 현황을 불러오지 못했어요:', error?.message);
      setNote('업로드 현황을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.');
    }
  }

  async function openDashboard() {
    if (open) return;
    open = true; veil.hidden = false; onOpen?.();
    requestAnimationFrame(() => veil.classList.add('is-in'));
    renderRequests();
    setNote('불러오는 중이에요');
    const allowed = await backend.canEditMaterials();
    if (!open) return;
    if (!allowed) { setNote('업로드 현황은 강사만 볼 수 있어요.'); return; }
    load(true);
    veil.querySelector('[data-act="close"]').focus({ preventScroll: true });
  }
  function close() {
    if (!open) return;
    open = false; loadId++;
    veil.classList.remove('is-in');
    setTimeout(() => { if (!open) veil.hidden = true; }, 230);
    onClose?.();
  }

  veil.addEventListener('click', event => {
    if (event.target === veil) { close(); return; }
    const t = event.target.closest('button'); if (!t) return;
    if (t.dataset.act === 'close') close();
    else if (t.dataset.period && t.dataset.period !== period) { period = t.dataset.period; load(true); }
    else if (t.dataset.req) { reqFilter = t.dataset.req; renderRequests(); }
    else if (t.dataset.go) { const go = { igloo: t.dataset.igloo, project: t.dataset.go }; close(); onGoProject?.(go.igloo, go.project); }
  });
  const chartBox = $('chart');
  chartBox.addEventListener('pointermove', moveCursor);
  chartBox.addEventListener('pointerleave', hideCursor);
  $('donut').addEventListener('pointerover', e => { const el = e.target.closest('[data-i]'); hotSlice(el ? Number(el.dataset.i) : null); });
  $('donut').addEventListener('pointerleave', () => hotSlice(null));
  window.addEventListener('keydown', event => { if (open && event.key === 'Escape') { event.stopPropagation(); close(); } }, true);
  window.addEventListener('resize', () => { if (open && data) renderChart(false); });

  return { open: openDashboard, close, isOpen: () => open };
}
