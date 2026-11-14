// 知識大陸（AI 智能國）的像素地圖：俯視 3/4 視角，風格 A（HD-2D 光影）。
// 2026-11-14 改版：內部解析度加倍（每格 16 像素，畫布 768×1152），地面以 2×2 像素為一個美術點逐點打光＋Bayer 抖色，
// 各區平均分布在整座島上，每區是一個聚落（主地標＋周邊小建物），區域之間有土路相連。
// 地形是固定種子產生，每次長得一樣。繪製分三層：
//   靜態層（地形、道路、建物、樹）整張只畫一次，模組層級快取；
//   底圖＝靜態層＋未開放區的動畫物件（停在第 0 幀）＋迷霧，只在開放狀態改變時重畫；
//   每幀只疊開放區的動畫物件（風車、水車、旗子、煙、浪花、羊、船）與勇者、驚嘆號。
// 柔光、光暈、景深由 fx.js 疊在上面。

export const TW = 48, TH = 72, T = 16; // 48×72 格，每格 16×16 像素 → 768×1152
const W = TW * T, H = TH * T, K = T >> 1, AW = W >> 1, AH = H >> 1, N = AW * AH; // 美術點 2×2 像素，每格 8×8 個美術點
// 區域在地圖上的中心（格座標）。claude、arena 是外海獨立小島
export const LAYOUT = { mount:{ sx:14, sy:10 }, sea:{ sx:35, sy:11 }, forest:{ sx:10, sy:27 }, valley:{ sx:37, sy:27 },
  capital:{ sx:24, sy:39 }, fort:{ sx:11, sy:50 }, plain:{ sx:35, sy:51 }, claude:{ sx:9, sy:65 }, arena:{ sx:39, sy:66 } };
const ISLES = ['claude', 'arena'];
const IDS = Object.keys(LAYOUT), MAIN = IDS.filter((k) => !ISLES.includes(k));
const ROADS = [['mount','forest'],['mount','sea'],['forest','capital'],['valley','capital'],['sea','valley'],['capital','fort'],['capital','plain'],['fort','plain'],['forest','fort']];
// 主島：幾個橢圓疊起來（格座標 cx, cy, rx, ry）
const BLOBS = [[24, 31, 21.5, 27.5], [36, 12, 10, 7.5], [12, 51, 10.5, 8], [35, 51, 11, 8], [11, 11, 9, 7]];
// 數據河谷的河：從山腳流經河谷出東海（格座標折線）
const RIVER = [[29, 17], [33, 20], [36.5, 24], [39.6, 27], [41, 31], [44, 34], [48, 36]];
const ax0 = (id) => LAYOUT[id].sx * T + 8, ay0 = (id) => LAYOUT[id].sy * T + 8; // 區域中心（像素）

const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
const fbm = (x, y) => vn(x / 9, y / 9) * 0.6 + vn(x / 4, y / 4) * 0.3 + vn(x / 2, y / 2) * 0.1;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16); // 4×4 Bayer 抖色門檻
const segD = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };

// ---- 地形格（美術點 384×576）----
const REG = new Int8Array(N).fill(-1); // 區域索引，-1＝海
const WAT = new Uint8Array(N);         // 1＝河、2＝潟湖
const HG = new Float32Array(N), FN = new Float32Array(N), V = new Float32Array(N);
const DO = new Uint8Array(N).fill(99), DL = new Uint8Array(N).fill(99), DW = new Uint8Array(N).fill(99); // 海→陸地、陸地→海水、潟湖→岸邊的距離（美術點）
const OCC = new Uint8Array(N); // 已被道路、建物、水佔用（樹不長在上面）
(() => {
  // 低頻雜訊先在每 2 個美術點的節點上算，再雙線性內插（省掉四分之三的雜訊運算）
  const NW = (AW >> 1) + 1, NH = (AH >> 1) + 1, HC = new Float32Array(NW * NH), LC = new Float32Array(NW * NH);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) { const tx = x * 2 / K, ty = y * 2 / K;
    HC[y * NW + x] = fbm(tx * 1.6 + 7, ty * 1.6 - 3); LC[y * NW + x] = (fbm(tx, ty) - 0.5) * 0.5 + (vn(tx * 1.4, ty * 1.4) - 0.5) * 0.1; }
  const lerp2 = (A, ax, ay) => { const x = (ax + 0.5) / 2, y = (ay + 0.5) / 2, x0 = Math.min(NW - 2, x | 0), y0 = Math.min(NH - 2, y | 0), fx = x - x0, fy = y - y0, j = y0 * NW + x0;
    return (A[j] * (1 - fx) + A[j + 1] * fx) * (1 - fy) + (A[j + NW] * (1 - fx) + A[j + NW + 1] * fx) * fy; };
  const iSea = IDS.indexOf('sea'), BR = new Int8Array((AW >> 1) * (AH >> 1)).fill(-2);
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) {
    const i = ay * AW + ax, tx = (ax + 0.5) / K, ty = (ay + 0.5) / K;
    FN[i] = vn(ax / 4, ay / 4); HG[i] = lerp2(HC, ax, ay);
    let land = -1; for (let q = 0; q < BLOBS.length; q++) { const B = BLOBS[q], u = (tx - B[0]) / B[2], v = (ty - B[1]) / B[3], e = 1 - Math.sqrt(u * u + v * v); if (e > land) land = e; }
    land += lerp2(LC, ax, ay);
    if (land > 0.07) { const bi = (ay >> 1) * (AW >> 1) + (ax >> 1); // 分區每 2×2 個美術點算一次就夠細
      if (BR[bi] === -2) { const bx = ((ax >> 1) * 2 + 1) / K, by = ((ay >> 1) * 2 + 1) / K; let best = 1e9; MAIN.forEach((rid, j) => { const L = LAYOUT[rid];
        const dd = Math.hypot(bx - L.sx, (by - L.sy) * 0.95) + (vn(bx / 5 + j * 13, by / 5 - j * 7) - 0.5) * 7 + (vn(bx * 0.7 + j * 5, by * 0.7) - 0.5) * 1.6;
        if (dd < best) { best = dd; BR[bi] = IDS.indexOf(rid); } }); }
      REG[i] = BR[bi]; }
    ISLES.forEach((k, j) => { const L = LAYOUT[k]; if (Math.abs(tx - L.sx) < 9 && Math.abs(ty - L.sy) < 7 && Math.hypot((tx - L.sx) / 6.6, (ty - L.sy) / 4.7) + (fbm(tx + 50 + j * 30, ty) - 0.5) * 0.5 + (vn(tx * 1.5, ty * 1.5) - 0.5) * 0.08 < 1) REG[i] = IDS.indexOf(k); });
    if (REG[i] < 0) continue;
    // 生成之海：潟湖，中心小島與幾塊沙洲以外都是淺水
    if (REG[i] === iSea && Math.hypot(tx - LAYOUT.sea.sx, ty - LAYOUT.sea.sy + 0.4) > 2.6 + vn(tx, ty) * 0.8 && fbm(tx * 2 + 9, ty * 2) < 0.66) WAT[i] = 2;
    let rd = 9; if (tx > 27 && ty > 15 && ty < 38) for (let s = 1; s < RIVER.length; s++) rd = Math.min(rd, segD(tx, ty, RIVER[s - 1], RIVER[s]));
    if (rd < 0.42 + (vn(tx * 2, ty * 2) - 0.5) * 0.12 && WAT[i] === 0) WAT[i] = 1;
  }
  const bfs = (D, src, pass) => { let q = []; for (let i = 0; i < N; i++) if (src(i)) { D[i] = 0; q.push(i); }
    for (let d = 1; d < 30 && q.length; d++) { const nq = []; for (const i of q) { const x = i % AW;
      for (const j of [x > 0 ? i - 1 : -1, x < AW - 1 ? i + 1 : -1, i - AW, i + AW]) if (j >= 0 && j < N && D[j] === 99 && pass(j)) { D[j] = d; nq.push(j); } } q = nq; } };
  bfs(DO, (i) => REG[i] >= 0, (i) => REG[i] < 0);
  bfs(DL, (i) => REG[i] < 0 || WAT[i] === 2, (i) => REG[i] >= 0 && WAT[i] !== 2);
  bfs(DW, (i) => REG[i] >= 0 && WAT[i] !== 2, (i) => WAT[i] === 2);
  for (let i = AW + 1; i < N - AW - 1; i++) { const r = REG[i]; if (r < 0) continue;
    const mt = IDS[r] === 'mount', rel = (HG[i - AW - 1] - HG[i + AW + 1]) * (mt ? 16 : 9);
    V[i] = 0.5 + rel + (FN[i] - 0.5) * 0.55 + (mt ? (HG[i] - 0.5) * 0.6 : 0);
    if (WAT[i]) OCC[i] = 1; }
})();
export function at(x, y) { if (x < 0 || y < 0 || x >= TW || y >= TH) return null; const r = REG[(y * K + 4) * AW + x * K + 4]; return r < 0 ? null : IDS[r]; }
const cellAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : (y >> 1) * AW + (x >> 1);
const regAt = (x, y) => { const i = cellAt(x, y); return i < 0 ? -1 : REG[i]; };

