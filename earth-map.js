// 地球永續國的像素地圖：俯視 3/4 視角，風格 A（HD-2D 光影）調色盤。介面與 world-map.js 相同（makeMap / TW / TH）。
// 7 區對應淨零碳考綱 7 個領域；地形是固定種子產生，靜態層只在開放狀態改變時重畫，每幀只疊動態物件。
// ponytail: 繪圖小工具與 world-map.js 重複一份；兩張地圖的地形與地標完全不同，共用引擎等第三國出現再抽

export const TW = 48, TH = 72, T = 8;
export const LAYOUT = { climate:{ sx:24, sy:35 }, disclose:{ sx:39, sy:22 }, inventory:{ sx:12, sy:23 }, footprint:{ sx:11, sy:46 },
  energy:{ sx:36, sy:46 }, renew:{ sx:24, sy:11 }, carbon:{ sx:25, sy:60 } };
const ROADS = [['climate','disclose'],['climate','inventory'],['climate','footprint'],['climate','energy'],['climate','renew'],['climate','carbon'],['inventory','renew'],['energy','carbon']];

const C = {
  g1:'#3b7340', g2:'#4f8f45', g3:'#7aa84c', g4:'#24503a', gl:'#b5c865', fd:'#1b3a37',
  hi1:'#8a9a4c', hi2:'#b0b860', hi3:'#d4cf80', hi4:'#6a7a44', // 高原草
  wt1:'#2f6a5a', wt2:'#3f8a6a', wt3:'#6aa070', reed:'#c9b070', // 濕地
  d1:'#c9a06a', d2:'#9a7450', d3:'#e5cd93', s1:'#ecd9a4', s2:'#cfb07a', cliff:'#7a5a44', cliff2:'#4a3440',
  w1:'#24577e', w2:'#33739a', w3:'#8cc8cf', foam:'#d6efe6',
  st1:'#b8ae9c', st2:'#8f8578', st3:'#ddd2bc', st4:'#5e5650', // 暖石（議事城廣場）
  cn1:'#5a6070', cn2:'#454a5a', cn3:'#7a8294', // 工業區地面
  wd1:'#5c3a28', wd2:'#3a2420', wd3:'#8a5a36', sn:'#eef3f2', rk:'#8a8290', rk2:'#625a6c',
  gold:'#e8c877', red:'#c8564b', wh:'#f3ead4', blk:'#1a1828', sol:'#2a3a6a', sol2:'#5a7ab0', acc:'#7ef0dc', warm:'#ffd38a',
  shadow:'rgba(16,20,44,.32)',
};
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
const fbm = (x, y) => vn(x / 9, y / 9) * 0.6 + vn(x / 4, y / 4) * 0.3 + vn(x / 2, y / 2) * 0.1;

// ---- 地形格 ----
const GRID = [], ROAD = new Set();
(() => {
  const ids = Object.keys(LAYOUT);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let id = null;
    const d = Math.hypot((x - 24) / 22.5, (y - 35) / 32) + (fbm(x + 300, y) - 0.5) * 0.55;
    if (d < 0.93) { let best = 1e9; ids.forEach((rid, i) => { const L = LAYOUT[rid];
      const dd = Math.hypot(x - L.sx, (y - L.sy) * 0.95) + (vn(x / 5 + i * 17, y / 5 - i * 5) - 0.5) * 7; if (dd < best) { best = dd; id = rid; } }); }
    GRID.push(id);
  }
  for (const [a, b] of ROADS) { const A = LAYOUT[a], B = LAYOUT[b], n = Math.max(Math.abs(A.sx - B.sx), Math.abs(A.sy - B.sy));
    for (let i = 0; i <= n; i++) { const x = Math.round(A.sx + (B.sx - A.sx) * i / n + Math.sin(i / 3) * 0.8), y = Math.round(A.sy + (B.sy - A.sy) * i / n);
      if (at(x, y)) ROAD.add(y * TW + x); } }
})();
export function at(x, y) { return (x < 0 || y < 0 || x >= TW || y >= TH) ? null : GRID[y * TW + x]; }
const riverX = (y) => 12 + 2.4 * Math.sin(y / 4);
const isRiver = (x, y) => at(x, y) === 'inventory' && y > 14 && Math.abs(x - riverX(y)) < 1.1;
const isPond = (x, y) => at(x, y) === 'carbon' && fbm(x * 1.7, y * 1.7) > 0.58;
const isBay = (x, y) => at(x, y) === 'disclose' && Math.hypot(x - 43, y - 22) < 3.6;
const OCEAN_RAMP = ['#3c86a6', '#2c6c94', '#1f5079', '#173a62', '#122c50', '#10213f'];
const DEPTH = new Uint8Array(TW * TH).fill(9);
(() => { let q = []; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (GRID[y * TW + x]) { DEPTH[y * TW + x] = 0; q.push([x, y]); }
  for (let d = 1; d <= 5 && q.length; d++) { const nq = []; for (const [x, y] of q) for (const [a, b] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x + a, Y = y + b;
    if (X < 0 || Y < 0 || X >= TW || Y >= TH || DEPTH[Y * TW + X] !== 9) continue; DEPTH[Y * TW + X] = d; nq.push([X, Y]); } q = nq; } })();

