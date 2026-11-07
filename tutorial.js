// 튜토리얼: 첫 가입(이글루 없는 승인 회원) 때 마을 안내를 자동으로 띄우고,
// 처음 내 방에 들어갈 때와 카드 테마·조명 변경이 실제로 열렸을 때 짧은 팁을 보여 준다.
// 본 기록은 브라우저 저장소에만 둔다(접근 실패해도 동작). DB 변경 없음.

const CSS = `
.tut-veil { position: fixed; inset: 0; z-index: 6; pointer-events: auto; background: rgba(5,13,24,.18); opacity: 0; transition: opacity 240ms cubic-bezier(.23,1,.32,1); }
.tut-veil[data-spot] { background: radial-gradient(circle at var(--sx) var(--sy), rgba(5,13,24,0) 0 110px, rgba(5,13,24,.42) 280px); }
.tut-veil.is-soft { pointer-events: none; background: rgba(5,13,24,.5); }
.tut-veil.is-soft[data-spot] { background: radial-gradient(circle at var(--sx) var(--sy), rgba(5,13,24,0) 0 80px, rgba(5,13,24,.52) 200px); }
.tut-veil.is-on { opacity: 1; }
.tut-card { position: fixed; z-index: 7; left: 0; top: 0; box-sizing: border-box; width: min(340px, calc(100vw - 32px)); padding: 18px 18px 14px; border: 1.5px solid rgba(255,255,255,.55); border-radius: 22px;
  background: linear-gradient(150deg, rgba(255,247,240,.30), rgba(255,226,236,.22)); -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 10px 40px rgba(5,13,24,.32), inset 0 1px 0 rgba(255,255,255,.5); color: #fffaf6; font: 400 14px/1.55 system-ui, "Malgun Gothic", sans-serif; letter-spacing: -.01em;
  text-shadow: 0 1px 3px rgba(40,20,40,.35); opacity: 0; transform: translate(var(--cx), var(--cy)) scale(.96); transform-origin: var(--ox, 50%) var(--oy, 100%);
  transition: opacity 220ms cubic-bezier(.23,1,.32,1), transform 220ms cubic-bezier(.23,1,.32,1); }
.tut-card.is-on { opacity: 1; transform: translate(var(--cx), var(--cy)) scale(1); }
.tut-card[hidden] { display: none; }
.tut-step { margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .02em; color: #ffe3ec; font-variant-numeric: tabular-nums; }
.tut-card h2 { margin: 0 0 6px; font-size: 17px; font-weight: 650; letter-spacing: -.02em; }
.tut-card p.tut-body { margin: 0; text-wrap: pretty; }
.tut-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.tut-dots { display: flex; gap: 6px; margin-right: auto; }
.tut-dots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.35); transition: background-color 200ms ease, transform 200ms cubic-bezier(.23,1,.32,1); }
.tut-dots i.is-now { background: #fff; transform: scale(1.25); }
.tut-card button { min-height: 34px; padding: 6px 13px; border: 1px solid rgba(255,255,255,.4); border-radius: 11px; background: rgba(255,255,255,.12); color: #fffaf6; font: inherit; font-weight: 600; cursor: pointer;
  transition: transform 160ms cubic-bezier(.23,1,.32,1), background-color 160ms ease; }
.tut-card button.primary { border-color: #fff4f7; background: #fff4f7; color: #5a3448; text-shadow: none; }
.tut-card button.tut-skip { border-color: transparent; background: none; padding: 6px 8px; color: rgba(255,250,246,.82); font-weight: 500; }
.tut-card button:active { transform: scale(.97); }
.tut-card button:focus-visible, .tut-help:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.tut-help { position: fixed; z-index: 2; right: 24px; bottom: 24px; min-height: 36px; padding: 7px 14px; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; background: rgba(255,240,246,.16);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fffaf6; font: 600 13px/1 system-ui, "Malgun Gothic", sans-serif; cursor: pointer; transition: transform 160ms cubic-bezier(.23,1,.32,1), background-color 160ms ease; }
.tut-help:active { transform: scale(.97); }
.tut-help[hidden] { display: none; }
@media (hover: hover) and (pointer: fine) { .tut-card button:hover { background: rgba(255,255,255,.22); } .tut-card button.primary:hover { background: #fff; } .tut-help:hover { background: rgba(255,240,246,.26); } }
@media (pointer: coarse) { .tut-card button, .tut-help { min-height: 44px; } }
@media (max-width: 800px) { .tut-help { bottom: 80px; right: 16px; } }
@media (prefers-reduced-motion: reduce) { .tut-card, .tut-veil { transition: opacity 120ms linear; transform: translate(var(--cx), var(--cy)); } .tut-card.is-on { transform: translate(var(--cx), var(--cy)); } .tut-card button:active, .tut-help:active { transform: none; } }
`;