// ---- 色盤：五階色帶，暗部偏藍紫、亮部偏黃 ----
const R = {
  grass:['#1d4636','#2c653d','#438543','#6aa84c','#a3c765'], meadow:['#28583a','#3a7a42','#58a048','#86c055','#c2db73'],
  wood:['#12282c','#193a31','#225038','#33683f','#4c8447'], vale:['#2a5c44','#41854a','#62a552','#93c262','#cbdc85'],
  moor:['#30384a','#46535c','#5d6d62','#7b8a6a','#a2ab84'], rock:['#2f2a46','#48415e','#655d7c','#8b839e','#b8b1c2'],
  snow:['#8494ba','#a8b9d8','#cddbec','#e9f1f9','#ffffff'], gold:['#40603a','#5f8042','#88a24e','#b7c264','#e2da8a'],
  alp:['#28424a','#3a5c52','#52785a','#749466','#a2b482'], sand:['#a0805a','#c4a472','#dbc28a','#eed9a4','#faeec6'], isle:['#245a3e','#357a44','#4f9a4a','#7cba56','#b4d672'],
};
const TER = { plain:'meadow', forest:'wood', valley:'vale', fort:'moor', mount:'rock', sea:'isle', capital:'gold', claude:'isle', arena:'isle' };
const OCN = ['#8ee0d0', '#5cc4c8', '#41a6c2', '#328bb3', '#2a72a0', '#225b8c', '#1b4878', '#163a64', '#122d52', '#0f2343'];
const RIV = ['#235a86', '#2e71a0', '#4791b8', '#7cc0d4', '#c2eaea'];
const S = { // 建物與物件色帶（暗→亮）
  st:['#2e2a44','#4e4864','#7c7690','#aaa4b8','#d8d2dc'], ws:['#3e3434','#6e5e54','#9c8872','#c6b294','#e8dcc0'],
  wd:['#2a1a16','#462c20','#6a442e','#92603e','#b88454'], pl:['#5e504e','#9c8c80','#d2c4ae','#ece2cc','#fffaf0'],
  rr:['#4e1e26','#82302e','#ae4638','#d4684a','#eea070'], rb:['#1c2650','#2a4076','#3a5a9e','#5880c2','#98bee6'],
  rt:['#1a3c3c','#285a56','#387a70','#58a088','#98d0ae'], ro:['#523020','#844822','#b4662a','#da8a3a','#f2be6e'],
  rp:['#2e2050','#463478','#62509e','#8a74c2','#c0aae6'], cr:['#1e3a6a','#2e64a6','#4aa0d4','#8ee0ee','#e8ffff'],
  lf:['#10261e','#1c4030','#2c6038','#4a8a44','#86b85a'], pine:['#0e2424','#16382e','#215036','#336a3e','#5a8c4c'],
  hay:['#6a4a1c','#9a7028','#c89a3a','#e6c25a','#f8e69a'], cor:['#6a2a22','#a8462e','#d97757','#ee9a78','#f8c8a8'],
};
const SH = 'rgba(14,18,44,.34)', WIN = '#ffd88a', WIN2 = '#ffefb8', GLOW = '#8ff4ea', BLK = '#1a1626', RED = '#c8463c', GOLD = '#f0c44e', WH = '#f6f1e6', FOAM = '#e8f8f2';

// ---- 繪圖小工具（g＝目前的 2D context）----
let g = null;
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const px = (x, y, c) => rect(x, y, 1, 1, c);
const ell = (cx, cy, rx, ry, c) => { g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy); for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
const line = (x0, y0, x1, y1, c) => { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); g.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (let n = 0; n < 2000; n++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
const shadow = (cx, cy, rx, ry) => ell(cx, cy, rx, ry, SH);
// 有明暗的球（樹冠、灌木）：左上亮、右下暗、底緣描邊，葉片用低頻雜訊分成一叢叢
function blob(cx, cy, r, P, seed = 0) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d > r + 0.3) continue;
    const l = (x + y * 1.2) / (r * 1.6) + (vn((cx + x + seed) / 2.2, (cy + y) / 2.2) - 0.5) * 0.7;
    const k = d > r - 1.1 && l > 0.15 ? 0 : l > 0.45 ? 1 : l > -0.05 ? 2 : l > -0.5 ? 3 : 4;
    g.fillStyle = P[k]; g.fillRect(cx + x, cy + y, 1, 1); }
}
// 圓柱（塔、筒倉）：依水平位置上色，左亮右暗
function cyl(x, y, w, h, P) { const L = Math.round(x - w / 2); for (let i = 0; i < w; i++) { const t = i / (w - 1 || 1); rect(L + i, y - h, 1, h, P[t < 0.18 ? 3 : t < 0.55 ? 2 : t < 0.85 ? 1 : 0]); } }
// 石磚牆面
function bricks(x, y, w, h, P) { rect(x, y, w, h, P[2]);
  for (let j = 2; j < h; j += 3) { rect(x, y + j, w, 1, P[1]); for (let i = ((j / 3) & 1) * 3; i < w; i += 6) px(x + i, y + j - 1, P[1]); }
  for (let i = 0; i < w; i += 2) if (hash(x + i, y) > 0.6) px(x + i, y + 1, P[3]); rect(x, y, w, 1, P[3]); }
function crenels(x, y, w, P) { for (let i = 0; i < w - 1; i += 4) { rect(x + i, y - 3, 2, 3, P[2]); px(x + i, y - 3, P[3]); } }
// 房屋：x 置中、y 是地面線；牆高 h、屋頂色帶 roof、牆面色帶 wall
function house(x, y, w = 20, h = 9, roof = S.rr, wall = S.pl, o = {}) {
  const L = Math.round(x - w / 2), rh = o.rh || Math.round(w * 0.45), top = y - h - rh;
  shadow(x + 6, y + 1, w / 2 + 5, 3); rect(L + w, top + 4, 4, y - top - 3, SH);
  rect(L, y - h, w, h, wall[2]); rect(L + w - 3, y - h, 3, h, wall[1]); rect(L, y - 1, w, 1, wall[0]); rect(L, y - h, w, 1, wall[0]);
  for (let wx = L + 3; wx < L + w - 5; wx += 6) if (Math.abs(wx + 1 - x) > 3) { rect(wx, y - h + 3, 3, 3, o.dark ? '#2a3046' : WIN); px(wx, y - h + 3, o.dark ? '#4a5876' : WIN2); }
  rect(x - 1, y - 6, 3, 6, S.wd[1]); px(x, y - 6, S.wd[3]);
  for (let j = 0; j < rh; j++) { const ins = Math.max(0, 2 - j), ww = w + 4 - ins * 2, xl = L - 2 + ins;
    rect(xl, top + j, ww, 1, j === 0 ? roof[4] : j === rh - 1 ? roof[0] : j % 3 === 0 ? roof[1] : roof[2]);
    if (j > 0 && j < rh - 1) { rect(xl, top + j, 3, 1, roof[3]); rect(xl + ww - 3, top + j, 3, 1, roof[1]); } }
  if (o.chim) { rect(L + w - 6, top - 3, 3, 6, S.st[2]); rect(L + w - 4, top - 3, 1, 6, S.st[1]); }
  return top;
}
// 圓錐屋頂的塔
function tower(x, y, w, h, P, roof, o = {}) {
  shadow(x + 5, y + 1, w / 2 + 4, 3); cyl(x, y, w, h, P);
  for (let j = y - h + 3; j < y - 1; j += 4) for (let i = -w / 2 + 1 + ((j >> 2) & 1) * 2; i < w / 2 - 1; i += 4) px(x + i, j, P[1]);
  if (o.win !== false) { rect(x - 1, y - h + 5, 2, 4, BLK); px(x - 1, y - h + 5, '#4a4060'); }
  if (roof) { const rh = Math.round(w * 1.1); for (let j = 0; j < rh; j++) { const ww = Math.max(1, Math.round((w + 3) * (j + 1) / rh)); const L = Math.round(x - ww / 2);
      for (let i = 0; i < ww; i++) { const t = i / (ww - 1 || 1); px(L + i, y - h - rh + j, roof[j === rh - 1 ? 0 : t < 0.3 ? 3 : t < 0.65 ? 2 : 1]); } }
    return y - h - rh; }
  rect(Math.round(x - w / 2) - 1, y - h - 1, w + 2, 2, P[3]); crenels(Math.round(x - w / 2) - 1, y - h - 1, w + 2, P); return y - h - 4;
}
function flag(x, y, f, c, len = 12) { line(x, y, x, y - len, S.wd[1]); const w = f % 2;
  rect(x + 1, y - len, 7, 4, c); px(x + 8, y - len + 1 + w, c); px(x + 8, y - len + 2 + w, c); rect(x + 1, y - len + 3, 7, 1, 'rgba(0,0,0,.25)'); }
function smoke(x, y, f, n = 3) { for (let k = 0; k < n; k++) { const s = (f + k * 2) % 6; ell(x + (s >> 1) + Math.round(Math.sin(f + k) * 1), y - s * 3, 2 + (s >> 2), 1 + (s >> 2), `rgba(236,240,240,${0.8 - s * 0.12})`); } }
function tree(x, y, s = 1, P = S.lf, seed = 0) { const r = Math.round(6 * s);
  shadow(x + 4, y + 1, r + 2, Math.max(2, r >> 1)); rect(x - 1, y - 5, 3, 6, S.wd[2]); px(x + 1, y - 5, S.wd[1]); px(x - 1, y - 4, S.wd[3]);
  blob(x - r * 0.55, y - r * 0.9, Math.round(r * 0.62), P, seed + 3); blob(x + r * 0.55, y - r * 0.85, Math.round(r * 0.62), P, seed + 5); blob(x, y - r * 1.35, r, P, seed); }