// ---- 繪圖小工具 ----
let g = null;
const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const ell = (cx, cy, rx, ry, c) => { g.fillStyle = c; for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
const line = (x0, y0, x1, y1, c) => { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
function blob(cx, cy, r, lo, mid, hi, seed = 0) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d > r * r + r * 0.6) continue;
    const l = (x + y) / r, h = hash(cx + x + seed, cy + y);
    px(cx + x, cy + y, l < -0.55 || (l < -0.1 && h > 0.8) ? hi : l > 0.55 || (l > 0.1 && h > 0.85) ? lo : mid); }
}
function field(X, Y, base, hi, lo, s = 6) { // 逐點明暗的地面
  rect(X, Y, T, T, base);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const n = vn((X + i) / s, (Y + j) / s) * 0.8 + hash(X + i, Y + j) * 0.2;
    if (n > 0.7) px(X + i, Y + j, hi); else if (n < 0.28) px(X + i, Y + j, lo); }
}

// ---- 地形格繪製 ----
function tile(x, y) {
  const id = at(x, y), X = x * T, Y = y * T, h = hash(x, y), h2 = hash(y + 99, x + 7);
  if (!id || isBay(x, y)) { const d = id ? 1 : DEPTH[y * TW + x], c0 = OCEAN_RAMP[Math.min(d, 5)], c1 = OCEAN_RAMP[Math.min(d + 1, 5)];
    rect(X, Y, T, T, c0); for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if ((i + j) % 2 === 0 && vn((X + i) / 7, (Y + j) / 7) > 0.62) px(X + i, Y + j, c1);
    if (d === 1 && h > 0.5) rect(X + ((h2 * 4) | 0), Y + 3, 3, 1, C.foam); return; }
  const oceanS = at(x, y + 1) === null, coast = oceanS || [[1,0],[-1,0],[0,-1]].some(([a, b]) => at(x + a, y + b) === null);
  if (coast) { rect(X, Y, T, T, C.s1); for (let i = 0; i < 3; i++) px(X + ((h * 7 + i * 3) | 0) % 8, Y + ((h2 * 7 + i * 5) | 0) % 8, C.s2);
    if (oceanS) { rect(X, Y + 5, T, 3, C.cliff); rect(X, Y + 7, T, 1, C.cliff2); px(X + ((h * 8) | 0), Y + 5, C.d1); } return; }
  if (ROAD.has(y * TW + x)) { rect(X, Y, T, T, C.d1); px(X + ((h * 8) | 0), Y + ((h2 * 8) | 0), C.d2); px(X + ((h2 * 8) | 0), Y + ((h * 8) | 0), C.d3); return; }
  if (isRiver(x, y)) { rect(X, Y, T, T, C.w1); rect(X + 1, Y + 2, 3, 1, C.w2); return; }
  switch (id) {
    case 'climate': if ((x + y) % 2 === 0 && Math.hypot(x - 24, y - 35) < 4) { rect(X, Y, T, T, C.st1); rect(X, Y + 7, T, 1, C.st2); rect(X + 7, Y, 1, T, C.st2); px(X + 2, Y + 2, C.st3); }
      else field(X, Y, C.g2, C.g3, C.g1); break;
    case 'disclose': field(X, Y, C.g3, C.gl, C.g2); break;
    case 'inventory': field(X, Y, C.g2, C.gl, C.g1); if (h > 0.6 && x > 14) { for (let i = 1; i < T; i += 3) rect(X, Y + i, T, 1, C.g4); } break; // 梯田
    case 'footprint': field(X, Y, C.g1, C.g2, C.fd, 4); break;
    case 'energy': rect(X, Y, T, T, C.cn1); rect(X, Y + 7, T, 1, C.cn2); rect(X + 7, Y, 1, T, C.cn2); if (h > 0.7) { rect(X + 1, Y + 1, 5, 5, C.g2); px(X + 2, Y + 2, C.g3); } // 綠屋頂
      else if (h2 > 0.85) px(X + 3, Y + 3, C.acc); break;
    case 'renew': field(X, Y, C.hi2, C.hi3, C.hi1, 5); if (h > 0.9) { px(X + 3, Y + 4, C.hi4); px(X + 4, Y + 3, C.hi4); } break;
    case 'carbon': if (isPond(x, y)) { rect(X, Y, T, T, C.w2); for (let i = 0; i < T; i += 2) px(X + ((h * 8 + i) | 0) % 8, Y + i, C.w3); }
      else { field(X, Y, C.wt2, C.wt3, C.wt1, 4); if (h > 0.6) { line(X + 2, Y + 7, X + 2, Y + 3, C.reed); line(X + 5, Y + 7, X + 6, Y + 2, C.reed); } } break;
  }
}

