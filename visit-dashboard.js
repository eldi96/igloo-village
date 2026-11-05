import { normalizeExperiment, visitNumber } from './visit-data.js';
import { mountExperimentView } from './visit-experiment-view.js';

export function createVisitDashboard(backend, { getMember, onExit }) {
  const style = document.createElement('style');
  style.textContent = `
    .observatory[hidden] { display:none; }
    .observatory { position:fixed; inset:0; z-index:8; overflow:auto; color:#e7ecec; background:radial-gradient(ellipse at 4% 30%,#39505b55,transparent 50%),linear-gradient(110deg,#182a32,#122028 60%,#1c2d34); font:14px/1.5 system-ui,'Malgun Gothic',sans-serif; }
    .observatory::before { content:''; position:fixed; inset:0; pointer-events:none; box-shadow:inset 0 0 130px #02080d99; border:clamp(8px,2vw,28px) solid #23333a; }
    .observatory::after { content:''; position:fixed; z-index:-1; bottom:0; left:0; right:0; height:22%; background:repeating-linear-gradient(0deg,#302f2c 0 2px,#383731 2px 22px); border-top:8px solid #4b493f; }
    .obs-window { position:absolute; top:200px; left:3%; width:12%; height:340px; border:12px solid #394a51; background:radial-gradient(circle at 68% 20%,#e1e8db 0 7px,transparent 8px),linear-gradient(#071622,#36556a); box-shadow:0 0 0 2px #17272f,inset 0 0 40px #0008; }
    .obs-window::before { content:''; position:absolute; inset:40% 0 0; background:#223a48; clip-path:polygon(0 60%,27% 20%,46% 52%,72% 0,100% 40%,100% 100%,0 100%); }
    .obs-window::after { content:''; position:absolute; left:48%; top:0; bottom:0; width:6px; background:#394a51; }
    .obs-shell { position:relative; max-width:1160px; margin:0 auto; padding:48px clamp(20px,4vw,64px) 50px; }
    .obs-top { display:flex; justify-content:space-between; gap:20px; align-items:center; margin-bottom:32px; }
    .obs-eyebrow { color:#a6b8bc; font-size:10px; letter-spacing:.24em; margin:0 0 8px; }
    .obs-top h1 { margin:0; font-size:clamp(25px,3vw,34px); font-weight:500; letter-spacing:-.04em; }
    .obs-top p:last-child { margin:8px 0 0; color:#aebcc0; font-size:13px; }
    .observatory button,.observatory select { font:inherit; color:inherit; border:1px solid #64767c77; border-radius:9px; background:#263941; min-height:38px; padding:7px 13px; cursor:pointer; }
    .observatory button:hover { background:#354b54; }
    .observatory button:disabled { opacity:.45; cursor:wait; }
    .observatory :focus-visible { outline:2px solid #c9dcd9; outline-offset:4px; }
    .obs-exit { white-space:nowrap; }
    .obs-board { padding:clamp(18px,3vw,32px); background:#17282ff5; border:1px solid #6e808244; border-radius:18px; box-shadow:0 20px 60px #02080c55,inset 0 1px #dbe6e31a; }
    .obs-toolbar,.obs-chart-head { display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
    .obs-toolbar { margin-bottom:24px; }
    .obs-toolbar label { display:flex; align-items:center; gap:10px; color:#b5c3c6; }
    .obs-updated { color:#91a6ac; font-size:11px; margin-left:auto; }
    .obs-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
    .obs-kpi { border:1px solid #657a8033; border-radius:12px; padding:16px; background:linear-gradient(135deg,#2a3d4544,#13232a44); }
    .obs-kpi p { margin:0; font-size:12px; color:#a9bdc1; }
    .obs-kpi strong { display:block; margin:8px 0 4px; font-size:30px; font-weight:500; font-variant-numeric:tabular-nums; letter-spacing:-.04em; }
    .obs-kpi small { color:#859ba3; font-size:11px; }
    .obs-chart-head h2 { font-size:16px; font-weight:500; margin:0; }
    .obs-tabs { display:flex; gap:4px; padding:3px; background:#091b2255; border:1px solid #5b747b44; border-radius:10px; }
    .obs-tabs button { min-height:30px; padding:4px 12px; border:0; background:transparent; font-size:12px; color:#91a6ac; }
    .obs-tabs button[aria-pressed=true] { background:#3a5059; color:#f1f5f4; box-shadow:0 1px 4px #0003; }
    .obs-legend { display:flex; gap:20px; margin:12px 0 0; color:#bdcbcc; font-size:12px; }
    .obs-legend span::before { content:''; display:inline-block; width:18px; height:2px; background:#9bc6cf; margin-right:7px; vertical-align:middle; }
    .obs-legend span:last-child::before { background:#dbba82; }
    .obs-plot { position:relative; margin:10px -6px 0; }
    .obs-plot svg { display:block; width:100%; height:auto; overflow:visible; }
    .obs-plot text { font:11px system-ui; fill:#91a7af; }
    .obs-plot [data-point] { cursor:crosshair; outline:none; }
    .obs-plot [data-point]:focus-visible { stroke:#e3e9dd; stroke-width:1; }
    .obs-readout { min-height:22px; margin:2px 0 18px; color:#c4d2d5; font-size:12px; font-variant-numeric:tabular-nums; }
    .obs-note { margin:0; padding-top:16px; border-top:1px solid #6d848833; font-size:11px; color:#8da3ab; line-height:1.8; }
    .obs-state { min-height:180px; display:grid; place-content:center; text-align:center; color:#b9c9cc; padding:20px; }
    .obs-state p { margin:6px 0; }
    .obs-state button { margin:14px auto 0; }
    .obs-table { margin-top:16px; font-size:12px; color:#a6bbc1; }
    .obs-table summary { cursor:pointer; padding:10px 0; }
    .obs-table-wrap { max-height:260px; overflow:auto; }
    .obs-table table { width:100%; border-collapse:collapse; text-align:right; font-variant-numeric:tabular-nums; }
    .obs-table th,.obs-table td { padding:9px 12px; border-bottom:1px solid #5b747b33; white-space:nowrap; }
    .obs-table th:first-child,.obs-table td:first-child { text-align:left; }
    .obs-table th { background:#1c3039; position:sticky; top:0; font-weight:500; }
    .obs-main[hidden],.obs-state[hidden] { display:none; }
    .experiment-card { padding:24px 0; border-top:1px solid #6d848833; }
    .experiment-card h2 { font-size:17px; font-weight:500; margin:0; }
    .experiment-caption { color:#9db1b8; font-size:12px; line-height:1.8; overflow-wrap:anywhere; }
    .experiment-badge { font-size:11px; color:#d9bd8b; padding:6px 10px; border:1px solid #c5a97444; border-radius:8px; }
    .experiment-filters { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:18px 0 12px; }
    .experiment-filters>button { min-height:32px; font-size:12px; background:transparent; padding:4px 10px; }
    .experiment-toggles { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .experiment-toggles button { min-height:32px; padding:5px 10px; font-size:12px; background:transparent; opacity:.45; }
    .experiment-toggles button::before { content:''; display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--series-color); margin-right:6px; }
    .experiment-toggles button[aria-pressed=true] { opacity:1; background:#334952; border-color:#7a969e77; }
    .experiment-grid { display:grid; grid-template-columns:1fr 1fr; gap:32px; }
    .experiment-comparison { display:grid; grid-template-columns:1fr 1fr; gap:32px; padding:12px 0 20px; }
    .experiment-average p { color:#a7bbc0; font-size:12px; }
    .experiment-average strong { font-size:26px; font-weight:500; }
    .experiment-average small { display:block; color:#99afb6; font-size:11px; }
    .experiment-bar { height:5px; margin:20px 0 10px; border-radius:3px; }
    .experiment-card .obs-plot { min-height:60px; }
    .experiment-card .obs-readout { overflow-wrap:anywhere; line-height:1.8; }
    @media(max-width:850px) { .experiment-grid { grid-template-columns:1fr; gap:0; } .experiment-comparison { gap:18px; } .experiment-average strong { font-size:19px; } }
    @media(min-width:1500px) { .obs-shell { padding-top:65px; } }
    @media(max-width:700px) { .obs-shell { padding:26px 16px 30px; } .obs-top { margin-bottom:24px; align-items:flex-start; } .obs-top p:last-child { max-width:230px; } .obs-kpis { grid-template-columns:repeat(2,1fr); gap:8px; } .obs-kpi { padding:12px; } .obs-kpi strong { font-size:26px; } .obs-board { border-radius:14px; } .obs-window { display:none; } .obs-updated { width:100%; margin:0; } .obs-readout { min-height:40px; } }
  `;
  document.head.append(style);

  const root = document.createElement('section'); root.className = 'observatory'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'obs-title');
  root.innerHTML = '<div class="obs-window" aria-hidden="true"></div><div class="obs-shell"><header class="obs-top"><div><p class="obs-eyebrow">IGLOO VILLAGE / OBSERVATORY</p><h1 id="obs-title">마을 성장 실험실</h1><p>사용자가 늘어나면, 기존 사용자도 더 자주 방문할까요?</p></div><button class="obs-exit" type="button">밖으로 나가기 ↗</button></header><div class="obs-board"><div class="obs-toolbar"><label>조회 기간<select aria-label="통계 조회 기간"><option value="7">최근 7일</option><option value="14" selected>최근 14일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><span class="obs-updated"></span><button type="button" data-refresh>새로고침</button></div><div class="obs-state" role="status" aria-live="polite"></div><div class="obs-main" hidden></div></div></div>';
  document.body.append(root);
  const q = s => root.querySelector(s), main=q('.obs-main'), state=q('.obs-state'), refreshButton=q('[data-refresh]');
  const view=mountExperimentView(main);
  let generation=0,opened=false,busy=false,loadedUser=null;
  function showState(text,retry=false){main.hidden=true;state.hidden=false;state.replaceChildren();const p=document.createElement('p');p.textContent=text;state.append(p);if(retry){const b=document.createElement('button');b.type='button';b.textContent='다시 불러오기';b.onclick=refresh;state.append(b);}}
  async function refresh(){
    if(!opened)return;
    const token=++generation,member=getMember();
    if(loadedUser!==member?.id)view.clear();loadedUser=member?.id;
    busy=false;refreshButton.disabled=false;q('.obs-updated').textContent='';
    if(!member?.approved){view.clear();showState('로그인한 승인 회원만 방문 통계를 볼 수 있어요. 밖으로 나가 로그인한 뒤 다시 방문해 주세요.');return;}
    busy=true;refreshButton.disabled=true;showState('실험 기록을 불러오는 중…');
    try{
      const [experiment,mine]=await Promise.allSettled([backend.getVisitExperiment(Number(q('select').value)),backend.getMemberVisitCounts()]);
      if(!opened||token!==generation||loadedUser!==getMember()?.id)return;
      if(experiment.status==='rejected')throw experiment.reason;
      const data=normalizeExperiment(experiment.value);
      let mineTotal=null;if(mine.status==='fulfilled'){try{mineTotal=visitNumber(mine.value);}catch{}}
      main.hidden=false;state.hidden=true;view.paint(data,mineTotal);
      q('.obs-updated').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' 갱신 · 1분마다 업데이트';
    }catch{if(opened&&token===generation)showState('통계를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',true);}
    finally{if(token===generation){busy=false;refreshButton.disabled=false;}}
  }
  q('.obs-exit').onclick=onExit;refreshButton.onclick=refresh;q('select').onchange=refresh;
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
