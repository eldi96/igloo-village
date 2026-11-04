// 마을 화면 오른쪽의 대화 창. 누가 읽고 쓸 수 있는지는 DB가 판단하고, 여기서는 상태만 보여준다.
// 3D 화면이 계속 그려지므로 큰 창에는 backdrop-filter를 쓰지 않는다. 내장 그래픽에서 프레임이 떨어진다.
const STYLE = `
  .chat-toggle { position: fixed; z-index: 3; top: 48px; right: 24px; display: flex; align-items: center; gap: 7px; min-height: 36px; padding: 7px 14px; border: 1px solid rgba(232,242,249,.28); border-radius: 9px; background: rgba(9,22,34,.62); color: #edf4f8; font: 500 13px/1.4 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease; }
  .chat-toggle:active { transform: scale(.97); }
  .chat-toggle[hidden] { display: none; }
  .chat-badge { min-width: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; background: #e5edf3; color: #152431; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums; }
  .chat-badge[hidden] { display: none; }
  .chat-panel { position: fixed; z-index: 3; top: 48px; right: 16px; bottom: 16px; display: flex; flex-direction: column; box-sizing: border-box; width: min(340px, calc(100vw - 32px)); border: 1px solid rgba(224,239,250,.12); border-radius: 16px; background: rgba(9,22,34,.93); box-shadow: 0 8px 32px rgba(0,7,15,.28), inset 0 1px rgba(255,255,255,.025); color: #e9f1f6; font: 400 13px/1.5 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; transform-origin: top right; transition: opacity 180ms cubic-bezier(.23,1,.32,1), transform 180ms cubic-bezier(.23,1,.32,1), visibility 180ms; }
  .chat-panel[data-open="false"] { visibility: hidden; opacity: 0; transform: translateY(-4px) scale(.98); pointer-events: none; transition-duration: 120ms; }
  .chat-head { display: flex; align-items: center; justify-content: space-between; flex: none; padding: 10px 8px 10px 16px; border-bottom: 1px solid rgba(224,239,250,.08); }
  .chat-head h2 { margin: 0; font-size: 14px; font-weight: 500; letter-spacing: -.01em; }
  .chat-icon { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #b5c4cf; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease, color 120ms ease; }
  .chat-icon:active { transform: scale(.94); }
  .chat-list { flex: 1; min-height: 0; margin: 0; padding: 8px 16px 12px; overflow-y: auto; overscroll-behavior: contain; list-style: none; scrollbar-width: thin; scrollbar-color: rgba(224,239,250,.16) transparent; }
  .chat-empty { display: flex; flex: 1; align-items: center; justify-content: center; padding: 24px; color: #9fb0bc; text-align: center; text-wrap: balance; }
  .chat-empty[hidden], .chat-list[hidden], .chat-form[hidden], .chat-new[hidden], .chat-note:empty { display: none; }
  .chat-msg { display: flex; flex-direction: column; align-items: flex-start; padding: 1.5px 0; }
  .chat-msg[data-mine="true"] { align-items: flex-end; }
  .chat-msg[data-first="true"] { margin-top: 12px; }
  .chat-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 3px; }
  .chat-name { max-width: 200px; overflow: hidden; color: #dbe6ed; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .chat-time { color: #8295a3; font-size: 11px; font-variant-numeric: tabular-nums; }
  .chat-row { display: flex; align-items: flex-end; gap: 2px; max-width: 86%; }
  .chat-msg[data-mine="true"] .chat-row { flex-direction: row-reverse; }
  .chat-body { min-width: 0; margin: 0; padding: 6px 10px; border-radius: 12px; background: rgba(233,243,250,.09); color: #e9f1f6; overflow-wrap: anywhere; white-space: pre-wrap; }
  .chat-msg[data-mine="true"] .chat-body { background: #e5edf3; color: #152431; }
  .chat-body a { color: #cfe3f2; text-underline-offset: 2px; }
  .chat-msg[data-mine="true"] .chat-body a { color: #1c4a6e; }
  .chat-del { flex: none; padding: 1px 6px; border: 0; border-radius: 6px; background: transparent; color: #8295a3; font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; opacity: 0; transition: opacity 100ms ease, color 100ms ease; }
  .chat-msg:hover .chat-del, .chat-del:focus-visible { opacity: 1; }
  .chat-new { align-self: center; flex: none; margin: -38px 0 8px; padding: 5px 12px; border: 1px solid rgba(232,242,249,.14); border-radius: 14px; background: #e5edf3; color: #152431; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; z-index: 1; }
  .chat-note { flex: none; margin: 0; padding: 0 16px 8px; color: #ffb4a8; font-size: 12px; }
  .chat-form { display: flex; flex: none; align-items: flex-end; gap: 6px; margin: 0 10px 10px; padding: 4px 4px 4px 12px; border: 1px solid rgba(232,242,249,.14); border-radius: 12px; background: rgba(233,243,250,.05); transition: border-color 120ms ease; }
  .chat-form:focus-within { border-color: rgba(232,242,249,.34); }
  .chat-input { flex: 1; min-width: 0; height: 22px; max-height: 110px; margin: 6px 0; padding: 0; border: 0; outline: 0; resize: none; background: transparent; color: #f2f7fa; font: inherit; font-size: 14px; line-height: 22px; }
  .chat-input::placeholder { color: #8295a3; }
  .chat-send { flex: none; min-height: 32px; padding: 5px 12px; border: 0; border-radius: 8px; background: #e5edf3; color: #152431; font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease, opacity 120ms ease; }
  .chat-send:active:not(:disabled) { transform: scale(.97); }
  .chat-send:disabled { opacity: .4; cursor: default; }
  .chat-toggle:focus-visible, .chat-icon:focus-visible, .chat-send:focus-visible, .chat-new:focus-visible, .chat-del:focus-visible, .chat-body a:focus-visible { outline: 2px solid #edf6ff; outline-offset: 2px; }
  @media (hover: hover) and (pointer: fine) { .chat-toggle:hover { background: rgba(9,22,34,.82); } .chat-icon:hover { background: rgba(233,243,250,.08); color: #fff; } .chat-send:hover:not(:disabled) { background: #fff; } .chat-del:hover { color: #ffb4a8; } .chat-new:hover { background: #fff; } }
  @media (pointer: coarse) { .chat-toggle { min-height: 44px; } .chat-icon { width: 44px; height: 44px; } .chat-send { min-height: 40px; } .chat-input { font-size: 16px; } .chat-del { opacity: 1; } }
  @media (max-width: 800px) { .chat-toggle { top: 44px; right: 16px; } .chat-panel { top: 44px; bottom: 12px; } }
  @media (prefers-reduced-motion: reduce) { .chat-toggle, .chat-icon, .chat-send, .chat-panel { transition-property: opacity, background-color, color, visibility; } .chat-toggle:active, .chat-icon:active, .chat-send:active:not(:disabled) { transform: none; } .chat-panel[data-open="false"] { transform: none; } }
`;

