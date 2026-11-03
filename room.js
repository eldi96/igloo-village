// 이글루 안쪽 화면. 고정 시점 이미지 한 장이라, 안에 있을 때는 3D를 그리지 않아 가볍다.
// 이미지를 바꿀 때는 이 경로의 파일만 교체하면 된다.
const ROOM_IMAGE = './assets/igloo-room.png';

// 16:9를 기준으로 화면을 채운다. 더 좁은 화면에서는 등불(왼쪽 5.9%)과 화덕(오른쪽 98.6%)이
// 들어오는 폭(가로 4~99.5%)에서 확대를 멈추고, 남는 위아래는 이미지 가장자리 색으로 채운다.
// WebGL을 거치면 블룸과 톤매핑으로 색이 바뀌므로 이미지는 캔버스 위에 그대로 올린다.
const STYLE = `
  .igloo-room { --w: min(max(100vw, 100vh * 16 / 9), 100vw / .955); position: fixed; inset: 0; overflow: hidden; background: #8fb8e2; pointer-events: none; }
  .igloo-room[hidden] { display: none; }
  .igloo-room-stage { position: absolute; width: var(--w); aspect-ratio: 16 / 9; left: clamp(100vw - var(--w), 50vw - var(--w) * .5175, 0px); top: calc((100% - var(--w) * 9 / 16) * .62); }
  .igloo-room-stage img { display: block; width: 100%; height: 100%; }
  @media (max-aspect-ratio: 17 / 10) {
    .igloo-room-stage img { -webkit-mask-image: linear-gradient(transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(transparent, #000 6%, #000 94%, transparent); }
  }
`;

// 가장자리 한 줄의 평균색. 이미지를 바꿔도 위아래 빈 곳의 색이 저절로 맞는다.
function edgeColor(img, y) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, y, img.naturalWidth, 1, 0, 0, 64, 1);
  const d = g.getImageData(0, 0, 64, 1).data, sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
  return `rgb(${sum.map(v => Math.round(v / 64)).join(',')})`;
}

export function createRoom(canvas) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'igloo-room';
  el.hidden = true;
  const stage = document.createElement('div');
  stage.className = 'igloo-room-stage';
  const img = new Image();
  img.alt = '';
  img.src = ROOM_IMAGE;
  stage.appendChild(img);
  el.appendChild(stage);
  canvas.after(el);

  // 이미지가 준비된 뒤 들어가 화면이 비어 보이지 않게 한다. 실패해도 들어갈 수는 있다.
  const ready = img.decode().then(() => {
    el.style.background = `linear-gradient(${edgeColor(img, 2)} 50%, ${edgeColor(img, img.naturalHeight - 3)} 50%)`;
  }).catch(e => console.warn('이글루 내부 이미지를 불러오지 못했어요:', e.message));

  return {
    ready,
    show() { el.hidden = false; },
    hide() { el.hidden = true; }
  };
}
