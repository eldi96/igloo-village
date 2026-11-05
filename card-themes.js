export const CARD_THEMES = [
  {id:'glass',name:'기본',a:'rgba(151,127,105,.38)',b:'rgba(47,41,41,.72)'},
  {id:'rose',name:'분홍',a:'rgba(159,102,124,.46)',b:'rgba(64,43,58,.76)'},
  {id:'cream',name:'크림',a:'rgba(197,181,144,.47)',b:'rgba(87,77,60,.77)'},
  {id:'graphite',name:'다크',a:'rgba(85,91,101,.49)',b:'rgba(27,32,40,.81)'},
  {id:'mint',name:'민트',a:'rgba(105,157,144,.43)',b:'rgba(35,64,61,.77)'}
];

let stylesInstalled=false;
function installStyles(){
  if(stylesInstalled)return;stylesInstalled=true;
  const style=document.createElement('style');style.textContent=`
    :is(.room-card,.room-form)[data-card-theme=rose] { --ct-bg:linear-gradient(135deg,rgba(171,111,137,.38),rgba(62,42,57,.76)); --ct-text:#fff1f6; --ct-muted:#e7c5d3; --ct-border:rgba(255,213,230,.3); --ct-fill:rgba(223,165,189,.1); --ct-button:#f3dbe5; --ct-ink:#50313e; --ct-panel:rgba(42,24,37,.23); }
    :is(.room-card,.room-form)[data-card-theme=cream] { --ct-bg:linear-gradient(135deg,rgba(205,187,149,.42),rgba(83,74,57,.77)); --ct-text:#fffaed; --ct-muted:#e6dcc3; --ct-border:rgba(255,242,207,.34); --ct-fill:rgba(255,236,191,.12); --ct-button:#f5ebd3; --ct-ink:#4b4130; --ct-panel:rgba(62,51,32,.2); }
    :is(.room-card,.room-form)[data-card-theme=graphite] { --ct-bg:linear-gradient(135deg,rgba(91,99,113,.43),rgba(25,30,38,.82)); --ct-text:#f0f3f8; --ct-muted:#bec8d6; --ct-border:rgba(212,225,247,.25); --ct-fill:rgba(193,207,229,.08); --ct-button:#dee5ef; --ct-ink:#2c3441; --ct-panel:rgba(14,20,29,.25); }
    :is(.room-card,.room-form)[data-card-theme=mint] { --ct-bg:linear-gradient(135deg,rgba(114,174,155,.36),rgba(34,62,58,.78)); --ct-text:#edfdf5; --ct-muted:#bfdfd3; --ct-border:rgba(208,255,236,.28); --ct-fill:rgba(169,235,206,.1); --ct-button:#d8f0e5; --ct-ink:#2b4d40; --ct-panel:rgba(21,45,38,.23); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) { background:var(--ct-bg); border-color:var(--ct-border); color:var(--ct-text); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) :is(.room-desc,.room-howto p,.room-browser-content p,.room-author,.feedback-comment-body,.feedback-head h3) { color:var(--ct-text); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) :is(.room-link,.room-btn.quiet,.feedback-status,.feedback-empty,.feedback-comment-head time,.feedback-submit>span,.feedback-text-action,.room-browser-address) { color:var(--ct-muted); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) :is(.room-howto,.room-shot,.room-btn,.room-icon,.feedback-reactions button,.feedback-form textarea,.feedback-reply-form textarea,.feedback-delete-confirm) { border-color:var(--ct-border); background:var(--ct-panel); color:var(--ct-text); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) :is(.project-feedback,.feedback-list>li,.feedback-reply-list,.room-browser-bar) { border-color:var(--ct-border); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .room-btn.primary { background:var(--ct-button); border-color:transparent; color:var(--ct-ink); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .room-avatar { background:var(--ct-button); color:var(--ct-ink); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) :is(button,a,textarea):focus-visible { outline-color:var(--ct-button); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .room-card-body { scrollbar-color:var(--ct-border) transparent; }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .feedback-reactions button[aria-pressed=true] { border-color:var(--ct-button); background:var(--ct-fill); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .feedback-form label { color:var(--ct-text); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .feedback-form textarea::placeholder { color:var(--ct-muted); opacity:.78; }
    .room-card[data-card-theme]:not([data-card-theme=glass]) .feedback-replies { border-color:var(--ct-border); }
    .room-card[data-card-theme]:not([data-card-theme=glass]) li.feedback-reply { background:var(--ct-fill); border-color:var(--ct-border); }
    .room-form[data-card-theme]:not([data-card-theme=glass]) { background:var(--ct-bg); border-color:var(--ct-border); color:var(--ct-text); scrollbar-color:var(--ct-border) transparent; }
    .room-form[data-card-theme]:not([data-card-theme=glass]) :is(p,label,.room-preview-frame) { color:var(--ct-muted); }
    .room-form[data-card-theme]:not([data-card-theme=glass]) :is(input,textarea,.room-btn,.room-preview-frame) { background:var(--ct-panel); border-color:var(--ct-border); color:var(--ct-text); }
    .room-form[data-card-theme]:not([data-card-theme=glass]) :is(input,textarea)::placeholder { color:var(--ct-muted); opacity:.78; }
    .room-form[data-card-theme]:not([data-card-theme=glass]) .room-btn.primary { background:var(--ct-button); color:var(--ct-ink); border-color:transparent; }
    .room-form[data-card-theme]:not([data-card-theme=glass]) input::file-selector-button { background:var(--ct-fill); border-color:var(--ct-border); color:var(--ct-text); }
    .room-form[data-card-theme]:not([data-card-theme=glass]) :is(input,textarea):focus { outline-color:var(--ct-button); }
    .room-form[data-card-theme]:not([data-card-theme=glass]) .room-error { color:#ffd7c7; }
    .card-theme-control { margin-top:12px; width:min(270px,calc(100vw - 48px)); font:12px/1.5 system-ui; }
    .room-reward-row { position:relative; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; width:min(245px,calc(100vw - 48px)); margin-top:12px; }
    .room-reward-row .card-theme-control { width:auto; min-width:0; margin:0; }
    .room-reward-row .card-theme-control[hidden] { display:none; }
    .room-reward-row .card-theme-trigger { width:100%; justify-content:center; padding:8px 10px; }
    .room-reward-row .card-theme-trigger small { display:none; }
    .room-reward-row .card-theme-picker { position:absolute; top:100%; left:0; z-index:1; max-width:calc(100vw - 48px); }
    .room-reward-row .card-theme-control:nth-child(2) .card-theme-picker { left:auto; right:0; }
    .card-theme-trigger { display:flex; align-items:center; gap:9px; min-height:38px; padding:8px 12px; border:1px solid rgba(239,247,250,.26); border-radius:12px; color:#edf5f6; background:linear-gradient(135deg,rgba(239,247,250,.12),rgba(239,247,250,.04)); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); font:inherit; cursor:pointer; }
    .card-theme-trigger small { font-size:10px; color:#bcc9cd; }
    .card-theme-trigger { transition:background-color 160ms ease,border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease; }
    .card-theme-options i { transition:transform 160ms ease,border-color 160ms ease,box-shadow 160ms ease; }
    @media(hover:hover) and (pointer:fine) {
      .card-theme-trigger:hover { background-color:rgba(239,247,250,.1); border-color:rgba(239,247,250,.55); box-shadow:inset 0 1px rgba(255,255,255,.2); transform:translateY(-1px); }
      .card-theme-options button:hover:not(:disabled) i { transform:translateY(-2px) scale(1.06); border-color:rgba(255,255,255,.8); box-shadow:0 3px 9px rgba(10,25,35,.14),inset 0 1px rgba(255,255,255,.4); }
    }
    .card-theme-trigger:active { transform:translateY(0); }
    @media(prefers-reduced-motion:reduce) { .card-theme-trigger,.card-theme-options i { transition:none; } .card-theme-trigger:hover,.card-theme-options button:hover:not(:disabled) i { transform:none; } }
    .card-theme-picker { box-sizing:border-box; width:fit-content; max-width:100%; margin-top:8px; padding:12px; border:1px solid rgba(239,247,250,.32); border-radius:15px; background:linear-gradient(135deg,rgba(239,247,250,.15),rgba(239,247,250,.04)); box-shadow:inset 0 1px #ffffff40; backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); color:#edf5f6; }
    .card-theme-picker[hidden] { display:none; }
    .card-theme-picker header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .card-theme-picker h2 { margin:0; font-size:12px; font-weight:500; }
    .card-theme-options { display:grid; grid-template-columns:repeat(5,32px); gap:8px; }
    .card-theme-options button { width:32px; height:32px; min-width:0; padding:0; border:0; border-radius:7px; background:transparent; cursor:pointer; }
    .card-theme-options button:disabled { cursor:default; opacity:.4; }
    .card-theme-options i { display:block; box-sizing:border-box; width:26px; height:26px; border-radius:5px; border:1px solid #ffffff45; box-shadow:inset 0 1px #ffffff30; margin:3px; }
    .card-theme-options [aria-pressed=true] i { outline:1px solid #f3f4ec; outline-offset:3px; }
    .card-theme-control :focus-visible { outline:2px solid #e1f0ef; outline-offset:4px; }
    .card-theme-picker p { max-width:192px; margin:8px 0 0; font-size:11px; color:#f8dfd5; }
    .card-theme-picker p[hidden] { display:none; }
    .card-theme-reward { position:fixed; z-index:9; left:50%; top:50%; box-sizing:border-box; width:max-content; max-width:calc(100vw - 48px); padding:16px 24px; border:1px solid rgba(239,247,250,.32); border-radius:16px; background:linear-gradient(135deg,rgba(239,247,250,.16),rgba(239,247,250,.05)); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); box-shadow:inset 0 1px #ffffff40; color:#f3faf8; text-shadow:0 1px 8px #102a3866; font:400 14px/1.7 'Segoe UI','Malgun Gothic',system-ui,sans-serif; letter-spacing:-.015em; text-align:center; pointer-events:none; opacity:0; transform:translate(-50%,calc(-50% + 6px)); transition:opacity 240ms ease,transform 300ms cubic-bezier(.16,1,.3,1); }
    .card-theme-reward.is-visible { opacity:1; transform:translate(-50%,-50%); }
    .card-theme-reward[hidden] { display:none; }
    @media(prefers-reduced-motion:reduce) { .card-theme-reward { transition:none; } }
    @media(max-width:720px) { .card-theme-picker { max-height:calc(100dvh - 300px); overflow:auto; } }
  `;document.head.append(style);
}

