// 知識大陸的像素地圖：俯視 3/4 視角、暖色系（參考星露谷類農場像素風）。
// 地形是固定種子產生，每次長得一樣；靜態層（地形、裝飾、迷霧）只在開放狀態改變時重畫，
// 每幀只疊動態物件（浪、河水、風車、水車、旗子、羊、勇者、驚嘆號）。

export const TW = 48, TH = 72, T = 8; // 48×72 格，每格 8×8 像素點 → 384×576
// 區域在地圖上的中心（格座標）。claude 是西南外海的獨立小島
export const LAYOUT = { plain:{ sx:28, sy:50 }, forest:{ sx:11, sy:30 }, valley:{ sx:39, sy:33 }, fort:{ sx:12, sy:46 },
  mount:{ sx:13, sy:12 }, sea:{ sx:35, sy:13 }, capital:{ sx:25, sy:31 }, claude:{ sx:9, sy:65 }, arena:{ sx:39, sy:67 } };
const ISLES = ['claude', 'arena']; // 外海小島，不屬於主大陸
const ROADS = [['plain','forest'],['plain','valley'],['plain','fort'],['forest','mount'],['forest','capital'],['valley','capital'],['capital','sea'],['plain','capital']];

const C = { // 色盤
  g1:'#3f8a3a', g2:'#58ad45', g3:'#7cc95a', g4:'#2f6b33', gl:'#a6dc6e',
  d1:'#c99a5c', d2:'#a97a43', d3:'#e0b878', s1:'#f2dca2', s2:'#e3c486', cliff:'#8a5a3a', cliff2:'#6a4128',
  w1:'#3b82c6', w2:'#5aa8e2', w3:'#a6dcf6', oc:'#22507f', oc2:'#2c6196', foam:'#d8f0fb',
  st1:'#a1a9b3', st2:'#7f8892', st3:'#c9cfd5', st4:'#5c646e',
  wd1:'#8c5b33', wd2:'#6a4225', wd3:'#b37c47', sn:'#f1f6fa', rk:'#8d8f97', rk2:'#6c6e78',
  br1:'#dca56a', br2:'#bb7d4c', gold:'#f3c34f', red:'#c94a3c', org:'#e9772f', pk:'#f08a3a', wh:'#f7f4ee', blk:'#2a2230',
  coral:'#d97757', cream:'#f5e8d8', sky:'#9fd3ff', shadow:'rgba(20,30,20,.28)',
};
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
const fbm = (x, y) => vn(x / 9, y / 9) * 0.6 + vn(x / 4, y / 4) * 0.3 + vn(x / 2, y / 2) * 0.1;

// ---- 地形格 ----
const GRID = [], ROAD = new Set();
(() => {
  const main = Object.keys(LAYOUT).filter((k) => !ISLES.includes(k));
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let id = null;
    const d = Math.hypot((x - 24) / 22, (y - 32) / 29.5) + (fbm(x, y) - 0.5) * 0.55;
    if (d < 0.93) { let best = 1e9; main.forEach((rid, i) => { const L = LAYOUT[rid];
      const dd = Math.hypot(x - L.sx, (y - L.sy) * 0.95) + (vn(x / 5 + i * 13, y / 5 - i * 7) - 0.5) * 7; if (dd < best) { best = dd; id = rid; } }); }
    ISLES.forEach((k, i) => { const L = LAYOUT[k]; if (Math.hypot((x - L.sx) / 6.5, (y - L.sy) / 4.6) + (fbm(x + 50 + i * 30, y) - 0.5) * 0.5 < 1) id = k; });
    GRID.push(id);
  }
  // 區域之間的土路（只鋪在陸地上）
  for (const [a, b] of ROADS) { const A = LAYOUT[a], B = LAYOUT[b], n = Math.max(Math.abs(A.sx - B.sx), Math.abs(A.sy - B.sy));
    for (let i = 0; i <= n; i++) { const x = Math.round(A.sx + (B.sx - A.sx) * i / n + Math.sin(i / 3) * 0.8), y = Math.round(A.sy + (B.sy - A.sy) * i / n);
      if (at(x, y) && at(x, y) !== 'sea') ROAD.add(y * TW + x); } }
})();
export function at(x, y) { return (x < 0 || y < 0 || x >= TW || y >= TH) ? null : GRID[y * TW + x]; }
const riverX = (y) => 39 + 2.2 * Math.sin(y / 4.2);
const isRiver = (x, y) => at(x, y) === 'valley' && Math.abs(x - riverX(y)) < 1.1;

