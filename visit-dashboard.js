import { normalizeExperiment, visitNumber } from './visit-data.js';
import { mountExperimentView } from './visit-experiment-view.js?v=legible1';

export function createVisitDashboard(backend, { getMember, onExit }) {
  const style = document.createElement('style');
  style.textContent = `
    .observatory[hidden] { display:none; }
    .observatory,.observatory *,.observatory *::before,.observatory *::after { box-sizing:border-box; }
    .observatory {
      --text:#fbf6ee; --muted:rgba(251,246,238,.64); --faint:rgba(251,246,238,.42);
      --amber:#f5b85c; --amber-soft:rgba(245,184,92,.18); --line:rgba(255,255,255,.18); --line-soft:rgba(255,255,255,.1);
      --card:linear-gradient(150deg,rgba(46,33,23,.86),rgba(30,21,15,.82)); --ease:cubic-bezier(.23,1,.32,1);
      position:fixed; inset:0; z-index:8; overflow:auto; color:var(--text);
      background:#1a1410 url('./assets/observatory-bg.webp') center/cover no-repeat;
      font:14px/1.5 system-ui,-apple-system,'Malgun Gothic',sans-serif; -webkit-font-smoothing:antialiased;
    }
    .observatory::before { content:''; position:fixed; inset:0; pointer-events:none; background:radial-gradient(ellipse at 50% 40%,transparent,rgba(20,13,8,.3) 85%),linear-gradient(180deg,rgba(20,13,8,.05),rgba(20,13,8,.25)); }
    .obs-glass { background:linear-gradient(150deg,rgba(255,255,255,.07),rgba(255,255,255,.01)); -webkit-backdrop-filter:blur(8px) saturate(140%); backdrop-filter:blur(8px) saturate(140%); border:1px solid var(--line); box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -1px 0 rgba(255,255,255,.04),0 30px 70px rgba(12,7,3,.38); }
    .obs-shell { position:relative; max-width:1380px; margin:0 auto; padding:36px clamp(16px,3vw,40px) 120px; }
    .obs-top { margin:2px 4px 16px; }
    .obs-eyebrow { color:var(--muted); font-size:10px; letter-spacing:.22em; margin:0 0 6px; text-transform:uppercase; }
    .obs-top h1 { margin:0; font-size:clamp(24px,2.6vw,32px); font-weight:600; letter-spacing:-.03em; }
    .obs-top p:last-child { margin:6px 0 0; color:var(--muted); font-size:13px; }
    .obs-frame { display:grid; grid-template-columns:64px minmax(0,1fr) 300px; gap:16px; align-items:start; }
    .obs-rail { position:sticky; top:36px; display:flex; flex-direction:column; gap:6px; padding:10px 8px; border-radius:999px; }
    .obs-rail button { width:46px; height:46px; min-height:0; padding:0; display:grid; place-items:center; border-radius:50%; border:0; background:transparent; color:var(--muted); }
    .obs-rail button[aria-pressed=true] { background:rgba(255,255,255,.9); color:#2a1d10; box-shadow:0 2px 10px rgba(0,0,0,.18); }
    .obs-rail svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .obs-stage { border-radius:34px; padding:18px; min-height:520px; }
    .obs-side { position:sticky; top:36px; border-radius:34px; padding:24px 20px 20px; display:flex; flex-direction:column; gap:14px; background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.01)); }
    .obs-clock strong { display:block; font-size:34px; font-weight:600; letter-spacing:-.04em; font-variant-numeric:tabular-nums; line-height:1.1; }
    .obs-clock span,.obs-updated { color:var(--muted); font-size:12px; }
    .obs-gauge { display:grid; place-items:center; padding:6px 0 2px; }
    .obs-gauge svg { width:100%; max-width:230px; height:auto; overflow:visible; }
    .obs-gauge [data-arc] { transition:stroke-dasharray 300ms var(--ease); }
    .obs-gauge .g-value { font-size:44px; font-weight:600; fill:var(--text); letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
    .obs-gauge .g-unit { font-size:15px; fill:var(--muted); }
    .obs-gauge .g-label { font-size:12px; fill:var(--muted); }
    .obs-gauge-caption { text-align:center; margin:-6px 0 0; font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
    .obs-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .obs-side-note { margin:0; font-size:11px; color:var(--faint); text-align:center; }
    .observatory button,.observatory select { font:inherit; color:inherit; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.08); min-height:40px; padding:8px 14px; cursor:pointer; transition:transform 160ms var(--ease),background-color 200ms var(--ease),color 200ms var(--ease),opacity 200ms var(--ease); }
    .observatory button:active:not(:disabled) { transform:scale(.97); }
    .observatory button:disabled { opacity:.45; cursor:wait; }
    .observatory :focus-visible { outline:2px solid var(--amber); outline-offset:3px; }
    .obs-exit { background:var(--amber) !important; color:#2b1a06 !important; border-color:transparent !important; font-weight:600; }
    .obs-dock { position:fixed; z-index:2; left:50%; bottom:22px; transform:translateX(-50%); display:flex; gap:4px; padding:6px; border-radius:999px; }
    .obs-dock button { border:0; border-radius:999px; min-height:36px; padding:6px 16px; font-size:13px; background:transparent; color:var(--muted); white-space:nowrap; }
    .obs-dock button[aria-pressed=true] { background:rgba(255,255,255,.9); color:#2a1d10; font-weight:600; box-shadow:0 2px 10px rgba(0,0,0,.18); }
    @media (hover:hover) and (pointer:fine) {
      .observatory button:hover:not(:disabled) { background:rgba(255,255,255,.16); }
      .obs-rail button:hover:not([aria-pressed=true]) { color:var(--text); }
      .obs-exit:hover { background:#ffc979 !important; }
      .obs-dock button[aria-pressed=true]:hover { background:#fff; }
    }
    .obs-state { min-height:480px; display:grid; place-content:center; text-align:center; color:var(--muted); padding:20px; }
    .obs-state p { margin:6px 0; }
    .obs-state button { margin:14px auto 0; }
    .obs-main[hidden],.obs-state[hidden] { display:none; }

    .obs-bento { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:14px; }
    .span-3 { grid-column:span 3; } .span-6 { grid-column:span 6; } .span-12 { grid-column:span 12; }
    .obs-card { position:relative; background:var(--card); border:1px solid var(--line-soft); border-radius:24px; padding:20px; box-shadow:inset 0 1px 0 rgba(255,255,255,.14); scroll-margin-top:24px; min-width:0; }
    .obs-card h2 { margin:0; font-size:16px; font-weight:600; letter-spacing:-.02em; }
    .obs-card-head,.obs-chart-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
    .obs-chip,.experiment-badge { font-size:11px; color:var(--amber); padding:5px 10px; border-radius:999px; background:var(--amber-soft); border:1px solid rgba(245,184,92,.28); white-space:nowrap; font-variant-numeric:tabular-nums; }
    .obs-kpi p { margin:0; font-size:12px; color:var(--muted); }
    .obs-kpi strong { display:block; margin:10px 0 2px; font-size:30px; font-weight:600; font-variant-numeric:tabular-nums; letter-spacing:-.04em; line-height:1.15; }
    .obs-kpi small { color:var(--faint); font-size:11px; }
    .obs-kpi::after { content:''; position:absolute; top:20px; right:20px; width:8px; height:8px; border-radius:50%; background:var(--amber); box-shadow:0 0 12px var(--amber); opacity:.85; }
    .obs-bars-host { height:190px; margin-top:12px; }
    .obs-bars-host svg { display:block; width:100%; height:100%; overflow:visible; }
    .obs-bars-host text { font:10px system-ui,sans-serif; fill:rgba(251,246,238,.5); font-variant-numeric:tabular-nums; }
    .obs-bars-host text.is-today { fill:var(--amber); font-weight:600; }
    .obs-bars-host .g-grid { stroke:#fff; stroke-opacity:.08; } .obs-bars-host .g-grid.is-axis { stroke-opacity:.2; }
    .obs-bars-host .g-hit { outline:none; cursor:crosshair; } .obs-bars-host .g-hit:focus-visible { stroke:var(--amber); stroke-width:1.5; }
    .mix-bar { transition:opacity 180ms var(--ease); } .has-focus .mix-bar:not(.is-focus) { opacity:.3; }
    .mix-today { fill:none; stroke:rgba(255,255,255,.55); stroke-width:1.2; stroke-dasharray:3 3; }
    .obs-bar { flex:1; min-width:0; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; gap:6px; }
    .obs-bar span { font-size:10px; color:var(--faint); font-variant-numeric:tabular-nums; }
    .obs-tabs { display:flex; gap:3px; padding:3px; background:rgba(0,0,0,.18); border:1px solid var(--line-soft); border-radius:999px; }
    .obs-tabs button { min-height:30px; padding:4px 12px; border:0; border-radius:999px; background:transparent; font-size:12px; color:var(--muted); }
    .obs-tabs button[aria-selected=true],.obs-tabs button[aria-pressed=true] { background:rgba(255,255,255,.88); color:#2a1d10; font-weight:600; }
    .obs-legend { display:flex; gap:20px; margin:12px 0 0; color:var(--muted); font-size:12px; }
    .obs-legend span::before { content:''; display:inline-block; width:18px; height:2px; background:#9bc6cf; margin-right:7px; vertical-align:middle; }
    .obs-legend span:last-child::before { background:var(--amber); }
    .obs-legend .lg-area::before { height:10px; border-radius:3px; background:rgba(255,255,255,.22); }
    .obs-legend .lg-bar::before { width:8px; height:12px; border-radius:3px; background:linear-gradient(#ffd794,#e8963a); }
    .obs-legend .lg-pct::before { display:none; }
    .obs-legend .lg-pct b { color:var(--amber); font-weight:600; }
    .obs-plot { position:relative; margin:10px -6px 0; }
    .obs-plot svg { display:block; width:100%; height:auto; overflow:visible; }
    .obs-plot text { font:11px system-ui; fill:rgba(251,246,238,.5); }
    .obs-plot [data-point] { cursor:crosshair; outline:none; }
    .obs-plot [data-point]:focus-visible { stroke:var(--amber); stroke-width:1; }
    .obs-readout { min-height:22px; margin:2px 0 0; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
    .obs-note { margin:4px 6px 0; font-size:11px; color:var(--faint); line-height:1.8; }
    .obs-table { margin-top:14px; font-size:12px; color:var(--muted); }
    .obs-table summary { cursor:pointer; padding:8px 0; }
    .obs-table-wrap { max-height:260px; overflow:auto; border-radius:14px; background:rgba(0,0,0,.14); }
    .obs-table table { width:100%; table-layout:fixed; border-collapse:collapse; text-align:center; font-variant-numeric:tabular-nums; }
    .obs-table th,.obs-table td { padding:9px 12px; border-bottom:1px solid var(--line-soft); white-space:nowrap; }
    .obs-table th:first-child,.obs-table td:first-child { width:118px; text-align:left; padding-left:16px; }
    .obs-table th,.obs-table td { overflow:hidden; text-overflow:ellipsis; }
    .obs-table td:not(:first-child) { color:var(--text); } .obs-table td.is-zero { color:var(--faint); }
    .obs-panel .obs-note { flex:none; margin:8px 2px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .obs-table th { background:rgba(40,28,18,.85); position:sticky; top:0; font-weight:500; }
    .experiment-caption { color:var(--muted); font-size:12px; line-height:1.75; overflow-wrap:anywhere; margin:10px 0 0; }
    .experiment-filters { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:16px 0 12px; }
    .experiment-filters>button { min-height:32px; font-size:12px; padding:4px 12px; border-radius:999px; }
    .experiment-toggles { flex:none; display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .experiment-toggles button { display:inline-flex; align-items:center; gap:7px; min-height:30px; padding:4px 12px 4px 10px; border-radius:999px; font-size:12px; background:rgba(0,0,0,.14); border-color:var(--line-soft); color:var(--muted); }
    .experiment-toggles button::before { content:''; width:9px; height:9px; border-radius:50%; flex:none; box-shadow:inset 0 0 0 1.5px var(--series-color); transition:background-color 160ms var(--ease),box-shadow 160ms var(--ease); }
    .experiment-toggles button[aria-pressed=true] { background:rgba(255,255,255,.14); border-color:var(--line); color:var(--text); }
    .experiment-toggles button[aria-pressed=true]::before { background:var(--series-color); box-shadow:0 0 8px var(--series-color); }
    .experiment-toggles .tg-name { font-weight:600; white-space:nowrap; }
    .experiment-comparison { display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:18px 0 4px; }
    .experiment-average p { margin:0; color:var(--muted); font-size:12px; }
    .experiment-average strong { display:block; margin-top:6px; font-size:28px; font-weight:600; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
    .experiment-average small { display:block; color:var(--faint); font-size:11px; }
    .experiment-bar { height:6px; margin:14px 0 8px; border-radius:999px; transition:width 300ms var(--ease); }
    .experiment-card .obs-readout { overflow-wrap:anywhere; line-height:1.8; }
    .obs-panel[hidden] { display:none; }
    .obs-panel { margin-top:12px; }
    .obs-inline { margin:0 0 0 auto; flex:1 1 200px; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:right; }
    .obs-plot text.ratio-pct { fill:var(--amber); font-weight:600; }
    .obs-plot text.ratio-pct.is-down { fill:#9bc6cf; }
    .obs-tabcard .experiment-filters { margin:0 0 10px; }
    .obs-bars-host { position:relative; }
    .obs-bar { border-radius:10px; outline:none; }
    .obs-bar i { display:flex; flex-direction:column; width:100%; max-width:26px; height:var(--h); min-height:4px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.08); transform-origin:50% 100%; transition:opacity 200ms var(--ease); }
    .obs-bar em { display:block; flex-basis:0; min-height:0; }
    .obs-bar .seg-other { background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.22)); }
    .obs-bar .seg-base { background:linear-gradient(180deg,#ffd18c,#e8963a); }
    .obs-bar.is-today i { box-shadow:0 0 0 1.5px rgba(255,255,255,.55),0 0 22px rgba(245,184,92,.35); }
    .obs-bars.has-focus .obs-bar:not(.is-focus) i { opacity:.32; }
    .obs-bar.is-focus span { color:var(--text); }
    .obs-bar:focus-visible { outline:2px solid var(--amber); outline-offset:2px; }
    .obs-bars.is-entering .obs-bar i { animation:obs-grow 420ms var(--ease) both; animation-delay:calc(var(--i)*22ms); }
    .obs-key { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); }
    .obs-key i { width:8px; height:8px; border-radius:2px; margin-left:6px; } .obs-key .k-base { background:var(--amber); } .obs-key .k-other { background:rgba(255,255,255,.55); }
    .obs-tip { position:absolute; z-index:4; left:0; top:0; min-width:170px; max-width:260px; padding:10px 12px; border-radius:14px; pointer-events:none; color:var(--text); font-size:12px; line-height:1.45; font-variant-numeric:tabular-nums; background:rgba(38,26,16,.8); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); border:1px solid rgba(255,255,255,.16); box-shadow:0 14px 34px rgba(0,0,0,.35); opacity:0; transform:scale(.96); transition:opacity 140ms var(--ease),transform 140ms var(--ease),left 120ms var(--ease),top 120ms var(--ease); }
    .obs-tip.is-on { opacity:1; transform:none; }
    .obs-tip strong { display:block; font-size:13px; } .obs-tip small { display:block; color:var(--muted); font-size:11px; margin-bottom:6px; }
    .tip-row,.tip-foot { display:flex; align-items:center; gap:8px; padding:2px 0; }
    .tip-row i { width:8px; height:8px; border-radius:50%; background:var(--c); flex:none; }
    .tip-row span,.tip-foot span { flex:1; min-width:0; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tip-row b,.tip-foot b { font-weight:600; white-space:nowrap; }
    .tip-foot { border-top:1px solid var(--line-soft); margin-top:6px; padding-top:6px; } .tip-foot + .tip-foot { border:0; margin:0; padding-top:2px; }
    .tip-foot b { color:var(--amber); } .tip-foot b.is-down { color:#9bc6cf; }
    .obs-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; margin:0; }
    .obs-plot .g-grid { stroke:#fff; stroke-opacity:.08; } .obs-plot .g-grid.is-v { stroke-opacity:.05; }
    .obs-plot .g-hit { outline:none; cursor:crosshair; } .obs-plot .g-hit:focus-visible { stroke:var(--amber); stroke-width:1.5; }
    .zone-before { fill:#fff; opacity:.025; } .zone-after { fill:var(--amber); opacity:.06; } .zone-line { stroke:var(--amber); stroke-dasharray:4 5; opacity:.6; }
    .obs-plot .zone-label { fill:var(--faint); font-weight:600; } .obs-plot .zone-label.is-after { fill:var(--amber); }
    .col-focus { fill:#fff; opacity:0; transition:opacity 150ms var(--ease),x 120ms var(--ease); } .has-focus .col-focus { opacity:.07; }
    .col-line { stroke:#fff; stroke-opacity:0; transition:stroke-opacity 150ms var(--ease); } .has-focus .col-line { stroke-opacity:.35; }
    .bar { transition:opacity 180ms var(--ease); } .bar.is-today { opacity:.45; } .has-focus .bar:not(.is-focus) { opacity:.28; } .has-focus .bar.is-today.is-focus { opacity:.65; }
    .avg-line { stroke:#fff; stroke-opacity:.6; stroke-width:1.5; stroke-dasharray:6 6; } .avg-line.is-after { stroke:#ffd18c; stroke-opacity:.9; }
    .obs-plot .avg-label { fill:rgba(255,255,255,.72); font-weight:600; } .obs-plot .avg-label.is-after { fill:#ffd18c; }
    .trend-line { stroke:var(--amber); stroke-width:2; stroke-dasharray:8 6; opacity:.75; }
    .obs-plot .axis-title { fill:var(--muted); font-weight:600; }
    .dot-pt { fill:rgba(255,255,255,.6); stroke:rgba(255,255,255,.9); stroke-width:1.5; transition:opacity 180ms var(--ease),r 180ms var(--ease); }
    .dot-pt.is-after { fill:var(--amber); stroke:#ffe1ad; filter:drop-shadow(0 0 6px rgba(245,184,92,.6)); } .dot-pt.is-latest { stroke-width:3; }
    .has-focus .dot-pt:not(.is-focus) { opacity:.3; } .dot-pt.is-focus { r:10px; }
    .k-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.6); margin:0 4px 0 6px; vertical-align:middle; } .k-dot.is-after { background:var(--amber); }
    .obs-panel-bar { flex:none; display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
    .obs-layer-toggles,.obs-stats { display:flex; gap:6px; flex-wrap:wrap; }
    .obs-layer-toggles button { display:flex; align-items:center; gap:7px; min-height:30px; padding:4px 12px; border-radius:999px; font-size:12px; }
    .obs-layer-toggles button[aria-pressed=false] { opacity:.42; }
    .lg-area { width:14px; height:10px; border-radius:3px; background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,.1)); }
    .lg-bar { width:7px; height:12px; border-radius:3px; background:linear-gradient(#ffd794,#e8963a); }
    .lg-avg { width:16px; border-top:2px dashed #ffd18c; }
    .obs-stat { display:flex; align-items:baseline; gap:8px; padding:5px 12px; border-radius:999px; background:rgba(0,0,0,.16); border:1px solid var(--line-soft); cursor:help; }
    .obs-stat small { font-size:11px; color:var(--muted); } .obs-stat b { font-size:13px; font-variant-numeric:tabular-nums; }
    .obs-heat-host { display:flex; }
    .obs-heat { flex:1; min-width:0; display:grid; grid-template-columns:minmax(64px,108px) repeat(var(--cols),minmax(0,1fr)); grid-template-rows:18px; grid-auto-rows:22px; gap:3px; align-content:start; }
    .heat-row { display:contents; }
    .heat-date { font-size:10px; color:var(--faint); text-align:center; align-self:end; white-space:nowrap; font-variant-numeric:tabular-nums; } .heat-date.is-today { color:var(--amber); }
    .heat-name { font-size:12px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; align-self:center; padding-right:6px; }
    .heat-name::before { content:''; display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--c); margin-right:6px; vertical-align:middle; }
    .heat-split { grid-column:1 / -1; display:flex; align-items:center; gap:8px; min-height:0; overflow:visible; font-size:10px; line-height:1; letter-spacing:.06em; color:var(--faint); white-space:nowrap; }
    .heat-split::after { content:''; flex:1; height:1px; background:var(--line-soft); }
    .heat-cell { min-height:0; border-radius:5px; background:rgba(245,184,92,var(--a)); outline:none; transition:transform 150ms var(--ease),box-shadow 150ms var(--ease); }
    .heat-cell.is-zero { background:rgba(255,255,255,.06); }
    .heat-cell.is-null { background:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 2px,transparent 2px 6px); }
    .heat-cell.is-focus { position:relative; z-index:1; box-shadow:0 0 0 2px #fff; transform:scale(1.08); }
    .heat-cell:focus-visible { box-shadow:0 0 0 2px var(--amber); }
    .obs-heat.is-entering .heat-cell { animation:obs-fade 360ms var(--ease) both; animation-delay:calc(var(--i)*14ms); }
    .heat-scale { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); }
    .heat-scale i { width:72px; height:8px; border-radius:999px; background:linear-gradient(90deg,rgba(245,184,92,.25),#f5b85c); }
    .heat-scale b { width:12px; height:8px; margin-left:8px; border-radius:2px; background:repeating-linear-gradient(135deg,rgba(255,255,255,.3) 0 2px,transparent 2px 5px); }
    .obs-spark { position:absolute; right:16px; bottom:14px; width:40%; max-width:120px; height:30px; overflow:visible; }
    .obs-kpi small { display:block; max-width:56%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .experiment-track { height:6px; margin:12px 0 8px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; }
    .experiment-track .experiment-bar { height:100%; margin:0; border-radius:999px; }
    .obs-report { flex:1; min-height:0; overflow:auto; display:grid; grid-template-columns:1.15fr 1fr 1fr; gap:12px; align-items:stretch; }
    .rp-card { min-width:0; display:flex; flex-direction:column; gap:8px; padding:14px 16px; border-radius:18px; background:rgba(0,0,0,.14); border:1px solid var(--line-soft); }
    .obs-report.is-entering .rp-card { animation:obs-rise 360ms var(--ease) both; animation-delay:calc(var(--i)*60ms); }
    @keyframes obs-rise { from { opacity:0; transform:translateY(8px); } }
    .rp-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .rp-level { font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; background:var(--amber-soft); color:var(--amber); border:1px solid rgba(245,184,92,.3); }
    .rp-level.is-wait,.rp-level.is-early { background:rgba(255,255,255,.08); color:var(--muted); border-color:var(--line-soft); }
    .rp-level.is-solid { background:var(--amber); color:#2b1a06; border-color:transparent; }
    .rp-date { font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums; }
    .rp-headline { margin:2px 0 4px; font-size:15px; font-weight:600; line-height:1.55; letter-spacing:-.01em; text-wrap:pretty; }
    .rp-metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:auto 0 0; }
    .rp-metrics div { padding:8px 10px; border-radius:12px; background:rgba(255,255,255,.06); min-width:0; }
    .rp-metrics dt { font-size:11px; color:var(--muted); }
    .rp-metrics dd { margin:2px 0 0; font-size:16px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rp-metrics small { font-size:10px; color:var(--faint); }
    .rp-card h3 { margin:0; font-size:13px; font-weight:600; color:var(--text); }
    .rp-card h3 + .rp-list { margin-top:-2px; }
    .rp-list { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:12px; line-height:1.6; color:var(--muted); }
    .rp-list strong { color:var(--text); font-weight:600; }
    .rp-list li::marker { color:var(--amber); font-weight:600; }
    .rp-list.is-caution li::marker { color:var(--faint); }
    .rp-list.is-next { margin-bottom:4px; }
    .rp-copy { margin-top:auto; align-self:flex-start; min-height:32px !important; padding:4px 14px !important; border-radius:999px !important; font-size:12px; }
    @media (max-width:1180px) { .obs-report { grid-template-columns:1fr; overflow:visible; } }
    @media (min-width:1181px) and (max-height:800px) { .rp-headline { font-size:13.5px; } .rp-list { font-size:11.5px; gap:4px; } .rp-metrics dd { font-size:14px; } .rp-card { padding:10px 12px; gap:6px; } }
    .obs-head-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .obs-wave-tabs button { min-height:26px !important; padding:2px 10px !important; font-size:11px !important; }
    .obs-breakdown { display:flex; flex-direction:column; gap:2px; margin-top:6px; }
    .obs-breakdown:empty { display:none; }
    .obs-break-row { display:flex; align-items:baseline; gap:10px; font-size:11.5px; color:var(--muted); font-variant-numeric:tabular-nums; }
    .obs-break-row span:first-child { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .obs-break-row b { min-width:52px; text-align:right; color:var(--amber); font-weight:600; } .obs-break-row b.is-down { color:#9bc6cf; }
    .bar.is-weekend { fill:rgba(255,255,255,.38); } .bar.is-wave { opacity:.6; }
    [data-ratio-groups] button { white-space:nowrap; }
    [data-ratio-groups][hidden],[data-wave-tabs][hidden] { display:none; }
    .obs-panel.obs-users:not([hidden]) { display:grid; grid-template-columns:minmax(240px,300px) minmax(0,1fr); grid-template-rows:minmax(0,1fr); gap:16px; }
    .obs-userlist { min-width:0; min-height:0; overflow:hidden; display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:18px; background:rgba(0,0,0,.14); border:1px solid var(--line-soft); }
    .obs-userlist-filters { display:flex; gap:6px; flex:none; }
    .obs-userlist-filters .obs-tabs { flex:1; } .obs-userlist-filters .obs-tabs button { flex:1; white-space:nowrap; padding:4px 8px; }
    .obs-userlist-actions { flex:none; display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .obs-userlist-actions button { min-height:28px !important; padding:2px 8px !important; border-radius:999px !important; font-size:12px; }
    .obs-userlist .experiment-toggles { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin:0; flex:1 1 0; min-height:0; overflow-y:auto; padding-right:2px; align-content:start; scrollbar-width:thin; }
    .obs-userlist .experiment-toggles button { width:100%; min-width:0; justify-content:flex-start; min-height:28px; padding:3px 8px; border-radius:10px; }
    .obs-userlist .experiment-toggles button:first-child { grid-column:1 / -1; }
    .obs-userlist .tg-name { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .obs-arrivals { flex:none; margin:0 !important; font-size:11px !important; color:var(--faint) !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .obs-users .obs-plot { min-width:0; }
    .obs-users .obs-plot:not(:has(svg)) { display:grid; place-items:center; color:var(--muted); font-size:13px; }
    .series { transition:opacity 160ms var(--ease); }
    .has-series-focus .series:not(.is-hl) { opacity:.14; }
    .has-series-focus .series.is-hl path { stroke-width:3.4; }
    @media (max-width:700px) { .obs-panel.obs-users:not([hidden]) { grid-template-columns:1fr; } .obs-users .obs-plot { min-height:220px; } }
    .gap-line { stroke:#fff; stroke-opacity:.18; stroke-dasharray:2 4; }
    .wk-empty { fill:rgba(255,255,255,.2); }
    .wave-badge { cursor:help; outline:none; }
    .wave-badge rect { fill:rgba(245,184,92,.2); stroke:rgba(245,184,92,.6); stroke-width:1; transition:fill 150ms var(--ease); }
    .wave-badge text { fill:#ffd18c !important; font-weight:600; }
    .wave-badge:focus-visible rect { stroke:#fff; stroke-width:2; }
    .tip-names { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
    .tip-names span { padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.1); font-size:11px; white-space:nowrap; }
    .obs-tip small.tip-sub { margin:8px 0 0; }
    @media (hover:hover) and (pointer:fine) { .wave-badge:hover rect { fill:rgba(245,184,92,.34); } }
    @keyframes obs-grow { from { transform:scaleY(0); } }
    @keyframes obs-draw { from { stroke-dashoffset:1; } }
    @keyframes obs-fade { from { opacity:0; } }
    @keyframes obs-pop { from { opacity:0; transform:scale(.4); } }
    .is-entering .a-grow { transform-box:fill-box; transform-origin:50% 100%; animation:obs-grow 420ms var(--ease) both; animation-delay:calc(var(--i,0)*18ms); }
    .is-entering .a-draw { stroke-dasharray:1; animation:obs-draw 700ms var(--ease) both; }
    .is-entering .a-fade { animation:obs-fade 420ms var(--ease) both; animation-delay:calc(160ms + var(--i,0)*14ms); }
    .is-entering .a-pop { transform-box:fill-box; transform-origin:center; animation:obs-pop 360ms var(--ease) both; animation-delay:calc(var(--i,0)*30ms); }
    @media (min-width:1181px) {
      .observatory { overflow:hidden; }
      .obs-dock { position:static; transform:none; flex:none; align-self:center; margin-top:clamp(8px,1.4vh,14px); }
      .obs-shell { height:100%; display:flex; flex-direction:column; max-width:1480px; padding:clamp(12px,2.4vh,24px) 32px clamp(10px,1.8vh,18px); }
      .obs-top { flex:none; display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin:2px 4px 12px; }
      .obs-top .obs-eyebrow { width:100%; margin:0; }
      .obs-top h1 { font-size:22px; } .obs-top p:last-child { margin:0; }
      .obs-frame { flex:1; min-height:0; grid-template-rows:minmax(0,1fr); align-items:stretch; }
      .obs-rail { position:static; align-self:start; }
      .obs-side { position:static; justify-content:space-between; overflow:hidden; }
      .obs-stage { min-height:0; display:flex; flex-direction:column; padding:16px; overflow:hidden; }
      .obs-state { min-height:0; flex:1; }
      .obs-main { flex:1; min-height:0; display:flex; }
      .obs-bento { flex:1; min-height:0; gap:12px; grid-template-rows:auto auto minmax(0,1fr); }
      .obs-card { padding:16px 18px; border-radius:22px; }
      .experiment-comparison { padding:12px 0 0; } .experiment-average strong { font-size:24px; } .experiment-track { margin:10px 0 6px; }
      [data-section=compare] .experiment-caption { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .obs-bars-host { height:min(130px,14vh); margin-top:8px; }
      .obs-kpi strong { font-size:24px; margin:6px 0 0; } .obs-kpi::after { top:16px; right:18px; }
      .obs-tabcard { display:flex; flex-direction:column; min-height:0; }
      .obs-panel { flex:1; min-height:0; display:flex; flex-direction:column; }
      .obs-plot { flex:1; min-height:0; display:flex; flex-direction:column; margin-top:4px; }
      .obs-plot svg { flex:1 1 0; min-height:0; height:100%; }
      .obs-readout { flex:none; }
      .obs-table { flex:1; min-height:0; display:flex; margin-top:8px; }
      .obs-table-wrap { flex:1; max-height:none; }
      .obs-gauge svg { max-width:min(230px,28vh); }
      .obs-heat { height:100%; grid-auto-rows:minmax(6px,1fr); align-content:stretch; }
    }
    @media (min-width:1181px) and (max-height:800px) {
      .obs-frame { gap:12px; } .obs-stage { padding:12px; border-radius:28px; } .obs-side { padding:16px; border-radius:28px; gap:8px; }
      .obs-top { margin:0 4px 8px; } .obs-top .obs-eyebrow { display:none; } .obs-top h1 { font-size:19px; } .obs-top p:last-child { font-size:12px; }
      .obs-bento { gap:8px; } .obs-card { padding:12px 14px; border-radius:18px; } .obs-card h2 { font-size:14px; } .obs-card .obs-eyebrow { display:none; }
      .experiment-comparison { padding:6px 0 0; gap:14px; } .experiment-average strong { font-size:19px; margin-top:2px; } .experiment-track { margin:6px 0 4px; height:5px; }
      [data-section=compare] .experiment-caption { display:none; }
      .obs-bars-host { height:max(60px,10vh); margin-top:4px; } .obs-bar span { font-size:9px; }
      .obs-kpi strong { font-size:19px; margin:2px 0 0; } .obs-kpi small { display:none; } .obs-kpi::after { top:13px; right:14px; }
      .obs-panel { margin-top:6px; } .obs-tabcard .experiment-filters { margin-bottom:6px; } .obs-tabcard .experiment-filters>button,.obs-tabs button { min-height:28px; }
      .obs-legend { margin-top:4px; } .obs-readout { font-size:11px; min-height:18px; }
      .obs-clock strong { font-size:26px; } .obs-gauge svg { max-width:min(200px,26vh); } .obs-gauge-caption { margin:0; font-size:11px; }
      .observatory button { min-height:34px; padding:6px 12px; } .obs-dock button { min-height:32px; padding:4px 14px; }
      .obs-rail button { width:40px; height:40px; }
    }
    @media (min-width:1181px) and (max-height:620px) {
      .obs-top p:last-child,.obs-side-note,.obs-gauge-caption,[data-section=detail] .obs-chart-head>div { display:none; }
      .obs-bars-host { height:52px; } .experiment-average small { display:none; }
    }
    /* 사용자가 늘어도 글자를 압축하지 않고 영역 안에서 스크롤한다. */
    .obs-table table { width:100%; table-layout:fixed; }
    .obs-table th,.obs-table td { width:48px; padding:8px 6px; }
    .obs-table th:first-child,.obs-table td:first-child { width:140px; padding-left:16px; }
    .obs-table .obs-member-key { display:inline-grid; place-items:center; width:28px; height:28px; min-height:28px; padding:0; border:0; border-radius:50%; background:transparent; }
    .obs-member-key i { display:block; width:11px; height:11px; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,.12); }
    .obs-table .obs-member-key:hover { background:rgba(255,255,255,.08); }
    [data-panel=table] { position:relative; min-width:0; overflow:hidden; }
    .obs-heat-host { min-height:0; overflow:auto; display:block; padding-bottom:8px; }
    .obs-heat { height:auto; min-width:calc(144px + var(--cols)*26px); grid-template-columns:140px repeat(var(--cols),minmax(22px,1fr)); grid-template-rows:24px; grid-auto-rows:28px; gap:4px; align-content:start; }
    .heat-name { min-width:0; line-height:20px; padding-right:12px; }
    .heat-split { min-height:28px; overflow:hidden; }
    .ratio-annotations { display:flex; flex:none; flex-wrap:wrap; align-items:center; gap:8px 16px; padding:4px 0 12px; font-size:11px; line-height:1.6; color:var(--muted); }
    .ratio-average-key { display:inline-flex; align-items:center; gap:6px; }
    .ratio-average-key::before { content:''; width:16px; border-top:2px dashed var(--c); flex:none; }
    .ratio-wave-key { padding:3px 8px; border:1px solid var(--line-soft); border-radius:8px; color:var(--amber); }
    [data-panel=ratio] { min-width:0; overflow:visible; }
    [data-panel=ratio] .obs-inline { white-space:normal; overflow:visible; text-align:left; flex-basis:100%; }
    [data-ratio-plot] { min-width:0; min-height:260px; margin-left:0; margin-right:0; }
    @media(min-width:1181px) {
      .obs-stage { overflow:hidden; }
      .obs-panel { overflow:hidden; }
      [data-ratio-plot] { min-height:0; }
      [data-panel=ratio] .obs-panel-bar { gap:6px 10px; margin-bottom:0; }
      [data-panel=ratio] .obs-inline { margin:0; font-size:11px; line-height:1.4; }
      .ratio-annotations { gap:4px 12px; padding:2px 0 6px; font-size:10px; }
      .ratio-wave-key { padding:1px 6px; }
      .obs-heat { height:auto; grid-auto-rows:28px; align-content:start; }
      .obs-heat-host { flex:1; margin-left:0; margin-right:0; }
    }
    @media (prefers-reduced-motion:reduce) { .observatory *,.observatory *::before { transition:none !important; animation:none !important; } }
    @media (max-width:1180px) { .obs-frame { grid-template-columns:64px minmax(0,1fr); } .obs-side { grid-column:2; grid-row:1; position:static; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:18px; } .obs-gauge { grid-row:span 2; } .obs-gauge svg { max-width:150px; } .obs-side-note { display:none; } .obs-actions { grid-template-columns:1fr; } .obs-stage { grid-column:2; } .obs-rail { grid-row:1 / span 2; } }
    @media (max-width:860px) { .span-3 { grid-column:span 6; } .span-6 { grid-column:span 12; } }
    @media (max-width:700px) {
      .obs-shell { padding:22px 16px 110px; } .obs-frame { grid-template-columns:minmax(0,1fr); } .obs-rail { display:none; }
      .obs-side,.obs-stage { grid-column:1; } .obs-side { grid-template-columns:1fr auto; border-radius:26px; padding:18px; } .obs-gauge { grid-row:auto; grid-column:2; grid-row-start:1; } .obs-gauge svg { max-width:120px; } .obs-gauge-caption { display:none; } .obs-actions { grid-column:1 / -1; grid-template-columns:1fr 1fr; }
      .obs-stage { padding:10px; border-radius:26px; } .obs-card { padding:16px; border-radius:20px; } .obs-kpi strong { font-size:24px; } .obs-bento { gap:10px; }
      .experiment-comparison { gap:14px; } .experiment-average strong { font-size:20px; } .obs-readout { min-height:40px; } .obs-dock button { padding:6px 12px; }
    }
  `;
  document.head.append(style);

  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const rail = [
    ['ratio','증감 분석',icon('<path d="M4 19h16"/><rect x="6" y="11" width="3" height="8" rx="1"/><rect x="11" y="8" width="3" height="11" rx="1"/><rect x="16" y="5" width="3" height="14" rx="1"/><path d="M4 9c4-5 10-6 16-6" stroke-dasharray="2 2.5"/>')],
    ['scatter','상관 관계',icon('<path d="M4 4v16h16"/><circle cx="8.5" cy="14.5" r="1.4"/><circle cx="12" cy="11" r="1.4"/><circle cx="15" cy="12.5" r="1.4"/><circle cx="17.5" cy="7.5" r="1.4"/><path d="M6 17L19 6" stroke-dasharray="2 2.4"/>')],
    ['heat','활동 히트맵',icon('<rect x="4" y="4" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="4" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="1"/><rect x="4" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="1"/>')],
    ['users','사용자 추이',icon('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6M18 19a5 5 0 0 0-2.6-4.4"/>')],
    ['table','수치 표',icon('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>')],
    ['weekend','주말 접속',icon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M13.5 13.5h3v3h-3z" fill="currentColor" stroke="none"/>')],
    ['report','분석 보고서',icon('<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15h6M9.5 18h3.5"/>')],
  ];
  const periods = [[7,'7일'],[14,'14일'],[30,'30일'],[90,'90일']];
  let period = 14;

  const root = document.createElement('section'); root.className = 'observatory'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'obs-title');
  root.innerHTML = `<div class="obs-shell">
    <div class="obs-frame"><nav class="obs-rail obs-glass" aria-label="상세 통계 바로가기">${rail.map(([key,label,svg])=>`<button type="button" data-jump="${key}" aria-label="${label}" aria-pressed="${key==='ratio'}" title="${label}">${svg}</button>`).join('')}</nav>
    <div class="obs-stage obs-glass"><header class="obs-top"><p class="obs-eyebrow">Igloo Village / Observatory</p><h1 id="obs-title">마을 성장 실험실</h1><p>사용자가 늘어나면, 기존 사용자도 더 자주 방문할까요?</p></header><div class="obs-state" role="status" aria-live="polite"></div><div class="obs-main" hidden></div></div>
    <aside class="obs-side obs-glass" aria-label="오늘 현황"><div class="obs-clock"><strong data-clock>--:--</strong><span data-date></span><br><span class="obs-updated"></span></div><div><div class="obs-gauge" data-gauge></div><p class="obs-gauge-caption" data-gauge-caption></p></div><div class="obs-actions"><button type="button" data-refresh>새로고침</button><button class="obs-exit" type="button">나가기 ↗</button></div><p class="obs-side-note">1분마다 자동 갱신 · 개발팀·강사 전용</p></aside></div>
    <nav class="obs-dock obs-glass" aria-label="통계 조회 기간">${periods.map(([days,label])=>`<button type="button" data-period="${days}" aria-pressed="${days===period}">최근 ${label}</button>`).join('')}</nav></div>`;
  document.body.append(root);
  const q = s => root.querySelector(s), main=q('.obs-main'), state=q('.obs-state'), refreshButton=q('[data-refresh]');
  const view=mountExperimentView(main,{gauge:q('[data-gauge]'),gaugeCaption:q('[data-gauge-caption]'),onTab:key=>root.querySelectorAll('[data-jump]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.jump===key)))});
  let generation=0,opened=false,busy=false,loadedUser=null;
  function showState(text,retry=false){main.hidden=true;state.hidden=false;state.replaceChildren();const p=document.createElement('p');p.textContent=text;state.append(p);if(retry){const b=document.createElement('button');b.type='button';b.textContent='다시 불러오기';b.onclick=refresh;state.append(b);}}
  function stamp(){
    const now=new Date(),zone={timeZone:'Asia/Seoul'};
    q('[data-clock]').textContent=new Intl.DateTimeFormat('ko-KR',{...zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    q('[data-date]').textContent=new Intl.DateTimeFormat('ko-KR',{...zone,month:'long',day:'numeric',weekday:'short'}).format(now);
    q('.obs-updated').textContent='마지막 갱신';
  }
  async function refresh(){
    if(!opened)return;
    const token=++generation,member=getMember();
    if(loadedUser!==member?.id)view.clear();loadedUser=member?.id;
    busy=false;refreshButton.disabled=false;q('.obs-updated').textContent='';
    if(!member?.approved){view.clear();showState('승인된 계정으로 로그인해야 들어갈 수 있어요.');return;}
    busy=true;refreshButton.disabled=true;showState('실험 기록을 불러오는 중…');
    try{
      const allowed=await backend.canViewObservatory();
      if(!opened||token!==generation||loadedUser!==getMember()?.id)return;
      if(!allowed){view.clear();showState('개발팀과 강사 전용 공간입니다.');return;}
      const [experiment,mine]=await Promise.allSettled([backend.getVisitExperiment(period),backend.getMemberVisitCounts()]);
      if(!opened||token!==generation||loadedUser!==getMember()?.id)return;
      if(experiment.status==='rejected')throw experiment.reason;
      const data=normalizeExperiment(experiment.value);
      let mineTotal=null;if(mine.status==='fulfilled'){try{mineTotal=visitNumber(mine.value);}catch{}}
      main.hidden=false;state.hidden=true;view.paint(data,mineTotal);stamp();
    }catch{if(opened&&token===generation)showState('통계를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',true);}
    finally{if(token===generation){busy=false;refreshButton.disabled=false;}}
  }
  q('.obs-exit').onclick=onExit;refreshButton.onclick=refresh;
  root.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{
    period=Number(button.dataset.period);
    root.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    refresh();
  });
  root.querySelectorAll('[data-jump]').forEach(button=>button.onclick=()=>view.selectTab(button.dataset.jump));
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();onExit();}
    if(event.key!=='Tab')return;
    const controls=[...root.querySelectorAll('button:not(:disabled),select,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  const timer=setInterval(()=>{if(opened&&!busy&&!document.hidden)refresh();},60000);
  const wake=()=>{if(opened&&!document.hidden)refresh();};document.addEventListener('visibilitychange',wake);
  return {open(){opened=true;root.hidden=false;root.scrollTop=0;q('.obs-exit').focus();refresh();},close(){opened=false;generation++;root.hidden=true;busy=false;view.clear();},refresh,dispose(){opened=false;generation++;clearInterval(timer);document.removeEventListener('visibilitychange',wake);root.remove();style.remove();}};
}