// ---- 裝飾物 ----
function tree(x, y, s = 1) { ell(x + 1, y + 1, Math.round(6 * s), 2, C.shadow); rect(x - 1, y - 5, 3, 6, C.wd1); px(x, y - 4, C.wd3); blob(x, y - Math.round(10 * s), Math.round(6 * s), C.g4, C.g1, C.g3, x); }
function pine(x, y) { ell(x, y + 1, 4, 2, C.shadow); rect(x - 1, y - 2, 2, 3, C.wd1);
  for (let i = 0; i < 4; i++) { const w = 1 + i * 1.3, yy = y - 12 + i * 3; for (let k = 0; k < 3; k++) line(x - w, yy + k, x + w, yy + k, k === 0 ? C.g1 : C.g4); } px(x, y - 13, C.g3); }
function mangrove(x, y) { ell(x, y + 1, 5, 2, 'rgba(16,40,44,.35)'); for (const dx of [-3, -1, 1, 3]) line(x, y - 4, x + dx, y + 1, C.wd1); blob(x, y - 8, 4, C.fd, C.g4, C.g1, y); }
function rock(x, y) { ell(x, y + 1, 3, 1, C.shadow); ell(x, y - 1, 3, 2, C.rk); px(x - 1, y - 2, C.sn); px(x + 2, y, C.rk2); }
function solar(x, y) { ell(x + 2, y + 1, 5, 1, C.shadow); for (let j = 0; j < 4; j++) rect(x - 4 + j, y - 3 + j, 9, 1, j === 0 ? C.sol2 : C.sol); px(x - 3, y - 3, '#a8c8f0'); }
function turbine(x, y, a) { ell(x + 2, y + 1, 4, 1, C.shadow); rect(x, y - 18, 1, 18, C.sn); rect(x + 1, y - 18, 1, 18, '#a8b0c0');
  for (let k = 0; k < 3; k++) { const t = a + k * 2.094; line(x, y - 18, x + Math.cos(t) * 9, y - 18 + Math.sin(t) * 9, C.sn); } rect(x - 1, y - 19, 3, 2, C.rk2); }

