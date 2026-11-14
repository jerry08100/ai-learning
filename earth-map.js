// 地球永續國的像素地圖：俯視 3/4 視角，風格 A（HD-2D 光影）。介面與 world-map.js 相同（makeMap / TW / TH / LAYOUT / at）。
// 7 區對應淨零碳考綱 7 個領域。2026-11-14 改版：內部解析度加倍（每格 16 像素，畫布 768×1152），地面逐點打光＋Bayer 抖色，
// 各區平均分布在整座島上，每區是一個聚落（主地標＋周邊小建物），區域之間有土路相連；右下角海面留給之後的「演武島」。
// 繪製分三層：靜態層整張只畫一次（模組層級快取）；底圖＝靜態層＋未開放區的動畫物件（第 0 幀）＋迷霧，只在開放狀態改變時重畫；
// 每幀只疊開放區的動畫物件（風機、燈塔光束、蒸氣、船、白鷺、浪花）與勇者、驚嘆號。柔光、光暈、景深由 fx.js 疊在上面。
// ponytail: 繪圖引擎與 world-map.js 重複一份；兩張地圖的地形與聚落完全不同，共用引擎等第三國出現再抽

export const TW = 48, TH = 72, T = 16; // 48×72 格，每格 16×16 像素 → 768×1152
const W = TW * T, H = TH * T, K = T >> 1, AW = W >> 1, AH = H >> 1, N = AW * AH; // 美術點 2×2 像素，每格 8×8 個美術點
export const LAYOUT = { renew:{ sx:22, sy:10 }, inventory:{ sx:11, sy:23 }, disclose:{ sx:36, sy:22 }, climate:{ sx:24, sy:35 },
  footprint:{ sx:10, sy:46 }, energy:{ sx:35, sy:44 }, carbon:{ sx:20, sy:57 }, arena:{ sx:39, sy:64 } };
const ISLES = ['arena']; // 右下角外海：演武島（官方題庫練習），不屬於主大陸
const IDS = Object.keys(LAYOUT), MAIN = IDS.filter((k) => !ISLES.includes(k));
const ROADS = [['climate','disclose'],['climate','inventory'],['climate','footprint'],['climate','energy'],['climate','renew'],['climate','carbon'],['inventory','renew'],['energy','carbon'],['footprint','carbon'],['renew','disclose']];
// 主島：幾個橢圓疊起來（格座標 cx, cy, rx, ry）；右下角不放陸地
const BLOBS = [[23, 31, 20.5, 25.5], [12, 51, 11, 9], [21, 57, 12, 6.5], [22, 9, 13, 6.5], [36, 40, 9, 9]];
// 盤查谷地的河：從高原流經谷地出西海（格座標折線）
const RIVER = [[19, 13], [15.5, 17], [14, 21], [14, 25], [10, 28.5], [5, 29.5], [-1, 30]];
const BAYC = [42.4, 22]; // 揭露海港的海灣中心
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
  const BR = new Int8Array((AW >> 1) * (AH >> 1)).fill(-2);
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
    // 揭露海港的海灣、碳匯濕地的水塘
    if (IDS[REG[i]] === 'disclose' && Math.hypot(tx - BAYC[0], ty - BAYC[1]) < 3.8 + (vn(tx, ty) - 0.5) * 1.2) WAT[i] = 2;
    if (IDS[REG[i]] === 'carbon' && Math.hypot(tx - LAYOUT.carbon.sx, ty - LAYOUT.carbon.sy) > 2.4 && fbm(tx * 2.2 + 40, ty * 2.2) > 0.56) WAT[i] = 3;
    let rd = 9; if (tx < 21 && ty > 11 && ty < 32) for (let s = 1; s < RIVER.length; s++) rd = Math.min(rd, segD(tx, ty, RIVER[s - 1], RIVER[s]));
    if (rd < 0.42 + (vn(tx * 2, ty * 2) - 0.5) * 0.12 && WAT[i] === 0) WAT[i] = 1;
  }
  const bfs = (D, src, pass) => { let q = []; for (let i = 0; i < N; i++) if (src(i)) { D[i] = 0; q.push(i); }
    for (let d = 1; d < 30 && q.length; d++) { const nq = []; for (const i of q) { const x = i % AW;
      for (const j of [x > 0 ? i - 1 : -1, x < AW - 1 ? i + 1 : -1, i - AW, i + AW]) if (j >= 0 && j < N && D[j] === 99 && pass(j)) { D[j] = d; nq.push(j); } } q = nq; } };
  bfs(DO, (i) => REG[i] >= 0, (i) => REG[i] < 0);
  bfs(DL, (i) => REG[i] < 0 || WAT[i] === 2, (i) => REG[i] >= 0 && WAT[i] !== 2);
  bfs(DW, (i) => REG[i] >= 0 && WAT[i] !== 2, (i) => WAT[i] === 2);
  for (let i = AW + 1; i < N - AW - 1; i++) { const r = REG[i]; if (r < 0) continue;
    const mt = IDS[r] === 'renew', rel = (HG[i - AW - 1] - HG[i + AW + 1]) * (mt ? 13 : 9);
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
  high:['#46583a','#66783e','#8c9a4c','#b4b862','#dcd486'], ind:['#2c3a40','#3e5250','#566c5c','#768a66','#9aa682'], wet:['#1a3638','#264e46','#3a6a52','#58865c','#86a46e'],
  alp:['#28424a','#3a5c52','#52785a','#749466','#a2b482'], sand:['#a0805a','#c4a472','#dbc28a','#eed9a4','#faeec6'], isle:['#245a3e','#357a44','#4f9a4a','#7cba56','#b4d672'],
};
const TER = { renew:'high', inventory:'vale', disclose:'grass', climate:'meadow', footprint:'wood', energy:'ind', carbon:'wet', arena:'isle' };
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
function crate(x, y) { rect(x - 3, y - 6, 7, 6, S.wd[3]); rect(x - 3, y - 6, 7, 1, S.wd[4]); rect(x + 2, y - 5, 2, 5, S.wd[1]); line(x - 3, y - 6, x + 2, y - 1, S.wd[2]); }
function barrel(x, y) { cyl(x, y, 6, 7, S.wd); rect(x - 3, y - 6, 6, 1, S.st[2]); rect(x - 3, y - 2, 6, 1, S.st[2]); ell(x, y - 7, 2, 1, S.wd[4]); }
function lamp(x, y, f = 0) { rect(x, y - 12, 1, 12, BLK); rect(x - 1, y - 15, 3, 3, f % 3 === 2 ? WIN2 : WIN); }
function sign(x, y, c = S.wd[3]) { rect(x, y - 9, 1, 9, S.wd[1]); rect(x - 4, y - 12, 10, 5, c); rect(x - 4, y - 8, 10, 1, S.wd[1]); }
function boat(x, y, f, c = WH) { const b = f % 2; ell(x, y + 2, 9, 1, 'rgba(232,248,242,.55)');
  for (let j = 0; j < 4; j++) rect(x - 8 + j, y - 3 + j + b, 17 - j * 2, 1, j === 0 ? S.wd[4] : S.wd[2]);
  line(x, y - 3 + b, x, y - 17 + b, S.wd[1]); for (let j = 0; j < 11; j++) rect(x + 1, y - 16 + j + b, Math.round(j * 0.7) + 1, 1, j < 6 ? c : '#d6d0c4'); }
