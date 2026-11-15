// 對話小劇場（使用者 2026-11-15：對話要搭配示意畫面，像敘事型教學影片，不要聲音）。
// 一個像素風舞台：NPC 在左、見習生在右，中間依每句台詞的「畫面指令」演出。畫面用 emoji 縮小再放大成像素圖，
// 所以不必一張張畫素材，任何 emoji 都能當道具。
//
// 台詞格式 ["npc"|"me", "台詞", "畫面指令"]，第三格可省略（沿用上一句的畫面）。畫面指令是空白分隔的 token：
//   🏭  🌳☀️         一個或一串 emoji：道具排一排，彈出登場
//   🏭>💨>🌍         用 > 串起來：流程，箭頭會流動
//   n=1,270 公噸     大字看板；開頭是數字會從 0 數上去
//   bar=1000,270     長條圖（最多 5 根，依序長出來）
//   tilt=-1|0|1      天平：-1 左重、0 平衡、1 右重
//   up=💨  down=💧   從中間往上飄／往下掉的粒子
//   ok  no  ?        蓋一個大大的 ✔／✘／？
//   clear            清空舞台
const W = 320, H = 120, GROUND = 98, R = 2; // 邏輯座標 320×120，實際畫在 2 倍解析度
const THEME = { // 每區背景：天空上下、地面、遠景 emoji
  climate: ['#7fb6e8', '#cfe6f4', '#6aa84c', '🏛️'], disclose: ['#6aa6dc', '#d6ecf6', '#c9b27c', '⚓'], inventory: ['#86b8dc', '#dcecf2', '#7aa25a', '📋'],
  footprint: ['#78a8c8', '#cfe2e6', '#3f7a44', '🌲'], energy: ['#8a9ab4', '#d8dde6', '#6a7484', '🏭'], renew: ['#86c4ec', '#e4f4fa', '#a8c868', '🌬️'],
  carbon: ['#7ab0c8', '#d4eae6', '#4a8a6a', '🌿'], plain: ['#8cc4ec', '#e2f2fa', '#86c055', '🌾'], forest: ['#6a9cc0', '#cfe2ea', '#2f6b3a', '🌳'],
  valley: ['#7ab4dc', '#d8ecf6', '#5a9a6a', '🌊'], fort: ['#8a96b0', '#d6dce8', '#6c7a6c', '🏰'], mount: ['#6a7cb0', '#cfd6ec', '#6a6a7a', '⛰️'],
  sea: ['#5aa4d8', '#cfeaf6', '#3a8ab8', '🐚'], capital: ['#9aa0d0', '#e6e4f4', '#b8a070', '👑'], claude: ['#e0a080', '#f6e4d4', '#c08060', '🛠️'],
};
const EMO = new Map();
function emoji(e, px = 28) { // emoji 先畫成小圖再放大（內部解析度是邏輯座標的 2 倍，保留像素感又不至於糊）
  const k = e + px; if (EMO.has(k)) return EMO.get(k);
  const c = document.createElement('canvas'); c.width = c.height = px + 2; const x = c.getContext('2d');
  x.font = `${px}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(e, (px + 2) / 2, (px + 2) / 2 + 1); EMO.set(k, c); return c;
}
const splitEmoji = (s) => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment).filter((g) => g.trim());
function parse(fx) {
  const S = { items: [], flow: false, n: null, bar: null, tilt: null, up: null, down: null, mark: null };
  for (const t of String(fx || '').split(/\s+/).filter(Boolean)) {
    const m = /^(n|bar|tilt|up|down)=(.*)$/.exec(t);
    if (m) { const [, k, v] = m; S[k] = k === 'bar' ? v.split(',').map(Number).filter(Number.isFinite).slice(0, 5) : k === 'tilt' ? Math.sign(+v || 0) : v; }
    else if (t === 'ok' || t === 'no' || t === '?') S.mark = t;
    else if (t === 'clear') Object.assign(S, { items: [] });
    else if (t.includes('>')) { S.flow = true; S.items.push(...t.split('>').filter(Boolean).map((x) => splitEmoji(x)[0])); }
    else S.items.push(...splitEmoji(t));
  }
  if (S.n) S.n = S.n.replace(/_/g, ' '); // n= 用底線代表空白
  return S;
}
export const FX_RE = /^(n|bar|tilt|up|down)=|^(ok|no|\?|clear)$/;

export function makeStage(region, npcSprite, meSprite) {
  const cv = document.createElement('canvas'); cv.width = W * R; cv.height = H * R; cv.className = 'lk-stage'; cv.setAttribute('aria-hidden', 'true');
  const g = cv.getContext('2d'); g.scale(R, R); g.imageSmoothingEnabled = false;
  const [sky1, sky2, grd] = THEME[region] || THEME.climate;
  let scene = parse(''), t0 = 0, speaker = 'npc', meX = W + 30, raf = 0, stopped = false;
  const P = []; // 粒子
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  function bg(t) {
    const sg = g.createLinearGradient(0, 0, 0, GROUND); sg.addColorStop(0, sky1); sg.addColorStop(1, sky2); g.fillStyle = sg; g.fillRect(0, 0, W, GROUND);
    g.globalAlpha = 0.35; for (let i = 0; i < 3; i++) { const x = ((i * 120 + t * 0.006) % (W + 60)) - 30; g.fillStyle = '#fff'; g.fillRect(x, 14 + i * 9, 26, 5); g.fillRect(x + 6, 10 + i * 9, 14, 4); }
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 0; x < W; x += 2) { const hh = 10 + Math.round(6 * Math.sin(x / 23) + 4 * Math.sin(x / 9)); g.fillRect(x, GROUND - hh, 2, hh); } // 遠山剪影
    g.fillStyle = grd; g.fillRect(0, GROUND, W, H - GROUND); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, GROUND, W, 2);
    for (let x = 3; x < W; x += 11) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, GROUND + 6 + (x % 3) * 4, 2, 1); }
  }
  function actor(img, x, talking, t, flip) {
    const bob = talking ? Math.round(Math.abs(Math.sin(t / 140)) * 2) : 0;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x - 12, GROUND - 1, 24, 3);
    g.save(); if (flip) { g.translate(x * 2, 0); g.scale(-1, 1); }
    g.drawImage(img, x - 16, GROUND - 32 - bob, 32, 32); g.restore();
    if (talking) { g.fillStyle = '#fff'; g.fillRect(x - 3, GROUND - 42 - bob, 6, 5); g.fillStyle = '#1a1626'; g.fillRect(x - 2, GROUND - 41 - bob, 1, 1); g.fillRect(x, GROUND - 41 - bob, 1, 1); g.fillRect(x + 2, GROUND - 41 - bob, 1, 1); }
  }
  function props(t) {
    const k = t - t0, n = scene.items.length; if (!n || chart()) return;
    const size = n > 4 ? 30 : 42, gap = scene.flow ? 18 : 8, total = n * size + (n - 1) * gap, cx = scene.bar || scene.tilt != null ? W / 2 - 46 : W / 2, x0 = cx - total / 2, y = GROUND - size - 4; // 有長條圖／天平時道具往左讓位
    scene.items.forEach((e, i) => {
      const a = ease((k - i * 160) / 350); if (a <= 0) return;
      const s = size * (0.6 + 0.4 * a) * (1 + 0.08 * Math.sin((k - i * 160) / 120) * (1 - a)), x = x0 + i * (size + gap) + (size - s) / 2;
      g.globalAlpha = a; g.drawImage(emoji(e), 0, 0, 30, 30, Math.round(x), Math.round(y + (size - s) + (1 - a) * 10), Math.round(s), Math.round(s)); g.globalAlpha = 1;
      if (scene.flow && i < n - 1 && a >= 1) { // 流動箭頭
        const ax = x0 + (i + 1) * (size + gap) - gap + 2, ay = y + size / 2, ph = Math.floor(k / 90) % 4;
        for (let d = 0; d < 3; d++) { g.fillStyle = d === ph % 3 ? '#fff' : 'rgba(255,255,255,.45)'; g.fillRect(ax + d * 4, ay - 1, 3, 3); }
        g.fillStyle = '#fff'; g.fillRect(ax + 12, ay - 3, 1, 7); g.fillRect(ax + 13, ay - 2, 1, 5); g.fillRect(ax + 14, ay - 1, 1, 3);
      }
    });
  }
  const chart = () => scene.bar && scene.bar.length > 1 && scene.bar.length === scene.items.length; // 道具數＝長條數：每根長條頂端放對應道具
  function bars(t) {
    const v = scene.bar; if (!v || !v.length) return; const k = t - t0, ch = chart(), mx = Math.max(...v.map(Math.abs), 1e-9), bw = ch ? 22 : 14, gap = ch ? 26 : 8, total = v.length * bw + (v.length - 1) * gap, x0 = (scene.items.length && !ch ? W / 2 + 56 : W / 2) - total / 2, hmax = ch ? 50 : 34;
    const cols = ['#e39a62', '#5fbf72', '#6fb3e8', '#e8c877', '#c8564b'];
    v.forEach((val, i) => { const hgt = Math.max(1, Math.round(ease((k - i * 150) / 500) * hmax * Math.abs(val) / mx));
      if (ch) g.drawImage(emoji(scene.items[i]), 0, 0, 30, 30, x0 + i * (bw + gap) + bw / 2 - 12, GROUND - 2 - hgt - 26, 24, 24); g.fillStyle = cols[i % 5]; g.fillRect(x0 + i * (bw + gap), GROUND - 2 - hgt, bw, hgt); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x0 + i * (bw + gap), GROUND - 2 - hgt, 3, hgt); });
  }
  function balance(t) {
    if (scene.tilt == null) return; const k = t - t0, ang = ease(k / 600) * scene.tilt * 0.22, cx = scene.items.length ? W / 2 + 56 : W / 2, cy = GROUND - 44;
    g.fillStyle = '#c9a85c'; g.fillRect(cx - 3, cy, 6, 42); g.fillRect(cx - 12, GROUND - 4, 24, 4);
    g.save(); g.translate(cx, cy); g.rotate(ang); g.fillRect(-60, -2, 120, 4);
    for (const s of [-1, 1]) { g.fillStyle = s < 0 ? '#e39a62' : '#5fbf72'; g.fillRect(s * 56 - 12, 10, 24, 4); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(s * 56, 0, 1, 10); }
    g.restore();
  }
  function board(t) {
    if (!scene.n) return; const k = t - t0, m = /^([\d,.]+)(.*)$/.exec(scene.n);
    let txt = scene.n;
    if (m) { const num = +m[1].replace(/,/g, ''), dec = (m[1].split('.')[1] || '').length, cur = num * ease(k / 900); txt = cur.toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[2]; }
    g.font = '14px "DotGothic16",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(W - 120, g.measureText(scene.n).width + 16), y = scene.items.length || scene.bar || scene.tilt != null ? 14 : 44;
    g.fillStyle = 'rgba(14,16,34,.82)'; g.fillRect(W / 2 - w / 2, y - 10, w, 20); g.fillStyle = '#e8c877'; g.fillRect(W / 2 - w / 2, y + 9, w, 1);
    g.fillStyle = '#fff3c8'; g.fillText(txt, W / 2, y + 1, w - 8);
  }
  function particles(t) {
    for (const [key, dir] of [['up', -1], ['down', 1]]) if (scene[key] && Math.random() < 0.18) P.push({ e: splitEmoji(scene[key])[0] || '•', x: W / 2 - 30 + Math.random() * 60, y: dir < 0 ? GROUND - 30 : 6, v: dir * (0.25 + Math.random() * 0.3), life: 1 });
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.y += p.v * 2; p.life -= 0.012; if (p.life <= 0) { P.splice(i, 1); continue; } g.globalAlpha = Math.min(1, p.life * 1.5); g.drawImage(emoji(p.e), 0, 0, 30, 30, Math.round(p.x), Math.round(p.y), 18, 18); }
    g.globalAlpha = 1;
  }
  function mark(t) {
    if (!scene.mark) return; const a = ease((t - t0 - 250) / 300); if (a <= 0) return; const e = { ok: '✅', no: '❌', '?': '❓' }[scene.mark], s = 20 * a + 10;
    g.drawImage(emoji(e), 0, 0, 30, 30, Math.round(W / 2 + 40 - s / 2), Math.round(18 - s / 2 + 10), Math.round(s), Math.round(s));
  }
  function frame(t) {
    if (stopped || !cv.isConnected && t0 && t - t0 > 1000) return void (stopped = true);
    bg(t);
    if (meX > W - 44) meX = Math.max(W - 44, meX - 3); // 見習生走進場
    balance(t); bars(t); props(t); particles(t); mark(t); board(t);
    actor(npcSprite, 44, speaker === 'npc', t, false); actor(meSprite, Math.round(meX), speaker === 'me', t, true);
    raf = requestAnimationFrame(frame);
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    el: cv,
    say(who, fx) { // 換一句台詞：有畫面指令就換場景，沒有就沿用
      speaker = who; if (fx != null && fx !== '') { scene = parse(fx); P.length = 0; }
      t0 = performance.now();
      if (still) { t0 -= 5000; meX = W - 44; cancelAnimationFrame(raf); frame(performance.now()); cancelAnimationFrame(raf); }
      else if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { stopped = true; cancelAnimationFrame(raf); },
  };
}