function pine(x, y, s = 1) { const h = Math.round(16 * s);
  shadow(x + 3, y + 1, 5 * s, 2); rect(x - 1, y - 3, 2, 4, S.wd[1]);
  for (let j = 0; j < h; j++) { const t = j / h, ww = Math.round(1 + t * 6 * s - ((j % 5) === 0 ? 1 : 0));
    for (let i = -ww; i <= ww; i++) px(x + i, y - 3 - h + j, S.pine[i < -ww * 0.3 ? 3 : i > ww * 0.4 ? 1 : 2]); px(x - ww, y - 3 - h + j, S.pine[4]); } }
function palm(x, y) { shadow(x + 4, y + 1, 6, 2); for (let j = 0; j < 14; j++) rect(x + Math.round(Math.sin(j / 5) * 2), y - j, 2, 1, j % 3 ? S.wd[3] : S.wd[2]);
  const tx = x + 2, ty = y - 15; for (const [dx, dy] of [[-8, 3], [8, 3], [-6, -3], [6, -4], [0, -6], [-9, 0], [9, 1]]) { line(tx, ty, tx + dx, ty + dy, S.lf[3]); line(tx, ty + 1, tx + dx, ty + dy + 1, S.lf[1]); } ell(tx, ty, 2, 1, S.lf[2]); }
function bush(x, y, s = 1, P = S.lf) { shadow(x + 2, y + 1, 4 * s, 1); blob(x, y - Math.round(2 * s), Math.round(3.5 * s), P, x); }
function rock(x, y, s = 1) { shadow(x + 2, y + 1, 4 * s, 1); ell(x, y - 2 * s, Math.round(4 * s), Math.round(3 * s), R.rock[2]); ell(x - 1, y - 3 * s, Math.round(2 * s), Math.round(1.5 * s), R.rock[3]); px(x - 2, y - 4 * s, R.rock[4]); rect(x - 3 * s, y, 7 * s, 1, R.rock[0]); }
function flowers(x, y, c) { for (let k = 0; k < 5; k++) { const a = hash(x + k, y), b = hash(y, x + k); px(x + Math.round(a * 8 - 4), y + Math.round(b * 4 - 2), k % 2 ? c : WH); } }
function fenceH(x, y, w) { rect(x, y - 3, w, 1, S.wd[4]); rect(x, y - 1, w, 1, S.wd[2]); for (let i = 0; i <= w; i += 5) { rect(x + i, y - 5, 2, 6, S.wd[2]); px(x + i, y - 5, S.wd[4]); } }
function fenceV(x, y, h) { for (let j = 0; j <= h; j += 4) { rect(x, y + j - 5, 2, 6, S.wd[2]); px(x, y + j - 5, S.wd[4]); } rect(x, y - 4, 1, h + 4, S.wd[3]); }
function field(x, y, w, h, kind) { // 農田：田畦一條條，kind 0 麥、1 菜、2 南瓜
  rect(x, y, w, h, '#6e4a2e'); rect(x, y, w, 1, '#8a6038');
  for (let j = 1; j < h - 1; j += 3) for (let i = 1; i < w - 1; i++) { const n = hash(x + i, y + j);
    if (kind === 0) { px(x + i, y + j, n > 0.4 ? S.hay[3] : S.hay[2]); if (n > 0.8) px(x + i, y + j - 1, S.hay[4]); px(x + i, y + j + 1, S.hay[1]); }
    else if (kind === 1) { if (i % 3) { px(x + i, y + j, n > 0.5 ? '#7cc04e' : '#5aa044'); px(x + i, y + j + 1, '#2e6a36'); } }
    else if (i % 4 === 1) { px(x + i, y + j, '#e8862e'); px(x + i + 1, y + j, '#c8641e'); px(x + i, y + j - 1, '#5aa044'); } }
}
function crate(x, y) { rect(x - 3, y - 6, 7, 6, S.wd[3]); rect(x - 3, y - 6, 7, 1, S.wd[4]); rect(x + 2, y - 5, 2, 5, S.wd[1]); line(x - 3, y - 6, x + 2, y - 1, S.wd[2]); }
function barrel(x, y) { cyl(x, y, 6, 7, S.wd); rect(x - 3, y - 6, 6, 1, S.st[2]); rect(x - 3, y - 2, 6, 1, S.st[2]); ell(x, y - 7, 2, 1, S.wd[4]); }
function lamp(x, y, f = 0) { rect(x, y - 12, 1, 12, BLK); rect(x - 1, y - 15, 3, 3, f % 3 === 2 ? WIN2 : WIN); }
function hay(x, y) { shadow(x + 3, y + 1, 6, 2); blob(x, y - 4, 5, S.hay, x); }
function sign(x, y, c = S.wd[3]) { rect(x, y - 9, 1, 9, S.wd[1]); rect(x - 4, y - 12, 10, 5, c); rect(x - 4, y - 8, 10, 1, S.wd[1]); }
function boat(x, y, f, c = WH) { const b = f % 2; ell(x, y + 2, 9, 1, 'rgba(232,248,242,.55)');
  for (let j = 0; j < 4; j++) rect(x - 8 + j, y - 3 + j + b, 17 - j * 2, 1, j === 0 ? S.wd[4] : S.wd[2]);
  line(x, y - 3 + b, x, y - 17 + b, S.wd[1]); for (let j = 0; j < 11; j++) rect(x + 1, y - 16 + j + b, Math.round(j * 0.7) + 1, 1, j < 6 ? c : '#d6d0c4'); }
function sheep(x, y, f) { shadow(x + 1, y + 3, 5, 1); blob(x, y, 4, ['#8a8494', '#c8c2c8', '#e8e4e0', '#f8f6f2', '#ffffff'], 7); rect(x + 4, y - 2, 3, 3, BLK); px(x + 5, y - 2, '#fff'); const l = f % 2; rect(x - 2, y + 3, 1, 1 + l, BLK); rect(x + 2, y + 3, 1, 2 - l, BLK); }
function mountain(x, y, w, h, snowF = 0.34, seed = 0) { // 山：左面受光、右面背光、頂上積雪，稜線有鋸齒
  shadow(x + 10, y + 1, w / 2 + 8, 4);
  const ridge = (j) => Math.round(Math.sin(j * 0.31 + seed) * 2 + Math.sin(j * 0.13 + seed * 2) * 3);
  for (let j = 0; j < h; j++) { const t = j / h, hw = Math.round(w / 2 * t + (hash(j, seed) - 0.5) * 2), c = Math.round(x + ridge(j) * t), snow = t < snowF + (hash(j + 9, seed) - 0.5) * 0.08;
    const L = x - hw, Rr = x + hw, P = snow ? R.snow : R.rock;
    rect(L, y - h + j, c - L, 1, P[t < 0.5 ? 3 : 2]); rect(c, y - h + j, Rr - c + 1, 1, P[1]); px(L, y - h + j, P[snow ? 4 : 4]); px(Rr, y - h + j, P[0]);
    if (!snow && j % 6 === 0) { const g2 = L + Math.round((c - L) * hash(j, seed + 1)); line(g2, y - h + j, g2 + 3, y - h + j + 4, R.rock[1]); } }
  rect(x - w / 2, y, w, 1, R.rock[0]);
}
function crystal(x, y, h, w = 6, f = 0) { // 結晶：左面亮、右面深，頂端反光
  shadow(x + 4, y + 1, w + 3, 2);
  for (let j = 0; j < h; j++) { const t = j / h, hw = Math.max(1, Math.round(w * Math.min(1, t * 3.2) * (1 - Math.max(0, t - 0.8) * 1.6)));
    rect(x - hw, y - h + j, hw, 1, S.cr[t < 0.3 ? 4 : 3]); rect(x, y - h + j, hw + 1, 1, S.cr[t < 0.3 ? 2 : 1]); }
  line(x - 1, y - h + 3, x - 1, y - 3, S.cr[4]); if (f % 3 === 1) { px(x - 2, y - h + 6, '#fff'); px(x - 3, y - h + 6, '#fff'); px(x - 2, y - h + 5, '#fff'); }
}