const VILLAGE_STEPS = [
  { target: 'empty', title: '이글루 점령하기', body: '빛나는 빈 이글루를 눌러 깃발을 꽂으면 내 이글루가 돼요. 한 사람당 하나예요.' },
  { target: 'occupied', title: '다른 이글루 둘러보기', body: '깃발이 꽂힌 이글루는 다른 수강생의 집이에요. 열려 있는 이글루에 들어가 프로젝트를 보고 피드백을 남길 수 있어요.' },
  { target: 'mine', title: '우편함 알림', body: '내 프로젝트에 새 피드백이 오면 이글루 앞 우편함 투입구가 이렇게 빛나요. 눌러서 바로 확인할 수 있어요.', noMine: '이글루를 정하면 깃발과 함께 우편함이 세워져요. 새 피드백이 오면 투입구가 이렇게 빛나요. (예시 우편함)' },
  { target: 'board', title: '광장 게시판', body: '모닥불 옆 표지판을 누르면 광장 보드가 열려요. 새 프로젝트 소식을 보고, 익명 채팅과 서비스 개선 의견에 참여할 수 있어요.' }
];
const ROOM_STEPS = [
  { anchor: null, title: '프로젝트 올리기', body: '방 안의 상자를 클릭하면 프로젝트를 넣을 수 있어요. 소개와 링크, 이미지를 올려 보세요.' },
  { anchor: '.room-privacy .igloo-switch', title: '이글루 잠금', body: '왼쪽 위 스위치로 이글루를 열고 닫아요. 닫혀 있으면 다른 사람이 들어오지 못해요.' }
];
const THEME_TIP = { anchor: 0, title: '카드 테마가 열렸어요', body: '첫 프로젝트를 올려서 카드 색을 고를 수 있어요. 고른 테마는 방문자에게도 보여요.' };
const LIGHT_TIP = { anchor: 1, title: '조명 변경이 열렸어요', body: '프로젝트 2개를 올려서 이글루 바깥 불빛 색을 바꿀 수 있어요. 마을 사람 모두가 이 색을 봐요.' };

const storeKey = id => `igloo-tutorial:v1:${id}`;
function readRecord(id) {
  try { return JSON.parse(localStorage.getItem(storeKey(id)) || 'null'); } catch { return null; }
}
function writeRecord(id, record) {
  try { localStorage.setItem(storeKey(id), JSON.stringify(record)); } catch {}
}

