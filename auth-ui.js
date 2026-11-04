// 로그인 버튼과 로그인 창. 권한 판단은 DB가 하고, 여기서는 상태만 보여준다.
const STYLE = `
  .auth-chip { position: fixed; z-index: 3; left: 24px; top: 20px; display: flex; align-items: center; gap: 10px; color: #e6eef4; font: 500 13px/1.4 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; text-shadow: 0 1px 6px rgba(0,0,0,.7); }
  .auth-chip button { min-height: 36px; padding: 7px 14px; border: 1px solid rgba(232,242,249,.28); border-radius: 9px; background: rgba(9,22,34,.5); color: #edf4f8; font: inherit; cursor: pointer; backdrop-filter: blur(8px); touch-action: manipulation; }
  .auth-chip .auth-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .auth-chip button:focus-visible, .auth-card button:focus-visible { outline: 2px solid #edf6ff; outline-offset: 3px; }
  .auth-veil { position: fixed; z-index: 10; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(3,10,18,.46); animation: auth-in 180ms ease-out; }
  .auth-veil[hidden] { display: none; }
  .auth-card { box-sizing: border-box; width: min(360px, 100%); padding: 30px 28px 24px; border: 1px solid rgba(224,239,250,.14); border-radius: 18px; background: rgba(9,22,34,.92); box-shadow: 0 18px 60px rgba(0,7,15,.45), inset 0 1px rgba(255,255,255,.04); color: #e9f1f6; font: 400 14px/1.55 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; text-align: center; backdrop-filter: blur(10px); animation: auth-up 220ms cubic-bezier(.16,1,.3,1); }
  .auth-card h2 { margin: 0 0 8px; font-size: 19px; font-weight: 500; letter-spacing: -.01em; }
  .auth-card p { margin: 0; color: #b5c4cf; text-wrap: balance; }
  .auth-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 22px; }
  .auth-card button { min-height: 44px; padding: 10px 14px; border: 1px solid rgba(232,242,249,.14); border-radius: 10px; background: transparent; color: #cdd9e2; font: inherit; font-weight: 500; cursor: pointer; touch-action: manipulation; }
  .auth-card button.auth-main { border-color: #eef3f7; background: #eef3f7; color: #16242f; }
  .auth-card button[disabled] { opacity: .6; cursor: progress; }
  .auth-card form { margin-top: 18px; text-align: left; }
  .auth-card label { display: block; margin-bottom: 10px; color: #b5c4cf; font-size: 12px; }
  .auth-card input { display: block; box-sizing: border-box; width: 100%; height: 42px; margin-top: 5px; padding: 0 12px; border: 1px solid rgba(232,242,249,.18); border-radius: 9px; background: rgba(233,243,250,.06); color: #f2f7fa; font: inherit; font-size: 14px; }
  .auth-card input:focus { outline: 2px solid #edf6ff; outline-offset: 1px; }
  .auth-card .auth-hint { display: block; margin-top: 5px; color: #dbe5ec; font-size: 12px; }
  .auth-card form .auth-actions { margin-top: 16px; }
  .auth-note { margin-top: 2px !important; font-size: 12px; }
  .auth-error { margin-top: 12px !important; color: #ffb4a8 !important; font-size: 13px; }
  .auth-error:empty { display: none; }
  @media (hover: hover) and (pointer: fine) { .auth-chip button:hover { background: rgba(9,22,34,.74); } .auth-card button:hover { background: rgba(233,243,250,.08); color: #fff; } .auth-card button.auth-main:hover { background: #fff; color: #16242f; } }
  @media (max-width: 800px) { .auth-chip { left: 16px; top: 14px; } }
  @keyframes auth-in { from { opacity: 0; } }
  @keyframes auth-up { from { opacity: 0; transform: translateY(8px); } }
  @media (prefers-reduced-motion: reduce) { .auth-veil, .auth-card { animation: none; } }
`;