// ---- 各區聚落：static 進靜態層（依 y 排序）、anim 每幀畫，bbox 是整個聚落的範圍（迷霧與點擊也算它）----
const P0 = (id) => [ax0(id), ay0(id)];
const SET = {}, TOPY = {};
const put = (id, y, d, fp) => { SET[id].st.push({ y, d }); if (fp) occ(...fp); };
function occ(x0, y0, x1, y1) { for (let y = Math.max(0, y0 >> 1); y <= Math.min(AH - 1, y1 >> 1); y++) for (let x = Math.max(0, x0 >> 1); x <= Math.min(AW - 1, x1 >> 1); x++) OCC[y * AW + x] = 1; }
const GROUND = []; // 鋪在地面、不參與排序的東西（廣場、農田）
IDS.forEach((id) => (SET[id] = { st: [], anim: [] }));
(() => {
  { // 規劃王城：石板廣場＋城牆兩塔＋主堡＋周圍房屋與市集
    const [x, y] = P0('capital'); TOPY.capital = y - 78;
    GROUND.push(() => { ell(x, y - 8, 88, 46, '#8e7e6c'); ell(x, y - 8, 86, 44, '#b8a68a');
      for (let j = -42; j <= 34; j += 4) for (let i = -84; i <= 84; i += 6) { const xx = x + i + ((j >> 2) & 1) * 3, yy = y - 8 + j; if (((i / 86) ** 2 + (j / 44) ** 2) < 0.95) { rect(xx, yy, 5, 3, hash(xx, yy) > 0.5 ? '#c8b698' : '#ad9a7e'); px(xx, yy, '#dccaa8'); } }
      ell(x, y + 14, 9, 4, '#7c6c5c'); ell(x, y + 13, 7, 3, '#4a90b8'); px(x - 2, y + 12, '#bfe8f0'); });
    occ(x - 88, y - 54, x + 88, y + 36);
    put('capital', y - 60, () => { // 後排：主堡
      const kx = x, ky = y - 18; shadow(kx + 10, ky + 1, 24, 4); bricks(kx - 20, ky - 30, 40, 30, S.st); rect(kx + 14, ky - 30, 6, 30, S.st[1]);
      for (let i = -14; i <= 10; i += 8) { rect(kx + i, ky - 24, 3, 6, BLK); rect(kx + i, ky - 24, 3, 2, '#ffd27a'); }
      for (let j = 0; j < 14; j++) { const ww = 46 - Math.round(j * 1.9); rect(kx - ww / 2, ky - 30 - 14 + j, ww, 1, S.rb[j === 0 ? 4 : j % 3 === 0 ? 1 : 2]); rect(kx - ww / 2, ky - 44 + j, 3, 1, S.rb[3]); }
      tower(kx - 26, ky - 4, 12, 40, S.st, S.rb); tower(kx + 26, ky - 4, 12, 40, S.st, S.rb); tower(kx, ky - 40, 10, 14, S.st, S.rb, { win: false });
    });
    put('capital', y - 2, () => { // 前排：城牆、城門、角塔
      bricks(x - 48, y - 18, 96, 18, S.st); rect(x - 48, y - 19, 96, 2, S.st[3]); crenels(x - 48, y - 19, 96, S.st); rect(x - 48, y - 1, 96, 1, S.st[0]);
      rect(x - 7, y - 14, 14, 14, BLK); ell(x, y - 14, 7, 4, BLK); for (let i = -5; i <= 5; i += 3) rect(x + i, y - 16, 1, 15, '#4a4060'); rect(x - 7, y - 6, 14, 1, '#4a4060');
      rect(x - 30, y - 12, 3, 5, BLK); rect(x + 27, y - 12, 3, 5, BLK);
      tower(x - 50, y + 2, 16, 34, S.st, S.rb); tower(x + 50, y + 2, 16, 34, S.st, S.rb);
    });
    SET.capital.anim.push((f) => { flag(x, y - 74, f, GOLD, 14); flag(x - 50, y - 50, f + 1, RED, 10); flag(x + 50, y - 50, f, RED, 10); });
    const H = [[-112, -18, 22, S.rr], [-104, 22, 20, S.ro], [-74, 44, 18, S.rt], [104, -20, 22, S.rt], [112, 20, 20, S.rr], [78, 46, 18, S.ro], [-82, -46, 18, S.rp], [84, -48, 18, S.rr]];
    H.forEach(([dx, dy, w, rf], k) => put('capital', y + dy, () => house(x + dx, y + dy, w, 9, rf, k % 2 ? S.pl : S.ws, { chim: k % 3 === 0 }), [x + dx - w / 2 - 2, y + dy - 22, x + dx + w / 2 + 2, y + dy]));
    [[-54, 30], [54, 30]].forEach(([dx, dy]) => put('capital', y + dy, () => { rect(x + dx - 8, y + dy - 10, 16, 2, '#c8463c'); for (let i = 0; i < 16; i += 4) rect(x + dx - 8 + i, y + dy - 10, 2, 2, WH); rect(x + dx - 8, y + dy - 8, 1, 8, S.wd[1]); rect(x + dx + 7, y + dy - 8, 1, 8, S.wd[1]); rect(x + dx - 7, y + dy - 4, 14, 4, S.wd[3]); px(x + dx - 4, y + dy - 5, '#e8862e'); px(x + dx + 2, y + dy - 5, '#7cc04e'); }));
    [[-30, 40], [30, 40]].forEach(([dx, dy]) => put('capital', y + dy, () => lamp(x + dx, y + dy)));
  }
  { // 守護城塞：四角塔石砌要塞＋營房＋木哨塔＋帳篷
    const [x, y] = P0('fort'); TOPY.fort = y - 72;
    GROUND.push(() => { ell(x, y - 18, 70, 34, '#545868'); ell(x, y - 18, 67, 32, '#6e7080'); for (let k = 0; k < 160; k++) { const a = hash(k, 3) * 6.28, r = Math.sqrt(hash(k, 4)); px(x + Math.cos(a) * r * 64, y - 18 + Math.sin(a) * r * 30, hash(k, 5) > 0.5 ? '#8a8a96' : '#5a5c6a'); } });
    occ(x - 70, y - 60, x + 70, y + 8);
    put('fort', y - 42, () => { bricks(x - 46, y - 52, 92, 12, S.st); crenels(x - 46, y - 52, 92, S.st); tower(x - 46, y - 38, 13, 26, S.st, null); tower(x + 46, y - 38, 13, 26, S.st, null); });
    put('fort', y - 22, () => { // 主堡
      shadow(x + 8, y - 21, 20, 3); bricks(x - 16, y - 50, 32, 30, S.st); rect(x + 11, y - 50, 5, 30, S.st[1]); rect(x - 17, y - 52, 34, 2, S.st[3]); crenels(x - 17, y - 52, 34, S.st);
      rect(x - 3, y - 42, 6, 8, BLK); ell(x, y - 42, 3, 2, BLK); rect(x - 11, y - 38, 2, 5, BLK); rect(x + 9, y - 38, 2, 5, BLK);
      for (const s of [-1, 1]) rect(x + s * 47 - 3, y - 40, 6, 38, S.st[s < 0 ? 3 : 1]); });
    put('fort', y + 2, () => { bricks(x - 46, y - 16, 92, 16, S.st); rect(x - 46, y - 17, 92, 2, S.st[3]); crenels(x - 46, y - 17, 92, S.st); rect(x - 46, y - 1, 92, 1, S.st[0]);
      rect(x - 6, y - 12, 12, 12, BLK); ell(x, y - 12, 6, 3, BLK); for (let i = -4; i <= 4; i += 3) rect(x + i, y - 14, 1, 13, '#5a5070');
      for (const s of [-1, 1]) { rect(x + s * 24 - 4, y - 14, 8, 10, RED); rect(x + s * 24 - 4, y - 14, 8, 1, '#e86a5a'); px(x + s * 24, y - 10, GOLD); px(x + s * 24 - 1, y - 9, GOLD); px(x + s * 24 + 1, y - 9, GOLD); }
      tower(x - 48, y + 4, 16, 30, S.st, null); tower(x + 48, y + 4, 16, 30, S.st, null); });
    SET.fort.anim.push((f) => { flag(x, y - 56, f, RED, 14); flag(x - 48, y - 30, f + 1, RED, 10); flag(x + 48, y - 30, f, RED, 10); });
    put('fort', y + 34, () => house(x - 94, y + 34, 26, 10, S.rb, S.ws, { dark: true }), [x - 110, y + 10, x - 78, y + 36]);
    put('fort', y - 6, () => { const tx = x + 100, ty = y - 6; shadow(tx + 4, ty + 1, 8, 2); for (const s of [-4, 4]) line(tx + s, ty, tx + s / 2, ty - 26, S.wd[2]); for (let j = 4; j < 26; j += 6) line(tx - 4 + j / 7, ty - j, tx + 4 - j / 7, ty - j, S.wd[1]);
      rect(tx - 6, ty - 32, 12, 6, S.wd[3]); rect(tx - 7, ty - 35, 14, 3, S.rr[2]); rect(tx - 6, ty - 30, 12, 1, S.wd[1]); }, [x + 90, y - 40, x + 110, y]);
    [[-100, -24], [-80, -40], [96, 34]].forEach(([dx, dy]) => put('fort', y + dy, () => { const X = x + dx, Y = y + dy; shadow(X + 4, Y + 1, 9, 2); for (let j = 0; j < 9; j++) rect(X - j, Y - 9 + j, j * 2 + 1, 1, j < 2 ? '#e8dcc0' : j % 3 ? '#c8b894' : '#a89874'); rect(X - 1, Y - 4, 3, 4, BLK); }, [x + dx - 10, y + dy - 10, x + dx + 10, y + dy]));
    [[74, 20], [86, 26], [62, 30]].forEach(([dx, dy]) => put('fort', y + dy, () => { const X = x + dx, Y = y + dy; rect(X, Y - 10, 1, 10, S.wd[1]); rect(X - 3, Y - 8, 7, 1, S.wd[2]); ell(X, Y - 11, 2, 2, '#c8a870'); }));
  }
  { // 起源平原：風車＋農舍＋穀倉＋大片農田＋羊圈＋水井
    const [x, y] = P0('plain'); TOPY.plain = y - 60;
    const FL = [[-116, -74, 56, 30, 0], [-52, -74, 36, 30, 1], [56, -66, 58, 26, 2], [62, 12, 54, 30, 0], [-120, 14, 40, 22, 1], [62, 50, 44, 22, 1]];
    GROUND.push(() => FL.forEach(([dx, dy, w, h, k]) => field(x + dx, y + dy, w, h, k)));
    FL.forEach(([dx, dy, w, h]) => occ(x + dx, y + dy - 4, x + dx + w, y + dy + h));
    FL.forEach(([dx, dy, w, h], k) => put('plain', y + dy + h + 1, () => { fenceH(x + dx - 2, y + dy + h + 1, w + 3); if (k % 2) fenceV(x + dx - 2, y + dy, h); }));
    put('plain', y, () => { // 風車塔身
      shadow(x + 10, y + 1, 16, 4); for (let j = 0; j < 34; j++) { const ww = 9 + Math.round(j * 0.22), L = x - ww; for (let i = 0; i <= ww * 2; i++) { const t = i / (ww * 2); px(L + i, y - 34 + j, S.pl[t < 0.2 ? 3 : t < 0.6 ? 2 : 1]); } if (j % 6 === 5) rect(x - ww, y - 34 + j, ww * 2 + 1, 1, S.pl[1]); }
      rect(x - 3, y - 9, 6, 9, S.wd[1]); ell(x, y - 9, 3, 2, S.wd[1]); rect(x - 2, y - 22, 4, 4, '#3a4a6a'); px(x - 2, y - 22, '#8ab0d0');
      for (let j = 0; j < 10; j++) { const ww = 13 + j; rect(x - ww / 2, y - 44 + j, ww, 1, S.rr[j === 0 ? 4 : j % 3 === 2 ? 1 : 2]); rect(x - ww / 2, y - 44 + j, 3, 1, S.rr[3]); } rect(x - 11, y - 35, 23, 1, S.rr[0]); });
    occ(x - 14, y - 40, x + 14, y);
    SET.plain.anim.push((f) => { const hx = x, hy = y - 38, a = f * 0.32;
      for (let k = 0; k < 4; k++) { const t = a + k * Math.PI / 2, c = Math.cos(t), s = Math.sin(t); line(hx, hy, hx + c * 26, hy + s * 26, S.wd[1]);
        for (let q = 0.3; q <= 1.0; q += 0.08) { const sx = hx + c * 26 * q, sy = hy + s * 26 * q; line(sx, sy, sx - s * 5, sy + c * 5, q > 0.92 ? S.wd[2] : '#f2e8d6'); } }
      rect(hx - 2, hy - 2, 5, 5, S.wd[1]); px(hx, hy, S.wd[4]); });
    put('plain', y - 8, () => house(x - 64, y - 8, 26, 11, S.rr, S.pl, { chim: true }), [x - 80, y - 34, x - 48, y - 6]);
    SET.plain.anim.push((f) => smoke(x - 55, y - 40, f));
    put('plain', y - 6, () => { const X = x + 78, Y = y - 6; shadow(X + 10, Y + 1, 22, 4); bricks(X - 18, Y - 16, 36, 16, ['#4a1e1e', '#7a2c28', '#a83a32', '#c8584a', '#e8a090']);
      rect(X - 6, Y - 13, 12, 13, '#5a2420'); line(X - 6, Y - 13, X + 5, Y, '#e8e0d0'); line(X + 5, Y - 13, X - 6, Y, '#e8e0d0'); rect(X - 6, Y - 13, 12, 1, '#e8e0d0');
      for (let j = 0; j < 12; j++) { const ins = Math.max(0, 3 - j); rect(X - 21 + ins, Y - 28 + j, 42 - ins * 2, 1, j === 0 ? '#9a8a8a' : j % 3 ? '#6a5a62' : '#54465a'); } }, [x + 56, y - 30, x + 100, y - 4]);
    put('plain', y + 18, () => { const X = x + 34, Y = y + 18; shadow(X + 3, Y + 1, 6, 2); cyl(X, Y, 10, 6, S.st); ell(X, Y - 6, 4, 1, '#2a4a6a'); rect(X - 5, Y - 15, 1, 9, S.wd[1]); rect(X + 4, Y - 15, 1, 9, S.wd[1]); for (let j = 0; j < 4; j++) rect(X - 6 + j, Y - 18 + j, 13 - j * 2, 1, S.rr[2 + (j === 0)]); }, [x + 28, y + 2, x + 40, y + 18]);
    [[-34, 24], [-26, 30], [100, 40]].forEach(([dx, dy]) => put('plain', y + dy, () => hay(x + dx, y + dy)));
    GROUND.push(() => { const X = x - 116, Y = y + 44; rect(X, Y, 50, 26, '#5a9a48'); for (let k = 0; k < 40; k++) px(X + hash(k, 7) * 50, Y + hash(k, 8) * 26, '#86c055'); });
    occ(x - 118, y + 38, x - 64, y + 72);
    put('plain', y + 70, () => { fenceH(x - 118, y + 44, 52); fenceH(x - 118, y + 70, 52); fenceV(x - 118, y + 44, 26); fenceV(x - 66, y + 44, 26); });
  }
  { // 演算森林：發光符文巨樹＋林務小屋＋發光巨石圈＋蘑菇
    const [x, y] = P0('forest'); TOPY.forest = y - 70;
    occ(x - 40, y - 60, x + 40, y + 8);
    put('forest', y, () => { shadow(x + 14, y + 2, 34, 6);
      for (let j = 0; j < 26; j++) { const ww = 6 + Math.round(Math.max(0, j - 18) * 1.4); rect(x - ww, y - 26 + j, ww * 2, 1, S.wd[2]); rect(x - ww, y - 26 + j, 3, 1, S.wd[3]); rect(x + ww - 4, y - 26 + j, 4, 1, S.wd[1]); }
      for (const [dx, dy] of [[-12, 2], [12, 2], [-6, 3], [8, 3]]) line(x, y - 4, x + dx, y + dy, S.wd[1]);
      blob(x - 22, y - 34, 15, S.lf, 4); blob(x + 22, y - 36, 15, S.lf, 8); blob(x - 10, y - 52, 17, S.lf, 2); blob(x + 12, y - 54, 16, S.lf, 6); blob(x, y - 42, 18, S.lf, 1); });
    SET.forest.anim.push((f) => { for (let k = 0; k < 7; k++) { const a = hash(k, 11) * 6.28, r = 6 + hash(k, 12) * 18, on = (f + k) % 4 < 2;
      const X = Math.round(x + Math.cos(a) * r * 1.3), Y = Math.round(y - 44 + Math.sin(a) * r * 0.8); px(X, Y, on ? '#fff' : GLOW); if (on) { px(X - 1, Y, GLOW); px(X + 1, Y, GLOW); px(X, Y - 1, GLOW); px(X, Y + 1, GLOW); } }
      for (let i = 0; i < 4; i++) { const on = (f + i) % 4 === 0; rect(x - 2, y - 22 + i * 5, 4, 2, on ? '#fff' : GLOW); } });
    put('forest', y + 6, () => house(x - 64, y + 6, 22, 9, S.rt, S.wd, { chim: true }), [x - 78, y - 16, x - 50, y + 6]);
    SET.forest.anim.push((f) => smoke(x - 56, y - 22, f));
    put('forest', y - 22, () => house(x + 62, y - 22, 20, 8, S.ro, S.wd), [x + 50, y - 42, x + 74, y - 22]);
    [[52, 24], [64, 18], [76, 26], [64, 32]].forEach(([dx, dy], k) => put('forest', y + dy, () => { const X = x + dx, Y = y + dy; shadow(X + 3, Y + 1, 4, 1); rect(X - 3, Y - 12, 6, 12, R.rock[2]); rect(X + 1, Y - 12, 2, 12, R.rock[1]); rect(X - 3, Y - 12, 6, 1, R.rock[4]); rect(X - 1, Y - 9, 2, 5, k % 2 ? GLOW : '#5ac8c8'); }, [x + dx - 4, y + dy - 12, x + dx + 4, y + dy]));
    [[-30, 34], [-22, 30], [34, -10]].forEach(([dx, dy]) => put('forest', y + dy, () => { rect(x + dx, y + dy - 3, 1, 3, WH); ell(x + dx, y + dy - 4, 2, 1, RED); px(x + dx - 1, y + dy - 4, WH); }));
  }
  { // 數據河谷：水車磨坊＋資料穀倉（筒倉）＋民房＋河邊碼頭
    const [x, y] = P0('valley'); TOPY.valley = y - 50;
    put('valley', y, () => { house(x - 6, y, 30, 12, S.rr, S.ws, { chim: true }); }, [x - 24, y - 30, x + 12, y]);
    SET.valley.anim.push((f) => { const cx = x + 18, cy = y - 8;
      for (let r = 0; r < 2; r++) for (let k = 0; k < 28; k++) { const t = k / 28 * Math.PI * 2; px(cx + Math.round(Math.cos(t) * (11 - r)), cy + Math.round(Math.sin(t) * (11 - r)), S.wd[r ? 1 : 2]); }
      for (let k = 0; k < 6; k++) { const t = f * 0.38 + k * Math.PI / 6; line(cx - Math.cos(t) * 11, cy - Math.sin(t) * 11, cx + Math.cos(t) * 11, cy + Math.sin(t) * 11, S.wd[3]); }
      rect(cx - 1, cy - 1, 3, 3, S.st[1]); if (f % 2) { px(cx + 9, cy + 9, FOAM); px(cx + 11, cy + 8, FOAM); } else { px(cx + 7, cy + 10, FOAM); px(cx + 12, cy + 10, FOAM); } });
    occ(x + 6, y - 20, x + 30, y + 4);
    [[-60, -10], [-76, -4], [-44, -2]].forEach(([dx, dy], k) => put('valley', y + dy, () => { const X = x + dx, Y = y + dy; shadow(X + 5, Y + 1, 8, 2); cyl(X, Y, 13, 24, S.st); for (let j = Y - 22; j < Y; j += 5) rect(X - 6, j, 13, 1, S.st[1]);
      for (let j = 0; j < 5; j++) { const ww = 13 - j * 2; rect(X - ww / 2, Y - 24 - j, ww, 1, S.rb[j ? 2 : 1]); } px(X - 4, Y - 26, S.rb[4]); rect(X - 2, Y - 16, 3, 2, (k % 2) ? GLOW : '#5ac8c8'); }, [x + dx - 7, y + dy - 30, x + dx + 7, y + dy]));
    put('valley', y + 30, () => house(x - 52, y + 30, 20, 9, S.ro, S.pl), [x - 64, y + 8, x - 40, y + 30]);
    put('valley', y - 40, () => house(x - 30, y - 40, 20, 9, S.rt, S.pl), [x - 42, y - 62, x - 18, y - 40]);
    GROUND.push(() => { field(x - 108, y - 56, 34, 22, 1); field(x - 112, y + 16, 34, 20, 0); });
    occ(x - 112, y - 60, x - 72, y - 32); occ(x - 114, y + 12, x - 76, y + 38);
    [[-20, 22], [-12, 26], [-28, 26]].forEach(([dx, dy], k) => put('valley', y + dy, () => (k ? barrel(x + dx, y + dy) : crate(x + dx, y + dy))));
    // 東岸：漁家、曬網架、田
    put('valley', y + 2, () => house(x + 76, y + 2, 20, 9, S.rb, S.ws, { chim: true }), [x + 64, y - 20, x + 88, y + 2]);
    put('valley', y + 34, () => house(x + 96, y + 34, 18, 8, S.rr, S.pl), [x + 86, y + 14, x + 106, y + 34]);
    put('valley', y + 20, () => { const X = x + 62, Y = y + 20; rect(X, Y - 10, 1, 10, S.wd[1]); rect(X + 14, Y - 10, 1, 10, S.wd[1]); rect(X, Y - 10, 15, 1, S.wd[2]); for (let i = 1; i < 14; i += 2) line(X + i, Y - 9, X + i, Y - 4, 'rgba(220,230,220,.7)'); }, [x + 60, y + 8, x + 78, y + 20]);
    GROUND.push(() => field(x + 64, y - 52, 40, 22, 0)); occ(x + 62, y - 56, x + 106, y - 28);
  }
  { // 神經山脈：三座雪峰＋峰頂之間發光的神經連線＋山腰觀測台
    const [x, y] = P0('mount'); TOPY.mount = y - 92;
    occ(x - 70, y - 70, x + 70, y + 6);
    put('mount', y - 30, () => { mountain(x - 52, y - 26, 80, 58, 0.36, 3); mountain(x + 54, y - 30, 84, 60, 0.36, 7); });
    put('mount', y, () => mountain(x, y, 120, 92, 0.32, 1));
    const NODES = [[x, y - 90], [x - 52, y - 82], [x + 54, y - 88], [x - 18, y - 56], [x + 22, y - 60], [x - 70, y - 50], [x + 76, y - 54]];
    const EDGES = [[0, 3], [0, 4], [1, 3], [2, 4], [1, 5], [2, 6], [3, 4], [0, 1], [0, 2]];
    put('mount', y + 1, () => { EDGES.forEach(([a, b]) => line(NODES[a][0], NODES[a][1], NODES[b][0], NODES[b][1], 'rgba(143,244,234,.45)')); NODES.forEach(([nx, ny]) => { rect(nx - 1, ny - 1, 3, 3, '#3ab0c0'); px(nx, ny, '#fff'); }); });
    SET.mount.anim.push((f) => EDGES.forEach(([a, b], k) => { const t = ((f + k * 3) % 8) / 8, [x1, y1] = NODES[a], [x2, y2] = NODES[b]; const X = x1 + (x2 - x1) * t, Y = y1 + (y2 - y1) * t; rect(X - 1, Y - 1, 3, 3, GLOW); px(X, Y, '#fff'); }));
    put('mount', y + 26, () => { const X = x + 78, Y = y + 26; shadow(X + 6, Y + 1, 14, 3); bricks(X - 12, Y - 10, 24, 10, S.ws); for (let j = 0; j < 9; j++) { const ww = Math.round(Math.sqrt(81 - (8 - j) ** 2) * 1.2); rect(X - ww, Y - 19 + j, ww * 2, 1, j < 3 ? '#e8eef4' : j < 6 ? '#b8c4d4' : '#8894a8'); }
      rect(X - 1, Y - 18, 6, 2, BLK); rect(X - 2, Y - 7, 4, 7, S.wd[1]); }, [x + 64, y + 4, x + 92, y + 26]);
    put('mount', y + 30, () => { const X = x - 76, Y = y + 30; shadow(X + 4, Y + 1, 12, 3); ell(X, Y - 6, 12, 8, R.rock[2]); ell(X - 3, Y - 9, 6, 4, R.rock[3]); ell(X, Y - 2, 6, 5, BLK); rect(X - 6, Y - 2, 12, 2, BLK); }, [x - 90, y + 16, x - 62, y + 30]);
  }
  { // 生成之海：潟湖中央的生成結晶塔＋小結晶、棕櫚、小船
    const [x, y] = P0('sea'); TOPY.sea = y - 76;
    occ(x - 26, y - 70, x + 26, y + 4);
    put('sea', y, () => { crystal(x - 12, y - 2, 34, 6); crystal(x + 13, y - 1, 30, 5); crystal(x, y + 2, 66, 10); });
    SET.sea.anim.push((f) => { crystal(x, y + 2, 66, 10, f); const s = f % 4; ell(x, y - 66, 4 + s, 2 + (s >> 1), `rgba(200,255,250,${0.5 - s * 0.1})`);
      for (let k = 0; k < 6; k++) { const a = f * 0.4 + k * 1.05, X = x + Math.cos(a) * 30, Y = y - 30 + Math.sin(a) * 12 - (k % 3) * 8; rect(X, Y, 2, 2, k % 2 ? GLOW : '#fff'); } });
    [[-30, 4], [30, 0]].forEach(([dx, dy]) => put('sea', y + dy, () => palm(x + dx, y + dy)));
    SET.sea.anim.push((f) => boat(x + 70, y + 30, f, '#f0e8d8'));
    SET.sea.anim.push((f) => boat(x - 64, y - 30, f + 1, '#d8e8f8'));
  }
  { // Claude 工坊島：珊瑚屋頂工坊＋煙囪＋招牌＋木碼頭＋棕櫚＋貨箱
    const [x, y] = P0('claude'); TOPY.claude = y - 52;
    occ(x - 46, y - 46, x + 46, y + 4);
    put('claude', y, () => { const top = house(x, y, 44, 16, S.cor, S.pl, { rh: 16 }); rect(x + 12, top - 4, 5, 10, S.st[2]); rect(x + 15, top - 4, 2, 10, S.st[1]);
      const sx = x - 30, sy = y - 4; rect(sx, sy - 12, 1, 12, S.wd[1]); rect(sx - 7, sy - 20, 15, 10, S.cor[2]); rect(sx - 7, sy - 20, 15, 1, S.cor[3]);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; line(sx - Math.cos(a) * 3, sy - 15 - Math.sin(a) * 3, sx + Math.cos(a) * 3, sy - 15 + Math.sin(a) * 3, WH); } });
    SET.claude.anim.push((f) => smoke(x + 14, y - 40, f, 4));
    [[34, 4], [-40, 10]].forEach(([dx, dy]) => put('claude', y + dy, () => palm(x + dx, y + dy)));
    [[24, 12], [30, 14], [27, 9]].forEach(([dx, dy], k) => put('claude', y + dy, () => (k === 1 ? barrel(x + dx, y + dy) : crate(x + dx, y + dy))));
    GROUND.push(() => { for (let k = 0; k < 6; k++) rect(x + 46 + k * 0, y - 6 + k * 4, 30, 3, k % 2 ? S.wd[3] : S.wd[2]); for (let k = 0; k < 3; k++) rect(x + 48 + k * 12, y + 18, 2, 4, S.wd[1]); });
    SET.claude.anim.push((f) => boat(x + 86, y + 10, f, S.cor[3]));
    put('claude', y + 20, () => lamp(x - 10, y + 20));
  }
  { // 演武島：圓形競技場＋旗＋火把＋帳篷
    const [x, y] = P0('arena'); TOPY.arena = y - 44;
    occ(x - 52, y - 40, x + 52, y + 10);
    put('arena', y, () => { shadow(x + 8, y + 3, 50, 8);
      ell(x, y - 10, 46, 20, S.st[1]); ell(x, y - 12, 45, 19, S.st[2]); ell(x, y - 14, 44, 17, S.st[3]);
      ell(x, y - 13, 34, 12, S.ws[1]); ell(x, y - 13, 32, 11, '#c8a46a'); ell(x, y - 12, 26, 8, '#d8b878');
      for (let i = -42; i <= 42; i += 7) { const yy = y - 2 + Math.round((1 - (i / 46) ** 2) * 6), dk = i > 10; rect(x + i - 2, yy - 9, 5, 9, dk ? S.st[1] : S.st[2]); rect(x + i - 1, yy - 7, 3, 5, BLK); ell(x + i, yy - 7, 1, 1, BLK); }
      rect(x - 46, y - 16, 92, 1, S.st[4]); rect(x - 5, y - 6, 10, 8, BLK); });
    SET.arena.anim.push((f) => { flag(x - 44, y - 18, f, RED, 18); flag(x + 44, y - 18, f + 1, GOLD, 18); flag(x, y - 30, f, '#3a6ac8', 14);
      for (const dx of [-14, 14]) { rect(x + dx, y - 6, 1, 6, S.wd[1]); px(x + dx, y - 7 - (f % 2), '#ffd27a'); px(x + dx, y - 8, f % 2 ? '#f08a3a' : '#ffd27a'); } });
    [[-62, 16], [62, 12]].forEach(([dx, dy], k) => put('arena', y + dy, () => { const X = x + dx, Y = y + dy; shadow(X + 4, Y + 1, 9, 2); for (let j = 0; j < 10; j++) rect(X - j, Y - 10 + j, j * 2 + 1, 1, k ? (j % 3 ? '#d8564a' : WH) : (j % 3 ? '#3a6ac8' : WH)); rect(X - 1, Y - 4, 3, 4, BLK); }));
  }
})();
// 每格歸哪一區：地形分區＋各聚落建物的剪影（高塔超出地形邊界也算該區；迷霧與點擊都用它）。剪影在 buildStatic 補上
const OWN = Int8Array.from(REG);

