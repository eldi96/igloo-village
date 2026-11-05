// 점등할 이글루 ID는 모두 조회하고, 알림 내용은 수신자 본인만 읽는다.
export function mountCommentMailbox(backend, { onOpen, onLightChange = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .comment-mailbox[hidden] { display: none; }
    .comment-mailbox { position: fixed; z-index: 7; left: 24px; top: 76px; box-sizing: border-box; width: min(360px, calc(100vw - 48px)); max-height: calc(100dvh - 110px); overflow: auto; padding: 20px; border: 1px solid rgba(255,245,230,.35); border-radius: 22px; background: linear-gradient(135deg, rgba(91,83,72,.7), rgba(29,31,31,.82)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: inset 0 1px rgba(255,255,255,.3); color: #fff3e4; font: 13px/1.6 system-ui; }
    .comment-mailbox header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .comment-mailbox h2 { margin: 0; font-size: 16px; }
    .comment-mailbox button { border: 1px solid rgba(255,245,230,.24); border-radius: 10px; background: rgba(255,255,255,.06); color: inherit; font: inherit; cursor: pointer; }
    .comment-mailbox header button { min-height: 34px; padding: 4px 10px; }
    .comment-mailbox ul { list-style: none; padding: 0; margin: 12px 0 0; }
    .comment-mailbox li + li { margin-top: 8px; }
    .comment-mailbox li button { display: block; width: 100%; padding: 12px; text-align: left; }
    .comment-mailbox li button:hover { background: rgba(255,255,255,.12); }
    .comment-mailbox strong, .comment-mailbox span { display: block; overflow-wrap: anywhere; }
    .comment-mailbox span { margin-top: 4px; color: #e5d5c3; font-size: 12px; }
    .comment-mailbox button:focus-visible { outline: 2px solid #fff0dd; outline-offset: 3px; }
  `;
  document.head.append(style);
  const panel = document.createElement('section'); panel.className = 'comment-mailbox'; panel.hidden = true;
  panel.setAttribute('aria-label', '내 프로젝트 댓글 알림');
  panel.innerHTML = '<header><h2>새 댓글</h2><button type="button">닫기</button></header><p role="status"></p><ul></ul>';
  document.body.append(panel);
  const list = panel.querySelector('ul'), status = panel.querySelector('p');
  panel.querySelector('button').onclick = () => { panel.hidden = true; };
  panel.onkeydown = event => { if (event.key === 'Escape') { panel.hidden = true; event.stopPropagation(); } };
  let userId = null, home = null, generation = 0, stop = null, world = null, rows = [], request = 0, glowRequest = 0, disposed = false, unreadHomes = [];
  function light() { world?.setUnreadMailboxes(unreadHomes); onLightChange(); }
  function paint() {
    list.replaceChildren();
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.project_id)) groups.set(row.project_id, { row, count: 0 });
      groups.get(row.project_id).count++;
    }
    status.textContent = rows.length ? '프로젝트를 열어 댓글을 확인해 주세요.' : '새 댓글이 없어요.';
    for (const { row, count } of groups.values()) {
      const item = document.createElement('li'), button = document.createElement('button'); button.type = 'button';
      const title = document.createElement('strong'); title.textContent = row.projects?.title || '프로젝트';
      const text = document.createElement('span');
      const author = row.project_comments?.members?.display_name || '다른 회원';
      text.textContent = `${author}님의 새 ${row.project_comments?.parent_id ? '답글' : '댓글'} · ${count}건`;
      button.append(title, text);
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
    } catch { if (token === generation && seq === request) status.textContent = '알림을 불러오지 못했어요. 잠시 후 우편함을 다시 열어 주세요.'; }
  }
  async function setAccess(member, nextHome) {
    home = nextHome;
    const next = member?.approved ? member.id : null;
    if (next === userId) return;
    const token = ++generation; request++;
    stop?.(); stop = null; userId = next; rows = []; panel.hidden = true; light(); paint();
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
