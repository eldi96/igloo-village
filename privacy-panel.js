// 방 열림 상태는 DB 저장 성공 후에만 표시한다.
export function mountPrivacyPanel(root, backend, { onRoomChange }) {
  root.innerHTML = `<button type="button" class="igloo-switch" role="switch" aria-label="이글루 열기" aria-checked="false"><span class="igloo-switch-knob"></span><span class="igloo-switch-label">OFF</span></button><p class="igloo-switch-message" role="status" aria-live="polite"></p>`;
  const button = root.querySelector('button'), message = root.querySelector('p');
  let home = null, opened = false, busy = false, generation = 0;
  function paint() {
    button.setAttribute('aria-checked', String(opened));
    button.setAttribute('aria-label', opened ? '이글루 닫기' : '이글루 열기');
    button.setAttribute('aria-busy', String(busy));
    button.querySelector('.igloo-switch-label').textContent = opened ? 'ON' : 'OFF';
    button.disabled = busy;
  }
  function describe() { message.textContent = opened ? '이글루가 열렸습니다.' : '이글루가 닫혔습니다.\n외부인이 들어오지 못합니다.'; }
  button.onclick = async () => {
    if (busy || home === null) return;
    const id = home, token = generation, next = !opened;
    busy = true; paint(); message.textContent = '저장 중…';
    try {
      const saved = await backend.setIglooPublic(id, next);
      if (token !== generation) return;
      opened = Boolean(saved.is_public);
      onRoomChange(opened);
      describe();
    } catch { if (token === generation) message.textContent = '설정을 저장하지 못했습니다. 다시 시도해 주세요.'; }
    finally { if (token === generation) { busy = false; paint(); } }
  };
  return {
    enter(id, isMine, isPublic) { generation++; home = id; opened = Boolean(isPublic); busy = false; root.hidden = !isMine; paint(); describe(); },
    leave() { generation++; home = null; root.hidden = true; }
  };
}
