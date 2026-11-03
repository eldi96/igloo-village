// 등대 우편 작성 화면 시안. 저장·전송·사용자 권한은 아직 연결하지 않는다.
export function createLighthouseMail({ getHomes, hub, lighthouse, onOpen, onClose }) {
  const style = document.createElement('style');
  style.textContent = `
    .lmail { --paper:#eee9de; --ink:#283d3e; --muted:#73796f; --line:#d6d5c9; --gold:#a4864e; width:min(1050px,calc(100vw - 40px)); max-width:none; max-height:calc(100dvh - 40px); box-sizing:border-box; padding:0; border:1px solid #ffffff55; border-radius:20px; background:var(--paper); color:var(--ink); font:13px/1.6 system-ui,'Malgun Gothic',sans-serif; box-shadow:0 30px 100px #0007; overflow:auto; }
    .lmail::backdrop { background:rgba(3,12,20,.62); backdrop-filter:blur(4px); }
    .lmail * { box-sizing:border-box; }
    .lmail button,.lmail input,.lmail textarea { font:inherit; }
    .lmail button { cursor:pointer; }
    .lmail button:disabled { cursor:default; opacity:.42; }
    .lmail button:focus-visible,.lmail input:focus-visible,.lmail textarea:focus-visible { outline:2px solid #8a713f; outline-offset:3px; }
    .lmail-head { display:flex; justify-content:space-between; gap:20px; padding:26px 30px 22px; border-bottom:1px solid var(--line); }
    .lmail-kicker { font-size:10px; font-weight:600; letter-spacing:.18em; color:var(--muted); }
    .lmail h2 { margin:5px 0 6px; font-size:25px; font-weight:550; letter-spacing:-.04em; }
    .lmail p { margin:0; }
    .lmail-sub { color:var(--muted); font-size:12px; }
    .lmail-close { align-self:flex-start; width:34px; height:34px; border:1px solid var(--line); border-radius:50%; background:transparent; color:var(--ink); font-size:22px!important; line-height:1; }
    .lmail-body { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(310px,1fr); }
    .lmail-map-side { padding:24px; border-right:1px solid var(--line); min-width:0; }
    .lmail-map-top { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; }
    .lmail-eyebrow { color:var(--muted); font-size:11px; }
    .lmail-link { padding:3px 0; border:0; border-bottom:1px solid currentColor; background:transparent; color:var(--ink); font-size:11px!important; }
    .lmail-map { position:relative; width:100%; aspect-ratio:1.45; border:1px solid #d1d5ca; border-radius:12px; background:#e1e6dd; overflow:hidden; }
    .lmail-map svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .lmail-home { position:absolute; transform:translate(-50%,-50%); width:34px; height:34px; padding:6px; border:1px solid transparent; border-radius:50%; background:transparent; color:#536963; }
    .lmail-home svg { position:static; display:block; width:100%; height:100%; }
    .lmail-home:disabled { opacity:.28; }
    .lmail-home[aria-pressed="true"] { color:#fff; border-color:#a88a52; background:#36544d; box-shadow:0 0 0 3px #a88a5224; }
    .lmail-home-name { position:absolute; top:31px; left:50%; transform:translateX(-50%); white-space:nowrap; color:#43564d; font-size:9px; line-height:1.4; }
    .lmail-legend { display:flex; flex-wrap:wrap; gap:16px; align-items:center; margin-top:13px; color:var(--muted); font-size:10px; }
    .lmail-dot { width:7px; height:7px; display:inline-block; border-radius:50%; background:#48675c; margin-right:5px; }
    .lmail-dot.empty { background:#a6b3a5; }
    .lmail-empty { margin-top:22px; padding-top:16px; border-top:1px solid var(--line); }
    .lmail-empty p { color:var(--muted); font-size:12px; margin-bottom:7px; }
    .lmail-sample-note { color:#8a6f3b!important; }
    .lmail-form-side { padding:24px 28px; min-width:0; }
    .lmail-recipients { margin-bottom:22px; padding-bottom:18px; border-bottom:1px solid var(--line); }
    .lmail-count { margin-top:5px; font-size:19px; font-weight:550; letter-spacing:-.03em; }
    .lmail-names { min-height:18px; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
    .lmail label { display:block; margin:16px 0 7px; font-size:12px; font-weight:550; }
    .lmail textarea,.lmail input { display:block; width:100%; border:1px solid #c7cdc2; border-radius:9px; padding:11px 12px; color:var(--ink); background:#f8f5ed; box-shadow:inset 0 1px 2px #263a2b05; }
    .lmail textarea { resize:vertical; min-height:128px; max-height:280px; line-height:1.7; }
    .lmail input::placeholder,.lmail textarea::placeholder { color:#969b8e; }
    .lmail-form-foot { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-top:22px; }
    .lmail-primary { min-height:40px; border:1px solid #304a43; border-radius:9px; background:#304a43; color:#f5f3e9; padding:9px 15px; white-space:nowrap; }
    .lmail-small { max-width:145px; color:var(--muted); font-size:10px; line-height:1.6; }
    .lmail-review h3 { margin:0 0 10px; font-size:18px; font-weight:550; }
    .lmail-review-text { margin:18px 0!important; white-space:pre-wrap; overflow-wrap:anywhere; }
    .lmail-review a { color:#526e60; overflow-wrap:anywhere; }
    .lmail-review-note { margin:20px 0!important; padding:12px; border:1px solid var(--line); border-radius:8px; color:var(--muted); font-size:12px; }
    .lmail [hidden] { display:none!important; }
    @media(max-width:760px) { .lmail { width:calc(100vw - 24px); max-height:calc(100dvh - 24px); border-radius:16px; } .lmail-head { padding:20px; } .lmail h2 { font-size:22px; } .lmail-body { grid-template-columns:1fr; } .lmail-map-side { border-right:0; border-bottom:1px solid var(--line); padding:20px; } .lmail-form-side { padding:20px; } .lmail-empty { margin-top:14px; } }
    @media(hover:hover) { .lmail-home:not(:disabled):hover { border-color:#a3b0a0; background:#cad5c6; } .lmail-home[aria-pressed="true"]:hover { background:#3b5c52; } .lmail-primary:not(:disabled):hover { background:#3c5c50; } }
    @media(prefers-reduced-motion:no-preference) { .lmail[open] { animation:lmail-in 180ms cubic-bezier(.16,1,.3,1); } .lmail button { transition:background-color 120ms ease,transform 120ms ease; } .lmail button:active:not(:disabled) { transform:scale(.98); } .lmail-home:active:not(:disabled) { transform:translate(-50%,-50%) scale(.96); } @keyframes lmail-in { from { opacity:0; translate:0 6px; } to { opacity:1; translate:0 0; } } }
  `;
  document.head.appendChild(style);
  const dialog = document.createElement('dialog');
  dialog.className = 'lmail'; dialog.setAttribute('aria-labelledby', 'lmail-title');
  dialog.innerHTML = `
    <header class="lmail-head"><div><div class="lmail-kicker">LIGHTHOUSE POST · 미리보기</div><h2 id="lmail-title">마을에 보내기</h2><p class="lmail-sub">깃발이 있는 이글루를 골라, 함께 보고 싶은 이야기를 남겨보세요.</p></div><button type="button" class="lmail-close" aria-label="우편 작성 닫기">×</button></header>
    <div class="lmail-body"><section class="lmail-map-side" aria-label="받는 이글루 선택"><div class="lmail-map-top"><span class="lmail-eyebrow">01 — 받는 이글루</span><button class="lmail-link" type="button" data-select-all>전체 선택</button></div><div class="lmail-map" role="group" aria-label="마을 이글루 배치도"></div><div class="lmail-legend"><span><i class="lmail-dot"></i>입주한 이글루</span><span><i class="lmail-dot empty"></i>빈 이글루</span><span>잠긴 이글루에도 보낼 수 있어요</span></div><div class="lmail-empty"><p data-sample-caption></p><button type="button" class="lmail-link" data-sample-toggle>예시 수강생으로 보기</button></div></section>
    <section class="lmail-form-side"><div class="lmail-recipients" aria-live="polite"><div class="lmail-eyebrow">02 — 전할 이야기</div><div class="lmail-count" data-count>받는 사람을 골라주세요</div><div class="lmail-names" data-names></div></div><form data-compose><label for="lmail-message">메시지</label><textarea id="lmail-message" placeholder="이 영상의 접근 방식이 좋아서 함께 나눕니다."></textarea><label for="lmail-url">함께 볼 링크 <span class="lmail-eyebrow">선택</span></label><input id="lmail-url" type="url" placeholder="https://www.youtube.com/..." inputmode="url"><div class="lmail-form-foot"><p class="lmail-small">현재는 화면 시안입니다.<br>실제 우편은 발송되지 않아요.</p><button class="lmail-primary" type="submit" data-review disabled>내용 확인</button></div></form><div class="lmail-review" data-review-panel hidden><h3>보내기 전 확인</h3><p class="lmail-sub" data-review-to></p><p class="lmail-review-text" data-review-text></p><a data-review-url target="_blank" rel="noopener noreferrer" hidden></a><p class="lmail-review-note">실제 발송은 아직 연결하지 않았습니다. 이 화면에서는 받는 사람과 내용만 확인할 수 있어요.</p><div class="lmail-form-foot"><button type="button" class="lmail-link" data-edit>내용 수정</button><button type="button" class="lmail-primary" disabled>전송 연결 전</button></div></div></section></div>
  `;
  document.body.appendChild(dialog);
  const q = selector => dialog.querySelector(selector);
  const map = q('.lmail-map'), form = q('[data-compose]');
  const message = q('#lmail-message'), url = q('#lmail-url');
  const review = q('[data-review-panel]'), selected = new Set();
  let sampleMode = false, homes = [], previousFocus = null;
  const mx = x => (x + 42) / 84 * 100, mz = z => (z + 39) / 56 * 100;
  const svgX = x => mx(x) * 9, svgY = z => mz(z) * 6.2;
  const iglooIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17a9 9 0 0 1 18 0v2H3Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 19v-4a2 2 0 0 1 4 0v4M4 12h16M8 8l2 4m6-4-2 4M6 15h4m4 0h4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
  const selectable = () => homes.filter(home => home.owner);
  function updateSelection() {
    const recipients = selectable().filter(home => selected.has(home.id));
    q('[data-count]').textContent = recipients.length ? `선택한 수강생 ${recipients.length}명` : '받는 사람을 골라주세요';
    q('[data-names]').textContent = recipients.map(home => home.owner).join(' · ');
    q('[data-review]').disabled = !recipients.length;
    q('[data-select-all]').disabled = !selectable().length;
    q('[data-select-all]').textContent = recipients.length && recipients.length === selectable().length ? '선택 해제' : '전체 선택';
    map.querySelectorAll('.lmail-home:not(:disabled)').forEach(button => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.home)))));
    q('[data-review-to]').textContent = `받는 사람 · ${recipients.map(home => home.owner).join(', ')}`;
  }
  function renderMap() {
    homes = getHomes().map(home => ({ ...home }));
    if (sampleMode) [1, 4, 16, 22].forEach((id, i) => { if (homes[id]) homes[id].owner = `수강생 ${String(i + 1).padStart(2, '0')}`; });
    for (const id of selected) if (!homes.some(home => home.id === id && home.owner)) selected.delete(id);
    map.innerHTML = `<svg viewBox="0 0 900 620" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="lmail-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#637d6212" stroke-width="1"/></pattern></defs><rect width="900" height="620" fill="url(#lmail-grid)"/><g fill="none" stroke="#b3bea9" stroke-width="6" stroke-linecap="round"><path d="M450 477C407 438 475 389 444 298S468 173 450 34"/><path d="M400 480C318 426 244 430 50 459M500 472C584 422 650 374 845 367M450 522C470 558 441 580 449 610"/><ellipse cx="${svgX(hub.x)}" cy="${svgY(hub.z)}" rx="77" ry="62"/></g><ellipse cx="${svgX(hub.x)}" cy="${svgY(hub.z)}" rx="43" ry="33" fill="#afc4bf" stroke="#d1dad0" stroke-width="7"/><g transform="translate(${svgX(lighthouse.x)},${svgY(lighthouse.z)})" fill="#62766a"><path d="M-8 15-5-12H5L8 15ZM-7-14H7V-21H-7ZM-11-22 0-29 11-22Z"/><text y="31" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14">등대</text></g><text x="860" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#7f8e7d">N ↑</text></svg>`;
    homes.forEach(home => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'lmail-home'; button.dataset.home = home.id;
      button.style.left = mx(home.x) + '%'; button.style.top = mz(home.z) + '%';
      button.disabled = !home.owner;
      button.setAttribute('aria-label', home.owner ? `${home.owner} 이글루 선택` : '빈 이글루 — 수신 대상 없음');
      button.innerHTML = iglooIcon;
      if (home.owner) {
        button.setAttribute('aria-pressed', String(selected.has(home.id)));
        const name = document.createElement('span'); name.className = 'lmail-home-name'; name.textContent = home.owner; button.appendChild(name);
      }
      button.onclick = () => { selected.has(home.id) ? selected.delete(home.id) : selected.add(home.id); updateSelection(); };
      map.appendChild(button);
    });
    q('[data-sample-caption]').textContent = sampleMode ? '예시 수강생 4명으로 살펴보는 중입니다. 실제 입주 상태는 바뀌지 않아요.' : selectable().length ? '빈 이글루는 선택할 수 없습니다.' : '아직 깃발이 꽂힌 이글루가 없습니다.';
    q('[data-sample-caption]').classList.toggle('lmail-sample-note', sampleMode);
    q('[data-sample-toggle]').textContent = sampleMode ? '실제 마을로 돌아가기' : '예시 수강생으로 보기';
    updateSelection();
  }
  q('[data-select-all]').onclick = () => {
    const eligible = selectable();
    const all = eligible.length && eligible.every(home => selected.has(home.id));
    selected.clear(); if (!all) eligible.forEach(home => selected.add(home.id)); updateSelection();
  };
  q('[data-sample-toggle]').onclick = () => { sampleMode = !sampleMode; selected.clear(); review.hidden = true; form.hidden = false; renderMap(); };
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
    form.hidden = true; review.hidden = false;
  };
  q('[data-edit]').onclick = () => { review.hidden = true; form.hidden = false; message.focus(); };
  function close() { if (dialog.open) dialog.close(); }
  q('.lmail-close').onclick = close;
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  dialog.addEventListener('close', () => { onClose?.(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
  return {
    open() {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      review.hidden = true; form.hidden = false; renderMap(); onOpen?.(); dialog.showModal(); q('.lmail-close').focus({ preventScroll: true });
    },
    close,
    isOpen: () => dialog.open
  };
}