// ---- 永續國專用物件 ----
const SOL = ['#121a36', '#1c2a56', '#2a427c', '#4a6ab0', '#a8ccf4'], CN = ['#2a2e3c', '#3e4454', '#5a6272', '#7a8292', '#a4aab4'];
function pole(x, y, h = 44) { shadow(x + 6, y + 1, 6, 2); for (let j = 0; j < h; j++) { const w = j < h * 0.4 ? 2 : 1; rect(x - 1, y - j, 1, 1, '#f2f2ee'); rect(x, y - j, w, 1, '#a8b0c0'); }
  rect(x - 2, y - h - 2, 6, 4, '#e8eaee'); rect(x + 2, y - h - 2, 2, 4, '#9aa2b2'); }
function rotor(x, y, a, L = 18) { for (let k = 0; k < 3; k++) { const t = a + k * 2.094, c = Math.cos(t), s = Math.sin(t); line(x, y, x + c * L, y + s * L, '#f6f6f2'); line(x + 1, y + 1, x + 1 + c * (L - 3), y + 1 + s * (L - 3), '#b8c0cc'); } rect(x - 1, y - 1, 3, 3, '#6a7080'); }
function solar(x, y, w = 24, rows = 2) { // 太陽能板陣列：斜放的深藍面板，上緣反光
  shadow(x + w / 2 + 3, y + 2, w / 2 + 3, 2);
  for (let r = 0; r < rows; r++) { const Y = y - r * 8; for (let j = 0; j < 6; j++) rect(x + j * 0.5, Y - 6 + j, w, 1, SOL[j === 0 ? 4 : j < 2 ? 3 : j < 4 ? 2 : 1]);
    for (let i = 4; i < w; i += 5) line(x + i, Y - 6, x + i + 2, Y - 1, SOL[0]); rect(x + 2, Y, 1, 2, CN[1]); rect(x + w - 2, Y, 1, 2, CN[1]); } }
function mangrove(x, y, s = 1) { shadow(x + 3, y + 1, Math.round(7 * s), 2); for (const dx of [-4, -2, 1, 3, 5]) line(x, y - 6 * s, x + dx * s, y + 1, S.wd[2]);
  blob(x - 3 * s, y - 9 * s, Math.round(4 * s), S.lf, x); blob(x + 3 * s, y - 10 * s, Math.round(4 * s), S.lf, y); blob(x, y - 13 * s, Math.round(5 * s), S.lf, x + y); }
function reeds(x, y) { for (let k = 0; k < 6; k++) { const dx = Math.round((hash(x + k, y) - 0.5) * 8), h = 5 + Math.round(hash(y, x + k) * 5); line(x + dx, y, x + dx + (k % 2), y - h, k % 3 ? '#9aa04a' : '#c8b46a'); rect(x + dx + (k % 2), y - h - 1, 1, 2, '#7a5a3a'); } }
function egret(x, y, f) { const b = f % 2; rect(x, y - 6 - b, 5, 3, WH); rect(x + 4, y - 10 - b, 1, 4, WH); rect(x + 4, y - 11 - b, 3, 2, WH); px(x + 7, y - 10 - b, GOLD); rect(x + 1, y - 3, 1, 3, BLK); rect(x + 3, y - 3, 1, 3, BLK); px(x + 1, y - 5 - b, '#d8dce0'); }
function tank(x, y, w, h) { shadow(x + 5, y + 1, w / 2 + 4, 3); cyl(x, y, w, h, ['#3a4454', '#6a7484', '#a8b0bc', '#d8dce2', '#f4f6f8']); ell(x, y - h, w / 2, 3, '#c8ced6'); ell(x - 1, y - h - 1, w / 2 - 3, 1, '#eef0f4'); rect(x - w / 2, y - h / 2, w, 2, '#5aa06a'); }
function pylon(x, y) { shadow(x + 4, y + 1, 5, 1); line(x - 4, y, x, y - 30, '#5a6070'); line(x + 4, y, x, y - 30, '#5a6070'); for (let j = 6; j < 30; j += 6) line(x - 4 + j / 8, y - j, x + 4 - j / 8, y - j, '#7a8090'); rect(x - 7, y - 26, 15, 1, '#5a6070'); rect(x - 5, y - 20, 11, 1, '#5a6070'); }