export function mountAuth(backend, { onChange = () => {} } = {}) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const chip = document.createElement('div');
  chip.className = 'auth-chip';
  const veil = document.createElement('div');
  veil.className = 'auth-veil';
  veil.hidden = true;
  const card = document.createElement('div');
  card.className = 'auth-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'auth-title');
  veil.appendChild(card);
  document.body.append(chip, veil);

  let user = null, member = null, opener = null, checked = false, busy = false;

  const button = (label, onClick, className = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (className) b.className = className;
    b.onclick = onClick;
    return b;
  };
  const close = () => {
    veil.hidden = true;
    opener?.focus();
    opener = null;
  };
  const ERRORS = [
    [/invalid login credentials/i, '아이디 또는 비밀번호가 맞지 않아요.'],
    [/already registered|already exists/i, '이미 쓰고 있는 아이디예요.'],
    [/password should be|weak password/i, '비밀번호를 8자 이상으로 더 길게 정해 주세요.'],
    [/rate limit|too many/i, '시도가 너무 많아요. 잠시 후 다시 해주세요.'],
    [/failed to fetch|network/i, '연결을 확인하고 다시 시도해 주세요.']
  ];
  const failMessage = error => {
    const text = error?.message || '';
    // 우리가 직접 쓴 한글 안내는 그대로 보여준다.
    if (/[가-힣]/.test(text)) return text;
    return ERRORS.find(([pattern]) => pattern.test(text))?.[1] || '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  const field = (label, name, attrs = {}, hint = '') => {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { name, required: true, ...attrs });
    wrap.appendChild(input);
    if (hint) {
      const small = document.createElement('small');
      small.className = 'auth-hint';
      small.textContent = hint;
      wrap.appendChild(small);
    }
    return wrap;
  };
  // 입력 칸이 있는 창. onSubmit이 끝나면 창을 닫고, 실패하면 안내만 보여준다.
  function showForm(title, text, fields, submitLabel, onSubmit, extra = []) {
    const submit = button(submitLabel, null, 'auth-main');
    submit.type = 'submit';
    const form = document.createElement('form');
    const row = document.createElement('div');
    row.className = 'auth-actions';
    row.append(submit, ...extra);
    form.append(...fields, row);
    card.innerHTML = '';
    const h = document.createElement('h2');
    h.id = 'auth-title';
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    const error = document.createElement('p');
    error.className = 'auth-error';
    error.setAttribute('role', 'alert');
    card.append(h, p, form, error);
    veil.hidden = false;
    form.querySelector('input')?.focus();
    form.onsubmit = async e => {
      e.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      busy = true;
      try {
        await onSubmit(new FormData(form));
        busy = false;
        await applyUser(await backend.currentUser());
        close();
      } catch (err) {
        error.textContent = failMessage(err);
      } finally {
        busy = false;
        submit.disabled = false;
      }
    };
  }
  function openLogin(event) {
    if (event?.currentTarget) opener = event.currentTarget;
    showForm('이글루 마을에 들어가기', '로그인하면 내 이글루를 정하고 프로젝트를 올릴 수 있어요.', [
      field('아이디', 'id', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false }),
      field('비밀번호', 'password', { type: 'password', autocomplete: 'current-password' })
    ], '로그인', data => backend.signIn(data.get('id'), data.get('password')), [button('처음이에요', openSignUp), button('둘러보기', close)]);
  }
  function openSignUp() {
    showForm('이글루 마을 가입', '강의실에서 받은 초대 코드가 필요해요.', [
      field('이름 (마을에 표시돼요)', 'name', { autocomplete: 'nickname', maxLength: 40 }),
      field('아이디 (영문 소문자, 숫자, _ 3~20자)', 'id', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, pattern: '[a-z0-9_]{3,20}' }),
      field('비밀번호 (8자 이상)', 'password', { type: 'password', autocomplete: 'new-password', minLength: 8 }, '평소 쓰는 비밀번호는 쓰지 말고, 여기서만 쓸 비밀번호를 새로 정해 주세요.'),
      field('초대 코드', 'code', { autocomplete: 'off', autocapitalize: 'characters' })
    ], '가입하기', data => backend.signUp({ id: data.get('id'), password: data.get('password'), displayName: data.get('name'), code: data.get('code') }), [button('이미 계정이 있어요', openLogin)]);
  }
  function openPending() {
    showForm('초대 코드를 입력해 주세요', '코드를 넣으면 내 이글루를 정할 수 있어요. 그동안 마을을 둘러봐도 돼요.', [
      field('이름 (마을에 표시돼요)', 'name', { autocomplete: 'nickname', maxLength: 40 }),
      field('초대 코드', 'code', { autocomplete: 'off', autocapitalize: 'characters' })
    ], '확인', data => backend.joinWithInvite(data.get('code'), data.get('name')), [button('둘러보기', close), button('로그아웃', signOut)]);
  }
  function openRename(event) {
    if (event?.currentTarget) opener = event.currentTarget;
    showForm('내 이름 바꾸기', '마을에서 이글루 위에 보이는 이름이에요.', [
      field('이름', 'name', { autocomplete: 'nickname', maxLength: 40, value: member?.display_name || '' })
    ], '저장', data => backend.updateDisplayName(data.get('name')), [button('취소', close)]);
  }
  async function signOut() {
    close();
    try { await backend.signOut(); } catch (e) { console.warn('로그아웃에 실패했어요:', e.message); }
  }
  function renderChip() {
    chip.textContent = '';
    if (!checked) return;
    if (!user) {
      chip.append(button('로그인', openLogin));
      return;
    }
    const name = document.createElement('span');
    name.className = 'auth-name';
    name.textContent = member?.display_name || user.email?.split('@')[0] || '로그인됨';
    chip.append(name, button('로그아웃', signOut));
  }
  async function applyUser(next) {
    const changed = next?.id !== user?.id;
    user = next;
    member = null;
    if (user) {
      try { member = await backend.getMembership(); } catch (e) { console.warn('회원 정보를 읽지 못했어요:', e.message); }
    }
    checked = true;
    renderChip();
    if (changed && user && !member?.approved && !busy) openPending();
    onChange();
  }

  veil.addEventListener('click', e => { if (e.target === veil) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !veil.hidden) close(); });
  backend.onAuthChange(applyUser).catch(e => {
    // 연결에 실패해도 마을은 그대로 볼 수 있다.
    console.warn('로그인 상태를 확인하지 못했어요:', e.message);
    checked = true;
    renderChip();
  });

  return { open: openLogin, openJoin: openPending, openRename, get user() { return user; }, get member() { return member; } };
}
