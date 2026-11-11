// 등대 책상에서 실제 입주 회원을 골라 우편을 보낸다. 권한·수신자 검증은 DB에서 다시 한다.
export function createLighthouseMail({ backend, getHomes, onOpen, onClose }) {
  const style = document.createElement('style');
  style.textContent = `
    .lmail { --ink:#3b4038; --muted:#6d7266; --line:#74795e26; width:min(1040px,calc(100vw - 48px)); max-width:none; max-height:calc(100dvh - 48px); padding:0; border:1px solid #fffb; border-radius:28px; color:var(--ink); background:linear-gradient(135deg,#fff8eaca,#e8e6d8c2); backdrop-filter:blur(30px) saturate(1.1); -webkit-backdrop-filter:blur(30px) saturate(1.1); box-shadow:inset 0 1px 0 #fff,0 28px 90px #17221b40; font:13px/1.6 system-ui,'Malgun Gothic',sans-serif; overflow:auto; }
    .lmail::backdrop { background:#131e202e; backdrop-filter:blur(6px); }
    .lmail * { box-sizing:border-box; }
    .lmail p { margin:0; }
    .lmail button,.lmail input,.lmail textarea { font:inherit; }
    .lmail button { cursor:pointer; }
    .lmail button:disabled { opacity:.4; cursor:default; }
    .lmail :is(button,input,textarea):focus-visible { outline:2px solid #ad7b3a; outline-offset:3px; }
    .lmail-head { display:flex; justify-content:space-between; gap:24px; padding:24px 28px 20px; border-bottom:1px solid var(--line); }
    .lmail-kicker { color:var(--muted); letter-spacing:.2em; font-size:9px; font-weight:600; }
    .lmail h2 { margin:5px 0; font-size:24px; line-height:1.4; letter-spacing:-.04em; font-weight:600; }
    .lmail-sub { color:var(--muted); font-size:12px; }
    .lmail-close { flex:none; align-self:center; display:grid; place-items:center; width:34px; height:34px; padding:0; border:1px solid #fff9; border-radius:50%; color:#626957; background:#ffffff40; line-height:1; }
    .lmail-close svg { display:block; width:14px; height:14px; }
    .lmail-select-all { display:inline-flex; align-items:center; justify-content:center; flex:none; min-height:34px; padding:6px 13px; border:1px solid #fffc; border-radius:10px; color:#66502e; background:linear-gradient(145deg,#fff1d6a8,#e6cf9f88); box-shadow:inset 0 1px 0 #fff9,0 2px 5px #6d542411; font-size:12px!important; font-weight:600!important; white-space:nowrap; }
    .lmail-select-all:not(:disabled):hover { background:#fff0ce; box-shadow:inset 0 1px 0 #fff,0 2px 8px #6d54241c; }
    .lmail-body { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); }
    .lmail-map-side { min-width:0; padding:24px; border-right:1px solid var(--line); }
    .lmail-map { position:relative; height:382px; overflow:hidden; isolation:isolate; border:1px solid #fffb; border-radius:20px; background:radial-gradient(ellipse at 15% 0%,#faf7e9e0,transparent 70%),linear-gradient(150deg,#e0e5d6b8,#c6d1c19c); box-shadow:inset 0 1px 0 #fff,0 6px 20px #384e3610; }
    .lmail-map>svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .lmail-map-foot { position:absolute; bottom:12px; left:16px; right:16px; display:flex; align-items:center; justify-content:space-between; color:#6b7b64; font-size:10px; letter-spacing:.02em; pointer-events:none; }
    .lmail-map-foot i { display:inline-block; width:6px; height:6px; margin-right:5px; border-radius:50%; background:#bb8d45; }
    .lmail-map-tip { position:absolute; z-index:5; max-width:calc(100% - 16px); padding:6px 10px; border:1px solid #fffa; border-radius:9px; background:#faf6e9f2; color:#414c3b; box-shadow:0 4px 16px #35433220; font-size:11px; overflow-wrap:anywhere; pointer-events:none; }
    .lmail-map-top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 12px; }
    .lmail-eyebrow { color:var(--muted); font-size:11px; }
    .lmail-selection { margin-left:6px; color:#9a692d; font-size:11px; font-weight:600; }
    .lmail-link { padding:3px 0; border:0; background:transparent; color:#6a705d; font-size:11px!important; text-underline-offset:4px; }
    .lmail-link:hover { text-decoration:underline; }
    .lmail-search { position:relative; margin-bottom:12px; }
    .lmail-search svg { position:absolute; left:12px; top:12px; width:16px; height:16px; color:#7e8976; pointer-events:none; }
    .lmail-search input { padding-left:36px!important; height:40px; }
    .lmail-person { position:absolute; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; transform:translate(-50%,-50%); min-height:48px; padding:3px; border:0; border-radius:12px; background:transparent; color:#4d5c46; font-size:11px!important; line-height:1.4; }
    .lmail-person::before { content:''; flex:none; width:13px; height:13px; border:3px solid #f5f5e9; border-radius:50%; background:#73866b; box-shadow:0 0 0 1px #71856666,0 3px 5px #52674920; transition:box-shadow 160ms ease,background-color 160ms ease; }
    .lmail-person span { display:block; max-width:100%; padding:2px 5px; border:1px solid transparent; border-radius:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lmail-person[aria-pressed=true] { color:#80571f; }
    .lmail-person[aria-pressed=true]::before { background:#c08b3e; box-shadow:0 0 0 1px #bb8b42,0 0 0 6px #d6ae6238,0 3px 8px #a47a3520; }
    .lmail-person[aria-pressed=true] span { border-color:#fff9; background:#fff0cb9c; }
    .lmail-map.is-searching .lmail-person:not(.is-match) { opacity:.22; }
    .lmail-person.is-match span { background:#fff8; border-color:#fff9; }
    .lmail-empty { margin-top:12px; color:var(--muted); font-size:11px; }
    .lmail-form-side { min-width:0; padding:24px; }
    .lmail-recipients { padding-bottom:16px; border-bottom:1px solid var(--line); margin-bottom:20px; }
    .lmail-count { font-size:20px; letter-spacing:-.035em; font-weight:550; margin-top:4px; }
    .lmail-names { color:var(--muted); font-size:11px; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lmail label { display:block; margin:16px 0 8px; font-size:12px; font-weight:550; }
    .lmail textarea,.lmail input { width:100%; display:block; border:1px solid #fff9; border-radius:12px; padding:11px 13px; background:#fffbef40; box-shadow:inset 0 1px 2px #36422b08; color:var(--ink); }
    .lmail input::placeholder,.lmail textarea::placeholder { color:#7b8173; }
    .lmail textarea { resize:vertical; min-height:150px; max-height:260px; line-height:1.7; }
    .lmail-form-foot { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:20px; }
    .lmail-small { max-width:170px; color:var(--muted); font-size:10px; }
    .lmail-primary { flex:none; min-height:40px; padding:9px 18px; border:1px solid #fff7; border-radius:12px; color:#62481f; background:linear-gradient(145deg,#f8dcaa,#e8ba77); box-shadow:inset 0 1px 0 #fffa,0 3px 8px #95734014; font-weight:600!important; }
    .lmail-review h3 { font-size:18px; font-weight:550; margin:0 0 12px; }
    .lmail-review-text { margin:16px 0!important; white-space:pre-wrap; overflow-wrap:anywhere; }
    .lmail-review a { color:#526e60; overflow-wrap:anywhere; }
    .lmail-review-note { margin:20px 0!important; padding:12px; border:1px solid var(--line); border-radius:12px; font-size:12px; color:var(--muted); }
    .lmail [hidden] { display:none!important; }
    @media(hover:hover) { .lmail-person:hover { background:#ffffff30; } .lmail-person:hover span { background:#fff9; } .lmail-close:hover { background:#fff7; } .lmail-primary:not(:disabled):hover { filter:brightness(1.04); } }
    @media(max-width:760px) { .lmail { width:calc(100vw - 24px); max-height:calc(100dvh - 24px); border-radius:22px; } .lmail-head { padding:18px; } .lmail-body { grid-template-columns:1fr; } .lmail-map-side { border-right:0; border-bottom:1px solid var(--line); padding:18px; } .lmail-form-side { padding:18px; }  }
    @media(prefers-reduced-motion:no-preference) { .lmail[open] { animation:lmail-in 180ms cubic-bezier(.16,1,.3,1); } .lmail button { transition:background-color 140ms ease,box-shadow 140ms ease,opacity 140ms ease; } @keyframes lmail-in { from { opacity:0; translate:0 6px; } to { opacity:1; translate:0 0; } } }
    `;
  document.head.appendChild(style);
  const dialog = document.createElement('dialog');
  dialog.className = 'lmail'; dialog.setAttribute('aria-labelledby', 'lmail-title');
  dialog.innerHTML = `
    <header class="lmail-head"><div><div class="lmail-kicker">LIGHTHOUSE POST</div><h2 id="lmail-title">메시지 보내기</h2><p class="lmail-sub">함께 보고 싶은 이야기와 링크를 전해보세요.</p></div><button type="button" class="lmail-close" aria-label="우편 작성 닫기"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13"/></svg></button></header>
    <div class="lmail-body"><section class="lmail-map-side" aria-label="받는 사람 선택"><div class="lmail-picker"><div class="lmail-map-top"><div><span class="lmail-eyebrow">받는 사람</span><span class="lmail-selection" data-selection-count></span></div><button class="lmail-select-all" type="button" data-select-all>전체 선택</button></div><div class="lmail-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-search aria-label="받는 사람 이름 검색" placeholder="이름으로 찾기" autocomplete="off"></div><div class="lmail-map" role="group" aria-label="지도에서 받는 사람 선택">
      <svg viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="post-water" x2="1" y2="1"><stop stop-color="#b3c6b4"/><stop offset="1" stop-color="#8cae9e"/></linearGradient></defs>
      <g fill="none" stroke="#72836a" stroke-opacity=".12" stroke-width="1"><path d="M-40 82C130-12 196 113 353 51S531 45 641 7M-40 93C130-1 196 124 353 62S531 56 641 18M-40 104C130 10 196 135 353 73S531 67 641 29M-30 328C107 244 211 394 363 326S514 292 640 361M-30 340C107 256 211 406 363 338S514 304 640 373M-30 352C107 268 211 418 363 350S514 316 640 385"/></g>
      <g fill="none" stroke-linecap="round"><path d="M-20 165C88 128 147 207 267 173S451 126 623 191M157-20C235 80 184 117 246 181S344 302 307 424M453-20C406 88 502 189 460 264S367 332 428 425" stroke="#72836a" stroke-opacity=".08" stroke-width="12"/><path d="M-20 162C88 125 147 204 267 170S451 123 623 188M157-20C235 80 184 117 246 181S344 302 307 424M453-20C406 88 502 189 460 264S367 332 428 425" stroke="#f8f8eb" stroke-opacity=".7" stroke-width="7"/></g>
      <path d="M304 221C314 199 346 190 363 206S397 223 380 245 344 264 326 253 296 240 304 221Z" fill="url(#post-water)" fill-opacity=".55" stroke="#f3f4e4" stroke-width="2"/>
      <path d="M326 223q14-8 30-3m-23 16q15-5 28-2" fill="none" stroke="#f5f6e8" stroke-opacity=".7" stroke-width="1"/>
      </svg><div class="lmail-map-foot"><span>마을 배치도</span><span><i></i>선택한 수신자</span></div></div><p class="lmail-empty" data-sample-caption role="status"></p></div></section>
    <section class="lmail-form-side"><div class="lmail-recipients" aria-live="polite"><div class="lmail-eyebrow">전할 이야기</div><div class="lmail-count" data-count>받는 사람을 골라주세요</div><div class="lmail-names" data-names></div></div><form data-compose><label for="lmail-message">메시지</label><textarea maxlength="5000" id="lmail-message" placeholder="이 영상의 접근 방식이 좋아서 함께 나눕니다."></textarea><label for="lmail-url">함께 볼 링크 <span class="lmail-eyebrow">선택</span></label><input maxlength="2048" id="lmail-url" type="url" placeholder="https://www.youtube.com/..." inputmode="url"><div class="lmail-form-foot"><p class="lmail-small">선택한 사람의 우편함으로<br>메시지가 전달됩니다.</p><button class="lmail-primary" type="submit" data-review disabled>내용 확인</button></div></form><div class="lmail-review" data-review-panel hidden><h3>보내기 전 확인</h3><p class="lmail-sub" data-review-to></p><p class="lmail-review-text" data-review-text></p><a data-review-url target="_blank" rel="noopener noreferrer" hidden></a><p class="lmail-review-note">받는 사람과 내용을 확인한 뒤 보내주세요.</p><div class="lmail-form-foot"><button type="button" class="lmail-link" data-edit>내용 수정</button><button type="button" class="lmail-primary" data-send>보내기</button></div></div></section></div>
  `;
  document.body.appendChild(dialog);
  const q = selector => dialog.querySelector(selector);
  const map = q('.lmail-map'), form = q('[data-compose]');
  const message = q('#lmail-message'), url = q('#lmail-url');
  const review = q('[data-review-panel]'), selected = new Set();
  let homes = [], previousFocus = null, busy = false, loading = false, revision = 0;
  const note = q('.lmail-review-note'); note.setAttribute('role', 'status');
  const selectable = () => homes.filter(home => home.owner);
  function updateSelection() {
    const recipients = selectable().filter(home => selected.has(home.id));
    q('[data-count]').textContent = recipients.length ? `선택한 회원 ${recipients.length}명` : '받는 사람을 골라주세요';
    const names=recipients.map(home => home.owner).join(' · ');
    q('[data-names]').textContent=names; q('[data-names]').title=names;
    q('[data-selection-count]').textContent=recipients.length ? recipients.length+'명 선택' : '';
    q('[data-review]').disabled = !recipients.length;
    q('[data-select-all]').disabled = !selectable().length;
    q('[data-select-all]').textContent = recipients.length && recipients.length === selectable().length ? '선택 해제' : '전체 선택';
    map.querySelectorAll('.lmail-person').forEach(button => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.home)))));
    q('[data-review-to]').textContent = `받는 사람 · ${recipients.map(home => home.owner).join(', ')}`;
  }
  // 좌표 재현보다 이름과 클릭 영역 사이의 여유를 우선하는 약식 지도다.
  function positionRecipients() {
    const buttons=[...map.querySelectorAll('.lmail-person')];
    const width=map.clientWidth || 500, cols=width<400?4:5, rows=Math.max(1,Math.ceil(buttons.length/cols));
    map.style.height=Math.max(330,rows*68+54)+'px';
    buttons.forEach((button,i)=>{
      const row=Math.floor(i/cols), col=i%cols, count=Math.min(cols,buttons.length-row*cols);
      const cell=(width-24)/cols, offset=(cols-count)*cell/2;
      button.style.width=Math.max(48,cell-8)+'px';
      button.style.left=(12+offset+cell*(col+.5)+(row%2?3:-3))+'px';
      button.style.top=(38+row*68+(col%2?5:-3))+'px';
    });
  }
  const mapTip=document.createElement('div'); mapTip.className='lmail-map-tip'; mapTip.hidden=true; map.append(mapTip);
  function searchRecipients() {
    const query=q('[data-search]').value.trim().toLocaleLowerCase('ko');
    map.classList.toggle('is-searching',!!query);
    let matches=0;
    map.querySelectorAll('.lmail-person').forEach(button=>{
      const match=!!query && button.textContent.toLocaleLowerCase('ko').includes(query);
      button.classList.toggle('is-match',match); if(match)matches++;
    });
    q('[data-sample-caption]').textContent=!selectable().length?'현재 메시지를 받을 수 있는 이글루가 없습니다.':query?(matches?matches+'명을 지도에서 찾았어요.':'일치하는 이름이 없어요.'):'지도에서 이름을 눌러 선택하세요. 잠긴 이글루에도 보낼 수 있어요.';
  }
  function renderRecipients() {
    for(const id of selected)if(!homes.some(home=>home.id===id&&home.owner))selected.delete(id);
    map.querySelectorAll('.lmail-person').forEach(button=>button.remove()); mapTip.hidden=true;
    const recipients=selectable().slice().sort((a,b)=>a.z-b.z||a.x-b.x);
    recipients.forEach(home=>{
      const button=document.createElement('button');
      button.type='button'; button.className='lmail-person'; button.dataset.home=home.id;
      button.setAttribute('aria-label',home.owner+' 선택');
      const name=document.createElement('span'); name.textContent=home.owner; button.append(name);
      const showName=()=>{
        if(name.scrollWidth<=name.clientWidth)return;
        mapTip.textContent=home.owner; mapTip.hidden=false;
        mapTip.style.left=Math.max(8,Math.min(map.clientWidth-mapTip.offsetWidth-8,button.offsetLeft-mapTip.offsetWidth/2))+'px';
        mapTip.style.top=Math.max(8,button.offsetTop-mapTip.offsetHeight-26)+'px';
      };
      button.onpointerenter=button.onfocus=showName;
      button.onpointerleave=button.onblur=()=>{mapTip.hidden=true;};
      button.onclick=()=>{selected.has(home.id)?selected.delete(home.id):selected.add(home.id); updateSelection();};
      map.append(button);
    });
    positionRecipients(); searchRecipients(); updateSelection();
  }
  new ResizeObserver(positionRecipients).observe(map);
  q('[data-search]').oninput=searchRecipients;
  q('[data-select-all]').onclick = () => {
    const eligible = selectable();
    const all = eligible.length && eligible.every(home => selected.has(home.id));
    selected.clear(); if (!all) eligible.forEach(home => selected.add(home.id)); updateSelection();
  };
  message.oninput = url.oninput = () => { message.setCustomValidity(''); url.setCustomValidity(''); };
  form.onsubmit = event => {
    event.preventDefault();
    if (!selected.size) return;
    if (!message.value.trim() && !url.value.trim()) { message.setCustomValidity('메시지나 링크를 하나 이상 입력해주세요.'); message.reportValidity(); return; }
    if (url.value.trim()) {
      let valid = false;
      try { valid = ['https:', 'http:'].includes(new URL(url.value.trim()).protocol); } catch {}
      if (!valid) { url.setCustomValidity('http 또는 https로 시작하는 링크를 입력해주세요.'); url.reportValidity(); return; }
    }
    q('[data-review-text]').textContent = message.value.trim() || '함께 볼 링크를 보냅니다.';
    const link = q('[data-review-url]'); link.hidden = !url.value.trim();
    if (!link.hidden) { link.href = url.value.trim(); link.textContent = url.value.trim(); }
    form.hidden = true; review.hidden = false; note.textContent = '받는 사람과 내용을 확인한 뒤 보내주세요.';
    q('.lmail-picker').inert=true; q('[data-select-all]').disabled=true;
  };
  q('[data-edit]').onclick = () => { if (busy) return; review.hidden = true; form.hidden = false; q('.lmail-picker').inert=false; updateSelection(); message.focus(); };
  q('[data-send]').onclick = async () => {
    if (busy || loading || !selected.size) return;
    const recipients = [...new Set(selectable().filter(h => selected.has(h.id)).map(h => h.recipientId))];
    busy = true; q('[data-send]').disabled = true; q('[data-edit]').disabled = true;
    note.textContent = '보내는 중이에요…';
    try {
      const count = await backend.sendMail(recipients, { body: message.value.trim(), link: url.value.trim() });
      note.textContent = `${count}명에게 메시지를 보냈어요.`;
      q('[data-send]').textContent = '전송 완료';
      message.value = ''; url.value = ''; selected.clear();
    } catch (error) {
      note.textContent = error?.message || '보내지 못했어요. 다시 시도해 주세요.';
      q('[data-send]').disabled = false; q('[data-edit]').disabled = false;
    } finally { busy = false; }
  };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function close() { if (dialog.open && !busy) { revision++; dialog.close(); } }
  q('.lmail-close').onclick = close;
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  dialog.addEventListener('close', () => { onClose?.(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
  return {
    async open() {
      if (dialog.open) return;
      const request = ++revision;
      previousFocus = document.activeElement;
      review.hidden = true; form.hidden = false; q('.lmail-picker').inert=false;
      q('[data-send]').disabled = false; q('[data-send]').textContent = '보내기'; q('[data-edit]').disabled = false;
      homes=[]; selected.clear(); q('[data-search]').value=''; renderRecipients(); loading=true;
      q('[data-sample-caption]').textContent = '받는 사람을 불러오는 중이에요…';
      onOpen?.(); dialog.showModal(); q('.lmail-close').focus({ preventScroll: true });
      try {
        const member = await backend.getMembership();
        if (!member?.approved) throw new Error('승인된 회원으로 로그인해주세요.');
        const loaded = await getHomes();
        if (request !== revision || !dialog.open) return;
        homes = loaded.map(home => ({ ...home })); renderRecipients();
      } catch (error) {
        if (request === revision && dialog.open) q('[data-sample-caption]').textContent = error?.message || '받는 사람을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.';
      } finally { if (request === revision) loading = false; }
    },
    close,
    isOpen: () => dialog.open
  };
}