// ---- 繪圖小工具 ----
let g = null; // 目前的 2D context
const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const ell = (cx, cy, rx, ry, c) => { g.fillStyle = c; for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
const line = (x0, y0, x1, y1, c) => { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
// 有明暗的圓（樹冠、羊毛）：左上亮、右下暗，加葉片雜點
function blob(cx, cy, r, lo, mid, hi, seed = 0) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d > r * r + r * 0.6) continue;
    const l = (x + y) / r, h = hash(cx + x + seed, cy + y);
    px(cx + x, cy + y, l < -0.55 || (l < -0.1 && h > 0.8) ? hi : l > 0.55 || (l > 0.1 && h > 0.85) ? lo : mid); }
}

// ---- 地形格繪製 ----
function tile(x, y) {
  const id = at(x, y), X = x * T, Y = y * T, h = hash(x, y), h2 = hash(y + 99, x + 7);
  if (!id) { rect(X, Y, T, T, C.oc); if (h > 0.82) rect(X + ((h2 * 4) | 0), Y + 3, 3, 1, C.oc2); return; }
  const oceanS = at(x, y + 1) === null, coast = oceanS || [[1,0],[-1,0],[0,-1]].some(([a, b]) => at(x + a, y + b) === null);
  if (id === 'sea') { rect(X, Y, T, T, h > 0.5 ? C.w2 : C.w1); if (fbm(x * 2, y * 2) > 0.74) { ell(X + 4, Y + 4, 3, 2, C.s1); px(X + 3, Y + 3, C.g3); } return; }
  if (coast) { rect(X, Y, T, T, C.s1); for (let i = 0; i < 3; i++) px(X + ((h * 7 + i * 3) | 0) % 8, Y + ((h2 * 7 + i * 5) | 0) % 8, C.s2);
    if (oceanS) { rect(X, Y + 5, T, 3, C.cliff); rect(X, Y + 7, T, 1, C.cliff2); px(X + ((h * 8) | 0), Y + 5, C.d1); } return; }
  if (ROAD.has(y * TW + x)) { rect(X, Y, T, T, C.d1); px(X + ((h * 8) | 0), Y + ((h2 * 8) | 0), C.d2); px(X + ((h2 * 8) | 0), Y + ((h * 8) | 0), C.d3); return; }
  if (isRiver(x, y)) { rect(X, Y, T, T, C.w1); rect(X + 1, Y + 2, 3, 1, C.w2); return; }
  switch (id) {
    case 'plain': case 'claude': case 'arena': grass(X, Y, h, h2, C.g2, C.g3, C.g1); if (h > 0.93) { px(X + 3, Y + 3, C.wh); px(X + 4, Y + 2, C.gold); } else if (h2 > 0.95) { px(X + 5, Y + 4, C.red); } break;
    case 'valley': grass(X, Y, h, h2, C.g3, C.gl, C.g2); if (Math.abs(x - riverX(y)) < 2.2 && h > 0.5) { line(X + 2, Y + 7, X + 2, Y + 3, C.g4); line(X + 5, Y + 7, X + 6, Y + 2, C.g4); } break;
    case 'forest': grass(X, Y, h, h2, C.g1, C.g2, C.g4); break;
    case 'fort': rect(X, Y, T, T, C.st1); rect(X, Y + 3, T, 1, C.st2); rect(X, Y + 7, T, 1, C.st2); px(X + ((y % 2) ? 2 : 6), Y, C.st2); px(X + ((y % 2) ? 2 : 6), Y + 1, C.st2); px(X + ((y % 2) ? 2 : 6), Y + 2, C.st2);
      px(X + ((y % 2) ? 5 : 1), Y + 4, C.st2); px(X + ((y % 2) ? 5 : 1), Y + 5, C.st2); px(X + ((y % 2) ? 5 : 1), Y + 6, C.st2); if (h > 0.85) { px(X + 1, Y + 1, C.g2); px(X + 2, Y + 1, C.g1); } if (h2 > 0.8) px(X + 4, Y + 1, C.st3); break;
    case 'mount': { const snow = y < 10 + h * 3; rect(X, Y, T, T, snow ? C.sn : C.rk); rect(X, Y + 6, T, 2, snow ? '#d6e2ea' : C.rk2); if (h > 0.6) line(X + 1, Y + 5, X + 4, Y + 2, snow ? '#c3d3de' : C.st4); break; }
    case 'capital': rect(X, Y, T, T, (x + y) % 2 ? C.br1 : '#e3b07a'); rect(X, Y + 7, T, 1, C.br2); rect(X + 7, Y, 1, T, C.br2); if (h > 0.9) px(X + 3, Y + 3, C.org); break;
  }
}
function grass(X, Y, h, h2, base, hi, lo) {
  rect(X, Y, T, T, base);
  const a = (h * 6) | 0, b = (h2 * 6) | 0; px(X + a, Y + b + 1, hi); px(X + a + 1, Y + b, hi); px(X + a + 2, Y + b + 1, hi);
  if (h2 > 0.5) px(X + ((a + 4) % 7), Y + ((b + 3) % 7), lo);
}

