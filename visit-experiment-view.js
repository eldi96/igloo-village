import { comparisonChange } from './visit-data.js';

const colors = ['#e0b879','#88c8d0','#b1a0df','#c0cf94','#de9da8','#84b5e2','#d3c394','#80c6b4','#caa7cf','#c7b39e'];
const fmt = value => value.toLocaleString('ko-KR', { maximumFractionDigits:2 });
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// 모든 그래프가 같은 날짜축·선택값·키보드 탐색을 사용한다. 가입 전은 null로 선을 끊는다.
function plot(root, dates, series, { marker, step = false, unit = '회', markerLabel = '신규 유입 시작' } = {}) {
  root.replaceChildren();
  if (!dates.length) { root.textContent = '아직 표시할 날짜가 없어요.'; return; }
  if (!series.length) { root.textContent = '위에서 표시할 사용자나 합계를 선택해 주세요.'; return; }
  const maximum = Math.max(1, ...series.flatMap(s => s.values.filter(v=>v!==null))), tick = Math.max(1, Math.ceil(maximum/4)), top=tick*4;
  const x=i=>56+i/Math.max(1,dates.length-1)*820, y=v=>236-v/top*210;
  const line = values => {
    let connected=false, d='';
    values.forEach((v,i)=>{ if(v===null){connected=false;return;} d+=!connected ? `M${x(i)},${y(v)} ` : step ? `H${x(i)} V${y(v)} ` : `L${x(i)},${y(v)} `; connected=true; });
    return d;
  };
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 900 280'); svg.setAttribute('role','group'); svg.setAttribute('aria-label',`날짜별 그래프. 단위 ${unit}`);
  const markerIndex=marker && marker>=dates[0] ? dates.findIndex(d=>d>=marker) : -1;
  svg.innerHTML=`${Array.from({length:5},(_,i)=>`<line x1="56" x2="876" y1="${y(i*tick)}" y2="${y(i*tick)}" stroke="#71858c" stroke-opacity=".18"/><text x="44" y="${y(i*tick)+4}" text-anchor="end">${fmt(i*tick)}</text>`).join('')}${[...new Set(Array.from({length:Math.min(5,dates.length)},(_,i)=>Math.round(i/Math.max(1,Math.min(5,dates.length)-1)*(dates.length-1))))].map(i=>`<text x="${x(i)}" y="263" text-anchor="middle">${dates[i].slice(5).replace('-','/')}</text>`).join('')}${markerIndex>=0?`<rect x="${x(markerIndex)}" y="20" width="${876-x(markerIndex)}" height="216" fill="#d9b882" opacity=".045"/><line x1="${x(markerIndex)}" x2="${x(markerIndex)}" y1="20" y2="236" stroke="#d9b882" stroke-dasharray="4 5" opacity=".65"/><text x="${Math.min(x(markerIndex)+5,805)}" y="15">${markerLabel}</text>`:''}${series.map(s=>`<path d="${line(s.values)}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" ${s.dashed?'stroke-dasharray="5 4"':''}/>${s.values.map((v,i)=>v===null?'':`<circle cx="${x(i)}" cy="${y(v)}" r="${dates.length>35?1.4:3}" fill="${s.color}"/>`).join('')}`).join('')}<line data-marker x1="876" x2="876" y1="20" y2="236" stroke="#cfdddf" opacity=".2"/>${dates.map((date,i)=>`<rect data-point="${i}" x="${i? (x(i-1)+x(i))/2:36}" y="20" width="${dates.length===1?840:(i===0||i===dates.length-1?410:820)/(dates.length-1)}" height="220" fill="transparent" role="button" tabindex="${i===dates.length-1?0:-1}" aria-label="${date}, ${series.map(s=>escape(s.name)+': '+(s.values[i]===null?'집계 대상 아님':fmt(s.values[i])+unit)).join(', ')}"/>`).join('')}`;
  root.append(svg);
  const labelSize=Math.max(11,Math.min(26,9900/Math.max(root.clientWidth,320)));
  svg.querySelectorAll('text').forEach(text=>{text.style.fontSize=`${labelSize}px`;});
  const readout=document.createElement('p'); readout.className='obs-readout'; readout.setAttribute('aria-live','polite'); root.append(readout);
  function show(i){ readout.textContent=`${dates[i]}　${series.map(s=>`${s.name} ${s.values[i]===null?'—':fmt(s.values[i])+unit}`).join(' · ')}`;const m=svg.querySelector('[data-marker]');m.setAttribute('x1',x(i));m.setAttribute('x2',x(i)); }
  svg.querySelectorAll('[data-point]').forEach(point=>{
    const i=Number(point.dataset.point); point.onpointerenter=point.onfocus=point.onclick=()=>show(i);
    point.onkeydown=e=>{let next=i;if(e.key==='ArrowLeft')next=Math.max(0,i-1);else if(e.key==='ArrowRight')next=Math.min(dates.length-1,i+1);else if(e.key==='Home')next=0;else if(e.key==='End')next=dates.length-1;else return;e.preventDefault();point.setAttribute('tabindex','-1');const target=svg.querySelector(`[data-point="${next}"]`);target.setAttribute('tabindex','0');target.focus();};
  }); show(dates.length-1);
}

