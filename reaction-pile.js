// 반응을 누르면 이미지 창 안에 아이콘이 떨어져 통통 튀며 쌓인다(원끼리 부딪히는 간단한 2D 물리).
// 떨어뜨린 가로 위치(0~1)는 DB에 저장되고, 다시 열면 같은 순서·같은 자리에서 떨어뜨려 본 그대로 쌓인 모습을 되살린다.
const MAX = 200, GRAVITY = 2200, BOUNCE = 0.42, FRICTION = 0.985;
const tilt = x => ((x * 9973) % 1 - 0.5) * 0.8;   // 같은 자리면 같은 기울기(다시 쌓을 때도 같게)

export function createReactionPile(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'reaction-pile';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  const images = new Map();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let items = [], width = 0, height = 0, frame = 0, last = 0, quiet = 0, pending = null;

  function resize() {
    const box = container.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pending && width && height) { const list = pending; pending = null; replay(list); }
    draw();
  }
  new ResizeObserver(resize).observe(container);

  function imageFor(svg) {
    if (!images.has(svg)) {
      const img = new Image();
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"'));
      img.onload = draw;
      images.set(svg, img);
    }
    return images.get(svg);
  }

  function step(dt) {
    let moving = false;
    for (const p of items) {
      p.vy += GRAVITY * dt; p.vx *= FRICTION;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.angle += p.vx / p.r * dt;
      if (p.y + p.r > height) { p.y = height - p.r; p.vy = -p.vy * BOUNCE; p.vx *= 0.9; if (Math.abs(p.vy) < 40) p.vy = 0; }
      if (p.x - p.r < 0) { p.x = p.r; p.vx = Math.abs(p.vx) * BOUNCE; }
      if (p.x + p.r > width) { p.x = width - p.r; p.vx = -Math.abs(p.vx) * BOUNCE; }
      if (p.pop < 1) p.pop = Math.min(1, p.pop + dt * 6);
    }
    for (let k = 0; k < 4; k++) for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { const imp = -(1 + BOUNCE) * rel / 2; a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny; }
    }
    for (const p of items) if (Math.abs(p.vx) > 6 || Math.abs(p.vy) > 6 || p.pop < 1) moving = true;
    return moving;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of items) {
      if (!p.img.complete) continue;
      const s = p.r * 2.2 * (0.6 + 0.4 * p.pop);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    // 튀어 오른 꼭대기에서 잠깐 속도가 0에 가까워져도 멈추지 않게, 조용한 프레임이 이어질 때만 쉰다
    quiet = step(dt) ? 0 : quiet + 1;
    draw();
    frame = quiet < 30 ? requestAnimationFrame(loop) : 0;
  }
  function wake() { quiet = 0; if (!frame) { last = performance.now(); frame = requestAnimationFrame(loop); } }

  const radius = () => Math.max(7, Math.min(14, width * 0.022));
  // 가로 위치 x(0~1)에서 떨어뜨릴 아이콘. 실제 클릭과 다시 쌓기가 같은 규칙을 쓴다.
  function spawn(svg, x) {
    const r = radius();
    return { img: imageFor(svg), r, x: r + x * Math.max(1, width - r * 2), y: -r, vx: 0, vy: 0, angle: tilt(x), pop: 1 };
  }
  // 저장된 반응을 받은 순서대로 같은 자리에서 떨어뜨리며 화면 밖에서 빠르게 굴려, 본 그대로 쌓인 모습을 만든다
  function replay(list) {
    items = [];
    for (const { svg, x } of list.slice(0, MAX)) {
      items.push(spawn(svg, x));
      for (let k = 0; k < 8; k++) step(1 / 60);
    }
    for (let k = 0; k < 120 && step(1 / 60); k++);
    for (const p of items) p.vx = p.vy = 0;
  }

  return {
    // list: [{ svg, x }] 받은 순서대로. x가 없으면(위치 저장 전 기록) 순번으로 고르게 흩어 놓는다.
    fill(list) {
      cancelAnimationFrame(frame); frame = 0;
      const rows = list.map((row, i) => ({ svg: row.svg, x: Number.isFinite(row.x) ? row.x : (i * 0.618034) % 1 }));
      if (!width || !height) resize();
      if (!width || !height) { items = []; pending = rows; return; }   // 창이 아직 안 보이면 크기가 잡힐 때 놓는다
      replay(rows); draw();
    },
    // 새 반응 하나를 떨어뜨리고, 저장할 가로 위치(0~1)를 돌려준다. 창이 가득 차면 떨어뜨리지 않는다.
    drop(svg) {
      if (!width || !height) resize();
      const x = Math.round(Math.random() * 1000) / 1000;
      if (items.length >= MAX) return x;
      const p = spawn(svg, x);
      p.pop = 0;
      if (reduce.matches) { p.y = height - p.r; p.pop = 1; }   // 동작 줄임: 떨어지는 대신 바닥에 바로 놓는다
      items.push(p);
      if (reduce.matches) { step(0); draw(); } else wake();
      return x;
    },
    clear() { items = []; pending = null; cancelAnimationFrame(frame); frame = 0; draw(); },
  };
}