// ---- 裝飾物（依 y 排序後畫，前景蓋住後景）----
function tree(x, y, s = 1) { ell(x + 1, y + 1, 6 * s, 2, C.shadow); rect(x - 1, y - 5, 3, 6, C.wd2); px(x, y - 4, C.wd1); blob(x, y - 10 * s, Math.round(6 * s), C.g4, C.g1, C.g3, x); }
function pine(x, y) { ell(x, y + 1, 4, 2, C.shadow); rect(x - 1, y - 2, 2, 3, C.wd2);
  for (let i = 0; i < 4; i++) { const w = 1 + i * 1.3, yy = y - 12 + i * 3; for (let k = 0; k < 3; k++) line(x - w + k * 0, yy + k, x + w, yy + k, k === 0 ? C.g1 : C.g4); }
  px(x, y - 13, C.g3); }
function rock(x, y) { ell(x, y + 1, 3, 1, C.shadow); ell(x, y - 1, 3, 2, C.rk); px(x - 1, y - 2, C.st3); px(x + 2, y, C.rk2); }
function crop(X, Y, kind) { // 一格作物
  for (let i = 0; i < 2; i++) { const cx = X + 2 + i * 4, cy = Y + 5;
    if (kind) { ell(cx, cy, 2, 1, C.pk); px(cx - 1, cy - 1, C.org); px(cx, cy - 2, C.g1); px(cx + 1, cy - 2, C.g2); }
    else { line(cx, cy + 1, cx - 2, cy - 3, C.g1); line(cx, cy + 1, cx + 2, cy - 3, C.g2); line(cx, cy + 1, cx, cy - 4, C.g3); } } }
