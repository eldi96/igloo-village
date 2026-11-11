// 등대 책장의 자료보관함 창. 모두가 같은 창을 보고, 강사(또는 자료 담당) 계정에만 올리기·수정·삭제가 더 보인다.
// 실제 권한은 DB(instructor_materials RLS)가 다시 검사한다.
// 기본 분류 4개(DB material_categories에도 같은 id로 들어 있음). 강사가 추가한 분류는 폴더 아이콘과 중립색을 쓴다.
const DEFAULT_CATS = [
  { id: 'meeting', label: '면담 예약' }, { id: 'website', label: '웹사이트' }, { id: 'youtube', label: '유튜브' }, { id: 'lecture', label: '강의자료' }
];
const STYLES = {
  meeting: { tint: '#efe5d8', ink: '#9a8064' }, website: { tint: '#e3e7e3', ink: '#6d7b78' },
  youtube: { tint: '#efe0dc', ink: '#a46f63' }, lecture: { tint: '#e2e9df', ink: '#6b7f6e' }
};
const OTHER = { tint: '#ebe6df', ink: '#7d756c' };
const ICONS = {
  meeting: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="m9 14 2 2 4-4"/>',
  website: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5S14.5 17.9 12 20.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5Z"/>',
  lecture: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20Z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6"/>',
  other: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>'
};
const icon = (paths, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const COPY = '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 5.5v-.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5"/>';
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

export function youtubeId(url) {
  try {
    const u = new URL(url), host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com')) return u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] || null;
  } catch { /* 링크가 아니면 썸네일 없음 */ }
  return null;
}
const sourceOf = item => item.file_type === 'pdf' ? 'PDF 파일' : item.file_type === 'image' ? '이미지 파일' : (() => { try { return new URL(item.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
const linkOf = item => item.url || item.file_url || '';
const dateOf = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createLighthouseArchive({ backend, getMember, onOpen, onClose }) {
  const style = document.createElement('style');
  style.textContent = `
  .lar-veil { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 24px; background: rgba(52,44,36,.22); opacity: 0; transition: opacity 200ms cubic-bezier(.23,1,.32,1); }
  .lar-veil.is-open { opacity: 1; }
  .lar-veil[hidden] { display: none; }
  .lar [hidden] { display: none !important; }
  .lar { --bg: #f4efe8; --card: #f9f6f1; --line: rgba(98,88,76,.1); --ink: #2e332f; --sub: #8a8f89; --sage: #6b7f6e; --sage-soft: #e7ece5;
    width: min(1080px, 100%); height: min(680px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 20px; box-sizing: border-box;
    border-radius: 28px; background: var(--bg); box-shadow: 0 30px 70px rgba(60,46,32,.2), inset 0 1px rgba(255,255,255,.8);
    color: var(--ink); font: 400 12px/1.5 'Pretendard', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: -.005em;
    transform: translateY(8px) scale(.98); transition: transform 240ms cubic-bezier(.23,1,.32,1); overflow: hidden; }
  .lar-veil.is-open .lar { transform: none; }
  .lar-card { border-radius: 20px; background: var(--card); box-shadow: 0 6px 18px rgba(110,90,66,.07), 0 1px 2px rgba(110,90,66,.06), inset 0 1px rgba(255,255,255,.9); }
  .lar-label { margin: 0 0 12px; font-size: 9.5px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--sub); }
  .lar-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 4px 8px 4px; }
  .lar-kicker { margin: 0 0 6px; font-size: 9.5px; font-weight: 600; letter-spacing: .32em; color: var(--sub); }
  .lar h2 { margin: 0; font-size: 22px; font-weight: 300; letter-spacing: .06em; color: #262b27; }
  .lar-sub { margin: 4px 0 0; font-size: 11.5px; color: var(--sub); }
  .lar-head-actions { display: flex; gap: 8px; align-items: center; }
  .lar :where(button) { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; transition: transform 120ms ease-out, background-color 160ms ease-out, box-shadow 160ms ease-out, opacity 160ms ease-out; }
  .lar :where(button):active { transform: scale(.97); }
  .lar button:focus-visible, .lar a:focus-visible, .lar input:focus-visible, .lar textarea:focus-visible { outline: 2px solid var(--sage); outline-offset: 2px; }
  .lar-primary { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 999px; background: var(--sage); color: #fff !important; font-weight: 500; font-size: 12px; text-decoration: none; box-shadow: 0 4px 12px rgba(107,127,110,.28); }
  .lar-ghost { padding: 8px 16px; border-radius: 999px; background: var(--card); font-size: 12px; box-shadow: 0 2px 8px rgba(110,90,66,.08), inset 0 0 0 1px var(--line); }
  .lar-close { display: grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 0; border-radius: 50%; background: var(--card) !important; line-height: 1; color: var(--sub) !important; box-shadow: 0 2px 8px rgba(110,90,66,.08); }
  .lar-close svg { display: block; width: 14px; height: 14px; }
  .lar-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 248px minmax(0, 1fr) 280px; gap: 12px; }
  .lar-body.is-managing { grid-template-columns: 352px minmax(0, 1fr) 280px; }
  .lar-nav { min-height: 0; overflow-y: auto; padding: 18px 12px; display: flex; flex-direction: column; gap: 4px; }
  .lar-nav .lar-label { padding: 0 8px; }
  .lar-navhead { display: flex; justify-content: space-between; align-items: baseline; padding: 0 8px; }
  .lar-manage { font-size: 11px; color: var(--sage) !important; padding: 2px 4px; border-radius: 6px; }
  .lar-catedit { display: grid; grid-template-columns: minmax(0,1fr) auto 24px 24px 24px; gap: 6px; align-items: center; padding: 2px 4px 2px 6px; }
  .lar-catedit .lar-catmove { color: var(--ink) !important; background: rgba(255,255,255,.5); }
  .lar-catedit .lar-catmove:disabled { opacity: .3; cursor: default; }
  .lar-catedit .lar-catmove:not(:disabled):hover { background: var(--accent-soft, #dce6df); }
  .lar-catedit input, .lar-catadd input { min-width: 0; padding: 7px 10px; border-radius: 999px; border: 0; background: #fff; box-shadow: inset 0 0 0 1px var(--line); font: 12px/1.3 inherit; font-family: inherit; color: var(--ink); }
  .lar-catedit span { font-size: 11px; color: var(--sub); font-variant-numeric: tabular-nums; }
  .lar-catedit button { width: 24px; height: 24px; border-radius: 50%; color: #a4594d !important; font-size: 14px; }
  .lar-catadd { display: flex; gap: 6px; margin-top: 8px; padding: 0 4px; }
  .lar-catadd .lar-primary { padding: 7px 12px; flex: none; }
  .lar-caterr { padding: 0 8px; }
  .lar-cat { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-radius: 999px; font-size: 12.5px; text-align: left; }
  .lar-cat span:last-child { font-variant-numeric: tabular-nums; color: var(--sub); font-size: 11px; }
  .lar-cat.is-on { background: var(--sage); color: #fff; box-shadow: 0 4px 12px rgba(107,127,110,.28); }
  .lar-cat.is-on span:last-child { color: rgba(255,255,255,.8); }
  .lar-main { min-height: 0; display: flex; flex-direction: column; padding: 18px 12px 12px; }
  .lar-listhead { display: flex; justify-content: space-between; align-items: baseline; padding: 0 8px; }
  .lar-listhead .lar-label { margin-bottom: 10px; }
  .lar-sort { font-size: 11px; color: var(--sub); }
  .lar-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; padding: 2px; }
  .lar-item { display: grid; grid-template-columns: 52px minmax(0,1fr) auto; gap: 14px; align-items: center; padding: 8px 12px 8px 8px; border-radius: 16px; text-align: left; width: 100%; }
  .lar-item.is-on { background: var(--sage-soft); box-shadow: inset 0 0 0 1px rgba(107,127,110,.35); }
  .lar-thumb { width: 52px; height: 38px; border-radius: 11px; display: grid; place-items: center; overflow: hidden; background-size: cover; background-position: center; }
  .lar-title { font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lar-src { margin-top: 2px; font-size: 10.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lar-date { font-size: 10.5px; color: var(--sub); font-variant-numeric: tabular-nums; }
  .lar-empty { padding: 32px 16px; text-align: center; font-size: 11.5px; color: var(--sub); line-height: 1.7; }
  .lar-detail > .lar-empty { padding: 0; text-align: left; }
  .lar-detail { min-height: 0; overflow: auto; padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
  .lar-detail h3 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.45; word-break: keep-all; }
  .lar-meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .lar-tag { padding: 3px 9px; border-radius: 999px; background: var(--sage-soft); font-size: 10.5px; color: #55675a; font-variant-numeric: tabular-nums; }
  .lar-desc { margin: 0; font-size: 12px; line-height: 1.75; white-space: pre-wrap; word-break: keep-all; color: #4a504b; }
  .lar-links { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .lar-copy { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--card) !important; color: var(--sage) !important; box-shadow: 0 2px 8px rgba(110,90,66,.1), inset 0 0 0 1px var(--line); }
  .lar-copied { font-size: 11px; color: var(--sage); opacity: 0; transition: opacity 160ms ease-out; }
  .lar-copied.is-on { opacity: 1; }
  .lar-admin { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; }
  .lar-danger { color: #a4594d !important; }
  .lar-form { display: flex; flex-direction: column; gap: 12px; }
  .lar-form label { display: flex; flex-direction: column; gap: 6px; font-size: 9.5px; font-weight: 600; letter-spacing: .16em; color: var(--sub); }
  .lar-form input[type=text], .lar-form input[type=url], .lar-form textarea, .lar-form input[type=file] { padding: 9px 14px; border-radius: 14px; border: 0; background: #fff; box-shadow: inset 0 0 0 1px var(--line), 0 1px 3px rgba(110,90,66,.05); font: 12.5px/1.5 inherit; font-family: inherit; letter-spacing: 0; color: var(--ink); }
  .lar-form textarea { min-height: 88px; resize: vertical; }
  .lar-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .lar-chip { padding: 6px 12px; border-radius: 999px; background: #fff; font-size: 11px; letter-spacing: 0; font-weight: 500; box-shadow: inset 0 0 0 1px var(--line); }
  .lar-chip.is-on { background: var(--sage); color: #fff !important; box-shadow: none; }
  .lar-error { min-height: 16px; margin: 0; font-size: 11px; color: #a4594d; }
  @media (hover: hover) and (pointer: fine) {
    .lar-cat:not(.is-on):hover, .lar-item:not(.is-on):hover { background: rgba(107,127,110,.07); }
    .lar-primary:hover { background: #5f7362; }
    .lar-ghost:hover, .lar-close:hover, .lar-copy:hover { box-shadow: 0 4px 12px rgba(110,90,66,.14), inset 0 0 0 1px var(--line); }
  }
  @media (max-width: 900px) {
    .lar { height: auto; max-height: 100%; padding: 14px; }
    .lar-body, .lar-body.is-managing { grid-template-columns: minmax(0,1fr); overflow: auto; }
    .lar-body.is-managing .lar-nav { flex-direction: column; overflow: visible; }
    .lar-nav { flex-direction: row; overflow-x: auto; padding: 10px; }
    .lar-nav .lar-label { display: none; }
    .lar-cat { flex: none; gap: 8px; }
    .lar-list { overflow: visible; }
    .lar-detail { overflow: visible; }
    .lar-veil { padding: 12px; }
  }
  @media (prefers-reduced-motion: reduce) { .lar-veil, .lar { transition: none; } }`;
  document.head.append(style);

  const veil = document.createElement('div');
  veil.className = 'lar-veil'; veil.hidden = true;
  veil.innerHTML = `<section class="lar" role="dialog" aria-modal="true" aria-labelledby="lar-title">
    <header class="lar-head"><div><p class="lar-kicker">LIGHTHOUSE ARCHIVE</p><h2 id="lar-title">자료 아카이브</h2><p class="lar-sub">강사님이 모아 둔 면담 예약, 웹사이트, 영상, 강의자료</p></div>
      <div class="lar-head-actions"><button type="button" class="lar-primary" data-act="new" hidden>자료 올리기</button><button type="button" class="lar-close" data-act="close" aria-label="자료 아카이브 닫기"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13"/></svg></button></div></header>
    <div class="lar-body"><nav class="lar-nav lar-card" aria-label="자료 분류"></nav>
      <div class="lar-main lar-card"><div class="lar-listhead"><p class="lar-label lar-count">전체 0</p><span class="lar-sort">최신순</span></div><div class="lar-list" role="list"></div></div>
      <aside class="lar-detail lar-card" aria-live="polite"></aside></div></section>`;
  document.body.append(veil);
  const $ = sel => veil.querySelector(sel);
  const nav = $('.lar-nav'), list = $('.lar-list'), detail = $('.lar-detail'), count = $('.lar-count'), newBtn = $('[data-act=new]');
  let items = [], filter = 'all', selected = null, editing = null, loadError = '', open = false, closeTimer = 0;
  let cats = DEFAULT_CATS, managing = false, catError = '', ordering = false;
  const shownItems = () => filter === 'all' ? items : items.filter(i => i.category === filter);
  const labelOf = id => cats.find(c => c.id === id)?.label || '기타';
  let canEdit = false;   // 강사 계정 또는 자료 담당 명단(DB can_edit_materials)
  const isInstructor = () => canEdit;

  const thumb = item => {
    const id = item.url ? youtubeId(item.url) : null;   // 유튜브 링크면 분류와 상관없이 영상 썸네일
    const c = STYLES[item.category] || OTHER;
    return id ? `<span class="lar-thumb" style="background-image:url('https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg')"></span>`
      : `<span class="lar-thumb" style="background:${c.tint};color:${c.ink}">${icon(ICONS[item.category] || ICONS.other, 22)}</span>`;
  };
  function renderNav() {
    nav.parentElement.classList.toggle('is-managing', managing && isInstructor());
    const n = id => id === 'all' ? items.length : items.filter(i => i.category === id).length;
    const head = `<div class="lar-navhead"><p class="lar-label">Category</p>${isInstructor() ? `<button type="button" class="lar-manage" data-act="manage" ${ordering ? 'disabled' : ''}>${managing ? '완료' : '편집'}</button>` : ''}</div>`;
    if (managing && isInstructor()) {
      // 분류 관리: 이름을 고치면(엔터·포커스 아웃) 저장, ×로 삭제(자료가 남은 분류는 DB가 막는다), 아래 칸에서 새 분류 추가.
      nav.innerHTML = head + cats.map((c, index) => `<div class="lar-catedit"><input type="text" maxlength="20" value="${esc(c.label)}" data-rename="${c.id}" ${ordering ? 'disabled' : ''} aria-label="${esc(c.label)} 분류 이름"><span>${n(c.id)}</span><button type="button" class="lar-catmove" data-movecat="${c.id}" data-direction="-1" aria-label="${esc(c.label)} 위로 이동" ${ordering || index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="lar-catmove" data-movecat="${c.id}" data-direction="1" aria-label="${esc(c.label)} 아래로 이동" ${ordering || index === cats.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-delcat="${c.id}" ${ordering ? 'disabled' : ''} aria-label="${esc(c.label)} 분류 삭제">×</button></div>`).join('')
        + `<form class="lar-catadd"><input type="text" name="label" maxlength="20" ${ordering ? 'disabled' : ''} placeholder="새 분류 이름" aria-label="새 분류 이름"><button type="submit" class="lar-primary" ${ordering ? 'disabled' : ''}>추가</button></form><p class="lar-error lar-caterr" role="alert">${esc(catError)}</p>`;
      return;
    }
    nav.innerHTML = head + [{ id: 'all', label: '전체' }, ...cats].map(c => `<button type="button" class="lar-cat${filter === c.id ? ' is-on' : ''}" data-cat="${c.id}" aria-pressed="${filter === c.id}"><span>${esc(c.label)}</span><span>${n(c.id)}</span></button>`).join('');
  }
  function renderList() {
    const shown = filter === 'all' ? items : items.filter(i => i.category === filter);
    count.textContent = `${filter === 'all' ? 'All' : labelOf(filter)} · ${shown.length}`;
    if (loadError) { list.innerHTML = `<p class="lar-empty">${esc(loadError)}</p>`; return; }
    if (!shown.length) { list.innerHTML = `<p class="lar-empty">아직 올라온 자료가 없어요.${isInstructor() ? '<br>오른쪽 위 자료 올리기로 첫 자료를 남겨 보세요.' : ''}</p>`; return; }
    list.innerHTML = shown.map(i => `<button type="button" role="listitem" class="lar-item${selected?.id === i.id ? ' is-on' : ''}" data-id="${i.id}">${thumb(i)}<span style="min-width:0"><div class="lar-title">${esc(i.title)}</div><div class="lar-src">${esc(sourceOf(i))}</div></span><span class="lar-date">${dateOf(i.created_at)}</span></button>`).join('');
  }
  function renderDetail() {
    if (editing) return renderForm();
    if (!selected) { detail.innerHTML = `<p class="lar-empty">왼쪽 목록에서 자료를 골라 주세요.</p>`; return; }
    const i = selected, link = linkOf(i), openLabel = i.file_type === 'pdf' ? 'PDF 열기' : i.file_type === 'image' ? '이미지 크게 보기' : i.category === 'meeting' ? '면담 예약하러 가기' : '사이트 열기';
    detail.innerHTML = `<p class="lar-label" style="margin:0">Detail</p><h3>${esc(i.title)}</h3><div class="lar-meta"><span class="lar-tag">${esc(labelOf(i.category))}</span><span class="lar-tag">${esc(sourceOf(i))}</span><span class="lar-tag">${dateOf(i.created_at)}</span></div>
      ${i.description ? `<p class="lar-desc">${esc(i.description)}</p>` : ''}
      <div class="lar-links">${link ? `<a class="lar-primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${openLabel} <span aria-hidden="true">→</span></a><button type="button" class="lar-copy" data-act="copy" aria-label="링크 복사">${icon(COPY)}</button><span class="lar-copied" role="status"></span>` : '<span class="lar-src">파일 주소를 만들지 못했어요.</span>'}</div>
      ${isInstructor() ? '<div class="lar-admin"><button type="button" class="lar-ghost" data-act="edit">수정</button><button type="button" class="lar-ghost lar-danger" data-act="delete">삭제</button></div>' : ''}`;
  }
  function renderForm() {
    const e = editing, isNew = !e.id, fileMode = e.mode === 'file';
    detail.innerHTML = `<form class="lar-form" novalidate><h3>${isNew ? '자료 올리기' : '자료 수정'}</h3>
      <label>분류<div class="lar-chips">${cats.map(c => `<button type="button" class="lar-chip${e.category === c.id ? ' is-on' : ''}" data-chip="${c.id}" aria-pressed="${e.category === c.id}">${esc(c.label)}</button>`).join('')}</div></label>
      ${isNew ? `<label>자료 종류<div class="lar-chips"><button type="button" class="lar-chip${!fileMode ? ' is-on' : ''}" data-mode="link">링크</button><button type="button" class="lar-chip${fileMode ? ' is-on' : ''}" data-mode="file">PDF·이미지 파일</button></div></label>` : ''}
      <label>제목<input type="text" name="title" maxlength="120" value="${esc(e.title)}" required></label>
      ${fileMode ? (isNew ? '<label>파일 (20MB 이하 PDF·JPEG·PNG·WebP)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>' : '')
        : `<label>링크<input type="url" name="url" placeholder="https://" value="${esc(e.url)}"></label>`}
      <label>설명<textarea name="description" maxlength="2000">${esc(e.description)}</textarea></label>
      <p class="lar-error" role="alert"></p>
      <div class="lar-admin"><button type="submit" class="lar-primary">${isNew ? '올리기' : '저장'}</button><button type="button" class="lar-ghost" data-act="cancel">취소</button></div></form>`;
    detail.querySelector('[name=title]').focus();
  }
  const renderAll = () => { newBtn.hidden = !isInstructor(); renderNav(); renderList(); renderDetail(); };

  async function load(keepId = selected?.id) {
    loadError = '';
    try {
      [items, canEdit] = await Promise.all([backend.listMaterials(), backend.canEditMaterials()]);
      cats = await backend.listMaterialCategories().catch(() => DEFAULT_CATS);   // 분류 테이블 적용 전에는 기본 4개
      if (filter !== 'all' && !cats.some(c => c.id === filter)) filter = 'all';
    }
    catch (error) { items = []; loadError = ['42P01', 'PGRST205'].includes(error?.code) ? '자료보관함이 아직 준비되지 않았어요.' : (error?.message || '자료를 불러오지 못했어요.'); }
    selected = shownItems().find(i => i.id === keepId) || shownItems()[0] || null;
    renderAll();
  }

  veil.addEventListener('click', async event => {
    if (event.target === veil) return close();
    const t = event.target.closest('button'); if (!t) return;
    if (t.dataset.act === 'close') return close();
    // 분류를 바꾸면 오른쪽 상세도 그 분류의 첫 자료로 바꾼다(다른 분류의 링크가 남아 있지 않게).
    if (t.dataset.cat) { filter = t.dataset.cat; editing = null; selected = shownItems()[0] || null; renderNav(); renderList(); renderDetail(); return; }
    if (t.dataset.id) { selected = items.find(i => i.id === t.dataset.id) || null; editing = null; renderList(); renderDetail(); return; }
    if (t.dataset.act === 'manage') { managing = !managing; catError = ''; renderNav(); return; }
    if (t.dataset.movecat) {
      if (ordering) return;
      const index = cats.findIndex(c => c.id === t.dataset.movecat), direction = Number(t.dataset.direction);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= cats.length) return;
      const moving = cats[index], neighbor = cats[target];
      ordering = true; catError = ''; renderNav();
      let firstSaved = false;
      try {
        // 인접한 두 분류만 바꾸고 두 번째 저장 실패 시 첫 변경을 되돌린다.
        const a = Number(moving.sort_order), b = Number(neighbor.sort_order);
        if (a === b) throw new Error('같은 순서의 분류가 있어요. 새로고침 후 관리자에게 확인해 주세요.');
        await backend.setMaterialCategoryOrder(moving.id, b, a); firstSaved = true;
        await backend.setMaterialCategoryOrder(neighbor.id, a, b);
      } catch (error) {
        if (firstSaved) {
          try { await backend.setMaterialCategoryOrder(moving.id, Number(moving.sort_order), Number(neighbor.sort_order)); }
          catch { catError = '순서 저장이 중단됐어요. 목록을 확인하고 다시 시도해 주세요.'; }
        }
        if (!catError) catError = error?.message || '순서를 바꾸지 못했어요.';
      } finally {
        ordering = false; await load();
        nav.querySelector(`[data-movecat="${moving.id}"][data-direction="${direction}"]`)?.focus();
      }
      return;
    }
    if (t.dataset.delcat) {
      const c = cats.find(x => x.id === t.dataset.delcat);
      if (!c || !confirm(`'${c.label}' 분류를 삭제할까요?`)) return;
      try { await backend.deleteMaterialCategory(c.id); catError = ''; await load(); } catch (error) { catError = error?.message || '삭제하지 못했어요.'; renderNav(); }
      return;
    }
    if (t.dataset.act === 'new') { editing = { category: filter === 'all' ? (cats[0]?.id || 'website') : filter, title: '', description: '', url: '', mode: 'link' }; renderDetail(); return; }
    if (t.dataset.act === 'edit' && selected) { editing = { ...selected, url: selected.url || '', mode: selected.file_path ? 'file' : 'link' }; renderDetail(); return; }
    if (t.dataset.act === 'cancel') { editing = null; renderDetail(); return; }
    if (t.dataset.chip) { syncForm(); editing.category = t.dataset.chip; renderForm(); return; }
    if (t.dataset.mode) { syncForm(); editing.mode = t.dataset.mode; renderForm(); return; }
    if (t.dataset.act === 'copy' && selected) {
      const note = detail.querySelector('.lar-copied');
      try { await navigator.clipboard.writeText(linkOf(selected)); note.textContent = '링크를 복사했어요'; t.innerHTML = icon(CHECK); }
      catch { note.textContent = '복사하지 못했어요'; }
      note.classList.add('is-on');
      setTimeout(() => { note.classList.remove('is-on'); if (t.isConnected) t.innerHTML = icon(COPY); }, 1400);
      return;
    }
    if (t.dataset.act === 'delete' && selected) {
      if (!confirm(`'${selected.title}' 자료를 삭제할까요?`)) return;
      try { await backend.deleteMaterial(selected.id); selected = null; await load(null); }
      catch (error) { alert(error?.message || '삭제하지 못했어요.'); }
    }
  });
  const syncForm = () => {
    const f = detail.querySelector('form'); if (!f || !editing) return;
    editing.title = f.title.value; editing.description = f.description.value;
    if (f.url) editing.url = f.url.value;
  };
  veil.addEventListener('change', async event => {
    const id = event.target.dataset?.rename; if (!id) return;
    const c = cats.find(x => x.id === id), next = event.target.value.trim();
    if (!c || next === c.label) return;
    try { await backend.renameMaterialCategory(id, next); catError = ''; await load(); } catch (error) { catError = error?.message || '이름을 바꾸지 못했어요.'; event.target.value = c.label; renderNav(); }
  });
  veil.addEventListener('submit', async event => {
    event.preventDefault();
    if (event.target.classList.contains('lar-catadd')) {
      try { await backend.addMaterialCategory(event.target.label.value); catError = ''; await load(); nav.querySelector('.lar-catadd input')?.focus(); }
      catch (error) { catError = error?.message || '분류를 추가하지 못했어요.'; renderNav(); }
      return;
    }
    const f = event.target, err = f.querySelector('.lar-error'), submit = f.querySelector('[type=submit]');
    syncForm(); err.textContent = ''; submit.disabled = true; submit.style.opacity = .6;
    try {
      const fields = { category: editing.category, title: editing.title, description: editing.description, url: editing.url };
      let row;
      if (editing.id) row = await backend.updateMaterial(editing.id, fields);
      else {
        const file = editing.mode === 'file' ? f.file?.files?.[0] : null;
        if (editing.mode === 'file' && !file) throw new Error('올릴 파일을 골라주세요.');
        row = await backend.addMaterial({ ...fields, file });
      }
      editing = null; await load(row.id);
    } catch (error) {
      err.textContent = error?.message || '저장하지 못했어요.';
      submit.disabled = false; submit.style.opacity = '';
    }
  });
  addEventListener('keydown', event => { if (open && event.key === 'Escape' && !editing) close(); });

  function close() {
    if (!open) return;
    open = false; veil.classList.remove('is-open');
    clearTimeout(closeTimer); closeTimer = setTimeout(() => { veil.hidden = true; }, 200);
    onClose?.();
  }
  return {
    isOpen: () => open,
    open() {
      if (open) return;
      open = true; editing = null; clearTimeout(closeTimer);
      veil.hidden = false; requestAnimationFrame(() => veil.classList.add('is-open'));
      onOpen?.(); renderAll(); load();
      $('[data-act=close]').focus();
    },
    close
  };
}