// ---- 道路：區域中心之間的彎曲土路，過河處架木橋 ----
const ROADPTS = [];
for (const [a, b] of ROADS) { const A = [ax0(a), ay0(a)], B = [ax0(b), ay0(b)], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy), bend = (hash(A[0], B[1]) - 0.5) * 0.5;
  const cx = (A[0] + B[0]) / 2 - dy * bend, cy = (A[1] + B[1]) / 2 + dx * bend;
  for (let t = 0; t <= 1; t += 1 / len) { const u = 1 - t, x = u * u * A[0] + 2 * u * t * cx + t * t * B[0], y = u * u * A[1] + 2 * u * t * cy + t * t * B[1]; const i = cellAt(x | 0, y | 0);
    if (i < 0 || REG[i] < 0 || WAT[i] === 2) continue; ROADPTS.push([x, y, WAT[i] === 1]); } }
for (const [x, y] of ROADPTS) occ(x - 4, y - 4, x + 4, y + 4);

// ---- 樹與小物：在格點上撒，依區域決定種類與密度 ----
const DECOR = [];
for (let gy = 4; gy < H; gy += 9) for (let gx = 4; gx < W; gx += 10) {
  const x = gx + Math.round((hash(gx, gy) - 0.5) * 8), y = gy + Math.round((hash(gy, gx) - 0.5) * 6), i = cellAt(x, y); if (i < 0) continue;
  const r = REG[i]; if (r < 0 || OCC[i] || DL[i] < 3) continue; const id = IDS[r], h = hash(x * 3, y * 7), d = fbm(x / 10, y / 10);
  if (OCC[i + 2] || OCC[i - 2] || (i > AW * 3 && OCC[i - AW * 3])) continue;
  let fn = null;
  if (id === 'forest') { if (d > 0.36 || h > 0.75) fn = h > 0.88 ? () => pine(x, y, 1.1) : () => tree(x, y, 0.95 + h * 0.5, S.lf, x); }
  else if (id === 'mount') { if (HG[i] > 0.6 && h > 0.74) fn = () => mountain(x, y, 30 + (h * 16 | 0), 22 + (h * 12 | 0), 0.4, h * 9); else if (h > 0.5 && d > 0.42) fn = () => pine(x, y, 0.8 + h * 0.4); else if (h > 0.4 && h < 0.46) fn = () => rock(x, y); }
  else if (id === 'valley') { if (d > 0.55 && h > 0.35) fn = () => tree(x, y, 0.8 + h * 0.3, S.lf, x); else if (h > 0.9) fn = () => flowers(x, y, '#f0c0e0'); else if (h > 0.84) fn = () => bush(x, y); }
  else if (id === 'fort') { if (h > 0.82) fn = () => rock(x, y, 1 + (h > 0.95)); else if (h > 0.66 && d > 0.45) fn = () => pine(x, y, 0.85); else if (h > 0.6) fn = () => bush(x, y, 0.8, S.pine); }
  else if (id === 'capital') { if (d > 0.6 && h > 0.45) fn = () => tree(x, y, 0.8, S.lf, x); else if (h > 0.9) fn = () => flowers(x, y, '#f0d050'); else if (h > 0.84) fn = () => bush(x, y); }
  else if (id === 'plain') { if (d > 0.58 && h > 0.4) fn = () => tree(x, y, 0.9, S.lf, x); else if (h > 0.88) fn = () => flowers(x, y, h > 0.94 ? '#f07070' : '#f0d050'); else if (h > 0.82) fn = () => bush(x, y); }
  else if (id === 'sea') { if (!WAT[i] && h > 0.6) fn = () => palm(x, y); }
  else if (h > 0.72) fn = () => (h > 0.86 ? palm(x, y) : bush(x, y));
  if (fn) DECOR.push({ y, d: fn, id });
}