function fenceH(X, Y) { rect(X, Y + 3, T, 1, C.wd3); rect(X, Y + 5, T, 1, C.wd1); rect(X + 1, Y + 1, 2, 6, C.wd1); px(X + 1, Y + 1, C.wd3); }
function fenceV(X, Y) { rect(X + 3, Y, 2, T, C.wd1); px(X + 3, Y, C.wd3); }
function flower(x, y, c) { px(x, y, c); px(x - 1, y, c); px(x + 1, y, c); px(x, y - 1, c); px(x, y, C.gold); px(x, y + 1, C.g1); }
function crystal(x, y) { ell(x, y + 1, 4, 1, 'rgba(0,40,80,.3)'); line(x, y - 9, x - 3, y - 3, C.w3); line(x, y - 9, x + 3, y - 3, C.w2);
  for (let j = -8; j <= 0; j++) { const w = Math.round(3 * (1 - Math.abs(j + 4) / 5)); rect(x - w, y + j, w * 2 + 1, 1, j < -4 ? C.w3 : C.w2); } px(x - 1, y - 6, C.wh); }

// ---- 地標（大物件，有些會動）----
const LM = {
  plain(x, y, f) { // 風車＋水井
    ell(x, y + 2, 10, 3, C.shadow);
    for (let j = 0; j < 16; j++) { const w = 4 + Math.round(j * 0.25); rect(x - w, y - 16 + j, w * 2 + 1, 1, j % 4 === 3 ? C.st2 : C.st1); }
    rect(x - 2, y - 6, 4, 6, C.wd2); px(x - 1, y - 9, C.sky); px(x, y - 9, C.sky);
    for (let j = 0; j < 6; j++) rect(x - 6 + j, y - 22 + j, 13 - j * 2, 1, j < 3 ? C.wd2 : C.wd1);
    const a = f * 0.35, hx = x, hy = y - 17;
    for (let k = 0; k < 4; k++) { const t = a + k * Math.PI / 2, ex = hx + Math.cos(t) * 13, ey = hy + Math.sin(t) * 13;
      line(hx, hy, ex, ey, C.wd2); const nx = -Math.sin(t) * 2, ny = Math.cos(t) * 2;
      for (let s = 0.35; s <= 1; s += 0.12) { const sx = hx + Math.cos(t) * 13 * s, sy = hy + Math.sin(t) * 13 * s; line(sx, sy, sx + nx, sy + ny, C.cream); } }
    rect(hx - 1, hy - 1, 3, 3, C.wd2);
  },
  forest(x, y) { tree(x, y + 2, 1.6); },
  valley(x, y, f) { // 水車小屋
    ell(x, y + 2, 10, 3, C.shadow); rect(x - 8, y - 10, 12, 11, C.wd3); rect(x - 8, y - 2, 12, 1, C.wd1); rect(x - 5, y - 6, 3, 3, C.sky); rect(x - 1, y - 5, 3, 6, C.wd2);
    for (let j = 0; j < 6; j++) rect(x - 10 + j, y - 16 + j, 16 - j * 2 + 0, 1, C.red); rect(x - 10, y - 11, 16, 1, '#9a3a30');
    const cxw = x + 7, cyw = y - 3; for (let r = 0; r < 2; r++) { for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; px(cxw + Math.round(Math.cos(t) * (6 - r)), cyw + Math.round(Math.sin(t) * (6 - r)), C.wd2); } }
    for (let k = 0; k < 4; k++) { const t = f * 0.4 + k * Math.PI / 4; line(cxw - Math.cos(t) * 6, cyw - Math.sin(t) * 6, cxw + Math.cos(t) * 6, cyw + Math.sin(t) * 6, C.wd1); }
  },
  fort(x, y, f) { // 石塔＋旗
    ell(x, y + 2, 9, 3, C.shadow); rect(x - 6, y - 20, 13, 21, C.st1); for (let j = -18; j < 0; j += 4) rect(x - 6, y + j, 13, 1, C.st2);
    for (let i = -6; i <= 6; i += 4) rect(x + i, y - 23, 3, 3, C.st1); rect(x - 2, y - 6, 5, 7, C.blk); rect(x - 1, y - 14, 3, 4, C.blk);
    line(x, y - 23, x, y - 32, C.wd2); const w = f % 2; rect(x + 1, y - 32, 6, 3, C.red); px(x + 7, y - 31 + w, C.red); px(x + 6, y - 29 + w, C.red);
  },
  mount(x, y) { // 大雪山
    ell(x, y + 2, 16, 3, C.shadow);
    for (let j = 0; j < 24; j++) { const w = Math.round(j * 0.75); rect(x - w, y - 24 + j, w * 2 + 1, 1, C.rk); rect(x, y - 24 + j, w + 1, 1, C.rk2); if (j < 8) { rect(x - w, y - 24 + j, w * 2 + 1, 1, C.sn); rect(x + 1, y - 24 + j, w, 1, '#d6e2ea'); } }
  },
  sea(x, y) { ell(x, y + 2, 7, 3, C.s1); crystal(x, y + 1); },
  capital(x, y, f) { // 城堡
    ell(x, y + 2, 15, 3, C.shadow); rect(x - 12, y - 14, 25, 15, C.st3); for (let i = -12; i <= 12; i += 4) rect(x + i, y - 17, 3, 3, C.st3);
    rect(x - 4, y - 24, 9, 11, C.st1); for (let i = -4; i <= 4; i += 4) rect(x + i, y - 27, 2, 3, C.st1);
    rect(x - 2, y - 6, 5, 7, C.wd2); px(x, y - 7, C.wd2); rect(x - 9, y - 9, 2, 3, C.blk); rect(x + 8, y - 9, 2, 3, C.blk); rect(x - 1, y - 20, 2, 3, C.blk);
    rect(x - 12, y - 1, 25, 1, C.st2);
    const w = f % 2; line(x, y - 27, x, y - 35, C.wd2); rect(x + 1, y - 35, 6, 3, C.gold); px(x + 7, y - 34 + w, C.gold);
    line(x - 12, y - 17, x - 12, y - 23, C.wd2); rect(x - 11, y - 23, 4, 2, C.red); line(x + 14, y - 17, x + 14, y - 23, C.wd2); rect(x + 15, y - 23, 4, 2, C.red);
  },
  arena(x, y, f) { // 演武場：圓形石砌競技場＋兩面旗
    ell(x, y + 2, 15, 3, C.shadow); ell(x, y - 4, 14, 7, C.st2); ell(x, y - 5, 13, 6, C.st1); ell(x, y - 5, 9, 4, C.d2); ell(x, y - 5, 8, 3, C.br1);
    for (let i = -12; i <= 12; i += 4) rect(x + i, y - 2 + Math.round(Math.abs(i) / 5), 2, 3, C.st3);
    rect(x - 2, y - 2, 5, 4, C.blk);
    const w = f % 2; [-13, 13].forEach((dx) => { line(x + dx, y - 6, x + dx, y - 16, C.wd2); rect(x + dx + 1, y - 16, 5, 3, dx < 0 ? C.red : C.gold); px(x + dx + 6, y - 15 + w, dx < 0 ? C.red : C.gold); });
  },
  claude(x, y, f) { // 工坊：珊瑚色屋頂＋煙囪冒煙＋招牌
    ell(x, y + 2, 12, 3, C.shadow); rect(x - 10, y - 11, 20, 12, C.cream); rect(x - 10, y, 20, 1, C.br2);
    for (let j = 0; j < 8; j++) rect(x - 12 + j, y - 19 + j, 24 - j * 2, 1, j % 2 ? C.coral : '#c4664a'); rect(x - 12, y - 12, 24, 1, '#a9533b');
    rect(x + 5, y - 22, 3, 6, C.st2); const s = f % 3; px(x + 6, y - 24 - s, '#e8e8e8'); px(x + 7, y - 26 - s, '#d0d0d0'); px(x + 5, y - 28 - s, '#bbbbbb');
    rect(x - 2, y - 7, 5, 8, C.wd2); rect(x - 8, y - 8, 4, 3, C.sky); rect(x + 5, y - 8, 4, 3, C.sky);
    rect(x - 15, y - 6, 1, 7, C.wd2); rect(x - 18, y - 9, 7, 4, C.wd3); px(x - 16, y - 8, C.blk); px(x - 14, y - 8, C.blk); px(x - 13, y - 7, C.blk);
  },
};

