// 익명 게시판을 3D 판의 투영 영역에 붙인다. 별도 모달/배경 덮개는 사용하지 않는다.
export function mountAnonymousBoard(backend, { getMember = () => null } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .ab-surface{position:fixed;z-index:1800;box-sizing:border-box;display:flex;flex-direction:column;
      background:rgba(242,232,209,.98);color:#3d3028;font:inherit;overflow:hidden;
      box-shadow:inset 0 0 22px #8b6e4b28;pointer-events:auto}
    .ab-surface[hidden]{display:none}
    .ab-surface[hidden]{display:none}
    .ab-surface *{box-sizing:border-box}
    .ab-surface button{font:inherit;cursor:pointer;border:1px solid #b49c7e;border-radius:7px;
      background:#f9f1e1;color:#493629;padding:5px 9px}
    .ab-surface button:disabled{opacity:.42;cursor:default}
    .ab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 14px 7px;border-bottom:1px solid #cab99d}
    .ab-head h2{font-size:1.28em;margin:0;font-weight:750;letter-spacing:.03em}
    .ab-head button{font-size:.86em;white-space:nowrap}
    .ab-error{color:#a43025;background:#fff2e7;padding:5px 12px;font-size:.82em}
    .ab-error[hidden]{display:none}
    .ab-feed{flex:1;min-height:0;padding:7px 13px;overflow-y:auto;overscroll-behavior:contain}
    .ab-post{padding:7px 0;border-bottom:1px dashed #c8b89d}
    .ab-meta{display:flex;gap:9px;align-items:center;font-size:.76em;color:#786551}
    .ab-meta button{margin-left:auto;padding:2px 7px;font-size:.96em}
    .ab-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.35;margin:3px 0 0;font-size:.91em;
      display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .ab-content[aria-expanded="true"]{display:block;overflow:visible}
    .ab-more{border:0!important;background:transparent!important;padding:2px!important;font-size:.75em!important}
    .ab-status{font-size:.85em;color:#786551;text-align:center;padding:14px 3px}
    .ab-pagination{display:flex;align-items:center;justify-content:center;gap:10px;padding:5px 12px;border-top:1px solid #cab99d}
    .ab-pagination span{font-size:.86em;color:#675442;font-variant-numeric:tabular-nums}
    .ab-compose{padding:8px 12px 10px;border-top:1px solid #cab99d}
    .ab-compose[hidden]{display:none}
    .ab-compose textarea{width:100%;height:54px;resize:none;display:block;border:1px solid #bea88c;
      border-radius:6px;background:#fffaf0;color:#3d3028;padding:6px 8px;font:inherit;font-size:.88em}
    .ab-compose-bottom{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:5px;font-size:.76em;color:#6d5746}
    .ab-compose-bottom button{font-size:1em}
    @media(max-width:650px){.ab-head{padding:5px 8px}.ab-head h2{font-size:1em}.ab-feed{padding:3px 7px}
      .ab-post{padding:4px 0}.ab-compose{padding:5px 7px}.ab-compose textarea{height:42px}
      .ab-pagination{padding:3px 7px}.ab-meta{font-size:.7em}}
    @media(prefers-reduced-motion:reduce){.ab-surface *{scroll-behavior:auto!important}}
  `;
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'ab-surface'; panel.hidden = true;
  panel.setAttribute('aria-label', '마을 익명 메모 게시판');
  panel.innerHTML = `
    <header class="ab-head"><h2>마을 익명 메모 게시판</h2><button type="button" class="ab-back">마을로 돌아가기</button></header>
    <div class="ab-error" hidden role="alert"></div>
    <div class="ab-feed" aria-label="익명 메모 목록"><div class="ab-posts"></div><div class="ab-status" aria-live="polite"></div></div>
    <nav class="ab-pagination" aria-label="메모 페이지"><button type="button" class="ab-prev">◀ 이전</button><span class="ab-page">1 페이지</span><button type="button" class="ab-next">다음 ▶</button></nav>
    <form class="ab-compose"><textarea maxlength="500" placeholder="자유롭게 메모를 남겨 주세요 (익명)" aria-label="익명 메모"></textarea>
    <div class="ab-compose-bottom"><span class="ab-counter">0 / 500</span><button type="submit" class="ab-submit">메모 남기기</button></div></form>`;
  document.body.append(panel);
  const $ = selector => panel.querySelector(selector);
  const posts = $('.ab-posts'), status = $('.ab-status'), form = $('.ab-compose');
  const input = $('textarea'), send = $('.ab-submit'), error = $('.ab-error');
  const prev = $('.ab-prev'), next = $('.ab-next'), page = $('.ab-page');
  const PAGE_SIZE = 4;
  let opened = false, loading = false, pageIndex = 0, hasNext = false, cursors = [null], generation = 0;
  let onExit = () => {};
  const showError = message => { error.hidden = !message; error.textContent = message || ''; };
  const dateLabel = iso => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
  function refreshAccess() {
    const allowed = Boolean(getMember()?.approved);
    form.hidden = !allowed;
    if (!allowed && opened) input.value = '';
  }
  function renderPost(post) {
    const article = document.createElement('article'); article.className = 'ab-post';
    const meta = document.createElement('div'); meta.className = 'ab-meta';
    const anonymous = document.createElement('strong'); anonymous.textContent = '익명';
    const time = document.createElement('time'); time.dateTime = post.created_at; time.textContent = dateLabel(post.created_at);
    meta.append(anonymous, time);
    if (post.is_mine) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '내 글 삭제';
      remove.addEventListener('click', async () => {
        if (!confirm('이 메모를 삭제할까요?')) return;
        remove.disabled = true; showError('');
        try {
          if (!await backend.deleteVillageBoardPost(post.id)) throw new Error('삭제할 수 없는 메모입니다.');
          await loadPage(pageIndex);
        } catch (err) { showError(err.message || '삭제 실패'); remove.disabled = false; }
      });
      meta.append(remove);
    }
    const content = document.createElement('p'); content.className = 'ab-content';
    content.textContent = post.content; content.setAttribute('aria-expanded','false');
    if (post.content.length > 120) {
      const expand = document.createElement('button'); expand.type='button'; expand.className='ab-more'; expand.textContent='전체 보기';
      expand.addEventListener('click', () => {
        const expanded = content.getAttribute('aria-expanded') === 'true';
        content.setAttribute('aria-expanded', String(!expanded)); expand.textContent = expanded ? '전체 보기' : '접기';
      });
      article.append(meta,content,expand);
    } else article.append(meta,content);
    return article;
  }
  async function loadPage(index) {
    if (!opened || loading || index < 0 || index >= cursors.length) return;
    loading = true; const token = ++generation;
    prev.disabled = true; next.disabled = true; status.textContent = '메모를 불러오는 중…';
    showError('');
    try {
      const rows = await backend.listVillageBoardPosts(PAGE_SIZE + 1, cursors[index]);
      if (!opened || generation !== token) return;
      const shown = rows.slice(0, PAGE_SIZE);
      posts.replaceChildren(...shown.map(renderPost));
      pageIndex = index; hasNext = rows.length > PAGE_SIZE;
      // 추가 1건은 존재 확인용이므로 다음 페이지의 커서는 현재 표시한 마지막 글을 사용한다.
      if (hasNext && shown.length) cursors[index + 1] = { created_at: shown.at(-1).created_at, id: shown.at(-1).id };
      else cursors.length = index + 1;
      status.textContent = shown.length ? '' : '아직 작성된 메모가 없어요.';
      page.textContent = `${index + 1} 페이지`;
      prev.disabled = index === 0; next.disabled = !hasNext;
      if (!shown.length && index > 0) { loading = false; return loadPage(index - 1); }
    } catch (err) {
      if (generation === token) { status.textContent = '메모를 불러오지 못했습니다.'; showError(err.message || '조회 실패'); }
    } finally { if (generation === token) loading = false; }
  }
  function reset() { generation++; loading = false; pageIndex = 0; hasNext = false; cursors = [null]; posts.replaceChildren(); return loadPage(0); }
  function close() { if (!opened) return; opened = false; generation++; panel.hidden = true; onExit(); }
  function open(exitCallback = () => {}) { if (opened) return; onExit = exitCallback; opened = true; panel.hidden = false; refreshAccess(); reset(); $('.ab-back').focus(); }
  next.addEventListener('click', () => { if (!loading && hasNext) loadPage(pageIndex + 1); });
  prev.addEventListener('click', () => { if (!loading && pageIndex > 0) loadPage(pageIndex - 1); });
  $('.ab-back').addEventListener('click', close);
  form.addEventListener('submit', async event => {
    event.preventDefault(); const content = input.value.trim();
    if (!content || content.length > 500) return showError('메모는 1~500자로 작성해 주세요.');
    send.disabled = true; showError('');
    try { await backend.createVillageBoardPost(content); input.value=''; $('.ab-counter').textContent='0 / 500'; await reset(); }
    catch (err) { showError(err.message || '작성 실패'); }
    finally { send.disabled = false; }
  });
  input.addEventListener('input', () => { $('.ab-counter').textContent = `${input.value.length} / 500`; });
  function placeOnFace(board, camera, viewportWidth, viewportHeight, closeEnough = true) {
    if (!opened) return;
    if (!closeEnough) { panel.style.visibility = 'hidden'; return; }
    const [a,b] = board.faceCorners();
    const topLeft = a.project(camera), bottomRight = b.project(camera);
    const left = (topLeft.x + 1) * .5 * viewportWidth;
    const top = (1 - topLeft.y) * .5 * viewportHeight;
    const right = (bottomRight.x + 1) * .5 * viewportWidth;
    const bottom = (1 - bottomRight.y) * .5 * viewportHeight;
    const width = right - left, height = bottom - top;
    if (topLeft.z < -1 || topLeft.z > 1 || width < 150 || height < 150) {panel.style.visibility = 'hidden'; return;}
    panel.style.visibility = 'visible';
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
    panel.style.width = `${width}px`; panel.style.height = `${height}px`;
    panel.style.fontSize = `${Math.max(10, Math.min(16, width / 47))}px`;
  }
  document.addEventListener('keydown', event => {
    if (opened && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  });
  return { open, close, refreshAccess, placeOnFace, get isOpen() { return opened; } };
}