export function mountExperimentView(root) {
  root.innerHTML=`<div class="obs-kpis"><article class="obs-kpi"><p>집계 사용자</p><strong data-population>—</strong><small>개발팀 4명 제외</small></article><article class="obs-kpi"><p>기존 5명 · 오늘 접속</p><strong data-baseline-today>—</strong><small data-average></small></article><article class="obs-kpi"><p>유입 전후 변화</p><strong data-change>—</strong><small data-change-note></small></article><article class="obs-kpi"><p>내 누적 접속</p><strong data-mine>—</strong><small>개발팀은 집계 제외</small></article></div>
  <section class="experiment-card"><div class="obs-chart-head"><div><p class="obs-eyebrow">01 / FIXED BASELINE</p><h2>5명일 때의 기준 기록</h2></div><span class="experiment-badge" data-baseline-range></span></div><p class="experiment-caption">처음 5명만 있던 기간의 일별 접속 횟수입니다. 사용자가 늘어난 뒤에도 이 기록을 유지해요.</p><div class="obs-plot" data-before-plot></div></section>
  <section class="experiment-card"><div class="obs-chart-head"><div><p class="obs-eyebrow">02 / USER ACTIVITY</p><h2>사용자가 늘면, 기존 사용자가 더 자주 올까?</h2></div><div class="obs-tabs" aria-label="사용자 그래프 집계 방식"><button type="button" data-metric="daily" aria-pressed="true">일별</button><button type="button" data-metric="cumulative" aria-pressed="false">누적</button></div></div><p class="experiment-caption">기존 5명은 고정 표본입니다. 이름을 눌러 같은 그래프에서 각 사용자의 선을 켜고 끄세요.</p><div class="experiment-filters"><div class="obs-tabs" aria-label="사용자 표시 범위"><button type="button" data-scope="baseline" aria-pressed="true">기존 5명</button><button type="button" data-scope="all" aria-pressed="false">전체 사용자</button></div><button type="button" data-select-all>모두 켜기</button><button type="button" data-select-none>모두 끄기</button></div><div class="experiment-toggles" aria-label="사용자별 그래프 표시"></div><div class="obs-plot" data-users-plot></div><p class="experiment-caption" data-arrivals></p><details class="obs-table"><summary>사용자별 날짜 수치 보기</summary><div class="obs-table-wrap"><table><thead></thead><tbody></tbody></table></div></details></section>
  <section class="experiment-card"><p class="obs-eyebrow">03 / BEFORE & AFTER</p><h2>기존 5명의 하루 평균 접속 비교</h2><p class="experiment-caption">오늘은 아직 진행 중이므로 제외합니다. 두 기간의 완료된 날짜만 비교해요.</p><div class="experiment-comparison"></div><p class="experiment-caption">실제 신규 사용자가 처음 들어온 날을 기준으로 나눕니다. 유입 예정일은 2026. 11. 6.이며 실제 유입 인원과 날짜를 함께 확인하세요. 접속 증가만으로 인과관계가 입증되지는 않아요.</p></section>
  <div class="experiment-grid"><section class="experiment-card"><p class="obs-eyebrow">04 / VILLAGE GROWTH</p><h2>전체 사용자 수</h2><p class="experiment-caption">승인된 수강생 중 개발팀을 제외한 집계 대상</p><div class="obs-plot" data-population-plot></div></section><section class="experiment-card"><p class="obs-eyebrow">05 / TOTAL VISITS</p><h2>전체와 기존 5명의 일별 접속</h2><div class="obs-legend"><span>전체 사용자</span><span>기존 5명</span></div><div class="obs-plot" data-total-plot></div></section></div><p class="obs-note">한국 시간 기준 · 30분 중복 방지 규칙으로 인정된 접속 횟수입니다. 사용자별 조회는 승인 회원에게만 제공해요. 가입 전은 0회 대신 집계 대상 아님(—)으로 표시합니다. 누적값에는 조회 기간 이전 기록도 포함됩니다.</p>`;
  const q=s=>root.querySelector(s);
  let data=null,scope='baseline',metric='daily',selected=new Set(),aggregate=true,initialized=false;
  const baselineSize=()=>data.members.filter(m=>m.cohort===1).length;
  const shownMembers=()=>data.members.filter(m=>scope==='all'||m.cohort===1);
  function paintUsers(){
    if(!data)return;
    const members=shownMembers(), days=data.daily.filter(d=>!data.start||d.date>=data.start),dates=days.map(d=>d.date);
    const toggles=q('.experiment-toggles');toggles.replaceChildren();
    function toggle(label,color,on,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-pressed',String(on));button.style.setProperty('--series-color',color);button.onclick=()=>{const index=[...toggles.children].indexOf(button);handler();toggles.children[index]?.focus({preventScroll:true});};toggles.append(button);}
    toggle(scope==='baseline'?'5명 합계':'전체 합계','#e9e8d9',aggregate,()=>{aggregate=!aggregate;paintUsers();});
    members.forEach(m=>{const i=data.members.findIndex(v=>v.key===m.key);toggle(m.name,colors[i%colors.length],selected.has(m.key),()=>{if(selected.has(m.key))selected.delete(m.key);else selected.add(m.key);paintUsers();});});
    const series=members.filter(m=>selected.has(m.key)).map(m=>({name:m.name,color:colors[data.members.indexOf(m)%colors.length],values:dates.map(date=>data.series.get(m.key).get(date)?.[metric]??null)}));
    if(aggregate)series.unshift({name:scope==='baseline'?'5명 합계':'전체 합계',color:'#e9e8d9',dashed:true,values:days.map(d=>scope==='baseline'?(metric==='daily'?d.baselineDaily:d.baseline):(metric==='daily'?d.totalDaily:d.total))});
    plot(q('[data-users-plot]'),dates,series,{marker:data.expansion,markerLabel:data.actualExpansion?'신규 유입 시작':'유입 예정일'});
    root.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===scope)));
    root.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
    const arrivals=data.members.filter(m=>m.cohort!==1&&m.joined<=data.today), future=data.members.filter(m=>m.cohort!==1&&m.joined>data.today);
    q('[data-arrivals]').textContent=arrivals.length?`신규 유입 기록: ${arrivals.map(m=>`${m.joined} ${m.name}`).join(' · ')}`:`신규 사용자는 아직 없어요. ${data.expansion}에 5명 유입 예정이며 승인된 수강생은 자동으로 집계합니다.${future.length?' 예약된 집계 대상 '+future.length+'명.':''}`;
    const head=document.createElement('tr');for(const label of ['날짜',...members.map(m=>m.name)]){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}q('thead').replaceChildren(head);
    q('tbody').replaceChildren(...dates.map(date=>{const tr=document.createElement('tr');for(const value of [date,...members.map(m=>data.series.get(m.key).get(date)?.[metric])]){const td=document.createElement('td');td.textContent=value==null?'—':typeof value==='number'?fmt(value):value;tr.append(td);}return tr;}));
  }
  root.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;paintUsers();});
  root.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{metric=b.dataset.metric;paintUsers();});
  q('[data-select-all]').onclick=()=>{shownMembers().forEach(m=>selected.add(m.key));aggregate=true;paintUsers();};
  q('[data-select-none]').onclick=()=>{shownMembers().forEach(m=>selected.delete(m.key));aggregate=false;paintUsers();};
  return {
    clear(){data=null;selected.clear();initialized=false;},
    paint(next,myTotal){
      data=next;if(!initialized){data.members.forEach(m=>selected.add(m.key));initialized=true;}
      const last=data.daily.at(-1),size=baselineSize();
      q('[data-population]').textContent=last?`${fmt(last.participants)}명`:'—';
      q('[data-baseline-today]').textContent=last?`${fmt(last.baselineDaily)}회`:'—';
      q('[data-average]').textContent=last&&size?`1인당 ${fmt(last.baselineDaily/size)}회 · 오늘 진행 중`:'기존 표본 기록 대기';
      q('[data-mine]').textContent=myTotal===null?'—':`${fmt(myTotal)}회`;
      q('[data-baseline-range]').textContent=data.start?`${data.start} ~ ${data.baselineEnd}${data.actualExpansion?' · 기준 기간':' · 수집 중'}`:'수집 대기';
      plot(q('[data-before-plot]'),data.baseline.map(r=>r.date),[{name:'기존 5명 합계',color:colors[0],values:data.baseline.map(r=>r.visits)}]);
      paintUsers();
      const change=comparisonChange(data.comparison),c=data.comparison;
      q('[data-change]').textContent=change===null?'비교 대기':change.percent===null?`${change.absolute>=0?'+':''}${fmt(change.absolute)}회`:`${change.percent>=0?'+':''}${fmt(change.percent)}%`;
      q('[data-change-note]').textContent=change===null?'완료된 유입 전·후 날짜가 필요해요':'기존 5명 일평균 · 완료일 기준';
      const comparison=q('.experiment-comparison');comparison.replaceChildren();
      const max=Math.max(1,c.before??0,c.after??0);
      for(const [label,value,days,color] of [['유입 전',c.before,c.beforeDays,colors[0]],['유입 후',c.after,c.afterDays,colors[1]]]){const item=document.createElement('div');item.className='experiment-average';const title=document.createElement('p');title.textContent=`${label} · 완료된 ${days}일`;const strong=document.createElement('strong');strong.textContent=days&&value!==null?`${fmt(value)}회 / 일`:'데이터 수집 대기';const bar=document.createElement('div');bar.className='experiment-bar';bar.style.width=`${value===null?0:value/max*100}%`;bar.style.background=color;const note=document.createElement('small');note.textContent=days&&value!==null&&size?`1인당 하루 ${fmt(value/size)}회`:'오늘의 미완료 기록은 비교에서 제외';item.append(title,strong,bar,note);comparison.append(item);}
      const days=data.daily.filter(d=>!data.start||d.date>=data.start),dates=days.map(d=>d.date);
      plot(q('[data-population-plot]'),dates,[{name:'집계 사용자',color:'#9bc6cf',values:days.map(d=>d.participants)}],{step:true,marker:data.expansion,unit:'명',markerLabel:data.actualExpansion?'신규 유입 시작':'유입 예정일'});
      plot(q('[data-total-plot]'),dates,[{name:'전체',color:'#9bc6cf',values:days.map(d=>d.totalDaily)},{name:'기존 5명',color:colors[0],dashed:true,values:days.map(d=>d.baselineDaily)}],{marker:data.expansion,markerLabel:data.actualExpansion?'신규 유입 시작':'유입 예정일'});
    }
  };
}