// ---- 地標 ----
const LM = {
  climate(x, y, f) { // 氣候議事堂：圓頂＋列柱＋旗
    ell(x + 2, y + 2, 15, 3, C.shadow); rect(x - 13, y - 8, 27, 9, C.st3); rect(x - 13, y, 27, 1, C.st2);
    for (let i = -11; i <= 11; i += 4) { rect(x + i, y - 7, 2, 7, C.wh); px(x + i + 1, y - 7, C.st2); }
    rect(x - 14, y - 10, 29, 2, C.st1); for (let j = 0; j < 5; j++) rect(x - 13 + j * 2, y - 12 - j, 27 - j * 4, 1, C.st3);
    blob(x, y - 20, 6, '#3f7a8a', '#5aa0a8', '#9ad8d0', 3); rect(x - 6, y - 17, 13, 2, C.st1);
    line(x, y - 26, x, y - 34, C.wd1); const w = f % 2; rect(x + 1, y - 34, 6, 3, C.g2); px(x + 7, y - 33 + w, C.g2); px(x + 3, y - 33, C.gold);
  },
  disclose(x, y, f) { // 海港：燈塔（光束輪轉）＋木棧橋＋船
    ell(x + 1, y + 2, 7, 2, C.shadow); for (let j = 0; j < 22; j++) { const w = 3 - Math.floor(j / 9); rect(x - w, y - j, w * 2 + 1, 1, (j >> 2) % 2 ? C.red : C.wh); }
    rect(x - 3, y - 26, 7, 4, C.blk); rect(x - 2, y - 25, 5, 2, C.warm); rect(x - 2, y - 28, 5, 2, C.red);
    const a = f * 0.5, bx = Math.cos(a) * 14; if (Math.sin(a) > -0.3) line(x, y - 24, x + bx, y - 24 + Math.sin(a) * 3, 'rgba(255,230,160,.85)');
    rect(x + 4, y - 1, 12, 2, C.wd3); for (let i = 5; i < 16; i += 3) rect(x + i, y + 1, 1, 2, C.wd2);
    const b = f % 2; rect(x + 8, y - 5 + b, 7, 2, C.wd3); rect(x + 9, y - 3 + b, 5, 1, C.wd1); line(x + 11, y - 5 + b, x + 11, y - 11 + b, C.wd2); rect(x + 12, y - 11 + b, 3, 4, C.wh);
  },
  inventory(x, y, f) { // 盤查測站：觀測塔＋儀表板（數字閃動）
    ell(x + 2, y + 2, 9, 2, C.shadow); for (let j = 0; j < 20; j++) { rect(x - 3 + Math.floor(j / 7), y - j, 1, 1, C.st4); rect(x + 3 - Math.floor(j / 7), y - j, 1, 1, C.st4); if (j % 5 === 0) line(x - 3 + Math.floor(j / 7), y - j, x + 3 - Math.floor(j / 7), y - j, C.st2); }
    rect(x - 4, y - 25, 9, 5, C.wh); rect(x - 3, y - 24, 7, 3, C.blk); for (let i = 0; i < 3; i++) rect(x - 2 + i * 2, y - 23 - ((f + i) % 2), 1, 1 + ((f + i) % 2), C.acc);
    line(x, y - 25, x, y - 30, C.st4); const s = f % 4; ell(x, y - 31, 2 + (s >> 1), 1, 'rgba(126,240,220,.5)');
    rect(x + 6, y - 6, 8, 7, C.d3); for (let j = 0; j < 4; j++) rect(x + 5 + j, y - 10 + j, 10 - j * 2, 1, C.wd3); rect(x + 9, y - 3, 2, 4, C.wd1);
  },
  footprint(x, y) { // 足跡森林：巨木＋發光腳印小徑
    tree(x, y + 2, 1.8); for (let i = 0; i < 4; i++) { const fx = x - 12 + i * 4, fy = y + 8 - (i % 2) * 2; rect(fx, fy, 2, 1, C.acc); px(fx, fy - 1, C.acc); }
  },
  energy(x, y, f) { // 節能工坊：廠房＋熱回收管＋白色水蒸氣＋屋頂太陽能
    ell(x + 2, y + 2, 15, 3, C.shadow); rect(x - 13, y - 10, 22, 11, C.cn3); rect(x - 13, y, 22, 1, C.cn2);
    for (let i = -11; i < 8; i += 4) rect(x + i, y - 7, 2, 3, C.warm);
    for (let j = 0; j < 4; j++) rect(x - 13 + j, y - 14 + j, 22, 1, j === 0 ? C.sol2 : C.sol);
    rect(x + 11, y - 22, 4, 23, C.st2); rect(x + 11, y - 22, 4, 2, C.g2); line(x + 9, y - 6, x + 11, y - 6, C.gold); line(x + 9, y - 4, x + 11, y - 4, C.gold);
    for (let k = 0; k < 3; k++) { const s = (f + k * 2) % 6; ell(x + 13 + (s >> 1), y - 25 - s * 2, 2 + (s >> 2), 1 + (s >> 2), `rgba(240,244,240,${0.8 - s * 0.12})`); }
  },
  renew(x, y, f) { // 風光高原：三座風機（轉）＋太陽能陣列
    turbine(x - 9, y + 2, f * 0.35); turbine(x + 2, y - 3, f * 0.35 + 1); turbine(x + 12, y + 3, f * 0.35 + 2);
    for (let i = 0; i < 3; i++) solar(x - 8 + i * 10, y + 12);
  },
  carbon(x, y, f) { // 碳匯濕地：紅樹林＋木棧道＋白鷺
    mangrove(x - 6, y); mangrove(x + 5, y - 2); mangrove(x, y + 4);
    rect(x - 14, y + 8, 28, 2, C.wd3); for (let i = -13; i < 14; i += 4) rect(x + i, y + 10, 1, 2, C.wd1);
    const b = Math.round(Math.sin(f / 2) * 2); rect(x + 9 + b, y - 10, 4, 2, C.wh); px(x + 13 + b, y - 11, C.wh); px(x + 14 + b, y - 11, C.gold); line(x + 10 + b, y - 8, x + 10 + b, y - 5, C.blk);
  },
};