// ---- 靜態層 ----
const DECOR = []; // { y, draw }
(() => {
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const id = at(x, y); if (!id || id === 'sea' || ROAD.has(y * TW + x) || isRiver(x, y)) continue;
    const coast = [[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => at(x + a, y + b) === null); if (coast) continue;
    const L = LAYOUT[id], near = Math.abs(x - L.sx) < 4 && y - L.sy < 2 && L.sy - y < 5; if (near) continue;
    const X = x * T + 4, Y = y * T + 7, h = hash(x * 3, y * 5);
    if (id === 'forest' && (x + y) % 2 === 0 && h > 0.15) DECOR.push({ y: Y, d: () => tree(X, Y, h > 0.7 ? 1.15 : 0.9) });
    else if (id === 'mount' && h > 0.55) DECOR.push({ y: Y, d: () => (y > 11 && h > 0.8 ? rock(X, Y) : pine(X, Y)) });
    else if (id === 'valley' && h > 0.9) DECOR.push({ y: Y, d: () => tree(X, Y, 0.8) });
    else if (id === 'capital' && h > 0.9) DECOR.push({ y: Y, d: () => { rect(X - 2, Y - 3, 5, 3, C.br2); flower(X, Y - 4, C.red); } });
    else if (id === 'fort' && h > 0.93) DECOR.push({ y: Y, d: () => rock(X, Y) });
    else if ((id === 'plain' || id === 'claude' || id === 'arena') && h > 0.94) DECOR.push({ y: Y, d: () => tree(X, Y, 0.85) });
  }
  // 起源平原的農田（圍籬圍起來）與羊圈
  const P = LAYOUT.plain;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { const x = P.sx + 4 + i, y = P.sy - 6 + j; if (at(x, y) === 'plain' && !ROAD.has(y * TW + x)) DECOR.push({ y: y * T, d: () => { rect(x * T, y * T, T, T, C.d2); crop(x * T, y * T, j % 2); } }); }
  for (let i = -1; i <= 6; i++) { const x = P.sx + 4 + i; [P.sy - 7, P.sy - 2].forEach((y) => { if (at(x, y) === 'plain') DECOR.push({ y: y * T + 6, d: () => fenceH(x * T, y * T) }); }); }
  for (let i = 0; i < 4; i++) { const x = P.sx - 8, y = P.sy - 6 + i; if (at(x, y) === 'plain') DECOR.push({ y: y * T, d: () => fenceV(x * T, y * T) }); }
  for (let i = 0; i < 5; i++) { const x = P.sx - 8 + i; [P.sy - 7, P.sy - 2].forEach((y) => { if (at(x, y) === 'plain') DECOR.push({ y: y * T + 6, d: () => fenceH(x * T, y * T) }); }); }
  DECOR.sort((a, b) => a.y - b.y);
})();
const SHEEP = [{ x: LAYOUT.plain.sx - 6, y: LAYOUT.plain.sy - 4, p: 0 }, { x: LAYOUT.plain.sx - 4.5, y: LAYOUT.plain.sy - 3, p: 2 }, { x: LAYOUT.plain.sx - 5.5, y: LAYOUT.plain.sy - 5.2, p: 4 }];
function sheep(x, y, f) { ell(x, y + 3, 4, 1, C.shadow); blob(x, y, 3, '#d8d4cc', C.wh, '#ffffff', 7); rect(x + 3, y - 1, 2, 3, C.blk); px(x + 4, y - 1, C.wh); const l = f % 2; rect(x - 2, y + 3, 1, 1 + l, C.blk); rect(x + 2, y + 3, 1, 2 - l, C.blk); }
function hero(x, y, bob) { y -= bob; ell(x, y + 1, 4, 1, C.shadow);
  rect(x - 2, y - 3, 2, 3, C.wd2); rect(x + 1, y - 3, 2, 3, C.wd2); rect(x - 3, y - 9, 7, 6, '#3b6fc4'); rect(x - 3, y - 5, 7, 1, C.wd2);
  rect(x - 3, y - 15, 7, 6, '#f3c9a0'); rect(x - 3, y - 16, 7, 3, C.wd2); rect(x - 4, y - 15, 1, 3, C.wd2); px(x - 1, y - 12, C.blk); px(x + 2, y - 12, C.blk);
  rect(x - 4, y - 9, 1, 4, '#f3c9a0'); rect(x + 4, y - 9, 1, 4, '#f3c9a0'); }