// ---- 各區聚落：static 進靜態層（依 y 排序）、anim 每幀畫 ----
const P0 = (id) => [ax0(id), ay0(id)];
const SET = {}, TOPY = {};
const put = (id, y, d, fp) => { SET[id].st.push({ y, d }); if (fp) occ(...fp); };
function occ(x0, y0, x1, y1) { for (let y = Math.max(0, y0 >> 1); y <= Math.min(AH - 1, y1 >> 1); y++) for (let x = Math.max(0, x0 >> 1); x <= Math.min(AW - 1, x1 >> 1); x++) OCC[y * AW + x] = 1; }
const GROUND = []; // 鋪在地面、不參與排序的東西（廣場、梯田、棧道、廠區地坪）
IDS.forEach((id) => (SET[id] = { st: [], anim: [] }));
(() => {
  { // 氣候議事城：石板廣場＋圓頂議事堂＋環繞民房（屋頂太陽能）＋噴泉
    const [x, y] = P0('climate'); TOPY.climate = y - 80;
    GROUND.push(() => { ell(x, y - 6, 92, 46, '#8e8270'); ell(x, y - 6, 90, 44, '#c0b294');
      for (let j = -42; j <= 36; j += 4) for (let i = -88; i <= 88; i += 6) { const xx = x + i + ((j >> 2) & 1) * 3, yy = y - 6 + j; if (((i / 90) ** 2 + (j / 44) ** 2) < 0.95) { rect(xx, yy, 5, 3, hash(xx, yy) > 0.5 ? '#d0c4a6' : '#b2a488'); px(xx, yy, '#e2d8bc'); } }
      ell(x, y + 16, 10, 4, '#7c7060'); ell(x, y + 15, 8, 3, '#4a98b8'); px(x - 3, y + 14, '#c8f0f4'); });
    occ(x - 92, y - 52, x + 92, y + 40);
    put('climate', y, () => { // 議事堂：基座階梯＋列柱＋山牆＋圓頂
      shadow(x + 12, y + 2, 52, 5); for (let j = 0; j < 4; j++) rect(x - 46 + j * 2, y - 4 + j, 92 - j * 4, 1, j % 2 ? S.pl[2] : S.pl[3]); rect(x - 46, y - 1, 92, 1, S.pl[1]);
      rect(x - 42, y - 26, 84, 22, S.pl[1]); for (let i = -38; i <= 36; i += 8) { rect(x + i, y - 26, 4, 22, S.pl[3]); rect(x + i + 3, y - 26, 1, 22, S.pl[2]); px(x + i, y - 26, S.pl[4]); }
      rect(x - 46, y - 30, 92, 4, S.pl[3]); rect(x - 46, y - 27, 92, 1, S.pl[1]);
      for (let j = 0; j < 10; j++) { const w = 8 + j * 9; rect(x - w / 2, y - 40 + j, w, 1, j === 0 ? S.pl[4] : j % 3 ? S.pl[2] : S.pl[3]); }
      rect(x - 18, y - 52, 36, 12, S.pl[2]); rect(x + 12, y - 52, 6, 12, S.pl[1]); for (let i = -14; i <= 10; i += 6) rect(x + i, y - 50, 3, 7, '#3a5a6a');
      blob(x, y - 58, 16, ['#1e4a52', '#2e6e74', '#4a9a98', '#7ccac0', '#c0f0e4'], 3); rect(x - 17, y - 54, 34, 3, S.pl[3]); rect(x - 1, y - 78, 3, 6, S.pl[3]); });
    SET.climate.anim.push((f) => { flag(x, y - 74, f, '#4aa860', 12); flag(x - 46, y - 30, f + 1, '#4aa860', 12); flag(x + 46, y - 30, f, '#4aa860', 12); });
    const HS = [[-112, -20, 22, S.rt], [-106, 22, 20, S.ro], [-70, 46, 18, S.rr], [108, -24, 22, S.rr], [114, 18, 20, S.rt], [74, 48, 18, S.ro], [-74, -52, 18, S.rb], [76, -56, 18, S.rt]];
    HS.forEach(([dx, dy, w, rf], k) => put('climate', y + dy, () => { house(x + dx, y + dy, w, 9, rf, k % 2 ? S.pl : S.ws, { chim: k % 3 === 0 }); if (k % 2 === 0) solar(x + dx - w / 2 + 3, y + dy - 12, w - 8, 1); }, [x + dx - w / 2 - 2, y + dy - 22, x + dx + w / 2 + 2, y + dy]));
    [[-40, 36], [40, 36], [-58, 6], [58, 6]].forEach(([dx, dy]) => put('climate', y + dy, () => { rect(x + dx - 4, y + dy - 3, 9, 3, S.pl[1]); tree(x + dx, y + dy - 2, 0.6, S.lf, dx); }));
  }
  { // 揭露海港：燈塔（光束輪轉）＋木碼頭伸進海灣＋倉庫＋吊車＋貨箱＋船
    const [x, y] = P0('disclose'); TOPY.disclose = y - 62;
    put('disclose', y, () => { shadow(x + 8, y + 2, 14, 4); ell(x, y - 2, 13, 5, R.rock[2]); ell(x - 3, y - 4, 8, 3, R.rock[3]);
      for (let j = 0; j < 44; j++) { const w = 7 - Math.floor(j / 11); for (let i = -w; i <= w; i++) { const t = (i + w) / (2 * w); px(x + i, y - 4 - j, ((j >> 2) % 2 ? (t < 0.3 ? '#e8705e' : t < 0.7 ? '#c8463c' : '#8a2a2a') : (t < 0.3 ? '#ffffff' : t < 0.7 ? '#e8e2d6' : '#a8a296'))); } }
      rect(x - 6, y - 54, 13, 7, BLK); rect(x - 5, y - 53, 11, 5, WIN); rect(x - 7, y - 56, 15, 2, '#8a2a2a'); for (let j = 0; j < 5; j++) rect(x - 5 + j, y - 61 + j, 11 - j * 2, 1, '#c8463c'); rect(x - 8, y - 47, 17, 1, S.st[1]); });
    SET.disclose.anim.push((f) => { const a = f * 0.5, c = Math.cos(a); if (Math.sin(a) > -0.4) { const ex = x + c * 46, ey = y - 50 + Math.sin(a) * 6; line(x, y - 50, ex, ey, 'rgba(255,236,170,.85)'); line(x, y - 49, ex, ey + 3, 'rgba(255,236,170,.45)'); } rect(x - 5, y - 53, 11, 5, f % 2 ? WIN2 : WIN); });
    GROUND.push(() => { for (const [px0, py0, L] of [[x + 20, y - 4, 84], [x + 26, y + 26, 70]]) { rect(px0, py0, L, 7, S.wd[3]); for (let i = 0; i < L; i += 4) rect(px0 + i, py0, 1, 7, S.wd[2]); rect(px0, py0, L, 1, S.wd[4]); rect(px0, py0 + 7, L, 2, S.wd[1]); for (let i = 4; i < L; i += 12) rect(px0 + i, py0 + 9, 2, 4, S.wd[1]); } });
    SET.disclose.anim.push((f) => { boat(x + 74, y - 16, f, '#f0e8d8'); boat(x + 62, y + 46, f + 1, '#d8e8f8'); });
    put('disclose', y - 18, () => house(x - 58, y - 18, 34, 13, S.rb, S.ws, { rh: 12, dark: true }), [x - 78, y - 44, x - 38, y - 16]);
    put('disclose', y + 26, () => house(x - 64, y + 26, 30, 11, S.rt, S.ws, { rh: 11, dark: true }), [x - 82, y + 2, x - 46, y + 26]);
    put('disclose', y - 6, () => { const X = x + 40, Y = y - 6; rect(X, Y - 36, 3, 36, '#e8b43a'); rect(X + 2, Y - 36, 1, 36, '#a87a20'); for (let j = 4; j < 36; j += 5) line(X, Y - j, X + 2, Y - j - 4, '#a87a20'); rect(X - 4, Y - 38, 34, 3, '#e8b43a'); rect(X - 4, Y - 36, 34, 1, '#a87a20'); line(X + 26, Y - 35, X + 26, Y - 18, BLK); rect(X + 22, Y - 18, 9, 6, '#3a7ac8'); });
    [[-28, 36], [-20, 40], [-24, 31], [24, 22]].forEach(([dx, dy], k) => put('disclose', y + dy, () => (k === 1 ? barrel(x + dx, y + dy) : crate(x + dx, y + dy))));
    put('disclose', y + 44, () => lamp(x - 10, y + 44));
  }
  { // 盤查谷地：觀測塔（數字跳動）＋氣象站＋梯田＋農舍＋穀倉＋測站小旗
    const [x, y] = P0('inventory'); TOPY.inventory = y - 66;
    put('inventory', y, () => { shadow(x + 8, y + 1, 14, 3);
      for (let j = 0; j < 46; j++) { const w = 9 - Math.floor(j / 9); px(x - w, y - j, S.st[1]); px(x + w, y - j, S.st[0]); if (j % 8 === 0) line(x - w, y - j, x + w, y - j, S.st[2]); if (j % 8 === 4) line(x - w, y - j, x + w, y - j - 4, S.st[1]); }
      rect(x - 11, y - 60, 22, 14, S.pl[3]); rect(x + 7, y - 60, 4, 14, S.pl[1]); rect(x - 9, y - 58, 16, 9, BLK); rect(x - 13, y - 62, 26, 3, S.rt[2]); rect(x - 13, y - 62, 26, 1, S.rt[4]); });
    SET.inventory.anim.push((f) => { for (let i = 0; i < 5; i++) { const h = 1 + ((f + i * 3) % 6); rect(x - 7 + i * 3, y - 50 - h, 2, h, i % 2 ? GLOW : '#7ef0a0'); } px(x + 4, y - 57, f % 2 ? '#ff6a5a' : '#5a2020'); });
    put('inventory', y + 20, () => { const X = x + 40, Y = y + 20; shadow(X + 3, Y + 1, 5, 1); rect(X, Y - 26, 1, 26, S.st[1]); rect(X - 6, Y - 18, 12, 1, S.st[1]); rect(X - 7, Y - 22, 3, 4, WH); rect(X + 5, Y - 22, 3, 4, WH); }, [x + 32, y - 6, x + 48, y + 20]);
    SET.inventory.anim.push((f) => { const X = x + 40, Y = y - 6, a = f * 0.9; for (let k = 0; k < 3; k++) { const t = a + k * 2.09; line(X, Y - 2, X + Math.cos(t) * 6, Y - 2 + Math.sin(t) * 2, S.st[2]); ell(X + Math.round(Math.cos(t) * 6), Y - 2 + Math.round(Math.sin(t) * 2), 1, 1, '#e8eef4'); } });
    GROUND.push(() => { for (const [fx, fy, w, rows] of [[x - 118, y - 62, 52, 6], [x - 116, y + 20, 48, 5], [x + 54, y - 64, 40, 5]]) for (let r = 0; r < rows; r++) { const Y = fy + r * 7; rect(fx, Y, w, 6, r % 2 ? '#7aa84a' : '#94bc58'); rect(fx, Y + 5, w, 2, '#5a6a34'); for (let i = 1; i < w; i += 3) px(fx + i, Y + 2, '#b8d070'); } });
    occ(x - 120, y - 66, x - 64, y - 18); occ(x - 118, y + 16, x - 66, y + 56); occ(x + 52, y - 68, x + 96, y - 28);
    put('inventory', y - 4, () => house(x - 50, y - 4, 24, 10, S.rr, S.pl, { chim: true }), [x - 64, y - 28, x - 36, y - 4]);
    SET.inventory.anim.push((f) => smoke(x - 43, y - 34, f));
    put('inventory', y + 44, () => house(x - 26, y + 44, 20, 9, S.ro, S.ws), [x - 38, y + 22, x - 14, y + 44]);
    put('inventory', y - 34, () => { const X = x - 30, Y = y - 34; shadow(X + 5, Y + 1, 8, 2); cyl(X, Y, 14, 22, S.wd); for (let j = Y - 20; j < Y; j += 5) rect(X - 7, j, 14, 1, S.wd[1]); for (let j = 0; j < 5; j++) rect(X - 7 + j, Y - 22 - j, 14 - j * 2, 1, S.rr[j ? 2 : 1]); }, [x - 38, y - 60, x - 22, y - 34]);
    [[-80, 4], [70, 10], [-4, 40]].forEach(([dx, dy], k) => { put('inventory', y + dy, () => rect(x + dx, y + dy - 12, 1, 12, S.wd[1])); SET.inventory.anim.push((f) => flag(x + dx, y + dy - 2, f + k, k % 2 ? GOLD : '#4aa860', 10)); });
  }
  { // 足跡森林：巨木＋發光腳印小徑＋林間小屋＋原木堆
    const [x, y] = P0('footprint'); TOPY.footprint = y - 70;
    occ(x - 40, y - 60, x + 40, y + 8);
    put('footprint', y, () => { shadow(x + 14, y + 2, 34, 6);
      for (let j = 0; j < 26; j++) { const ww = 6 + Math.round(Math.max(0, j - 18) * 1.4); rect(x - ww, y - 26 + j, ww * 2, 1, S.wd[2]); rect(x - ww, y - 26 + j, 3, 1, S.wd[3]); rect(x + ww - 4, y - 26 + j, 4, 1, S.wd[1]); }
      for (const [dx, dy] of [[-12, 2], [12, 2], [-6, 3], [8, 3]]) line(x, y - 4, x + dx, y + dy, S.wd[1]);
      blob(x - 22, y - 34, 15, S.lf, 4); blob(x + 22, y - 36, 15, S.lf, 8); blob(x - 10, y - 52, 17, S.lf, 2); blob(x + 12, y - 54, 16, S.lf, 6); blob(x, y - 42, 18, S.lf, 1); rect(x - 4, y - 14, 8, 6, BLK); ell(x, y - 14, 4, 2, BLK); });
    const FP = Array.from({ length: 12 }, (_, k) => [x + 18 + k * 7, y + 10 + Math.round(Math.sin(k * 0.7) * 6) + (k % 2) * 3]);
    put('footprint', y + 9, () => FP.forEach(([X, Y]) => { rect(X, Y, 3, 2, 'rgba(126,240,220,.55)'); }));
    SET.footprint.anim.push((f) => FP.forEach(([X, Y], k) => { if ((k + 12 - (f % 12)) % 12 > 2) return; rect(X, Y, 3, 2, '#c8fff4'); px(X, Y - 1, '#7ef0dc'); px(X + 2, Y - 1, '#7ef0dc'); }));
    put('footprint', y + 2, () => house(x - 66, y + 2, 22, 9, S.rt, S.wd, { chim: true }), [x - 80, y - 20, x - 52, y + 2]);
    SET.footprint.anim.push((f) => smoke(x - 58, y - 26, f));
    put('footprint', y - 28, () => house(x + 60, y - 28, 20, 8, S.ro, S.wd), [x + 48, y - 48, x + 72, y - 28]);
    put('footprint', y + 40, () => { const X = x - 40, Y = y + 40; shadow(X + 6, Y + 1, 14, 2); for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) { const cx = X - 8 + k * 7 + r * 3, cy = Y - 3 - r * 5; rect(cx - 3, cy - 2, 14, 5, S.wd[3]); rect(cx - 3, cy - 2, 14, 1, S.wd[4]); ell(cx - 3, cy, 2, 2, '#d8b07a'); px(cx - 3, cy, S.wd[2]); } }, [x - 54, y + 26, x - 26, y + 40]);
    put('footprint', y + 30, () => sign(x + 4, y + 30, '#4aa860'));
  }
  { // 節能工坊：水泥廠區＋屋頂太陽能廠房＋煙囪蒸氣＋儲槽＋管線＋熱泵＋電塔
    const [x, y] = P0('energy'); TOPY.energy = y - 72;
    GROUND.push(() => { rect(x - 92, y - 54, 184, 92, CN[2]); rect(x - 92, y - 54, 184, 1, CN[3]); rect(x - 92, y + 37, 184, 1, CN[1]); for (let j = -50; j < 36; j += 12) rect(x - 92, y + j, 184, 1, 'rgba(40,44,60,.35)'); for (let i = -88; i < 92; i += 16) rect(x + i, y - 54, 1, 92, 'rgba(40,44,60,.25)');
      for (let i = -80; i < 80; i += 10) rect(x + i, y + 30, 6, 1, '#e8d070'); });
    occ(x - 94, y - 56, x + 94, y + 40);
    put('energy', y, () => { shadow(x + 14, y + 2, 50, 5); bricks(x - 46, y - 24, 80, 24, ['#3a3e4e', '#5a6070', '#8a92a2', '#b0b8c4', '#d8dce4']); rect(x + 28, y - 24, 6, 24, '#5a6070');
      for (let i = -42; i < 26; i += 8) if (Math.abs(i + 1) > 9) { rect(x + i, y - 18, 5, 6, WIN); px(x + i, y - 18, WIN2); } rect(x - 8, y - 12, 14, 12, '#2a3040'); for (let j = y - 11; j < y; j += 2) rect(x - 7, j, 12, 1, '#4a5060');
      for (let k = 0; k < 5; k++) { const X = x - 46 + k * 16; for (let j = 0; j < 12; j++) rect(X, y - 36 + j, Math.min(16, 4 + j * 1.2), 1, SOL[j === 0 ? 4 : j < 3 ? 3 : 2]); rect(X + 15, y - 36, 1, 12, '#3a3e4e'); } rect(x - 46, y - 25, 80, 1, '#2a2e3c');
      for (const cx of [x + 40, x + 52]) { shadow(cx + 4, y + 1, 5, 2); cyl(cx, y, 8, 58, ['#4a3a3a', '#7a5a52', '#a8786a', '#c89a88', '#e8c0b0']); rect(cx - 4, y - 50, 8, 3, '#e8e8e8'); rect(cx - 4, y - 44, 8, 3, RED); } });
    SET.energy.anim.push((f) => { smoke(x + 40, y - 62, f, 4); smoke(x + 52, y - 62, f + 3, 4); });
    put('energy', y - 30, () => { tank(x + 76, y - 30, 22, 26); tank(x - 74, y - 30, 18, 20); });
    put('energy', y + 22, () => { rect(x + 34, y + 12, 52, 3, '#c8a040'); rect(x + 34, y + 12, 52, 1, '#f0d070'); rect(x + 84, y - 30, 3, 44, '#c8a040'); rect(x - 66, y - 34, 3, 16, '#4aa0c8'); rect(x - 66, y - 34, 22, 3, '#4aa0c8'); px(x - 66, y - 34, '#9ad8f0');
      for (const dx of [-80, -60]) { const X = x + dx, Y = y + 26; shadow(X + 3, Y + 1, 7, 2); rect(X - 6, Y - 10, 12, 10, '#d8dce4'); rect(X + 3, Y - 10, 3, 10, '#a0a8b8'); ell(X - 1, Y - 5, 3, 3, '#5a6070'); px(X - 1, Y - 5, '#8ad0e8'); } });
    put('energy', y - 70, () => { pylon(x - 30, y - 70); pylon(x + 20, y - 74); line(x - 37, y - 96, x + 13, y - 100, '#3a3e4e'); line(x - 23, y - 96, x + 27, y - 100, '#3a3e4e'); }, [x - 36, y - 104, x + 26, y - 70]);
    put('energy', y + 60, () => house(x + 62, y + 60, 22, 9, S.rt, S.pl), [x + 48, y + 38, x + 76, y + 60]);
  }
  { // 風光高原：成排風機（轉動）＋太陽能陣列＋變電站
    const [x, y] = P0('renew'); TOPY.renew = y - 76;
    const TB = [[0, 0], [-46, -14], [46, -12], [-92, 6], [92, 8], [-70, -50], [70, -48], [-24, -60], [24, -64], [-124, -30], [124, -26]];
    TB.forEach(([dx, dy], k) => put('renew', y + dy, () => pole(x + dx, y + dy, k ? 38 : 50), [x + dx - 4, y + dy - 6, x + dx + 6, y + dy + 2]));
    SET.renew.anim.push((f) => TB.forEach(([dx, dy], k) => rotor(x + dx, y + dy - (k ? 38 : 50), f * 0.42 + k * 0.7, k ? 16 : 22)));
    [[-110, 40], [-70, 44], [44, 40], [84, 44], [-30, 52]].forEach(([dx, dy]) => put('renew', y + dy, () => solar(x + dx, y + dy, 32, 3), [x + dx - 2, y + dy - 26, x + dx + 36, y + dy + 3]));
    put('renew', y + 20, () => { const X = x + 40, Y = y + 20; bricks(X - 10, Y - 10, 20, 10, S.ws); for (let j = 0; j < 4; j++) rect(X - 12, Y - 13 + j, 24, 1, S.rt[j ? 2 : 4]); for (const dx of [16, 24]) { rect(X + dx - 2, Y - 8, 5, 8, '#8a92a2'); rect(X + dx - 3, Y - 10, 7, 2, '#b0b8c4'); } }, [x + 28, y - 4, x + 68, y + 20]);
  }
  { // 碳匯濕地：高腳賞鳥屋＋木棧道穿過水塘＋紅樹林＋白鷺＋碳權石碑
    const [x, y] = P0('carbon'); TOPY.carbon = y - 44;
    GROUND.push(() => { const pts = [[-120, 30], [-70, 20], [-20, 22], [0, 6]]; for (let s = 1; s < pts.length; s++) { const [a1, b1] = pts[s - 1], [a2, b2] = pts[s], n = Math.hypot(a2 - a1, b2 - b1);
        for (let t = 0; t <= n; t += 3) { const X = x + a1 + (a2 - a1) * t / n, Y = y + b1 + (b2 - b1) * t / n; rect(X - 3, Y - 2, 6, 5, S.wd[3]); rect(X - 3, Y - 2, 1, 5, S.wd[2]); rect(X - 3, Y + 3, 6, 1, S.wd[1]); } }
      for (const [a, b] of [[40, 20], [80, 4], [110, 14]]) { rect(x + a - 10, y + b, 20, 5, S.wd[3]); rect(x + a - 10, y + b + 5, 20, 1, S.wd[1]); } });
    occ(x - 124, y + 14, x + 4, y + 36);
    put('carbon', y, () => { const X = x, Y = y; shadow(X + 8, Y + 2, 18, 3); for (const dx of [-12, -4, 4, 12]) rect(X + dx, Y - 14, 2, 14, S.wd[1]); line(X - 12, Y - 2, X + 12, Y - 12, S.wd[2]);
      rect(X - 16, Y - 30, 32, 16, S.wd[3]); rect(X + 12, Y - 30, 4, 16, S.wd[2]); rect(X - 16, Y - 16, 32, 2, S.wd[1]); rect(X - 10, Y - 26, 20, 4, BLK); rect(X - 10, Y - 26, 20, 1, '#4a5a4a');
      for (let j = 0; j < 9; j++) rect(X - 19 + Math.max(0, 2 - j), Y - 39 + j, 38 - Math.max(0, 2 - j) * 2, 1, j === 0 ? '#e0d090' : j % 3 ? '#b89a50' : '#8a7038'); });
    occ(x - 20, y - 40, x + 20, y + 2);
    put('carbon', y - 22, () => { const X = x + 62, Y = y - 22; shadow(X + 3, Y + 1, 6, 2); rect(X - 5, Y - 16, 10, 16, R.rock[2]); rect(X + 2, Y - 16, 3, 16, R.rock[1]); rect(X - 5, Y - 16, 10, 1, R.rock[4]); rect(X - 2, Y - 12, 4, 7, '#7ef0a0'); px(X - 1, Y - 11, '#fff'); }, [x + 56, y - 40, x + 68, y - 22]);
    SET.carbon.anim.push((f) => { egret(x + 30 + Math.round(Math.sin(f / 3) * 3), y + 44, f); egret(x - 64, y - 26, f + 1); egret(x + 96, y - 14, f + 2); });
    [[-40, -10], [36, -20], [-90, -4], [70, 30], [-60, 50]].forEach(([dx, dy]) => put('carbon', y + dy, () => mangrove(x + dx, y + dy, 1.1)));
  }
  { // 演武島：圓形競技場＋旗＋火把＋帳篷（跟 AI 國的演武島同一套造型，永續國用綠旗）
    const [x, y] = P0('arena'); TOPY.arena = y - 44;
    occ(x - 52, y - 40, x + 52, y + 10);
    put('arena', y, () => { shadow(x + 8, y + 3, 50, 8);
      ell(x, y - 10, 46, 20, S.st[1]); ell(x, y - 12, 45, 19, S.st[2]); ell(x, y - 14, 44, 17, S.st[3]);
      ell(x, y - 13, 34, 12, S.ws[1]); ell(x, y - 13, 32, 11, '#c8a46a'); ell(x, y - 12, 26, 8, '#d8b878');
      for (let i = -42; i <= 42; i += 7) { const yy = y - 2 + Math.round((1 - (i / 46) ** 2) * 6), dk = i > 10; rect(x + i - 2, yy - 9, 5, 9, dk ? S.st[1] : S.st[2]); rect(x + i - 1, yy - 7, 3, 5, BLK); ell(x + i, yy - 7, 1, 1, BLK); }
      rect(x - 46, y - 16, 92, 1, S.st[4]); rect(x - 5, y - 6, 10, 8, BLK); });
    SET.arena.anim.push((f) => { flag(x - 44, y - 18, f, '#3f9a52', 18); flag(x + 44, y - 18, f + 1, GOLD, 18); flag(x, y - 30, f, '#3a8ac8', 14);
      for (const dx of [-14, 14]) { rect(x + dx, y - 6, 1, 6, S.wd[1]); px(x + dx, y - 7 - (f % 2), '#ffd27a'); px(x + dx, y - 8, f % 2 ? '#f08a3a' : '#ffd27a'); } });
    [[-62, 16], [62, 12]].forEach(([dx, dy], k) => put('arena', y + dy, () => { const X = x + dx, Y = y + dy; shadow(X + 4, Y + 1, 9, 2); for (let j = 0; j < 10; j++) rect(X - j, Y - 10 + j, j * 2 + 1, 1, k ? (j % 3 ? '#3f9a52' : WH) : (j % 3 ? '#3a8ac8' : WH)); rect(X - 1, Y - 4, 3, 4, BLK); }));
    [[-34, 26], [36, 28]].forEach(([dx, dy]) => put('arena', y + dy, () => palm(x + dx, y + dy)));
  }
})();