// ---- 靜態層 ----
const DECOR = [];
(() => {
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const id = at(x, y); if (!id || ROAD.has(y * TW + x) || isRiver(x, y) || isPond(x, y) || isBay(x, y)) continue;
    if ([[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => at(x + a, y + b) === null)) continue;
    const L = LAYOUT[id]; if (Math.abs(x - L.sx) < 4 && y - L.sy < 3 && L.sy - y < 6) continue;
    const X = x * T + 4, Y = y * T + 7, h = hash(x * 3, y * 5);
    if (id === 'footprint' && (x + y) % 2 === 0 && h > 0.15) DECOR.push({ y: Y, d: () => (h > 0.6 ? tree(X, Y, h > 0.85 ? 1.15 : 0.9) : pine(X, Y)) });
    else if (id === 'renew' && h > 0.9) DECOR.push({ y: Y, d: () => rock(X, Y) });
    else if (id === 'renew' && h > 0.82 && y > 6) DECOR.push({ y: Y, d: () => solar(X, Y) });
    else if (id === 'carbon' && h > 0.8) DECOR.push({ y: Y, d: () => mangrove(X, Y) });
    else if ((id === 'climate' || id === 'disclose') && h > 0.92) DECOR.push({ y: Y, d: () => tree(X, Y, 0.8) });
    else if (id === 'inventory' && h > 0.88) DECOR.push({ y: Y, d: () => tree(X, Y, 0.85) });
    else if (id === 'energy' && h > 0.9) DECOR.push({ y: Y, d: () => { rect(X - 3, Y - 6, 6, 6, C.cn3); rect(X - 2, Y - 4, 1, 1, C.warm); rect(X + 1, Y - 4, 1, 1, C.warm); } });
  }
  DECOR.sort((a, b) => a.y - b.y);
})();
const TURBS = []; // 高原上散落的風機（會轉）
for (let i = 0; i < 6; i++) { const x = 15 + Math.round(hash(i, 41) * 18), y = 4 + Math.round(hash(i, 43) * 9); if (at(x, y) === 'renew' && Math.hypot(x - LAYOUT.renew.sx, y - LAYOUT.renew.sy) > 4) TURBS.push([x * T + 4, y * T + 7, i]); }
function hero(x, y, bob) { y -= bob; ell(x, y + 1, 4, 1, C.shadow);
  rect(x - 2, y - 3, 2, 3, C.wd1); rect(x + 1, y - 3, 2, 3, C.wd1); rect(x - 3, y - 9, 7, 6, '#3b8a5c'); rect(x - 3, y - 5, 7, 1, C.wd1);
  rect(x - 3, y - 15, 7, 6, '#f3c9a0'); rect(x - 3, y - 16, 7, 3, C.wd2); rect(x - 4, y - 15, 1, 3, C.wd2); px(x - 1, y - 12, C.blk); px(x + 2, y - 12, C.blk);
  rect(x - 4, y - 9, 1, 4, '#f3c9a0'); rect(x + 4, y - 9, 1, 4, '#f3c9a0'); }
