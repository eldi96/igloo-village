// 마을 광장 보드: 파스텔 글래스모피즘 벤토 그리드.
// 왼쪽 위 = 새로 올라온 프로젝트(3초마다 자동 전환), 왼쪽 아래 = 피드백을 기다리는 프로젝트, 오른쪽 = 익명 실시간 채팅.
// 채팅은 기존 익명 메모 RPC를 쓰고, 열려 있는 동안 주기적으로 새 글을 가져온다(DB 변경 없음).
export function mountAnonymousBoard(backend, { getMember = () => null, getOwnerName = () => '', onVisitProject = () => {} } = {}) {
  const style = document.createElement('style');
  style.textContent = `
    .ab-surface{position:fixed;left:50%;top:50%;z-index:1800;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;
      width:min(1200px,calc(100vw - 40px));height:min(840px,calc(100dvh - 48px));padding:18px;
      color:#1c2541;font:inherit;font-size:16px;border-radius:36px;
      background:linear-gradient(150deg,rgba(255,247,244,.07),rgba(247,226,224,.04) 55%,rgba(240,226,236,.05));
      /* 바깥 패널에는 backdrop-filter를 쓰지 않는다: 겹치면 안쪽 칸의 블러가 마을을 못 보고 작동하지 않는다. */
      border:1px solid rgba(255,255,255,.8);
      box-shadow:inset 0 1px 0 #fff,0 30px 80px rgba(60,30,40,.26),0 4px 14px rgba(60,30,40,.1);
      transform:translate(-50%,-50%);opacity:1;transition:opacity .28s cubic-bezier(.23,1,.32,1),transform .28s cubic-bezier(.23,1,.32,1)}
    .ab-surface:not(.ab-ready){opacity:0;transform:translate(-50%,-47%) scale(.97)}
    /* 바깥 틀과 칸 사이 빈 곳은 마우스를 통과시켜 마을 화면이 반응하게 하고, 칸과 돌아가기 버튼만 입력을 받는다. */
    .ab-surface{pointer-events:none}
    .ab-surface.ab-ready .ab-tile,.ab-surface.ab-ready .ab-top button{pointer-events:auto}
    .ab-surface[hidden]{display:none}
    .ab-surface *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#3a506b transparent}
    .ab-surface button{font:inherit;cursor:pointer;border:1px solid rgba(91,192,222,.35);border-radius:999px;background:rgba(255,255,255,.75);
      color:#1c2541;padding:7px 15px;transition:background .16s ease-out,transform .16s cubic-bezier(.23,1,.32,1),box-shadow .16s ease-out}
    .ab-surface button:focus-visible,.ab-surface textarea:focus-visible{outline:2px solid #5bc0de;outline-offset:2px}
    .ab-surface button:disabled{opacity:.4;cursor:default}
    .ab-top{display:flex;align-items:center;gap:14px;padding:4px 8px 0 12px}
    .ab-brand{font-weight:800;letter-spacing:.02em;color:#0b132b;font-size:1.05em}
    .ab-top .ab-back{margin-left:auto;font-size:.85em}
    .ab-bento{flex:1;min-height:0;display:grid;gap:14px;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);grid-template-rows:minmax(0,1.05fr) minmax(0,1.35fr) minmax(0,1.2fr);
      grid-template-areas:"new chat" "ask chat" "idea chat"}
    .ab-tile{position:relative;min-height:0;min-width:0;overflow:hidden;border-radius:28px;container-type:size;
      background:linear-gradient(160deg,rgba(255,255,255,.72),rgba(255,248,246,.6));
      -webkit-backdrop-filter:blur(18px) saturate(130%);backdrop-filter:blur(18px) saturate(130%);
      border:1px solid rgba(255,255,255,.7);box-shadow:inset 0 1px 0 #fff,0 10px 30px rgba(190,140,140,.16)}
    .ab-tile-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 20px 0}
    .ab-label{font-size:.7em;letter-spacing:.2em;text-transform:uppercase;color:#5bc0de}
    .ab-tile h3{margin:3px 0 0;font-size:1.12em;font-weight:750;color:#0b132b}
    .ab-note{font-size:.84em;color:#3a506b;padding:22px;line-height:1.6}
    /* 새 프로젝트 */
    .ab-new-tile{grid-area:new;display:flex;flex-direction:column}
    .ab-slides{position:relative;flex:1;min-height:0;overflow:hidden}
    .ab-slide-body button{margin-top:2px}
    .ab-slide{position:absolute;inset:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:center;padding:8px 22px 6px;
      opacity:0;transform:translate3d(100%,0,0);transition:transform 1s cubic-bezier(.45,.05,.2,1),opacity .6s ease-out;pointer-events:none}
    /* 옆으로 미는 슬라이드: 나가는 카드와 들어오는 카드가 동시에 같은 방향으로 움직인다(left=지나간 카드, right=다음 카드). */
    .ab-slide[data-pos="left"]{transform:translate3d(-100%,0,0)}
    .ab-slide[data-pos="center"]{opacity:1;transform:none;pointer-events:auto}
    .ab-slide[data-pos="center"] .ab-art{cursor:pointer}
    .ab-slide.is-snap{transition:none}
    .ab-art{flex:none;width:92px;height:92px;border-radius:22px;overflow:hidden;
      background:#3a506b;box-shadow:0 10px 24px rgba(91,192,222,.3)}
    .ab-art img{width:100%;height:100%;object-fit:cover;display:block}
    .ab-slide-body{min-width:0;display:flex;flex-direction:column;gap:4px}
    .ab-owner{font-size:.78em;color:#5bc0de;font-weight:600}
    .ab-upd{display:inline-block;margin:0 2px 0 4px;padding:1px 8px;border-radius:999px;background:rgba(91,192,222,.18);color:#5bc0de;font-size:.92em;font-weight:650}
    .ab-slide-body h4{margin:0;font-size:1.25em;line-height:1.2;color:#0b132b;overflow-wrap:anywhere;
      display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
    .ab-slide-body p{margin:0;font-size:.88em;line-height:1.55;color:#3a506b;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
    .ab-slide-body button{align-self:flex-start;margin-top:4px;font-size:.84em}
    .ab-dots{display:flex;gap:6px;justify-content:center;padding:0 0 10px}
    .ab-surface .ab-dots button{width:8px;height:8px;padding:0;border:0;border-radius:999px;background:#3a506b;transition:width .28s cubic-bezier(.23,1,.32,1),background-color .2s ease-out}
    .ab-surface .ab-dots button.is-on{width:24px;background:#5bc0de}
    /* 피드백 요청 */
    .ab-ask-tile{grid-area:ask;display:flex;flex-direction:column}
    .ab-ask-list{flex:1;min-height:0;overflow:hidden;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:8px;padding:10px 22px 14px}
    .ab-ask-list .ab-note{grid-row:1/-1;align-self:center;padding:0 4px;text-align:center}
    .ab-ask{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px 12px;border-radius:20px;
      background:rgba(255,255,255,.66);border:1px solid rgba(58,80,107,.22)}
    .ab-ask i{width:26px;height:26px;border-radius:50%}
    .ab-ask b{display:block;font-size:.92em;color:#1c2541;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ab-ask small{font-size:.74em;color:#3a506b}
    .ab-ask button{font-size:.8em;white-space:nowrap}
    .ab-ask.is-zero button{border:0;color:#0b132b;background:#5bc0de}
    /* 서비스 개선 의견 */
    .ab-idea-tile{grid-area:idea;display:flex;flex-direction:column}
    .ab-idea-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:12px 16px 16px 22px;scrollbar-gutter:stable;
      -webkit-mask-image:linear-gradient(to bottom,transparent,#000 12px,#000 calc(100% - 16px),transparent);
      mask-image:linear-gradient(to bottom,transparent,#000 12px,#000 calc(100% - 16px),transparent)}
    .ab-idea{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:10px 12px;border-radius:18px;
      background:rgba(255,255,255,.66);border:1px solid rgba(58,80,107,.22)}
    .ab-idea.is-done{opacity:.72}
    .ab-idea-main{min-width:0}
    .ab-idea-title{display:flex;align-items:center;gap:7px;min-width:0}
    .ab-idea-title b{font-size:.92em;color:#1c2541;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ab-tag{flex:none;font-size:.66em;padding:2px 8px;border-radius:999px;background:rgba(58,80,107,.14);color:#3a506b;font-weight:650}
    .ab-tag.st-in_progress{background:rgba(91,192,222,.2);color:#5bc0de}.ab-tag.st-done{background:rgba(110,200,150,.18);color:#2f7a52}.ab-tag.st-review{background:rgba(240,200,110,.18);color:#8a6a1c}
    .ab-idea small{font-size:.74em;color:#3a506b;line-height:1.45;margin-top:2px;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .ab-react{display:flex;gap:6px}
    .ab-surface .ab-react button{display:inline-grid;grid-template-columns:auto 3ch;justify-content:center;align-items:center;column-gap:6px;width:68px;padding:5px 0;font-size:.82em}
    .ab-num{text-align:right;font-variant-numeric:tabular-nums}.ab-ico{line-height:1}
    .ab-surface .ab-react button.is-on{background:rgba(91,192,222,.22);border-color:#5bc0de;color:#1c2541}
    .ab-surface .ab-react button.is-down.is-on{background:rgba(58,80,107,.14);border-color:#3a506b;color:#3a506b}
    .ab-mod{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}
    .ab-surface .ab-mod button{font-size:.72em;padding:3px 10px}
    .ab-sample{align-self:flex-start;margin:0 0 2px;padding:4px 12px;border-radius:999px;background:rgba(58,80,107,.12);color:#3a506b;font-size:.72em}
    .ab-surface .ab-react button:disabled{opacity:.75}
    .ab-idea.is-sample .ab-tag:first-of-type{background:rgba(58,80,107,.12);color:#3a506b}
    /* 칸 높이에 맞춰 내용을 줄인다 */
    @container (max-height:250px){
      .ab-ask small{display:none}.ab-ask{padding:6px 12px}.ab-ask-list{gap:6px}
      .ab-idea small{display:none}.ab-idea{padding:7px 12px}.ab-idea-list{gap:6px}
    }
    @container (max-height:190px){
      .ab-slide-body p{display:none}.ab-art{width:72px;height:72px;border-radius:18px}.ab-slide{gap:14px}
    }
    @container (max-height:150px){.ab-owner{display:none}.ab-tile-head{padding-top:10px}}
    /* 채팅 */
    .ab-chat-tile{grid-area:chat;display:flex;flex-direction:column}
    .ab-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px 14px;border-bottom:1px solid rgba(58,80,107,.22)}
    .ab-live{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;background:rgba(91,192,222,.15);color:#5bc0de;font-size:.78em;font-weight:600;white-space:nowrap}
    .ab-live::before{content:'';width:8px;height:8px;border-radius:50%;background:#5bc0de;animation:ab-pulse 2s infinite}
    .ab-live.is-off{background:rgba(58,80,107,.12);color:#3a506b}.ab-live.is-off::before{background:#3a506b;animation:none}
    @keyframes ab-pulse{0%{box-shadow:0 0 0 0 rgba(91,192,222,.6)}70%,100%{box-shadow:0 0 0 8px rgba(91,192,222,0)}}
    .ab-hint{display:block;margin-top:3px;font-size:.72em;color:#3a506b}
    .ab-error{color:#b03a48;background:rgba(176,58,72,.1);padding:8px 22px;font-size:.85em}
    .ab-error[hidden]{display:none}
    .ab-feed{position:relative;flex:1;min-height:0;padding:16px 22px;overflow-y:auto;overscroll-behavior:contain;scrollbar-color:#3a506b transparent}
    .ab-surface .ab-older{display:block;margin:0 auto 14px;font-size:.8em}
    .ab-surface .ab-older[hidden]{display:none}
    .ab-posts{display:flex;flex-direction:column;gap:12px}
    .ab-post{display:flex;flex-direction:column;align-items:flex-start;max-width:80%;animation:ab-in .24s cubic-bezier(.23,1,.32,1)}
    .ab-post.is-mine{align-self:flex-end;align-items:flex-end}
    @keyframes ab-in{from{opacity:0;transform:translateY(6px)}}
    .ab-meta{display:flex;gap:8px;align-items:center;font-size:.72em;color:#3a506b;margin:0 6px 4px}
    .ab-meta strong{color:#3a506b;font-weight:650}
    .ab-surface .ab-meta button{padding:2px 10px;font-size:1em;border-color:rgba(176,58,72,.35);color:#b03a48;background:rgba(255,255,255,.6)}
    .ab-bubble{padding:11px 15px;border-radius:20px 20px 20px 6px;background:rgba(255,255,255,.9);border:1px solid rgba(58,80,107,.18);box-shadow:0 3px 10px rgba(11,19,43,.08)}
    .ab-post.is-mine .ab-bubble{border-radius:20px 20px 6px 20px;background:rgba(91,192,222,.22);border-color:rgba(91,192,222,.45)}
    .ab-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;margin:0;font-size:.96em;color:#1c2541;
      display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
    .ab-content[aria-expanded="true"]{display:block;overflow:visible}
    .ab-surface .ab-more{border:0;background:transparent;padding:6px 0 0;font-size:.8em;color:#5bc0de}
    .ab-status{font-size:.9em;color:#3a506b;text-align:center;padding:40px 4px}
    .ab-status:empty{display:none}
    .ab-surface .ab-new{position:sticky;bottom:4px;display:block;margin:10px auto 0;background:#5bc0de;color:#0b132b;border-color:#5bc0de;font-size:.8em}
    .ab-surface .ab-new[hidden]{display:none}
    .ab-compose{display:flex;gap:10px;align-items:flex-end;padding:14px 18px 16px;border-top:1px solid rgba(58,80,107,.22)}
    .ab-compose[hidden]{display:none}
    .ab-field{flex:1;min-width:0}
    .ab-compose textarea{width:100%;height:54px;resize:none;display:block;border:1px solid rgba(58,80,107,.35);border-radius:18px;
      background:rgba(255,255,255,.92);color:#1c2541;padding:11px 15px;font:inherit;font-size:.94em;line-height:1.4}
    .ab-compose textarea::placeholder{color:#7f93a8}
    .ab-counter{display:block;font-size:.7em;color:#7f93a8;margin:4px 0 0 8px}
    .ab-surface .ab-submit{height:54px;padding:0 22px;margin-bottom:19px;border:0;color:#0b132b;font-weight:650;background:#5bc0de}
    .ab-login{padding:14px 22px 18px;border-top:1px solid rgba(58,80,107,.22);font-size:.84em;color:#3a506b;text-align:center}
    .ab-login[hidden]{display:none}
    @media(max-width:860px){
      .ab-surface{padding:10px;gap:10px;border-radius:26px;font-size:15px;width:calc(100vw - 16px);height:calc(100dvh - 20px)}
      .ab-bento{display:flex;flex-direction:column;overflow-y:auto}
      .ab-new-tile{flex:0 0 190px}.ab-chat-tile{flex:0 0 72dvh}.ab-ask-tile{flex:0 0 250px}.ab-idea-tile{flex:0 0 300px}
      .ab-slide-body h4{font-size:1.1em}.ab-post{max-width:90%}}
    .ab-art{transition:transform .25s cubic-bezier(.23,1,.32,1)}
    @keyframes ab-tile-in{from{opacity:0;transform:translateY(10px)}}
    .ab-surface.ab-ready .ab-tile{animation:ab-tile-in .36s cubic-bezier(.23,1,.32,1) backwards;animation-delay:var(--d,0ms)}
    .ab-chat-tile{--d:0ms}.ab-new-tile{--d:40ms}.ab-ask-tile{--d:85ms}.ab-idea-tile{--d:130ms}
    /* 호버는 마우스 같은 포인터 기기에서만, 눌림은 어디서나 */
    @media (hover:hover) and (pointer:fine){
      .ab-surface button:hover:not(:disabled){background:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(11,19,43,.16)}
      .ab-surface .ab-dots button:hover:not(:disabled){transform:none;box-shadow:none}
      .ab-surface .ab-more:hover:not(:disabled){background:transparent;box-shadow:none;transform:none;text-decoration:underline}
      .ab-surface .ab-new:hover:not(:disabled){background:#7fd0e8}
      .ab-surface .ab-submit:hover:not(:disabled){background:#7fd0e8}
      .ab-slide[data-pos="center"] .ab-art:hover{transform:scale(1.03)}
    }
    .ab-surface button:active:not(:disabled){transform:scale(.97)}
    .ab-surface .ab-dots button:active:not(:disabled){transform:none}
    @container (max-height:215px){.ab-ask{padding:3px 12px}.ab-ask i{width:22px;height:22px}.ab-surface .ab-ask button{padding:4px 12px}}
    @media(prefers-reduced-motion:reduce){.ab-surface,.ab-surface *{transition:none!important;animation:none!important}}
  `;
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'ab-surface'; panel.hidden = true;
  panel.setAttribute('aria-label', '마을 광장 보드');
  panel.innerHTML = `
    <div class="ab-top"><span class="ab-brand">Igloo Village · 광장</span>
      <button type="button" class="ab-back">마을로 돌아가기</button></div>
    <div class="ab-bento">
      <section class="ab-tile ab-new-tile" aria-label="새로 올라온 프로젝트">
        <div class="ab-tile-head"><div><span class="ab-label">New</span><h3>새로 올라온 프로젝트</h3></div></div>
        <div class="ab-slides" aria-live="off"></div><div class="ab-dots"></div>
      </section>
      <section class="ab-tile ab-ask-tile" aria-label="피드백을 기다리는 프로젝트">
        <div class="ab-tile-head"><div><span class="ab-label">Feedback</span><h3>피드백을 기다려요</h3></div></div>
        <div class="ab-ask-list"></div>
      </section>
      <section class="ab-tile ab-idea-tile" aria-label="서비스 개선 의견">
        <div class="ab-tile-head"><div><span class="ab-label">Ideas</span><h3>서비스 개선 의견</h3></div></div>
        <div class="ab-idea-list"></div>
      </section>
      <section class="ab-tile ab-chat-tile" aria-label="익명 실시간 채팅">
        <header class="ab-chat-head"><div><span class="ab-label">Anonymous</span><h3>익명 채팅</h3><small class="ab-hint">개선 의견은 AI가 정리해 왼쪽에 올릴 수 있어요</small></div><span class="ab-live is-off">연결 중</span></header>
        <div class="ab-error" hidden role="alert"></div>
        <div class="ab-feed" aria-label="익명 메시지 목록">
          <button type="button" class="ab-older" hidden>이전 메시지 더 보기</button>
          <div class="ab-posts" aria-live="polite"></div><div class="ab-status"></div>
          <button type="button" class="ab-new" hidden>새 메시지 ↓</button>
        </div>
        <form class="ab-compose"><div class="ab-field"><textarea maxlength="500" placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)" aria-label="익명 메시지"></textarea>
          <span class="ab-counter">0 / 500</span></div><button type="submit" class="ab-submit">보내기</button></form>
        <div class="ab-login" hidden>로그인한 승인 회원만 메시지를 보낼 수 있어요. 읽기는 누구나 가능합니다.</div>
      </section>
    </div>`;
  document.body.append(panel);
  const $ = selector => panel.querySelector(selector);
  const list = $('.ab-posts'), status = $('.ab-status'), form = $('.ab-compose'), login = $('.ab-login');
  const input = $('textarea'), send = $('.ab-submit'), error = $('.ab-error'), feed = $('.ab-feed');
  const older = $('.ab-older'), newPill = $('.ab-new'), live = $('.ab-live');
  const slides = $('.ab-slides'), dots = $('.ab-dots'), askList = $('.ab-ask-list'), newTile = $('.ab-new-tile'), ideaList = $('.ab-idea-list');
  const PAGE_SIZE = 20, POLL_MS = 6000, SLIDE_MS = 3000;
  const ASK_COLORS = ['#5bc0de', '#7fd0e8', '#9ad7c4', '#a9b8f0', '#b9a7f0'];
  let canModerate = false, opened = false, loading = false, hasOlder = false, generation = 0, pollTimer = 0, unseen = 0;
  let slideTimer = 0, slideIndex = 0, slidePaused = false, pollCount = 0;
  let posts = []; // 오래된 것 → 최신 순
  let onExit = () => {};
  const showError = message => { error.hidden = !message; error.textContent = message || ''; };
  const dateLabel = iso => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
  const ago = iso => {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return minutes < 1 ? '방금' : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`;
  };
  const order = (a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nearBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
  const toBottom = () => { feed.scrollTop = feed.scrollHeight; unseen = 0; newPill.hidden = true; };
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const ownerLabel = project => { const name = getOwnerName(project.igloo_id); return name ? `${name}의 이글루` : `${project.igloo_id + 1}번 이글루`; };
  function visit(project) { const id = project.igloo_id; close(); onVisitProject(id); }

  // ── 프로젝트 타일 ──
  // dir: 1 = 다음(오른쪽에서 들어옴), -1 = 이전(왼쪽에서 들어옴). 움직이는 건 나가는 카드와 들어오는 카드뿐이고
  // 나머지는 애니메이션 없이 제자리로 맞춘다. 마지막 → 처음으로 돌 때도 오른쪽에서 들어온다.
  function showSlide(index, dir = 1) {
    const items = [...slides.children]; if (!items.length) return;
    const next = (index + items.length) % items.length, prev = slideIndex;
    const first = items.every(item => !item.dataset.pos);
    const wrapped = !first && dir > 0 && next < prev;
    const want = i => i === next ? 'center'
      : wrapped ? (i === prev ? 'left' : 'right')
      : i < next ? 'left' : 'right';
    items.forEach((item, i) => {
      const moving = !first && (i === next || i === prev);
      if (!moving || (wrapped && i === next)) {
        item.classList.add('is-snap');
        item.dataset.pos = wrapped && i === next ? 'right' : want(i); // 들어올 카드는 먼저 들어올 쪽에 둔다
      }
    });
    void slides.offsetWidth; // 위 위치를 먼저 확정한 뒤에 움직이는 카드만 전환한다
    items.forEach((item, i) => {
      item.dataset.pos = want(i);
      item.classList.remove('is-snap');
      item.inert = i !== next; // 화면 밖 카드의 버튼이 키보드 포커스를 받지 않게 한다
      item.setAttribute('aria-hidden', String(i !== next));
    });
    slideIndex = next;
    [...dots.children].forEach((dot, i) => dot.classList.toggle('is-on', i === next));
  }
  function startSlides() {
    clearInterval(slideTimer);
    if (slides.children.length > 1) slideTimer = setInterval(() => { if (!slidePaused) showSlide(slideIndex + 1); }, SLIDE_MS);
  }
  function renderProjects(projects) {
    slides.replaceChildren(); dots.replaceChildren(); askList.replaceChildren();
    if (!projects.length) {
      slides.append(el('p', 'ab-note', '아직 공개된 프로젝트가 없어요.'));
      askList.append(el('p', 'ab-note', '피드백을 기다리는 프로젝트가 없어요.'));
      return;
    }
    projects.slice(0, 8).forEach((project, i) => {
      const slide = el('article', 'ab-slide');
      const art = el('div', 'ab-art');
      if (project.image_url) { const img = el('img'); img.src = project.image_url; img.alt = ''; img.loading = 'lazy'; art.append(img); }
      const body = el('div', 'ab-slide-body');
      const go = el('button', null, '보러 가기'); go.type = 'button'; go.addEventListener('click', () => visit(project));
      // 업데이트를 알린 프로젝트는 "업데이트" 태그와 알린 시각, 바뀐 점 메모(있으면)를 보여 준다.
      const owner = el('span', 'ab-owner', ownerLabel(project));
      if (project.announced_at) owner.append(' ', el('span', 'ab-upd', '업데이트'), ' ' + ago(project.announced_at));
      body.append(owner, el('h4', null, project.title));
      const blurb = project.announced_at && project.update_note ? '바뀐 점 · ' + project.update_note : project.description;
      if (blurb) body.append(el('p', null, blurb));
      body.append(go);
      slide.append(art, body); slides.append(slide);
      art.addEventListener('click', () => visit(project)); // 이미지를 눌렀을 때만 이동한다(글자·빈 공간은 이동하지 않는다)
      const dot = el('button'); dot.type = 'button'; dot.setAttribute('aria-label', `${i + 1}번째 프로젝트 보기`);
      dot.addEventListener('click', () => { if (i !== slideIndex) showSlide(i, i > slideIndex ? 1 : -1); startSlides(); });
      dots.append(dot);
    });
    showSlide(0); startSlides();
    // 최신 순(조회가 최신 순)으로 댓글이 아직 없는 프로젝트 3개.
    // 업데이트를 알린 프로젝트는 그 뒤에 달린 댓글만 센다(fresh_comment_count).
    const waiting = projects.filter(project => !project.fresh_comment_count).slice(0, 3);
    if (!waiting.length) askList.append(el('p', 'ab-note', '모든 프로젝트에 피드백이 달렸어요. 고마워요!'));
    waiting.forEach((project, i) => {
      const row = el('div', 'ab-ask is-zero');
      const dot = el('i'); dot.style.background = ASK_COLORS[i % ASK_COLORS.length];
      const text = el('div'); text.append(el('b', null, project.title),
        el('small', null, `${ownerLabel(project)} · ${project.announced_at ? '업데이트 후 첫 피드백을 기다려요' : '첫 피드백을 기다려요'}`));
      const go = el('button', null, '피드백 남기기'); go.type = 'button'; go.addEventListener('click', () => visit(project));
      row.append(dot, text, go); askList.append(row);
    });
  }
  async function loadProjects() {
    clearInterval(slideTimer);
    if (!getMember()?.approved) {
      slides.replaceChildren(el('p', 'ab-note', '로그인한 마을 주민에게 새 프로젝트가 보여요.')); dots.replaceChildren();
      askList.replaceChildren(el('p', 'ab-note', '로그인하면 피드백을 기다리는 프로젝트를 볼 수 있어요.'));
      return;
    }
    const token = generation;
    slides.replaceChildren(el('p', 'ab-note', '프로젝트를 불러오는 중…'));
    try {
      const projects = await backend.listRecentProjects(12);
      if (opened && generation === token) renderProjects(projects);
    } catch (err) {
      console.warn('광장 보드: 프로젝트를 불러오지 못했어요:', err);
      if (opened && generation === token) {
        const retry = el('button', null, '다시 시도'); retry.type = 'button'; retry.addEventListener('click', loadProjects);
        const note = el('div', 'ab-note', '프로젝트를 불러오지 못했어요. '); note.append(retry);
        slides.replaceChildren(note); dots.replaceChildren();
        askList.replaceChildren(el('p', 'ab-note', '프로젝트를 불러오지 못해 표시할 수 없어요.'));
      }
    }
  }
  newTile.addEventListener('pointerenter', () => { slidePaused = true; });
  newTile.addEventListener('pointerleave', () => { slidePaused = false; });
  newTile.addEventListener('focusin', () => { slidePaused = true; });
  newTile.addEventListener('focusout', () => { slidePaused = false; });

  // ── 서비스 개선 의견(좋아요/싫어요) ──
  const NEXT_STATUS = { review: [['공개', 'voting']], voting: [['진행 중으로', 'in_progress']], in_progress: [['완료로', 'done']], done: [] };
  const STATUS_LABEL = { review: '검토 대기', in_progress: '진행 중', done: '반영 완료' };
  let ideas = [];
  // 실제 의견이 올라오기 전에 보이는 예시. 채팅에 나온 주제를 본뜬 것이며, 누를 수 없다.
  const SAMPLE_IDEAS = [
    { title: '북극곰과 상호작용', summary: '먹이를 주거나 말을 걸 수 있으면 좋겠어요', category: '기능', mentions: 4, status: 'voting', ups: 12, downs: 1, my_value: 0 },
    { title: '1인칭으로 마을 걷기', summary: '메타버스처럼 직접 걸어 다니고 싶어요', category: '기능', mentions: 3, status: 'voting', ups: 9, downs: 2, my_value: 0 },
    { title: '호수에서 낚시하기', summary: '호수에서 즐길 수 있는 활동', category: '콘텐츠', mentions: 2, status: 'in_progress', ups: 7, downs: 0, my_value: 0 },
    { title: '내 이글루 알림을 첫 화면에', summary: '댓글·반응을 들어오자마자 보여 주기', category: '디자인', mentions: 2, status: 'done', ups: 15, downs: 0, my_value: 0 }
  ];
  function renderIdeas(sample = false) {
    const shown = sample ? SAMPLE_IDEAS : ideas;
    if (!shown.length) { ideaList.replaceChildren(el('p', 'ab-note', '아직 정리된 개선 의견이 없어요.')); return; }
    const approved = Boolean(getMember()?.approved);
    const rows = shown.map(idea => {
      const row = el('article', 'ab-idea' + (idea.status === 'done' ? ' is-done' : '') + (sample ? ' is-sample' : ''));
      const main = el('div', 'ab-idea-main'), title = el('div', 'ab-idea-title');
      title.append(el('b', null, idea.title), el('span', 'ab-tag', idea.category));
      if (STATUS_LABEL[idea.status]) title.append(el('span', 'ab-tag st-' + idea.status, STATUS_LABEL[idea.status]));
      main.append(title, el('small', null, (idea.summary ? idea.summary + ' · ' : '') + '채팅에서 ' + idea.mentions + '번 언급'));
      const react = el('div', 'ab-react'), votable = idea.status === 'voting';
      for (const [value, icon, count, extra] of [[1, '👍', idea.ups, ''], [-1, '👎', idea.downs, ' is-down']]) {
        const button = el('button', (idea.my_value === value ? 'is-on' : '') + extra); button.type = 'button';
        button.append(el('span', 'ab-ico', icon), el('span', 'ab-num', count > 99 ? '99+' : String(count)));
        button.disabled = sample || !approved || !votable;
        button.setAttribute('aria-pressed', String(idea.my_value === value));
        button.setAttribute('aria-label', (value === 1 ? '좋아요 ' : '싫어요 ') + count);
        button.addEventListener('click', async () => {
          const next = idea.my_value === value ? 0 : value; // 같은 걸 다시 누르면 취소, 다른 걸 누르면 바뀜
          button.disabled = true;
          try { await backend.reactImprovementIdea(idea.id, next); await loadIdeas(); }
          catch (err) { showError(err.message || '반응 실패'); button.disabled = false; }
        });
        react.append(button);
      }
      row.append(main, react);
      if (canModerate && !sample) {
        const mod = el('div', 'ab-mod');
        for (const [label, status] of [...(NEXT_STATUS[idea.status] || []), ['숨김', 'hidden']]) {
          const button = el('button', null, '운영: ' + label); button.type = 'button';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await backend.setImprovementIdeaStatus(idea.id, status); await loadIdeas(); }
            catch (err) { showError(err.message || '상태 변경 실패'); button.disabled = false; }
          });
          mod.append(button);
        }
        row.append(mod);
      }
      return row;
    });
    const note = sample ? [el('p', 'ab-sample', '예시 화면이에요 · 개선 의견이 올라오면 실제 내용으로 바뀝니다')] : [];
    ideaList.replaceChildren(...note, ...rows);
  }
  async function loadIdeas() {
    const token = generation;
    try {
      const rows = await backend.listImprovementIdeas();
      if (opened && generation === token) { ideas = rows; renderIdeas(!rows.length); }
    } catch {
      if (opened && generation === token) renderIdeas(true); // 아직 DB에 없거나 일시 오류일 때도 예시로 모양을 보여 준다
    }
  }

  // ── 익명 채팅 ──
  let lastApproved = null;
  function refreshAccess() {
    const allowed = Boolean(getMember()?.approved);
    form.hidden = !allowed; login.hidden = allowed;
    if (!allowed && opened) input.value = '';
    // 열려 있는 동안 로그인·승인 상태가 바뀌면 왼쪽 칸도 새 상태로 다시 불러온다.
    if (opened && lastApproved !== null && lastApproved !== allowed) {
      refreshModerator().then(() => { if (opened) { loadProjects(); loadIdeas(); } });
    }
    lastApproved = allowed;
  }
  // 운영자 여부는 열 때마다 다시 확인한다. 실패하면 일반 사용자처럼 보인다.
  async function refreshModerator() {
    canModerate = false;
    if (!getMember()?.approved) return;
    try { canModerate = await backend.canModerateVillageBoard(); } catch { canModerate = false; }
  }
  function renderPost(post) {
    const article = el('article', 'ab-post' + (post.is_mine ? ' is-mine' : ''));
    const meta = el('div', 'ab-meta');
    const time = el('time', null, dateLabel(post.created_at)); time.dateTime = post.created_at;
    meta.append(el('strong', null, post.is_mine ? '나 (익명)' : '익명'), time);
    if (post.is_mine || canModerate) {
      const remove = el('button', null, post.is_mine ? '삭제' : '운영자 삭제'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!confirm(post.is_mine ? '이 메시지를 삭제할까요?' : '운영자 권한으로 이 메시지를 삭제할까요?')) return;
        remove.disabled = true; showError('');
        try {
          if (!await backend.deleteVillageBoardPost(post.id)) throw new Error('삭제할 수 없는 메시지입니다.');
          posts = posts.filter(p => p.id !== post.id); render();
        } catch (err) { showError(err.message || '삭제 실패'); remove.disabled = false; }
      });
      meta.append(remove);
    }
    const bubble = el('div', 'ab-bubble');
    const content = el('p', 'ab-content', post.content); content.setAttribute('aria-expanded', 'false');
    bubble.append(content);
    if (post.content.length > 260) {
      const expand = el('button', 'ab-more', '전체 보기'); expand.type = 'button';
      expand.addEventListener('click', () => {
        const expanded = content.getAttribute('aria-expanded') === 'true';
        content.setAttribute('aria-expanded', String(!expanded)); expand.textContent = expanded ? '전체 보기' : '접기';
      });
      bubble.append(expand);
    }
    article.append(meta, bubble);
    return article;
  }
  function render() {
    list.replaceChildren(...posts.map(renderPost));
    status.textContent = posts.length ? '' : '아직 메시지가 없어요. 먼저 말을 걸어 보세요.';
    older.hidden = !hasOlder;
  }
  function setLive(on) { live.classList.toggle('is-off', !on); live.textContent = on ? '실시간' : '연결 끊김 · 재시도 중'; }

  async function loadLatest() {
    if (!opened) return;
    loading = true; const token = generation;
    status.textContent = '메시지를 불러오는 중…'; showError('');
    try {
      const rows = await backend.listVillageBoardPosts(PAGE_SIZE + 1);
      if (!opened || generation !== token) return;
      hasOlder = rows.length > PAGE_SIZE;
      posts = rows.slice(0, PAGE_SIZE).reverse();
      render(); setLive(true); requestAnimationFrame(toBottom);
    } catch (err) {
      if (generation === token) { status.textContent = '메시지를 불러오지 못했습니다.'; showError(err.message || '조회 실패'); setLive(false); }
    } finally { if (generation === token) loading = false; }
  }
  async function loadOlder() {
    if (!opened || loading || !hasOlder || !posts.length) return;
    loading = true; older.disabled = true; const token = generation;
    try {
      const first = posts[0];
      const rows = await backend.listVillageBoardPosts(PAGE_SIZE + 1, { created_at: first.created_at, id: first.id });
      if (!opened || generation !== token) return;
      const before = feed.scrollHeight;
      hasOlder = rows.length > PAGE_SIZE;
      const known = new Set(posts.map(p => p.id));
      posts = [...rows.slice(0, PAGE_SIZE).filter(p => !known.has(p.id)).reverse(), ...posts];
      render(); feed.scrollTop += feed.scrollHeight - before; // 읽던 위치 유지
    } catch (err) { showError(err.message || '조회 실패'); }
    finally { loading = false; older.disabled = false; }
  }
  // 최신 메시지를 다시 받아 새 글은 추가하고, 그 범위에서 사라진(삭제된) 글은 뺀다.
  async function poll() {
    if (!opened || loading || document.visibilityState !== 'visible') return;
    const token = generation;
    try {
      const rows = await backend.listVillageBoardPosts(PAGE_SIZE);
      if (!opened || generation !== token || loading) return;
      setLive(true);
      if (++pollCount % 5 === 0) loadIdeas(); // 30초마다 개선 의견 점수도 갱신
      const fresh = new Map(rows.map(p => [p.id, p]));
      const boundary = rows.length === PAGE_SIZE ? rows.at(-1) : null;
      const stick = nearBottom();
      const kept = posts.filter(p => fresh.has(p.id) || (boundary && order(p, boundary) < 0));
      const known = new Set(kept.map(p => p.id));
      const added = rows.filter(p => !known.has(p.id));
      if (!added.length && kept.length === posts.length) return;
      posts = [...kept.map(p => fresh.get(p.id) || p), ...added].sort(order);
      render();
      if (stick) toBottom();
      else if (added.length) { unseen += added.length; newPill.textContent = `새 메시지 ${unseen}개 ↓`; newPill.hidden = false; }
    } catch { if (generation === token) setLive(false); }
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(poll, POLL_MS); }
  function stopPolling() { clearInterval(pollTimer); pollTimer = 0; }

  function close() {
    if (!opened) return;
    opened = false; generation++; stopPolling(); clearInterval(slideTimer);
    panel.classList.remove('ab-ready'); panel.hidden = true; onExit();
  }
  function open(exitCallback = () => {}) {
    if (opened) return;
    onExit = exitCallback; opened = true; generation++; panel.hidden = false;
    posts = []; hasOlder = false; unseen = 0; newPill.hidden = true; slidePaused = false;
    pollCount = 0; ideas = [];
    render(); live.classList.add('is-off'); live.textContent = '연결 중';
    lastApproved = null; refreshAccess(); loadProjects();
    ideaList.replaceChildren(el('p', 'ab-note', '불러오는 중…'));
    refreshModerator().then(() => { if (opened) { loadLatest(); loadIdeas(); startPolling(); } });
    $('.ab-back').focus();
  }
  older.addEventListener('click', loadOlder);
  newPill.addEventListener('click', toBottom);
  feed.addEventListener('scroll', () => { if (nearBottom()) { unseen = 0; newPill.hidden = true; } });
  $('.ab-back').addEventListener('click', close);
  form.addEventListener('submit', async event => {
    event.preventDefault(); const content = input.value.trim();
    if (!content || content.length > 500) return showError('메시지는 1~500자로 작성해 주세요.');
    send.disabled = true; showError('');
    try {
      await backend.createVillageBoardPost(content);
      input.value = ''; $('.ab-counter').textContent = '0 / 500';
      await poll(); toBottom();
    } catch (err) { showError(err.message || '전송 실패'); }
    finally { send.disabled = false; input.focus(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener('input', () => { $('.ab-counter').textContent = `${input.value.length} / 500`; });
  // 카메라가 게시판 앞에 도착하면 보드를 보여 주고, 닫을 때까지 유지한다(마우스 흔들림에 깜빡이지 않게).
  function setArrived(ready) { if (opened && ready) panel.classList.add('ab-ready'); }
  document.addEventListener('keydown', event => {
    if (opened && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  });
  document.addEventListener('visibilitychange', () => { if (opened && document.visibilityState === 'visible') poll(); });
  return { open, close, refreshAccess, setArrived, get isOpen() { return opened; } };
}
