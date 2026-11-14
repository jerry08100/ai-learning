// HD-2D 光影疊層：像素地圖本體不動，上面疊柔光調色、光暈、光束、上下景深模糊、暗角、漂浮光粒。
// 全部是 CSS 合成或小畫布，地圖每次重畫後呼叫 update() 讓光暈跟著動態物件更新。
// 世界地圖（index.html）、AI 國與永續國的知識大陸共用這一支。
const RM = matchMedia('(prefers-reduced-motion: reduce)');

// outer：地圖可捲動時，光暈貼著地圖本身（wrap），其他疊層貼著固定的鏡頭框（outer）
export function mountFx(wrap, src, { motes = 26, tint = ['255,226,170', '150,255,230'], outer = wrap } = {}) {
  const add = (tag, cls, to = outer) => { const e = document.createElement(tag); e.className = 'fx ' + cls; e.setAttribute('aria-hidden', 'true'); to.appendChild(e); return e; };
  const bloom = add('canvas', 'fx-bloom', wrap); bloom.width = 96; bloom.height = Math.max(1, Math.round(96 * src.height / src.width));
  const bg = bloom.getContext('2d');
  add('div', 'fx-grade'); add('div', 'fx-rays'); add('div', 'fx-tilt t'); add('div', 'fx-tilt b'); add('div', 'fx-vig');
  const mc = add('canvas', 'fx-mote'), mg = mc.getContext('2d');
  // 光粒：慢慢往上飄、明暗呼吸；位置用比例，視窗大小改變不用重算
  const P = Array.from({ length: motes }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2, v: 0.004 + Math.random() * 0.01, p: Math.random() * 6.28, c: tint[i % 3 ? 0 : 1] }));
  let raf = 0, last = 0;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (t - last < 40) return; const dt = Math.min(0.1, (t - last) / 1000); last = t; // 約 25fps 就夠
    const w = mc.clientWidth, h = mc.clientHeight; if (!w) return;
    if (mc.width !== w) { mc.width = w; mc.height = h; }
    mg.clearRect(0, 0, w, h);
    for (const m of P) {
      m.y -= m.v * dt * 4; m.x += Math.sin(t / 1800 + m.p) * 0.0004; if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      const a = 0.35 + 0.45 * Math.sin(t / 900 + m.p) ** 2, x = m.x * w, y = m.y * h, R = m.r * (w / 1100 + 0.45);
      const gr = mg.createRadialGradient(x, y, 0, x, y, R * 3); gr.addColorStop(0, `rgba(${m.c},${a})`); gr.addColorStop(1, `rgba(${m.c},0)`);
      mg.fillStyle = gr; mg.fillRect(x - R * 3, y - R * 3, R * 6, R * 6);
    }
  };
  if (!RM.matches) raf = requestAnimationFrame(tick);
  return {
    update() { bg.clearRect(0, 0, bloom.width, bloom.height); bg.drawImage(src, 0, 0, bloom.width, bloom.height); },
    stop() { cancelAnimationFrame(raf); },
  };
}