// ---- 靜態層（整張只畫一次）----
let STATIC = null, FOGN = null, CLIFF = null;
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return 0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16); };
function paintTerrain(ctx) {
  const img = ctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
  const RP = {}; for (const k in R) RP[k] = R[k].map(rgb); const OC = OCN.map(rgb), RV = RIV.map(rgb), FM = rgb(FOAM), CL = ['#2a1e30', '#4a3438', '#6e5244', '#8a6c52'].map(rgb);
  const terr = IDS.map((id) => RP[TER[id]]), RT = new Float32Array(128 * 128).map((_, k) => hash(k & 127, k >> 7)); // 逐像素小雜點用查表
  for (let py = 0; py < H; py++) for (let pX = 0; pX < W; pX++) {
    const i = (py >> 1) * AW + (pX >> 1), b = BAY[(py & 3) * 4 + (pX & 3)], r = REG[i]; let c;
    if (r < 0) { const d = DO[i], up1 = i >= AW && REG[i - AW] >= 0 && !WAT[i - AW], up2 = i >= 2 * AW && REG[i - 2 * AW] >= 0 && !WAT[i - 2 * AW];
      if (up1) c = CL[(py & 1) ? 2 : 3 - (hash(pX >> 1, py >> 2) > 0.6 ? 1 : 0)];
      else if (up2 && REG[i - AW] < 0) c = CL[(py & 1) ? 0 : 1];
      else if (d === 1 && FN[i] > 0.32) c = FM;
      else { const t = (d - 1.2) * 0.5 + (FN[i] - 0.5) * 1.6 + b * 0.9; c = OC[Math.max(0, Math.min(9, Math.floor(t)))]; } }
    else if (WAT[i]) { const sh = i >= AW && REG[i - AW] >= 0 && !WAT[i - AW], rim = i + AW < N && !WAT[i + AW];
      if (WAT[i] === 2) { if (DW[i] === 1 && FN[i] > 0.3) c = FM; else { const t = Math.min(DW[i], 30) * 0.16 + (FN[i] - 0.5) * 1.4 + b * 0.9 + (sh ? 0.8 : 0); c = OC[Math.max(0, Math.min(5, Math.floor(t)))]; } }
      else { const t = 1.4 + (FN[i] - 0.5) * 1.6 + b - (sh ? 1.2 : 0) + (rim ? 1.4 : 0); c = RV[Math.max(0, Math.min(4, Math.floor(t)))]; } }
    else { const n = RT[(py & 127) * 128 + ((pX + (py >> 7) * 37) & 127)], v = V[i] + (n > 0.985 ? 0.35 : n < 0.012 ? -0.35 : 0); let P = terr[r];
      if (IDS[r] === 'mount') { const e = HG[i] + (8 - py / 32) * 0.045; P = e > 0.62 ? RP.snow : e < 0.36 ? RP.alp : P; }
      if (DL[i] === 1 || (DL[i] === 2 && b > 0.55)) P = RP.sand;
      const wbank = (i + AW < N && WAT[i + AW] === 1) ? -0.5 : 0;
      c = P[Math.max(0, Math.min(4, Math.floor(v * 5 + b - 0.5 + wbank)))]; }
    buf[py * W + pX] = c;
  }
  ctx.putImageData(img, 0, 0);
}
function buildStatic() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d');
  paintTerrain(g);
  for (const [x, y] of ROADPTS) { g.fillStyle = '#7a5a3e'; g.fillRect(Math.round(x) - 4, Math.round(y) - 3, 9, 7); }
  for (const [x, y, br] of ROADPTS) { const X = Math.round(x), Y = Math.round(y); if (br) { rect(X - 5, Y - 4, 11, 9, S.wd[3]); rect(X - 5, Y - 4, 11, 1, S.wd[4]); rect(X - 5, Y + 4, 11, 1, S.wd[1]); }
    else { rect(X - 3, Y - 2, 7, 5, '#c9a36c'); if (hash(X, Y) > 0.8) px(X + 1, Y, '#e6cc94'); if (hash(Y, X) > 0.85) px(X - 1, Y + 1, '#9c7a52'); } }
  GROUND.forEach((d) => d());
  const items = [...DECOR, ...IDS.flatMap((id) => SET[id].st)].sort((a, b) => a.y - b.y);
  for (const o of items) o.d();
  // 雲：海面上幾朵，底下有影子
  for (const [x, y, s] of [[40, 120, 1], [736, 250, 0.8], [26, 700, 0.85], [386, 1112, 0.75], [740, 1150, 0.9]]) {
    ell(x + 16, y + 30, 34 * s, 8 * s, 'rgba(8,20,48,.25)');
    for (const [dx, dy, r] of [[-22, 2, 12], [0, -6, 16], [22, 0, 13], [8, 6, 12], [-10, 6, 11]]) blob(x + dx * s, y + dy * s, Math.round(r * s), ['#b8c4dc', '#d4dcec', '#e8eef6', '#f6f8fc', '#ffffff'], x); }
  STATIC = cv;
  // 聚落剪影：每區的建物單獨畫在遮罩上，有畫到的美術點歸該區
  const mk = document.createElement('canvas'); mk.width = W; mk.height = H; g = mk.getContext('2d', { willReadFrequently: true });
  IDS.forEach((id, r) => { g.clearRect(0, 0, W, H); SET[id].st.forEach((o) => o.d()); SET[id].anim.forEach((a) => a(0));
    const X0 = Math.max(0, ax0(id) - 160), Y0 = Math.max(0, ay0(id) - 130), w = Math.min(W, ax0(id) + 160) - X0, h = Math.min(H, ay0(id) + 100) - Y0, d = g.getImageData(X0, Y0, w, h).data;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 90 || d[((y + 1) * w + x + 1) * 4 + 3] > 90) { const i = cellAt(X0 + x, Y0 + y); if (i >= 0) OWN[i] = r; } });
  // 迷霧雜訊：一次算好
  FOGN = new Float32Array(N); for (let i = 0; i < N; i++) { const x = i % AW, y = (i / AW) | 0; FOGN[i] = fbm(x / 1.6 + 300, y / 1.6); }
  // 會動的浪花：海岸外第二圈的美術點
  CLIFF = []; for (let i = 0; i < N; i++) if (REG[i] < 0 && DO[i] === 2 && hash(i, 3) > 0.55) CLIFF.push(i);
}