// getTargets(kind) → [{ x, y, z, r }] 월드 좌표. getMode() → 'map' | 'room' | ...
export function mountTutorial({ THREE, scene, camera, getMode, getTargets, hasMine = () => false, onFocus = () => {} }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const veil = document.createElement('div');
  veil.className = 'tut-veil';
  veil.hidden = true;
  const card = document.createElement('section');
  card.className = 'tut-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<p class="tut-step"></p><h2></h2><p class="tut-body"></p><div class="tut-foot"><div class="tut-dots" aria-hidden="true"></div></div>';
  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'tut-help';
  help.textContent = '도움말';
  help.hidden = true;
  document.body.append(veil, card, help);
  const stepEl = card.querySelector('.tut-step'), titleEl = card.querySelector('h2'), bodyEl = card.querySelector('.tut-body');
  const dotsEl = card.querySelector('.tut-dots'), footEl = card.querySelector('.tut-foot');

  // 이글루 발밑에서 천천히 숨 쉬는 빛 고리. 광원 없이 한 재질을 함께 쓴다.
  const ringGeo = new THREE.RingGeometry(0.82, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd6e6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const rings = [];
  const ringFor = i => {
    if (!rings[i]) { rings[i] = new THREE.Mesh(ringGeo, ringMat); rings[i].renderOrder = 3; scene.add(rings[i]); }
    return rings[i];
  };
  let ringTargets = [];
  function showRings(targets) {
    ringTargets = targets;
    rings.forEach((m, i) => { m.visible = i < targets.length; });
    targets.forEach((t, i) => { const m = ringFor(i); m.visible = true; m.position.set(t.x, t.y + 0.06, t.z); m.userData.r = t.r; });
  }

  let userId = null, record = null;
  let tour = null; // { steps, index, kind: 'village' | 'room' | 'tip', blocking }
  let pendingVillage = false, pendingRoom = false, inOwnRoom = false, tipQueue = [], tipDelay = 0;
  let time = 0, focused = null;
  const v = new THREE.Vector3();

  const save = patch => { if (!userId) return; record = { ...(record || {}), ...patch }; writeRecord(userId, record); };

  function button(text, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    b.textContent = text;
    b.onclick = onClick;
    return b;
  }

  function render() {
    const { steps, index, kind } = tour;
    const step = steps[index];
    const many = steps.length > 1;
    stepEl.hidden = !many;
    stepEl.textContent = many ? `${index + 1} / ${steps.length}` : '';
    titleEl.textContent = step.title;
    bodyEl.textContent = step.target === 'mine' && !hasMine() ? step.noMine : step.body;
    dotsEl.textContent = '';
    if (many) steps.forEach((_, i) => { const d = document.createElement('i'); if (i === index) d.className = 'is-now'; dotsEl.append(d); });
    footEl.querySelectorAll('button').forEach(b => b.remove());
    const last = index === steps.length - 1;
    if (many && !last) footEl.append(button('건너뛰기', 'tut-skip', () => finish()));
    if (index > 0) footEl.append(button('이전', '', () => go(-1)));
    footEl.append(button(last ? (kind === 'village' ? '시작하기' : '알겠어요') : '다음', 'primary', () => (last ? finish() : go(1))));
    if (focused !== step.target) { onFocus(focused, false); focused = step.target; onFocus(focused, true); }
    showRings(step.target ? getTargets(step.target) : []);
    // 방 안 팁은 조작을 막지 않되, 밝은 방에서도 글자가 보이게 배경만 어둡게 한다.
    veil.hidden = false;
    veil.classList.toggle('is-soft', !tour.blocking);
    card.hidden = false;
    place();
    requestAnimationFrame(() => { veil.classList.add('is-on'); card.classList.add('is-on'); footEl.querySelector('.primary')?.focus({ preventScroll: true }); });
  }

  function go(delta) {
    tour.index = Math.min(Math.max(tour.index + delta, 0), tour.steps.length - 1);
    render();
  }

  function start(steps, kind, blocking) {
    tour = { steps, index: 0, kind, blocking };
    help.hidden = true;
    render();
  }

  function finish() {
    if (!tour) return;
    const { kind, steps } = tour;
    if (kind === 'village') save({ village: true });
    if (kind === 'room') save({ room: true });
    if (kind === 'tip') save({ [steps[0] === THEME_TIP ? 'theme' : 'light']: true });
    tour = null;
    onFocus(focused, false);
    focused = null;
    showRings([]);
    veil.classList.remove('is-on');
    card.classList.remove('is-on');
    setTimeout(() => { if (!tour) { veil.hidden = true; card.hidden = true; } }, 240);
  }

  // 카드 위치: 대상 하나면 그 위에, 여럿이거나 없으면 화면 아래 가운데에 둔다.
  function anchorPoint() {
    const step = tour.steps[tour.index];
    if (typeof step.anchor === 'string') {
      const el = document.querySelector(step.anchor);
      const r = el?.getBoundingClientRect();
      if (r && r.width) return { x: r.left + r.width / 2, y: r.bottom, below: true, spot: true, sy: r.top + r.height / 2 };
    }
    if (typeof step.anchor === 'number') {
      const el = document.querySelectorAll('.room-reward-row .card-theme-control')[step.anchor];
      const r = el?.getBoundingClientRect();
      if (r && r.width) return { x: r.left + r.width / 2, y: r.bottom, below: true, spot: true, sy: r.top + r.height / 2 };
    }
    if (ringTargets.length === 1) {
      const t = ringTargets[0];
      v.set(t.x, t.y + 1.2, t.z).project(camera);
      if (v.z < 1) return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, spot: true };
    }
    return null;
  }

  function place() {
    if (!tour) return;
    const w = card.offsetWidth, h = card.offsetHeight, pad = 16;
    const a = anchorPoint();
    let x, y, ox = '50%', oy = '100%';
    if (a) {
      x = a.x - w / 2;
      y = a.below ? a.y + 12 : a.y - h - 24;
      if (a.below) oy = '0%';
      if (!a.below && y < pad) { y = a.y + 40; oy = '0%'; }
    } else {
      x = (innerWidth - w) / 2;
      y = innerHeight - h - (innerWidth <= 800 ? 140 : 96);
    }
    x = Math.min(Math.max(x, pad), innerWidth - w - pad);
    y = Math.min(Math.max(y, pad), innerHeight - h - pad);
    card.style.setProperty('--cx', `${Math.round(x)}px`);
    card.style.setProperty('--cy', `${Math.round(y)}px`);
    card.style.setProperty('--ox', ox);
    card.style.setProperty('--oy', oy);
    if (a?.spot) { veil.dataset.spot = ''; veil.style.setProperty('--sx', `${Math.round(a.x)}px`); veil.style.setProperty('--sy', `${Math.round(a.sy ?? a.y + 40)}px`); }
    else delete veil.dataset.spot;
  }

  addEventListener('keydown', e => {
    if (!tour || !tour.blocking) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight') { if (tour.index < tour.steps.length - 1) go(1); }
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  addEventListener('resize', () => place());

  help.onclick = () => {
    if (tour) return;
    if (getMode() === 'room' && inOwnRoom) {
      const steps = [...ROOM_STEPS];
      const controls = visibleRewards();
      if (controls[0]) steps.push(THEME_TIP);
      if (controls[1]) steps.push(LIGHT_TIP);
      start(steps, 'help', false);
    } else if (getMode() === 'map') start(VILLAGE_STEPS, 'help', true);
  };

  function visibleRewards() {
    return [...document.querySelectorAll('.room-reward-row .card-theme-control')].map(el => !el.hidden && el.getClientRects().length > 0);
  }

  return {
    // 로그인 상태가 바뀌거나 마을 상태를 다시 읽을 때 부른다.
    sync({ user, member, hasIgloo }) {
      const id = user && member?.approved ? user.id : null;
      if (id !== userId) { userId = id; record = id ? readRecord(id) : null; pendingVillage = false; }
      if (!userId) return;
      // 이글루가 없는 승인 회원 = 방금 가입한 계정으로 보고 안내 대상에 넣는다.
      if (!record && !hasIgloo) save({ enrolled: true });
      if (record?.enrolled && !record.village) pendingVillage = true;
    },
    enterRoom(isMine) {
      inOwnRoom = Boolean(isMine);
      if (inOwnRoom && record?.enrolled && !record.room) pendingRoom = true;
    },
    leaveRoom() {
      inOwnRoom = false;
      pendingRoom = false;
      tipQueue = [];
      if (tour && tour.kind !== 'village' && !(tour.kind === 'help' && tour.blocking)) finish();
    },
    update(dt) {
      time += dt;
      const mode = getMode();
      help.hidden = Boolean(tour) || !(mode === 'map' || (mode === 'room' && inOwnRoom));
      if (tour) {
        if (ringTargets.length) {
          const k = (Math.sin(time * 2.2) + 1) / 2;
          ringMat.opacity = 0.35 + k * 0.4;
          rings.forEach(m => { if (m.visible) m.scale.setScalar((m.userData.r || 2.4) * (1 + k * 0.08)); });
          place();
        }
        return;
      }
      if (pendingVillage && mode === 'map') { pendingVillage = false; start(VILLAGE_STEPS, 'village', true); return; }
      if (mode !== 'room' || !inOwnRoom || !record?.enrolled) return;
      if (pendingRoom) { pendingRoom = false; tipDelay = 0.6; tipQueue.push('room'); }
      // 카드 테마·조명 변경 버튼이 실제로 보일 때만(해금됐을 때만) 팁을 띄운다.
      const [theme, light] = visibleRewards();
      if (theme && !record.theme && !tipQueue.includes('theme')) { tipQueue.push('theme'); tipDelay = Math.max(tipDelay, 3.9); }
      if (light && !record.light && !tipQueue.includes('light')) { tipQueue.push('light'); tipDelay = Math.max(tipDelay, 3.9); }
      if (!tipQueue.length) return;
      tipDelay -= dt;
      if (tipDelay > 0) return;
      const next = tipQueue.shift();
      tipDelay = 0.4;
      if (next === 'room') start(ROOM_STEPS, 'room', false);
      else if (next === 'theme') start([THEME_TIP], 'tip', false);
      else start([LIGHT_TIP], 'tip', false);
    }
  };
}
