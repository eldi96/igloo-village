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
    .mailbox-scroll > p { flex-shrink:0; margin:12px 0 0; color:#dce9f0; font-size:12px; line-height:1.7; text-wrap:pretty; }
    .mailbox-scroll > h3 { margin:16px 0 0; font-size:14px; font-weight:500; }
    .mailbox-scroll { min-height:0; overflow-y:auto; overflow-x:hidden; }
    .mailbox-mail { margin-top:20px; padding-top:16px; border-top:1px solid var(--mail-edge); }
    .mailbox-mail h3 { margin:0; font-size:14px; font-weight:500; }
    .mailbox-mail > p { color:#d5e4ed; font-size:12px; }
    .mailbox-mail details { margin-top:8px; border:1px solid var(--mail-edge); border-radius:16px; background:rgba(225,244,255,.07); overflow:hidden; }
    .mailbox-mail summary { padding:12px; cursor:pointer; overflow-wrap:anywhere; font-size:12px; }
    .mailbox-mail summary:focus-visible { outline:2px solid #e7f6ff; outline-offset:-3px; }
    .mailbox-mail details p { margin:0 12px 12px; white-space:pre-wrap; overflow-wrap:anywhere; }
    .mailbox-mail a { display:block; margin:0 12px 12px; color:#e1f4ff; overflow-wrap:anywhere; }
    .comment-mailbox ul { display:grid; gap:8px; list-style:none; padding:0; margin:12px 0 0; scrollbar-width:thin; scrollbar-color:rgba(235,250,255,.3) transparent; }
    .comment-mailbox[data-empty=true] .mailbox-scroll > p { margin-top:20px; padding:16px; border:1px solid rgba(244,253,255,.22); border-radius:20px; background:linear-gradient(130deg,rgba(235,250,255,.10),rgba(220,239,250,.025)); box-shadow:inset 0 1px rgba(255,255,255,.20); }
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
  panel.setAttribute('aria-label', '내 우편함');
  panel.innerHTML = '<header><div class="mailbox-heading"><div class="mailbox-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></div><h2>우편함</h2></div><button type="button" class="mailbox-close" aria-label="우편함 닫기"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></header><div class="mailbox-scroll"><h3>새 댓글</h3><p role="status" data-comments-status></p><ul></ul><section class="mailbox-mail" aria-label="받은 메시지"><h3>받은 메시지</h3><p role="status" data-mail-status></p><div data-mail-list></div></section></div>';
  document.body.append(panel);
  const list = panel.querySelector('ul'), status = panel.querySelector('[data-comments-status]');
  const mailList = panel.querySelector('[data-mail-list]'), mailStatus = panel.querySelector('[data-mail-status]');
  panel.querySelector('button').onclick = () => { panel.hidden = true; };
  panel.onkeydown = event => { if (event.key === 'Escape') { panel.hidden = true; event.stopPropagation(); } };
  let userId = null, home = null, generation = 0, stop = null, stopMail = null, world = null, rows = [], mails = [], request = 0, glowRequest = 0, disposed = false, unreadHomes = [];
  // 이미 보여 준 알림 ID. 사용자가 닫은 뒤에는 새 알림이 올 때만 다시 연다.
  let shown = new Set(), autoPending = false;
  const expandedMail = new Set(), markingMail = new Set();
  function light() {
    const lit = new Set(unreadHomes);
    if (home !== null && mails.some(mail => !mail.read_at)) lit.add(home);
    world?.setUnreadMailboxes([...lit]); onLightChange();
  }
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
  function paintMail() {
    mailList.replaceChildren();
    const unread = mails.filter(mail => !mail.read_at).length;
    mailStatus.textContent = mails.length ? `${mails.length}개 · 안 읽은 메시지 ${unread}개` : '받은 메시지가 없어요.';
    const token = generation;
    for (const mail of mails) {
      const item = document.createElement('details'), title = document.createElement('summary');
      const label = () => `${mail.read_at ? '' : '새 메시지 · '}${new Date(mail.created_at).toLocaleString('ko-KR')}`;
      title.textContent = label(); item.append(title);
      const text = document.createElement('p'); text.textContent = mail.body; item.append(text);
      if (mail.link) {
        try {
          const parsed = new URL(mail.link);
          if (['https:', 'http:'].includes(parsed.protocol)) {
            const link = document.createElement('a'); link.href = parsed.href; link.textContent = mail.link;
            link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link);
          }
        } catch { /* 올바르지 않은 링크는 표시하지 않는다. */ }
      }
      item.open = expandedMail.has(mail.id);
      item.ontoggle = async () => {
        if (token !== generation || !item.isConnected) return;
        if (item.open) expandedMail.add(mail.id); else expandedMail.delete(mail.id);
        if (!item.open || mail.read_at || markingMail.has(mail.id)) return;
        markingMail.add(mail.id);
        try {
          const read = await backend.markMailRead(mail.id);
          if (token !== generation) return;
          const current = mails.find(row => row.id === mail.id);
          if (current) current.read_at = read.read_at;
          mail.read_at = read.read_at; title.textContent = label(); light();
          mailStatus.textContent = `${mails.length}개 · 안 읽은 메시지 ${mails.filter(row => !row.read_at).length}개`;
        } catch { if (token === generation) mailStatus.textContent = '읽음 표시를 저장하지 못했어요. 메시지를 다시 펼쳐 주세요.'; }
        finally { if (token === generation) markingMail.delete(mail.id); }
      };
      mailList.append(item);
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
    const [comments, inbox] = await Promise.allSettled([backend.getCommentNotifications(), backend.getInbox()]);
    if (token !== generation || seq !== request || disposed) return;
    if (comments.status === 'fulfilled') {
      rows = comments.value; paint();
      if (rows.some(row => !shown.has(row.id))) autoPending = true;
      rows.forEach(row => shown.add(row.id));
      if (autoPending && home !== null && canAutoOpen()) { autoPending = false; panel.hidden = false; }
    } else status.textContent = '댓글 알림을 불러오지 못했어요. 우편함을 다시 열어 주세요.';
    if (inbox.status === 'fulfilled') { mails = inbox.value; paintMail(); light(); }
    else mailStatus.textContent = '메시지를 불러오지 못했어요. 우편함을 다시 열어 주세요.';
  }

  async function setAccess(member, nextHome) {
    home = nextHome;
    const next = member?.approved ? member.id : null;
    if (next === userId) return;
    const token = ++generation; request++;
    stop?.(); stopMail?.(); stop = null; stopMail = null; userId = next; rows = []; mails = []; expandedMail.clear(); markingMail.clear(); shown = new Set(); autoPending = false; panel.hidden = true; light(); paint(); paintMail();
    refresh();
    if (!userId) return;
    try {
      const unsubscribe = await backend.subscribeCommentNotifications(refresh, value => { if (value === 'SUBSCRIBED' && token === generation) refresh(); });
      if (token !== generation) unsubscribe(); else stop = unsubscribe;
    } catch { /* 실시간 연결이 실패해도 주기적 조회로 복구한다. */ }
    if (token !== generation) return;
    try {
      const unsubscribe = await backend.subscribeInbox(refresh);
      if (token !== generation) unsubscribe(); else stopMail = unsubscribe;
    } catch { /* 메시지도 주기적 조회로 복구한다. */ }
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
    dispose() { disposed = true; glowRequest++; generation++; request++; stopCommentChanges(); stop?.(); stopMail?.(); clearInterval(timer); document.removeEventListener('visibilitychange', wake); panel.remove(); style.remove(); }
  };
}