// ---- 勇者與驚嘆號 ----
function hero(x, y, bob) { y -= bob; shadow(x + 1, y + 1, 7, 2);
  rect(x - 4, y - 6, 3, 6, S.wd[1]); rect(x + 1, y - 6, 3, 6, S.wd[1]); rect(x - 5, y - 16, 11, 10, '#3b6fc4'); rect(x - 5, y - 16, 3, 10, '#5a8ee0'); rect(x + 3, y - 16, 3, 10, '#2a4e94');
  rect(x - 5, y - 8, 11, 2, S.wd[2]); px(x, y - 8, GOLD); rect(x - 7, y - 15, 2, 7, '#f3c9a0'); rect(x + 6, y - 15, 2, 7, '#e0b088');
  rect(x - 5, y - 27, 11, 11, '#f3c9a0'); rect(x + 3, y - 27, 3, 11, '#e0b088'); rect(x - 6, y - 29, 13, 5, S.wd[2]); rect(x - 6, y - 26, 2, 6, S.wd[2]); px(x - 2, y - 22, BLK); px(x + 2, y - 22, BLK); px(x - 2, y - 23, BLK); px(x + 2, y - 23, BLK);
  rect(x + 8, y - 22, 1, 14, '#d8dce8'); rect(x + 7, y - 9, 3, 1, GOLD); }