// 每格歸哪一區：地形分區＋各聚落建物的剪影（高塔超出地形邊界也算該區；迷霧與點擊都用它）。剪影在 buildStatic 補上
const OWN = Int8Array.from(REG);

// ---- 道路：區域中心之間的彎曲土路，過河與過水塘處架木橋 ----
const ROADPTS = [];
for (const [a, b] of ROADS) { const A = [ax0(a), ay0(a)], B = [ax0(b), ay0(b)], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy), bend = (hash(A[0], B[1]) - 0.5) * 0.5;
  const cx = (A[0] + B[0]) / 2 - dy * bend, cy = (A[1] + B[1]) / 2 + dx * bend;
  for (let t = 0; t <= 1; t += 1 / len) { const u = 1 - t, x = u * u * A[0] + 2 * u * t * cx + t * t * B[0], y = u * u * A[1] + 2 * u * t * cy + t * t * B[1]; const i = cellAt(x | 0, y | 0);
    if (i < 0 || REG[i] < 0 || WAT[i] === 2) continue; ROADPTS.push([x, y, WAT[i] === 1 || WAT[i] === 3]); } }
for (const [x, y] of ROADPTS) occ(x - 4, y - 4, x + 4, y + 4);

// ---- 樹與小物：在格點上撒，依區域決定種類與密度 ----
const DECOR = [];
for (let gy = 4; gy < H; gy += 9) for (let gx = 4; gx < W; gx += 10) {
  const x = gx + Math.round((hash(gx, gy) - 0.5) * 8), y = gy + Math.round((hash(gy, gx) - 0.5) * 6), i = cellAt(x, y); if (i < 0) continue;
  const r = REG[i]; if (r < 0 || OCC[i] || DL[i] < 3) continue; const id = IDS[r], h = hash(x * 3, y * 7), d = fbm(x / 10, y / 10);
  if (OCC[i + 2] || OCC[i - 2] || (i > AW * 3 && OCC[i - AW * 3])) continue;
  let fn = null;
  if (id === 'footprint') { if (d > 0.34 || h > 0.72) fn = h > 0.8 ? () => pine(x, y, 1.1) : () => tree(x, y, 0.95 + h * 0.5, S.lf, x); }
  else if (id === 'renew') { if (h > 0.95) fn = () => rock(x, y); else if (h > 0.84) fn = () => flowers(x, y, '#f8e070'); else if (h > 0.74 && d > 0.5) fn = () => bush(x, y, 0.9); }
  else if (id === 'inventory') { if (d > 0.56 && h > 0.35) fn = () => tree(x, y, 0.85 + h * 0.3, S.lf, x); else if (h > 0.9) fn = () => flowers(x, y, '#f0c0e0'); else if (h > 0.84) fn = () => bush(x, y); }
  else if (id === 'disclose') { if (d > 0.58 && h > 0.4) fn = () => tree(x, y, 0.85, S.lf, x); else if (h > 0.86) fn = () => (DL[i] < 6 ? palm(x, y) : bush(x, y)); }
  else if (id === 'climate') { if (d > 0.6 && h > 0.45) fn = () => tree(x, y, 0.85, S.lf, x); else if (h > 0.9) fn = () => flowers(x, y, '#f07070'); else if (h > 0.84) fn = () => bush(x, y); }
  else if (id === 'energy') { if (h > 0.86) fn = () => bush(x, y); else if (d > 0.6 && h > 0.5) fn = () => tree(x, y, 0.8, S.lf, x); }
  else if (id === 'carbon') { const nearW = WAT[i + AW * 2] === 3 || WAT[i + 2] === 3 || WAT[i - 2] === 3; if (nearW) { if (h > 0.35) fn = () => reeds(x, y); } else if (h > 0.8) fn = () => mangrove(x, y, 0.8); else if (h > 0.55) fn = () => reeds(x, y); }
  if (fn) DECOR.push({ y, d: fn, id });
}

