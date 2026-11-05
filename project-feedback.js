// 프로젝트별 댓글과 반응. 다른 카드로 바뀐 뒤 도착한 응답은 표시하지 않는다.
export function mountProjectFeedback(root, backend) {
  root.innerHTML = `<div class="feedback-head"><h3>피드백</h3><div class="feedback-reactions" aria-label="프로젝트 반응"><button type="button" data-emoji="👍" aria-label="좋아요" aria-pressed="false" disabled>👍 <span>0</span></button><button type="button" data-emoji="❤️" aria-label="하트" aria-pressed="false" disabled>❤️ <span>0</span></button></div></div><p class="feedback-status" role="status"></p><ul class="feedback-list" aria-label="프로젝트 댓글"></ul><form class="feedback-form"><label>댓글 남기기<textarea name="comment" maxlength="1000" rows="3" required placeholder="사용해 본 소감이나 개선 아이디어를 남겨 주세요."></textarea></label><div class="feedback-submit"><span>최대 1,000자</span><button type="submit" class="room-btn">댓글 등록</button></div></form>`;
  const list = root.querySelector('.feedback-list');
  const status = root.querySelector('.feedback-status');
  const form = root.querySelector('form');
  const input = form.elements.comment;
  const submit = form.querySelector('button');
  const buttons = [...root.querySelectorAll('[data-emoji]')];
  let projectId = null, generation = 0, userId = null, reactions = [], busy = false, reactionBusy = new Set(), loading = false;
  function controls() {
    input.disabled = submit.disabled = !userId || busy || loading;
    buttons.forEach(button => { button.disabled = !userId || busy || loading;
      button.setAttribute('aria-busy', String(reactionBusy.has(button.dataset.emoji))); });
  }
  function paintReactions() {
    for (const button of buttons) {
      const rows = reactions.filter(row => row.emoji === button.dataset.emoji);
      button.querySelector('span').textContent = rows.length;
      button.setAttribute('aria-pressed', String(rows.some(row => row.member_id === userId)));
    }
  }
  function paintComments(rows) {
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'feedback-empty';
      empty.textContent = '아직 댓글이 없어요. 첫 피드백을 남겨 주세요.';
      list.append(empty);
      return;
    }
    for (const row of rows) {
      const item = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'feedback-comment-head';
      const name = document.createElement('strong');
      name.textContent = row.members?.display_name || '수강생';
      const date = document.createElement('time');
      date.dateTime = row.created_at;
      date.textContent = new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      head.append(name, date);
      const body = document.createElement('p');
      body.textContent = row.body;
      item.append(head, body);
      list.append(item);
    }
  }
  const message = error => /[가-힣]/.test(error?.message || '') ? error.message : '피드백을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  async function refresh(id, token, includeComments = true) {
    const result = await backend.getProjectFeedback(id);
    if (token !== generation) return;
    reactions = result.reactions;
    paintReactions();
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
    let saved = false;
    try {
      await backend.addProjectComment(id, body);
      saved = true;
      if (token !== generation) return;
      input.value = '';
      await refresh(id, token);
      if (token === generation) status.textContent = '댓글을 등록했어요.';
    } catch (error) {
      if (token === generation) status.textContent = saved ? '댓글은 저장됐지만 목록을 새로 불러오지 못했어요. 카드를 다시 열어 주세요.' : message(error);
    } finally {
      if (token === generation) { busy = false; controls(); }
    }
  });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!projectId || !userId || busy || reactionBusy.has(button.dataset.emoji) || loading) return;
    const id = projectId, token = generation, emoji = button.dataset.emoji;
    const remove = reactions.some(row => row.emoji === emoji && row.member_id === userId);
    reactionBusy.add(emoji);
    controls();
    try {
      await backend.setProjectReaction(id, emoji, !remove);
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
      projectId = id;
      userId = null;
      reactions = [];
      busy = false;
      reactionBusy.clear();
      loading = true;
      input.value = '';
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
        if (token === generation) status.textContent = '';
      } catch (error) {
        if (token === generation) { userId = null; status.textContent = message(error); }
      } finally {
        if (token === generation) { loading = false; controls(); }
      }
    },
    close() { generation++; projectId = userId = null; busy = loading = false; reactionBusy.clear(); controls(); }
  };
}