export function mountCardThemes(root,card,backend,companions=[]){
  installStyles();
  const control=document.createElement('div');control.className='card-theme-control';
  control.innerHTML='<button type="button" class="card-theme-trigger" aria-expanded="false"><span>카드 테마</span><small></small></button><section class="card-theme-picker" aria-label="프로젝트 카드 테마" hidden><header><h2>프로젝트 카드 테마</h2></header><div class="card-theme-options" aria-label="카드 색상 선택"></div><p role="status" aria-live="polite" hidden></p></section>';
  root.append(control);
  const reward=document.createElement('div');reward.className='card-theme-reward';reward.hidden=true;reward.setAttribute('role','status');reward.setAttribute('aria-live','polite');reward.setAttribute('aria-atomic','true');document.body.append(reward);
  let rewardTimer=null,rewardHideTimer=null,rewardFrame=null;
  function hideReward(){clearTimeout(rewardTimer);clearTimeout(rewardHideTimer);cancelAnimationFrame(rewardFrame);reward.classList.remove('is-visible');reward.hidden=true;reward.textContent='';}
  function showReward(){hideReward();reward.textContent='첫 프로젝트를 게시하여 테마 변경이 가능해졌어요.';reward.hidden=false;rewardFrame=requestAnimationFrame(()=>{reward.classList.add('is-visible');});rewardTimer=setTimeout(()=>{reward.classList.remove('is-visible');rewardHideTimer=setTimeout(()=>{reward.hidden=true;reward.textContent='';},260);},3600);}
  const trigger=control.querySelector('.card-theme-trigger'),panel=control.querySelector('section'),status=panel.querySelector('p');
  let active=false,home=null,isMine=false,theme='glass',unlocked=false,loaded=false,busy=false,generation=0,request=0;
  const options=CARD_THEMES.map(item=>{const button=document.createElement('button');button.type='button';button.dataset.theme=item.id;button.setAttribute('aria-label',item.name+' 카드 테마');button.title=item.name;const swatch=document.createElement('i');swatch.setAttribute('aria-hidden','true');swatch.style.background=`linear-gradient(135deg,${item.a},${item.b})`;button.append(swatch);panel.querySelector('.card-theme-options').append(button);button.onclick=()=>save(item.id);return button;});
  function clearStatus(){status.textContent='';status.hidden=true;}
  function errorStatus(text){status.textContent=text;status.hidden=false;}
  function paint(){
    for(const surface of [card,...companions]) surface.dataset.cardTheme=theme;
    control.hidden=!active||!isMine||!loaded||!unlocked;
    trigger.querySelector('small').textContent=!loaded?'확인 중':unlocked?'선택 가능':'프로젝트 1개로 해금';
    options.forEach(button=>{button.disabled=!loaded||busy||(!unlocked&&button.dataset.theme!=='glass');button.setAttribute('aria-pressed',String(button.dataset.theme===theme));});
  }
  function close(focus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
  trigger.onclick=()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){root.dispatchEvent(new CustomEvent('reward-picker-open',{detail:control}));clearStatus();options.find(b=>!b.disabled)?.focus();if(!loaded)refresh();}};
  root.addEventListener('reward-picker-open',event=>{if(event.detail!==control)close();});
  control.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();close(true);}});
  async function refresh({notifyUnlock=false}={}){
    if(!active||home===null)return;
    const token=generation,seq=++request,targetHome=home;
    try{const result=await backend.getCardTheme(targetHome);if(!active||token!==generation||seq!==request)return;theme=CARD_THEMES.some(t=>t.id===result.theme)?result.theme:'glass';unlocked=Boolean(result.unlocked);loaded=true;paint();clearStatus();if(notifyUnlock&&isMine&&unlocked)showReward();}
    catch{if(active&&token===generation&&seq===request){loaded=false;paint();errorStatus('설정을 불러오지 못했어요. 다시 열어 주세요.');}}
  }
  async function save(next){
    if(!active||!isMine||!loaded||busy||(!unlocked&&next!=='glass')||next===theme)return;
    const token=generation;busy=true;request++;paint();clearStatus();
    try{const result=await backend.setCardTheme(next);if(!active||token!==generation)return;theme=result.theme;unlocked=Boolean(result.unlocked);}
    catch{if(active&&token===generation)errorStatus('저장하지 못했어요. 다시 선택해 주세요.');}
    finally{if(token===generation){busy=false;paint();options.find(b=>b.dataset.theme===next)?.focus({preventScroll:true});}}
  }
  return {enter(id,mine){generation++;request++;active=true;home=id;isMine=mine;theme='glass';loaded=false;unlocked=false;busy=false;hideReward();clearStatus();close();paint();return refresh();},refresh,async unlockState(){if(!loaded)await refresh();return loaded?unlocked:null;},projectPosted(previousUnlock){return refresh({notifyUnlock:previousUnlock===false});},leave(){generation++;request++;active=false;home=null;isMine=false;theme='glass';loaded=false;busy=false;hideReward();clearStatus();close();paint();}};
}