// ---- 靜態層（整張只畫一次）----
let STATIC = null, FOGN = null, CLIFF = null;
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return 0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16); };
function paintTerrain(ctx) {
  const img = ctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
  const RP = {}; for (const k in R) RP[k] = R[k].map(rgb); const OC = OCN.map(rgb), RV = RIV.map(rgb), PD = ['#1a3c44', '#24545a', '#2e6a6a', '#5a9a8a', '#a8d8c0'].map(rgb), FM = rgb(FOAM), CL = ['#2a1e30', '#4a3438', '#6e5244', '#8a6c52'].map(rgb);
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
      else if (WAT[i] === 3) { const t = 1.6 + (FN[i] - 0.5) * 1.4 + b - (sh ? 1.3 : 0) + (rim ? 1.5 : 0); c = PD[Math.max(0, Math.min(4, Math.floor(t)))]; }
      else { const t = 1.4 + (FN[i] - 0.5) * 1.6 + b - (sh ? 1.2 : 0) + (rim ? 1.4 : 0); c = RV[Math.max(0, Math.min(4, Math.floor(t)))]; } }
    else { const n = RT[(py & 127) * 128 + ((pX + (py >> 7) * 37) & 127)], v = V[i] + (n > 0.985 ? 0.35 : n < 0.012 ? -0.35 : 0); let P = terr[r];
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
  for (const [x, y, s] of [[40, 130, 1], [740, 236, 0.8], [24, 720, 0.85], [736, 650, 0.7]]) {
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
  rect(x - 4, y - 6, 3, 6, S.wd[1]); rect(x + 1, y - 6, 3, 6, S.wd[1]); rect(x - 5, y - 16, 11, 10, '#3b8a5c'); rect(x - 5, y - 16, 3, 10, '#5aae78'); rect(x + 3, y - 16, 3, 10, '#2a6a44');
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
      const bob = frame % 2;
      for (const id of marks) if (LAYOUT[id]) mark(ax0(id) + 26, TOPY[id] - 4 - bob);
      const hid = LAYOUT[heroId] ? heroId : 'climate'; hero(ax0(hid) - 40, ay0(hid) + 22, bob);
    },
    regionAt(clientX, clientY) { const b = canvas.getBoundingClientRect(); const i = cellAt(Math.floor((clientX - b.left) / b.width * W), Math.floor((clientY - b.top) / b.height * H)); return i < 0 || OWN[i] < 0 ? null : IDS[OWN[i]]; },
    tagPos(id) { return { left: ax0(id) / W * 100, top: (ay0(id) + 28) / H * 100 }; },
  };
}