function mark(x, y) { rect(x - 3, y - 11, 7, 12, C.blk); rect(x - 2, y - 10, 5, 7, C.gold); rect(x - 2, y - 2, 5, 2, C.gold); rect(x - 1, y - 9, 3, 5, '#fff3b0'); }
const ANIM = new Set(['disclose', 'inventory', 'energy', 'renew', 'carbon', 'climate']); // 地標有動畫的區（每幀重畫）

export function makeMap(canvas) {
  canvas.width = TW * T; canvas.height = TH * T;
  const ctx = canvas.getContext('2d'), base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
  let key = '';
  const OCEAN = []; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (!at(x, y)) OCEAN.push([x, y]);
  function buildBase(open) {
    g = base.getContext('2d');
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) tile(x, y);
    for (const d of DECOR) d.d();
    for (const [id, L] of Object.entries(LAYOUT)) if (!ANIM.has(id)) LM[id](L.sx * T + 4, L.sy * T + 4, 0);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const id = at(x, y); if (!id || open[id]) continue; // 迷霧
      const X = x * T, Y = y * T; g.fillStyle = 'rgba(30,36,60,.62)'; g.fillRect(X, Y, T, T);
      g.fillStyle = 'rgba(200,214,230,.30)'; for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if (fbm((X + i) / 3, (Y + j) / 3) > 0.62) g.fillRect(X + i, Y + j, 1, 1); }
  }
  return {
    draw({ open, marks, hero: heroId, frame }) {
      const k = JSON.stringify(open); if (k !== key) { key = k; buildBase(open); }
      g = ctx; ctx.drawImage(base, 0, 0);
      for (const [x, y] of OCEAN) if (hash(x, y + frame) > 0.985) rect(x * T + 2, y * T + 4, 4, 1, C.foam);
      for (let y = 0; y < TH; y++) { const x = Math.round(riverX(y)); if (isRiver(x, y) && (y + frame) % 4 === 0) rect(x * T + 3, y * T + 4, 3, 1, C.w3); }
      if (open.renew) for (const [x, y, i] of TURBS) turbine(x, y, frame * 0.35 + i);
      for (const id of ANIM) { const L = LAYOUT[id], X = L.sx * T + 4, Y = L.sy * T + 4; LM[id](X, Y, open[id] ? frame : 0);
        if (!open[id]) { g.fillStyle = 'rgba(30,36,60,.55)'; g.fillRect(X - 22, Y - 38, 44, 54); } }
      const bob = frame % 2;
      for (const id of marks) { const L = LAYOUT[id]; if (L) mark(L.sx * T + 18, L.sy * T - 26 - bob); }
      const H = LAYOUT[heroId] || LAYOUT.climate; hero(H.sx * T - 14, H.sy * T + 8, bob);
    },
    regionAt(clientX, clientY) { const b = canvas.getBoundingClientRect(); return at(Math.floor((clientX - b.left) / b.width * TW), Math.floor((clientY - b.top) / b.height * TH)); },
    tagPos(id) { const L = LAYOUT[id]; return { left: (L.sx * T + 4) / (TW * T) * 100, top: (L.sy * T + 14) / (TH * T) * 100 }; },
  };
}