const OPEN_KEY = 'igloo-village-chat-open';
const KEEP = 200;
const GROUP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM = 60;
const LINK = /(https?:\/\/[^\s]+)/g;

function readOpen() {
  // 저장 공간을 못 쓰는 환경에서는 넓은 화면에서만 처음부터 연다.
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved !== null) return saved === 'true';
  } catch {}
  return innerWidth > 1100;
}
function saveOpen(open) {
  try { localStorage.setItem(OPEN_KEY, String(open)); } catch {}
}
const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>';

// 글자는 textContent로만 넣고, http/https 주소만 링크로 만든다.
function fillBody(el, text) {
  for (const part of text.split(LINK)) {
    if (!/^https?:\/\//.test(part)) {
      if (part) el.append(part);
      continue;
    }
    const a = document.createElement('a');
    a.href = part;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = part;
    el.append(a);
  }
}

export function mountChat(backend) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chat-toggle';
  toggle.hidden = true;
  toggle.setAttribute('aria-controls', 'chat-panel');
  const toggleText = document.createElement('span');
  toggleText.textContent = '대화';
  const badge = document.createElement('span');
  badge.className = 'chat-badge';
  badge.hidden = true;
  toggle.append(toggleText, badge);

  const panel = document.createElement('aside');
  panel.className = 'chat-panel';
  panel.id = 'chat-panel';
  panel.setAttribute('aria-label', '마을 대화');
  panel.dataset.open = 'false';
  panel.innerHTML = `
    <div class="chat-head"><h2>마을 대화</h2><button type="button" class="chat-icon" aria-label="대화 창 닫기">${ICON_CLOSE}</button></div>
    <ol class="chat-list" role="log" aria-live="polite" hidden></ol>
    <div class="chat-empty"></div>
    <button type="button" class="chat-new" hidden>새 메시지</button>
    <p class="chat-note" role="alert"></p>
    <form class="chat-form" hidden><textarea class="chat-input" rows="1" maxlength="500" placeholder="메시지 보내기" aria-label="메시지"></textarea><button type="submit" class="chat-send" disabled>보내기</button></form>
  `;
  document.body.append(toggle, panel);

  const q = selector => panel.querySelector(selector);
  const list = q('.chat-list'), empty = q('.chat-empty'), form = q('.chat-form'), input = q('.chat-input');
  const send = q('.chat-send'), note = q('.chat-note'), newBtn = q('.chat-new');

  const messages = new Map();
  let names = new Map();
  let me = null, canChat = false, approved = false, started = false, hiddenByScene = false;
  let open = false, unread = 0, unsubscribe = null, sending = false, session = 0, refreshingNames = false;

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM;
  const toBottom = () => { list.scrollTop = list.scrollHeight; newBtn.hidden = true; };
  const nameOf = id => names.get(id) || '수강생';
  const clock = iso => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const showNote = text => { note.textContent = text; };

  function failText(error) {
    const text = error?.message || '';
    if (/[가-힣]/.test(text)) return text;
    if (/failed to fetch|network/i.test(text)) return '연결을 확인하고 다시 시도해 주세요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  function render() {
    const stick = nearBottom();
    const sorted = [...messages.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    list.textContent = '';
    let previous = null;
    for (const message of sorted) {
      const li = document.createElement('li');
      li.className = 'chat-msg';
      const time = new Date(message.created_at).getTime();
      const first = !previous || previous.sender_id !== message.sender_id || time - new Date(previous.created_at).getTime() > GROUP_MS;
      const mine = message.sender_id === me;
      li.dataset.first = String(first);
      li.dataset.mine = String(mine);
      if (first) {
        const meta = document.createElement('div');
        meta.className = 'chat-meta';
        if (!mine) {
          const name = document.createElement('span');
          name.className = 'chat-name';
          name.textContent = nameOf(message.sender_id);
          meta.append(name);
        }
        const stamp = document.createElement('time');
        stamp.className = 'chat-time';
        stamp.dateTime = message.created_at;
        stamp.textContent = clock(message.created_at);
        meta.append(stamp);
        li.append(meta);
      }
      const row = document.createElement('div');
      row.className = 'chat-row';
      const body = document.createElement('p');
      body.className = 'chat-body';
      fillBody(body, message.body);
      row.append(body);
      if (mine) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'chat-del';
        del.textContent = '삭제';
        del.setAttribute('aria-label', '내 메시지 삭제');
        del.onclick = () => remove(message.id);
        row.append(del);
      }
      li.append(row);
      list.append(li);
      previous = message;
    }
    const hasMessages = sorted.length > 0;
    list.hidden = !hasMessages;
    empty.hidden = hasMessages;
    if (!hasMessages) empty.textContent = canChat ? '아직 대화가 없어요. 먼저 인사해 보세요.' : '이글루를 정하면 대화에 참여할 수 있어요.';
    if (stick) toBottom();
  }
  function trim() {
    if (messages.size <= KEEP) return;
    const old = [...messages.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    old.slice(0, messages.size - KEEP).forEach(m => messages.delete(m.id));
  }
  function setBadge() {
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    toggle.setAttribute('aria-label', unread ? `대화 창 열기, 새 메시지 ${unread}개` : '대화 창 열기');
  }
  function syncVisibility() {
    const showable = approved && !hiddenByScene;
    toggle.hidden = !showable || open;
    panel.dataset.open = String(showable && open);
    panel.inert = !(showable && open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  function setOpen(next, { focus = true } = {}) {
    open = next;
    saveOpen(open);
    if (open) {
      unread = 0;
      setBadge();
    }
    syncVisibility();
    if (open) {
      toBottom();
      if (focus && canChat) input.focus({ preventScroll: true });
    } else if (focus) toggle.focus({ preventScroll: true });
  }
  async function refreshNames() {
    if (refreshingNames) return;
    refreshingNames = true;
    try {
      names = new Map((await backend.getMemberNames()).map(m => [m.id, m.display_name]));
      render();
    } catch (e) {
      console.warn('대화 이름을 읽지 못했어요:', e.message);
    } finally {
      refreshingNames = false;
    }
  }
  async function load(current) {
    try {
      const rows = await backend.getChat();
      if (current !== session) return;
      messages.clear();
      rows.forEach(row => messages.set(row.id, row));
      render();
      toBottom();
    } catch (e) {
      if (current === session) showNote(failText(e));
    }
  }
  function onChange(payload, current) {
    if (current !== session) return;
    if (payload.eventType === 'DELETE') {
      messages.delete(payload.old?.id);
      render();
      return;
    }
    if (payload.eventType !== 'INSERT') return;
    const row = payload.new;
    if (messages.has(row.id)) return;
    const stick = nearBottom();
    messages.set(row.id, row);
    trim();
    if (!names.has(row.sender_id) && row.sender_id !== me) refreshNames();
    render();
    if (row.sender_id === me) return;
    if (!open || hiddenByScene) {
      unread++;
      setBadge();
    } else if (!stick) newBtn.hidden = false;
  }
  async function start() {
    const current = ++session;
    started = true;
    showNote('');
    await refreshNames();
    if (current !== session) return;
    await load(current);
    try {
      const stop = await backend.subscribeChat(payload => onChange(payload, current), status => {
        if (current !== session) return;
        if (status === 'SUBSCRIBED') {
          showNote('');
          load(current);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') showNote('실시간 연결이 끊겼어요. 다시 연결하는 중이에요.');
      });
      if (current !== session) stop();
      else unsubscribe = stop;
    } catch (e) {
      if (current === session) showNote(failText(e));
    }
  }
  function stop() {
    session++;
    started = false;
    unsubscribe?.();
    unsubscribe = null;
    messages.clear();
    names = new Map();
    unread = 0;
    setBadge();
    showNote('');
    input.value = '';
    fit();
    render();
  }
  async function remove(id) {
    const saved = messages.get(id);
    messages.delete(id);
    render();
    showNote('');
    try {
      await backend.deleteChat(id);
    } catch (e) {
      if (saved) messages.set(id, saved);
      render();
      showNote(failText(e));
    }
  }
  function fit() {
    input.style.height = '22px';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    send.disabled = sending || !input.value.trim();
  }

  input.addEventListener('input', () => { showNote(''); fit(); });
  input.addEventListener('keydown', e => {
    // 한글 조합 중의 Enter로 보내면 글자가 잘리거나 두 번 전송된다.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    send.disabled = true;
    showNote('');
    const current = session;
    try {
      const row = await backend.sendChat(text);
      if (current === session) {
        messages.set(row.id, row);
        trim();
        input.value = '';
        render();
        toBottom();
      }
    } catch (error) {
      if (current === session) showNote(failText(error));
    } finally {
      sending = false;
      fit();
      input.focus({ preventScroll: true });
    }
  });
  list.addEventListener('scroll', () => { if (nearBottom()) newBtn.hidden = true; }, { passive: true });
  newBtn.onclick = toBottom;
  toggle.onclick = () => setOpen(true);
  q('.chat-icon').onclick = () => setOpen(false);
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setOpen(false);
  });

  open = readOpen();
  render();
  setBadge();
  syncVisibility();

  return {
    // 로그인 상태나 입주 상태가 바뀔 때마다 호출한다.
    setAccess({ user = null, member = null, hasHome = false } = {}) {
      const nextMe = user?.id || null;
      const nextApproved = Boolean(member?.approved);
      const nextCan = nextApproved && (hasHome || member.role === 'instructor');
      const changedUser = nextMe !== me;
      if (changedUser && started) stop();
      me = nextMe;
      approved = nextApproved;
      if (nextCan !== canChat) {
        canChat = nextCan;
        form.hidden = !canChat;
        if (!canChat && started) stop();
      }
      if (canChat && !started) start();
      else render();
      syncVisibility();
    },
    // 이글루나 등대 안에서는 대화 창을 숨긴다. 연결은 유지해 나왔을 때 놓친 수를 보여준다.
    setHidden(hidden) {
      hiddenByScene = hidden;
      syncVisibility();
      if (!hidden && open) {
        unread = 0;
        setBadge();
        toBottom();
      }
    }
  };
}