function mark(x, y) { rect(x - 3, y - 11, 7, 12, C.blk); rect(x - 2, y - 10, 5, 7, C.gold); rect(x - 2, y - 2, 5, 2, C.gold); rect(x - 1, y - 9, 3, 5, '#fff3b0'); }

export function makeMap(canvas) {
  canvas.width = TW * T; canvas.height = TH * T;
  const ctx = canvas.getContext('2d'), base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
  let key = '';
  const OCEAN = []; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (!at(x, y)) OCEAN.push([x, y]);
  function buildBase(open) {
    g = base.getContext('2d');
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) tile(x, y);
    for (const d of DECOR) d.d();
    for (const [id, L] of Object.entries(LAYOUT)) if (id !== 'plain' && id !== 'valley' && id !== 'fort' && id !== 'capital' && !ISLES.includes(id)) LM[id](L.sx * T + 4, L.sy * T + 4, 0);
    // 迷霧：未開放區域蓋上霧
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const id = at(x, y); if (!id || open[id]) continue;
      const X = x * T, Y = y * T; g.fillStyle = 'rgba(38,44,64,.62)'; g.fillRect(X, Y, T, T);
      g.fillStyle = 'rgba(200,214,230,.30)'; for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if (fbm((X + i) / 3, (Y + j) / 3) > 0.62) g.fillRect(X + i, Y + j, 1, 1); }
  }
  return {
    draw({ open, marks, hero: heroId, frame }) {
      const k = JSON.stringify(open); if (k !== key) { key = k; buildBase(open); }
      g = ctx; ctx.drawImage(base, 0, 0);
      for (const [x, y] of OCEAN) if (hash(x, y + frame) > 0.985) { rect(x * T + 2, y * T + 4, 4, 1, C.foam); }
      for (let y = 0; y < TH; y++) { const x = Math.round(riverX(y)); if (isRiver(x, y) && (y + frame) % 4 === 0) rect(x * T + 3, y * T + 4, 3, 1, C.w3); }
      const fogged = (id) => !open[id];
      for (const id of ['plain', 'valley', 'fort', 'capital', ...ISLES]) { const L = LAYOUT[id]; LM[id](L.sx * T + 4, L.sy * T + 4, fogged(id) ? 0 : frame);
        if (fogged(id)) { const X = L.sx * T + 4, Y = L.sy * T + 4; g.fillStyle = 'rgba(38,44,64,.55)'; g.fillRect(X - 20, Y - 38, 40, 42); } }
      if (open.plain) SHEEP.forEach((s, i) => sheep(Math.round(s.x * T + Math.sin((frame + s.p) / 3) * 5), Math.round(s.y * T), frame + i));
      const bob = frame % 2;
      for (const id of marks) { const L = LAYOUT[id]; if (L) mark(L.sx * T + 18, L.sy * T - 26 - bob); }
      const H = LAYOUT[heroId] || LAYOUT.plain; hero(H.sx * T - 12, H.sy * T + 6, bob);
    },
    regionAt(clientX, clientY) { const b = canvas.getBoundingClientRect(); return at(Math.floor((clientX - b.left) / b.width * TW), Math.floor((clientY - b.top) / b.height * TH)); },
    tagPos(id) { const L = LAYOUT[id]; return { left: (L.sx * T + 4) / (TW * T) * 100, top: (L.sy * T + 12) / (TH * T) * 100 }; },
  };
}
