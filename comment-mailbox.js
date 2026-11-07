// 점등할 이글루 ID는 모두 조회하고, 알림 내용은 수신자 본인만 읽는다.
export function mountCommentMailbox(backend, { onOpen, onLightChange = () => {}, canAutoOpen = () => true }) {
  const style = document.createElement('style');
  style.textContent = `

    .comment-mailbox[hidden] { display:none; }
    .comment-mailbox { --mail-edge:rgba(244,253,255,.38); position:fixed; z-index:7; left:24px; top:76px; box-sizing:border-box; width:min(320px,calc(100vw - 48px)); max-height:calc(100dvh - 100px); display:flex; flex-direction:column; overflow:hidden; padding:20px; border:1px solid var(--mail-edge); border-radius:28px; background:linear-gradient(135deg,rgba(234,251,255,.19),rgba(220,237,248,.07) 42%,rgba(33,53,67,.19)); backdrop-filter:blur(28px) saturate(140%); -webkit-backdrop-filter:blur(28px) saturate(140%); box-shadow:inset 0 1px 1px rgba(255,255,255,.5),inset 1px 0 rgba(255,255,255,.18),inset 0 -1px rgba(12,32,46,.15),0 16px 48px rgba(3,18,32,.19),0 3px 8px rgba(3,18,32,.08); color:#f2f8fb; font:400 13px/1.6 'Segoe UI','Malgun Gothic',system-ui,sans-serif; letter-spacing:-.015em; scrollbar-width:thin; scrollbar-color:rgba(235,250,255,.3) transparent; isolation:isolate; }
    .comment-mailbox::before { content:''; position:absolute; z-index:-1; pointer-events:none; inset:0; border-radius:inherit; background:radial-gradient(ellipse at 0 0,rgba(231,253,255,.17),transparent 56%),linear-gradient(115deg,transparent 42%,rgba(255,255,255,.045) 52%,transparent 65%); }
    .comment-mailbox header { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-shrink:0; }
    .mailbox-heading { display:flex; align-items:center; gap:12px; min-width:0; }
    .mailbox-emblem { display:grid; place-items:center; flex:none; width:36px; height:36px; border:1px solid rgba(245,253,255,.38); border-radius:50%; background:linear-gradient(145deg,rgba(238,253,255,.22),rgba(222,246,255,.04)); box-shadow:inset 0 1px rgba(255,255,255,.42),0 4px 12px rgba(5,25,40,.08); }
    .mailbox-emblem svg { width:18px; height:18px; }
    .comment-mailbox h2 { margin:0; font-size:16px; line-height:1.4; font-weight:500; letter-spacing:-.035em; }
    .comment-mailbox button { box-sizing:border-box; border:1px solid rgba(244,253,255,.32); color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; transition:background-color 160ms ease,border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease; }
    .comment-mailbox .mailbox-close { display:grid; place-items:center; flex:none; width:32px; height:32px; padding:0; border-radius:50%; background:linear-gradient(145deg,rgba(240,250,255,.14),rgba(220,240,255,.03)); box-shadow:inset 0 1px rgba(255,255,255,.23),0 2px 6px rgba(5,25,40,.06); }
    .mailbox-close svg { width:14px; height:14px; }
    .comment-mailbox > p { flex-shrink:0; margin:12px 0 0; color:#dce9f0; font-size:12px; line-height:1.7; text-wrap:pretty; }
    .comment-mailbox ul { display:grid; gap:8px; min-height:0; overflow:auto; list-style:none; padding:4px; margin:12px -4px -4px; scrollbar-width:thin; scrollbar-color:rgba(235,250,255,.3) transparent; }
    .comment-mailbox[data-empty=true] > p { margin-top:20px; padding:16px; border:1px solid rgba(244,253,255,.22); border-radius:20px; background:linear-gradient(130deg,rgba(235,250,255,.10),rgba(220,239,250,.025)); box-shadow:inset 0 1px rgba(255,255,255,.20); }
    .comment-mailbox ul:empty { display:none; }
    .comment-mailbox li { min-width:0; }
    .comment-mailbox li button { display:flex; align-items:center; gap:16px; width:100%; padding:14px 12px; text-align:left; border-radius:20px; background:linear-gradient(130deg,rgba(235,250,255,.14),rgba(220,239,250,.035) 60%,rgba(14,35,51,.10)); box-shadow:inset 0 1px rgba(255,255,255,.29),inset 0 -1px rgba(10,32,47,.10),0 4px 12px rgba(4,24,40,.055); }
    .mailbox-copy { flex:1; min-width:0; }
    .comment-mailbox strong { display:block; overflow-wrap:anywhere; font-size:13px; font-weight:500; line-height:1.5; }
    .comment-mailbox .mailbox-meta { display:block; margin-top:6px; color:#d5e4ed; font-size:12px; overflow-wrap:anywhere; }
    .mailbox-arrow { display:grid; place-items:center; flex:none; width:28px; height:28px; border:1px solid rgba(240,251,255,.19); border-radius:50%; background:rgba(235,250,255,.04); }
    .mailbox-arrow svg { width:13px; height:13px; }
    @media(hover:hover) and (pointer:fine) { .comment-mailbox button:hover { border-color:rgba(248,254,255,.65); background-color:rgba(230,248,255,.12); box-shadow:inset 0 1px rgba(255,255,255,.46),0 6px 18px rgba(4,24,40,.10); transform:translateY(-1px); } }
    .comment-mailbox button:active { transform:translateY(0) scale(.985); }
    .comment-mailbox button:focus-visible { outline:2px solid #e7f6ff; outline-offset:4px; }
    @media(max-width:480px) { .comment-mailbox { left:16px; top:72px; width:calc(100vw - 32px); max-height:calc(100dvh - 88px); padding:20px; border-radius:28px; } .comment-mailbox li button { padding:14px 12px; } }
    @media(prefers-reduced-motion:reduce) { .comment-mailbox button { transition:none; } .comment-mailbox button:hover,.comment-mailbox button:active { transform:none; } }
  `;
  document.head.append(style);
  const panel = document.createElement('section'); panel.className = 'comment-mailbox'; panel.hidden = true;
  panel.setAttribute('aria-label', '내 프로젝트 댓글 알림');
  panel.innerHTML = '<header><div class="mailbox-heading"><div class="mailbox-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></div><h2>새 댓글</h2></div><button type="button" class="mailbox-close" aria-label="우편함 닫기"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></header><p role="status"></p><ul></ul>';
  document.body.append(panel);
  const list = panel.querySelector('ul'), status = panel.querySelector('p');
  panel.querySelector('button').onclick = () => { panel.hidden = true; };
  panel.onkeydown = event => { if (event.key === 'Escape') { panel.hidden = true; event.stopPropagation(); } };
  let userId = null, home = null, generation = 0, stop = null, world = null, rows = [], request = 0, glowRequest = 0, disposed = false, unreadHomes = [];
  // 이미 보여 준 알림 ID. 사용자가 닫은 뒤에는 새 알림이 올 때만 다시 연다.
  let shown = new Set(), autoPending = false;
  function light() { world?.setUnreadMailboxes(unreadHomes); onLightChange(); }
  function paint() {
    list.replaceChildren();
    panel.dataset.empty = String(rows.length === 0);
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.project_id)) groups.set(row.project_id, { row, count: 0 });
      groups.get(row.project_id).count++;
    }
    status.textContent = rows.length ? '프로젝트를 열어 댓글을 확인해 주세요.' : '새 댓글이 없어요.';
    for (const { row, count } of groups.values()) {
      const item = document.createElement('li'), button = document.createElement('button'); button.type = 'button';
      const title = document.createElement('strong'); title.textContent = row.projects?.title || '프로젝트';
      const text = document.createElement('span'); text.className = 'mailbox-meta';
      const author = row.project_comments?.members?.display_name || '다른 회원';
      text.textContent = `${author}님의 새 ${row.project_comments?.parent_id ? '답글' : '댓글'} · ${count}건`;
      const copy = document.createElement('div'); copy.className = 'mailbox-copy'; copy.append(title, text);
      const arrow = document.createElement('span'); arrow.className = 'mailbox-arrow'; arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>';
      button.append(copy, arrow);
      button.onclick = () => { panel.hidden = true; onOpen(row.project_id); };
      item.append(button); list.append(item);
    }
  }
  async function refreshLights() {
    const seq = ++glowRequest;
    try {
      const next = await backend.getUnreadMailboxHomes();
      if (disposed || seq !== glowRequest) return;
      unreadHomes = next; light();
    } catch { /* 실패 시 마지막 점등 상태를 유지하고 다음 조회에서 복구한다. */ }
  }
  async function refresh() {
    if (disposed) return;
    refreshLights();
    if (!userId) return;
    const token = generation, seq = ++request;
    try {
      const next = await backend.getCommentNotifications();
      if (token !== generation || seq !== request) return;
      rows = next; paint();
      // 새 댓글 알림이 있으면 우편함을 누르지 않아도 왼쪽 위 카드를 연다(포커스는 옮기지 않는다).
      if (rows.some(row => !shown.has(row.id))) autoPending = true;
      rows.forEach(row => shown.add(row.id));
      if (autoPending && home !== null && canAutoOpen()) { autoPending = false; panel.hidden = false; }
    } catch { if (token === generation && seq === request) status.textContent = '알림을 불러오지 못했어요. 잠시 후 우편함을 다시 열어 주세요.'; }
  }
  async function setAccess(member, nextHome) {
    home = nextHome;
    const next = member?.approved ? member.id : null;
    if (next === userId) return;
    const token = ++generation; request++;
    stop?.(); stop = null; userId = next; rows = []; shown = new Set(); autoPending = false; panel.hidden = true; light(); paint();
    refresh();
    if (!userId) return;
    try {
      const unsubscribe = await backend.subscribeCommentNotifications(refresh, value => { if (value === 'SUBSCRIBED' && token === generation) refresh(); });
      if (token !== generation) unsubscribe(); else stop = unsubscribe;
    } catch { /* 실시간 연결이 실패해도 주기적 조회로 복구한다. */ }
  }
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
  const wake = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', wake);
  const stopCommentChanges = backend.onCommentChange(refresh);
  refreshLights();
  return {
    setAccess, refresh,
    setWorld(value) { world = value; light(); },
    open() { if (!userId || home === null) return; panel.hidden = false; paint(); refresh(); panel.querySelector('button').focus(); },
    close() { panel.hidden = true; },
    dispose() { disposed = true; glowRequest++; generation++; request++; stopCommentChanges(); stop?.(); clearInterval(timer); document.removeEventListener('visibilitychange', wake); panel.remove(); style.remove(); }
  };
}
