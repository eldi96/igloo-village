// 프로젝트별 댓글과 반응. 다른 카드로 바뀐 뒤 도착한 응답은 표시하지 않는다.
export function mountProjectFeedback(root, backend, { onViewed = () => {}, onReact = () => {}, onLoaded = () => {}, isOwner = () => false } = {}) {
  root.innerHTML = `<div class="feedback-head"><h3>피드백</h3><div class="feedback-reactions" aria-label="프로젝트 반응"><button type="button" data-emoji="👍" aria-label="좋아요" aria-pressed="false" disabled><svg class="reaction-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="10" width="4.6" height="10.5" rx="2" fill="#7cc9e8"/><path d="M8.6 10.4 12 4.2c.4-.8 1.4-1.2 2.2-.8 1 .5 1.4 1.6 1.1 2.6l-.8 3h4.1c1.5 0 2.6 1.4 2.3 2.9l-1.3 6.5c-.25 1.2-1.3 2.1-2.5 2.1H10.4c-1 0-1.8-.8-1.8-1.8z" fill="#a8e1f5"/><path d="M8.6 17.4c3.8.9 7.6.5 11.4-1.2l-.4 2.4c-.25 1.2-1.3 2.1-2.5 2.1H10.4c-1 0-1.8-.8-1.8-1.8z" fill="#7cc9e8"/><ellipse cx="12.6" cy="7.4" rx="1.3" ry="2.1" transform="rotate(28 12.6 7.4)" fill="#fff" opacity=".75"/></svg><span>0</span></button><button type="button" data-emoji="❤️" aria-label="하트" aria-pressed="false" disabled><svg class="reaction-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-.4 0-.8-.15-1.1-.42C6.2 16.5 2.5 13.1 2.5 8.9 2.5 5.9 4.8 3.6 7.6 3.6c1.7 0 3.3.85 4.4 2.2 1.1-1.35 2.7-2.2 4.4-2.2 2.8 0 5.1 2.3 5.1 5.3 0 4.2-3.7 7.6-8.4 11.68-.3.27-.7.42-1.1.42z" fill="#ffb3c7"/><path d="M4.2 12.6c1.6 2.4 4.2 4.7 7.8 7.8 3.6-3.1 6.2-5.4 7.8-7.8-1.9 2.2-4.6 4.4-7.8 6.9-3.2-2.5-5.9-4.7-7.8-6.9z" fill="#f08fab"/><ellipse cx="7.6" cy="7.6" rx="2.2" ry="1.4" transform="rotate(-30 7.6 7.6)" fill="#fff" opacity=".75"/></svg><span>0</span></button></div></div><p class="feedback-status" role="status"></p><ul class="feedback-list" aria-label="프로젝트 댓글"></ul><form class="feedback-form"><label>댓글 남기기<textarea name="comment" maxlength="1000" rows="3" required placeholder="사용해 본 소감이나 개선 아이디어를 남겨 주세요."></textarea></label><div class="feedback-submit"><span>최대 1,000자</span><button type="submit" class="room-btn">댓글 등록</button></div></form>`;
  const list = root.querySelector('.feedback-list');
  const status = root.querySelector('.feedback-status');
  const form = root.querySelector('form');
  const input = form.elements.comment;
  const submit = form.querySelector('button');
  const buttons = [...root.querySelectorAll('[data-emoji]')];
  let filledFor = null, projectId = null, generation = 0, userId = null, reactions = [], busy = false, reactionBusy = new Set(), loading = false;
  function controls() {
    input.disabled = submit.disabled = !userId || busy || loading;
    list.querySelectorAll('button, textarea').forEach(control => { control.disabled = !userId || busy || loading; });
    buttons.forEach(button => { button.disabled = !userId || busy || loading;
      button.setAttribute('aria-busy', String(reactionBusy.has(button.dataset.emoji))); });
  }
  // 한국 날짜 기준 오늘 내가 누른 반응(날짜 칸이 없던 옛 기록은 오늘로 본다)
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const mineToday = row => row.member_id === userId && (row.reacted_on ?? today()) === today();
  function paintReactions() {
    for (const button of buttons) {
      const rows = reactions.filter(row => row.emoji === button.dataset.emoji);
      button.querySelector('span').textContent = rows.length > 99 ? '99+' : rows.length;
      button.setAttribute('aria-pressed', String(rows.some(mineToday)));
    }
  }
  const expanded = new Set();
  let replyTarget = null;
  const drafts = new Map();
  function action(label, handler) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'feedback-text-action';
    button.textContent = label;
    button.onclick = handler;
    return button;
  }
  async function writeComment(body, parentId, token) {
    const id = projectId;
    let saved = false;
    try {
      await backend.addProjectComment(id, body, parentId);
      saved = true;
      if (token !== generation) return;
      if (parentId) { drafts.delete(parentId); expanded.add(parentId); replyTarget = null; }
      else input.value = '';
      await refresh(id, token);
      if (token === generation) status.textContent = parentId ? '답글을 등록했어요.' : '댓글을 등록했어요.';
    } catch (error) {
      if (token === generation) status.textContent = saved ? '저장됐지만 목록을 불러오지 못했어요. 카드를 다시 열어 주세요.' : message(error);
    }
  }
  function paintComments(rows) {
    list.replaceChildren();
    if (!rows.some(row => !row.deleted_at)) {
      const empty = document.createElement('li');
      empty.className = 'feedback-empty';
      empty.textContent = '아직 댓글이 없어요. 첫 피드백을 남겨 주세요.';
      list.append(empty);
      return;
    }
    const repliesOf = id => rows.filter(row => row.parent_id === id && !row.deleted_at);
    function commentItem(row, isReply = false) {
      const item = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'feedback-comment-head';
      const name = document.createElement('strong');
      name.textContent = row.members?.display_name || '수강생';
      const date = document.createElement('time');
      date.dateTime = row.created_at;
      date.textContent = new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      head.append(name, date);
      let deleteConfirm = null;
      if (!row.deleted_at && row.member_id === userId) {
        deleteConfirm = document.createElement('div');
        deleteConfirm.className = 'feedback-delete-confirm'; deleteConfirm.hidden = true;
        deleteConfirm.setAttribute('role', 'group'); deleteConfirm.setAttribute('aria-label', '댓글 삭제 확인');
        const prompt = document.createElement('span'); prompt.textContent = '댓글을 삭제할까요?';
        const confirmActions = document.createElement('div'); confirmActions.className = 'feedback-delete-actions';
        const cancel = action('취소', () => { if (busy) return; deleteConfirm.hidden = true; requestDelete.focus(); });
        cancel.className = 'feedback-confirm-button';
        const remove = action('삭제', async () => {
          if (busy || loading) return;
          const token = generation, id = projectId;
          busy = true; controls(); remove.disabled = true; status.textContent = '';
          let saved = false;
          try {
            await backend.deleteProjectComment(row.id); saved = true;
            if (token !== generation) return;
            if (replyTarget === row.id) replyTarget = null;
            drafts.delete(row.id);
            await refresh(id, token);
            if (token === generation) status.textContent = '댓글을 삭제했어요.';
          } catch (error) {
            if (token === generation) status.textContent = saved ? '삭제됐지만 목록을 불러오지 못했어요. 카드를 다시 열어 주세요.' : message(error);
          } finally { if (token === generation) { busy = false; controls(); remove.disabled = false; } }
        });
        remove.className = 'feedback-confirm-button feedback-confirm-danger';
        confirmActions.append(cancel, remove); deleteConfirm.append(prompt, confirmActions);
        deleteConfirm.addEventListener('keydown', event => { if (event.key === 'Escape' && !busy) { deleteConfirm.hidden = true; requestDelete.focus(); } });
        const requestDelete = action('댓글 삭제', () => {
          if (busy || loading) return;
          deleteConfirm.hidden = false; cancel.focus();
        });
        requestDelete.className = 'feedback-menu-delete';
        requestDelete.setAttribute('aria-label', '댓글 삭제');
        requestDelete.title = '댓글 삭제';
        requestDelete.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
        head.append(requestDelete);
      }
      const body = document.createElement('p');
      body.textContent = row.deleted_at ? '삭제된 댓글입니다.' : row.body;
      if (row.deleted_at) body.className = 'feedback-deleted';
      item.append(head, body);
      if (deleteConfirm) item.append(deleteConfirm);
      if (isReply) { item.classList.add('feedback-reply'); return item; }
      const actions = document.createElement('div'); actions.className = 'feedback-comment-actions';
      if (!row.deleted_at) actions.append(action('답글', () => {
        if (!userId || busy || loading) return;
        replyTarget = replyTarget === row.id ? null : row.id;
        paintComments(rows);
        list.querySelector('.feedback-reply-form textarea')?.focus();
      }));
      const replies = repliesOf(row.id);
      if (replies.length) {
        const show = action(expanded.has(row.id) ? '답글 접기' : `답글 ${replies.length}개 보기`, () => {
          if (expanded.has(row.id)) expanded.delete(row.id); else expanded.add(row.id);
          paintComments(rows);
        });
        show.setAttribute('aria-expanded', String(expanded.has(row.id))); actions.append(show);
      }
      item.append(actions);
      if (replies.length && expanded.has(row.id)) {
        const nested = document.createElement('ul'); nested.className = 'feedback-replies'; nested.setAttribute('aria-label', '답글');
        replies.forEach(reply => nested.append(commentItem(reply, true))); item.append(nested);
      }
      if (replyTarget === row.id && !row.deleted_at) {
        const replyForm = document.createElement('form'); replyForm.className = 'feedback-form feedback-reply-form';
        const label = document.createElement('label'); label.textContent = '답글 남기기';
        const textarea = document.createElement('textarea'); textarea.rows = 2; textarea.maxLength = 1000; textarea.required = true;
        textarea.placeholder = '이 댓글에 답글을 남겨 주세요.'; textarea.value = drafts.get(row.id) || '';
        textarea.oninput = () => drafts.set(row.id, textarea.value);
        label.append(textarea);
        const footer = document.createElement('div'); footer.className = 'feedback-submit';
        const cancel = action('취소', () => { if (busy) return; drafts.delete(row.id); replyTarget = null; paintComments(rows); });
        const send = document.createElement('button'); send.type = 'submit'; send.className = 'room-btn'; send.textContent = '답글 등록';
        footer.append(cancel, send); replyForm.append(label, footer);
        replyForm.onsubmit = async event => {
          event.preventDefault();
          const text = textarea.value.trim();
          if (!text || !projectId || !userId || busy || loading) return;
          const token = generation; busy = true; controls(); status.textContent = '';
          try { await writeComment(text, row.id, token); }
          finally { if (token === generation) { busy = false; controls(); } }
        };
        item.append(replyForm);
      }
      return item;
    }
    rows.filter(row => !row.parent_id).forEach(row => {
      if (row.deleted_at) {
        // 원댓글은 숨기고 남아 있는 답글만 같은 위치에 표시한다.
        repliesOf(row.id).forEach(reply => list.append(commentItem(reply, true)));
      } else list.append(commentItem(row));
    });
    controls();
  }

  const message = error => /[가-힣]/.test(error?.message || '') ? error.message : '피드백을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  async function refresh(id, token, includeComments = true) {
    const result = await backend.getProjectFeedback(id);
    if (token !== generation) return;
    reactions = result.reactions;
    paintReactions();
    if (filledFor !== id) {   // 프로젝트를 처음 열 때 받은 반응 수만큼 이미지 창에 쌓아 둔다
      filledFor = id;
      const svgOf = Object.fromEntries(buttons.map(button => [button.dataset.emoji, button.querySelector('svg').outerHTML]));
      onLoaded(reactions.filter(row => svgOf[row.emoji]).map(row => ({ svg: svgOf[row.emoji], x: row.drop_x })));
    }
    if (includeComments) paintComments(result.comments);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = input.value.trim();
    if (!projectId || !userId || busy || loading || !body) return;
    const id = projectId, token = generation;
    busy = true;
    controls();
    status.textContent = '';
    try { await writeComment(body, null, token); }
    finally { if (token === generation) { busy = false; controls(); } }
  });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!projectId || !userId || busy || reactionBusy.has(button.dataset.emoji) || loading) return;
    const id = projectId, token = generation, emoji = button.dataset.emoji;
    const svg = button.querySelector('svg').outerHTML;
    if (isOwner()) { onReact(emoji, svg); return; }   // 내 이글루: 시험용으로 몇 번이든 떨어뜨리고 DB에는 쓰지 않는다
    if (reactions.some(row => row.emoji === emoji && mineToday(row))) return;   // 오늘 이미 눌렀다
    reactionBusy.add(emoji);
    controls();
    const dropX = onReact(emoji, svg);   // 누르자마자 이미지 창에 떨어뜨리고, 떨어진 가로 위치를 함께 저장한다
    try {
      await backend.addProjectReaction(id, emoji, dropX);
      if (token !== generation) return;
      await refresh(id, token, false);
    } catch (error) {
      if (token === generation) status.textContent = message(error);
    } finally {
      if (token === generation) { reactionBusy.delete(emoji); controls(); }
    }
  }));
  return {
    async open(id) {
      const token = ++generation;
      const openedAt = new Date().toISOString();
      projectId = id;
      userId = null;
      reactions = [];
      busy = false;
      reactionBusy.clear();
      loading = true;
      input.value = '';
      expanded.clear(); drafts.clear(); replyTarget = null;
      list.replaceChildren();
      paintReactions();
      controls();
      status.textContent = '피드백을 불러오는 중이에요.';
      try {
        const member = await backend.getMembership();
        if (token !== generation) return;
        if (!member?.approved) { status.textContent = '피드백은 로그인한 승인 회원만 이용할 수 있어요.'; return; }
        userId = member.id;
        await refresh(id, token);
        if (token === generation) {
          status.textContent = '';
          try { await onViewed(id, openedAt); }
          catch { if (token === generation) status.textContent = '댓글은 불러왔지만 알림 확인을 저장하지 못했어요. 다시 열어 주세요.'; }
        }
      } catch (error) {
        if (token === generation) { userId = null; status.textContent = message(error); }
      } finally {
        if (token === generation) { loading = false; controls(); }
      }
    },
    close() { filledFor = null; expanded.clear(); drafts.clear(); replyTarget = null; generation++; projectId = userId = null; busy = loading = false; reactionBusy.clear(); controls(); }
  };
}