function mark(x, y) { rect(x - 5, y - 20, 11, 21, BLK); rect(x - 4, y - 19, 9, 12, GOLD); rect(x - 4, y - 5, 9, 4, GOLD); rect(x - 2, y - 17, 4, 8, '#fff3b0'); rect(x - 2, y - 4, 4, 2, '#fff3b0'); }

export function makeMap(canvas) {
  canvas.width = W; canvas.height = H;
  if (!STATIC) buildStatic();
  const ctx = canvas.getContext('2d'), base = document.createElement('canvas'); base.width = W; base.height = H;
  let key = '';
  function buildBase(open) {
    g = base.getContext('2d'); g.drawImage(STATIC, 0, 0);
    for (const id of IDS) if (!open[id]) SET[id].anim.forEach((a) => a(0)); // 未開放區的動畫物件停在第 0 幀，壓在迷霧底下
    // 迷霧：未開放區（含整個聚落範圍）蓋上暗藍與霧絲，靠近已開放區的邊緣淡一點
    const img = g.getImageData(0, 0, W, H), d = img.data, closed = IDS.map((id) => !open[id]);
    for (let i = 0; i < N; i++) { const r = OWN[i]; if (r < 0 || !closed[r]) continue;
      const ax = i % AW, ay = (i / AW) | 0; let edge = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const j = (ay + b) * AW + ax + a; if (ax + a >= 0 && ax + a < AW && OWN[j] >= 0 && !closed[OWN[j]]) edge = 1; }
      const f = FOGN[i];
      for (let k = 0; k < 4; k++) { const p = ((ay * 2 + (k >> 1)) * W + ax * 2 + (k & 1)) * 4, bay = BAY[(((ay * 2 + (k >> 1)) & 3) * 4) + ((ax * 2 + (k & 1)) & 3)];
        const a = edge ? 0.45 : 0.62; d[p] = d[p] * (1 - a) + 30 * a; d[p + 1] = d[p + 1] * (1 - a) + 36 * a; d[p + 2] = d[p + 2] * (1 - a) + 62 * a;
        if (f > 0.6 + bay * 0.1) { const w = edge ? 0.14 : 0.24; d[p] = d[p] * (1 - w) + 205 * w; d[p + 1] = d[p + 1] * (1 - w) + 216 * w; d[p + 2] = d[p + 2] * (1 - w) + 232 * w; } } }
    g.putImageData(img, 0, 0);
  }
  return {
    draw({ open, marks, hero: heroId, frame }) {
      const k = JSON.stringify(open); if (k !== key) { key = k; buildBase(open); }
      g = ctx; ctx.drawImage(base, 0, 0);
      for (let n = 0; n < CLIFF.length; n++) { const i = CLIFF[n]; if (((n * 7 + frame) % 11) < 2) rect((i % AW) * 2, ((i / AW) | 0) * 2, 4, 2, 'rgba(232,248,242,.75)'); }
      for (let s = 1; s < RIVER.length; s++) { const [x1, y1] = RIVER[s - 1], [x2, y2] = RIVER[s]; for (let t = (frame % 4) / 4; t < 1; t += 0.5) { const X = (x1 + (x2 - x1) * t) * T, Y = (y1 + (y2 - y1) * t) * T; const i = cellAt(X | 0, Y | 0); if (i >= 0 && WAT[i] === 1) rect(X - 2, Y, 4, 1, '#c2eaea'); } }
      for (const id of IDS) if (open[id]) SET[id].anim.forEach((a) => a(frame));
      if (open.plain) { const [x, y] = P0('plain'); [[-100, 56, 0], [-86, 62, 2], [-92, 50, 4], [-76, 54, 1]].forEach(([dx, dy, p], i) => sheep(Math.round(x + dx + Math.sin((frame + p) / 3) * 5), y + dy, frame + i)); }
      const bob = frame % 2;
      for (const id of marks) if (LAYOUT[id]) mark(ax0(id) + 26, TOPY[id] - 4 - bob);
      const hid = LAYOUT[heroId] ? heroId : 'plain'; hero(ax0(hid) - 40, ay0(hid) + 22, bob);
    },
    regionAt(clientX, clientY) { const b = canvas.getBoundingClientRect(); const i = cellAt(Math.floor((clientX - b.left) / b.width * W), Math.floor((clientY - b.top) / b.height * H)); return i < 0 || OWN[i] < 0 ? null : IDS[OWN[i]]; },
    tagPos(id) { return { left: ax0(id) / W * 100, top: (ay0(id) + 28) / H * 100 }; },
  };
}
