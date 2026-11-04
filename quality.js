// 프레임을 보고 품질 단계를 정한다. 내릴 때는 비교적 빠르게, 올릴 때는 천천히 움직여 화면이 오르내리지 않게 한다.
// 레벨 0이 최고 품질이고, 숫자가 클수록 가볍다.
const SLOW_FPS = 28, FAST_FPS = 45;
const SLOW_SAMPLES = 3;
const WARMUP_MS = 6000;
const RAISE_AFTER_MS = 15000;
const RAISE_AFTER_MAX_MS = 240000;
// 올린 뒤 이 시간 안에 다시 느려지면 그 PC에는 무리였던 것으로 보고 다음 시도를 늦춘다.
const REGRET_MS = 30000;

export function createQualityControl({ maxLevel, now }) {
  let level = 0, slow = 0, fastSince = null, raisedAt = -Infinity, raiseAfter = RAISE_AFTER_MS;
  let readyAt = now + WARMUP_MS;
  return {
    get level() { return level; },
    // 탭을 숨겼거나 안에 머무는 동안은 측정이 끊기므로 처음처럼 다시 잰다.
    pause(at) {
      slow = 0;
      fastSince = null;
      readyAt = Math.max(readyAt, at + WARMUP_MS);
    },
    // 측정값을 넣으면 현재 단계를 돌려준다.
    sample(fps, at) {
      if (at < readyAt) return level;
      if (fps < SLOW_FPS) {
        fastSince = null;
        slow++;
        if (slow < SLOW_SAMPLES || level >= maxLevel) return level;
        slow = 0;
        if (at - raisedAt < REGRET_MS) raiseAfter = Math.min(raiseAfter * 4, RAISE_AFTER_MAX_MS);
        level++;
        readyAt = at + WARMUP_MS;
        return level;
      }
      slow = 0;
      if (fps < FAST_FPS) {
        fastSince = null;
        return level;
      }
      if (fastSince === null) fastSince = at;
      if (level > 0 && at - fastSince >= raiseAfter) {
        level--;
        raisedAt = at;
        fastSince = null;
        readyAt = at + WARMUP_MS;
      }
      return level;
    }
  };
}
