// 世界地圖（首頁）：兩塊大陸＝地球永續國（左／上）與 AI 智能國（右／下）。
// 地形是固定種子的程序繪製（風格板 A），設計座標 480×270；手機直式時把座標轉置，兩國改成上下排。
// 靜態層只畫一次；每幀只疊雲、風機、城市燈火、浪花。光影由 fx.js 疊上。
import { mountFx } from './fx.js';

const $ = (s) => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DW = 480, DH = 270;

// ---- 雜訊 ----
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
const fb = (u, v) => vn(u / 48, v / 48) * .5 + vn(u / 24, v / 24) * .25 + vn(u / 12, v / 12) * .15 + vn(u / 6, v / 6) * .1;

// ---- 調色盤（色相偏移：暗部偏藍紫、亮部偏黃）----
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const R = (...a) => a.map(hx);
const P = {
  grass: R('#1d2f3a', '#244a3c', '#2f6a41', '#4a8a44', '#7aa84c', '#b5c865'), forest: R('#152434', '#1b3a37', '#24563a', '#3b7340', '#5f9446'),
  sand: R('#9a7a5c', '#c9a66e', '#e5cd93', '#f3e6bd'), rock: R('#2a2638', '#423c50', '#625a6c', '#8a8290', '#b6aeb0'), snow: R('#8fa6c0', '#c3d4e2', '#eef3f2'),
  water: R('#0b1430', '#10213f', '#163256', '#1d4870', '#29638c', '#3c86a6', '#5aaab8'), foam: hx('#d6efe6'),
  slate: R('#1a1c32', '#252a48', '#33405f', '#4a5d7e', '#6d86a4', '#9cb3c8'), crys: R('#231c40', '#3b2f63', '#5a4a8a', '#8a7cb8', '#c8bfe6'),
  acc: hx('#7ef0dc'), warm: hx('#ffd38a'), wood: R('#3a2420', '#5c3a28', '#8a5a36'), cloud: R('#a9b6cc', '#d4dde8', '#f2f4f0'),
  spire: R('#1b5a5a', '#2fa8a0', '#7ef0dc', '#e8fff8'),
  roofR: R('#4a2228', '#7a3430', '#a84c3c', '#d07a5a'), roofT: R('#1a3a44', '#265a5e', '#3a827a', '#62aa94'), wall: R('#8a8070', '#c4b89a', '#e8dcc0'),
  towerC: R('#142a36', '#1e3c4a', '#2e5866', '#4e8490', '#94c8c8'), towerW: R('#221e38', '#342e50', '#4e4670', '#7c7298', '#b2a8c6'), tower: R('#181e3a', '#242e52', '#364670', '#56709a', '#94b0d0'), pv: R('#101a40', '#1c2e66', '#2e4c96', '#7fa6dc'), field: R('#5a6a2a', '#8a9a3a', '#c8b45a', '#4a7a3a'),
};
// 聚落（設計座標）：使用者 2026-11-19「全部建築物都蓋在一起不合理」→ 拆成幾個城鎮，放在平地（避開水晶山脈與河），之間用道路連起來
// 驗收第 1 輪：北鎮、南鎮原位置有樓蓋在水晶山脈上 → 移到平地，且每棟樓再逐一避開山脈
const TOWNS = [{ u: 318, v: 118, r: 24, top: 26, cap: true }, { u: 330, v: 60, r: 15, top: 15 }, { u: 402, v: 140, r: 15, top: 16 }, { u: 303, v: 174, r: 14, top: 13 }]; // 驗收第 2 輪：南鎮原址一半是山、像空停車場 → 移到平地（99% 可蓋）
const townD = (u, v, pad = 0) => Math.min(...TOWNS.map((t) => Math.hypot((u - t.u) / (t.r + pad), (v - t.v) / ((t.r + pad) * .7)))); // 離最近城鎮中心的相對距離（<1 在鎮內）
const DC = [392, 168]; // 資料中心園區（驗收第 2 輪：原位置冷卻塔落在海上，移到整片都是陸地處）
const ROADS = [[0, 1], [0, 2], [0, 3], [2, -1]]; // -1＝資料中心
const VILLS = [[88, 150], [96, 86], [186, 140]]; // 永續國村落：河邊、北方平原、東海岸
const SOLAR = [86, 124]; // 西側平原、風機旁（驗收第 3 輪：(150,185) 壓到山腳岩地；這裡橫式直式都不壓岩、海、河）
const nearAny = (u, v, pts, r) => pts.some(([a, b]) => Math.hypot(u - a, v - b) < r);
const pick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

// ---- 地形（設計座標）----
const det = (u, v) => (vn(u / 9, v / 9) - .5) * .28 + (vn(u / 4, v / 4) - .5) * .1;
// 兩國之間留一道海峽（使用者 2026-11-15：不要緊貼，要有好幾個國家的感覺）：越過中線就快速沉到海裡
const STRAIT = 245, GAP = 18;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wob = (v, k) => (vn(v / 13, k) - .5) * 30 + (vn(v / 5, k + 7) - .5) * 10; // 海峽兩岸跟著雜訊起伏，不是一條直線
const landE = (u, v) => 1 - Math.hypot((u - 138) / 104, (v - 142) / 108) + (fb(u, v) - .5) * .9 + det(u, v) - sm((u - (STRAIT - GAP - 34 + wob(v, 11))) / 46) * 1.3;
const landA = (u, v) => 1 - Math.hypot((u - 352) / 100, (v - 132) / 100) + (fb(u + 600, v + 300) - .5) * .9 + det(u + 300, v) - sm(((STRAIT + GAP + 34 + wob(v, 23)) - u) / 46) * 1.3;
const mtn = (u, v) => fb(u * 1.6 + 40, v * 1.6 + 70);
const riverU = (v) => 112 + 10 * Math.sin(v / 15);
export const CENTER = { earth: [138, 142], ai: [352, 132] };

export function build(portrait) {
  const W = portrait ? DH : DW, H = portrait ? DW : DH;
  const toD = (x, y) => (portrait ? [y, x] : [x, y]); // 螢幕 → 設計座標
  const toS = (u, v) => (portrait ? [v, u] : [u, v]); // 設計 → 螢幕
  // 高度場先算好（含 1 格邊），光照用相鄰差分
  const GW = W + 2, GH = H + 2, HS = new Float32Array(GW * GH), HH = new Float32Array(GW * GH), SIDE = new Uint8Array(GW * GH), MM = new Float32Array(GW * GH);
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) { const [u, v] = toD(x, y), e = landE(u, v), a = landA(u, v), h = Math.max(e, a) - .08, i = (y + 1) * GW + x + 1;
    const m = mtn(u, v); HH[i] = h; SIDE[i] = e > a ? 1 : 2; MM[i] = m; HS[i] = h + m * (e > a ? .5 : .18) + vn(u / 3, v / 3) * (e > a ? .06 : .02); }
  const img = new ImageData(W, H), D = img.data;
  const put = (x, y, c, al = 1) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4;
    D[i] = D[i] * (1 - al) + c[0] * al; D[i + 1] = D[i + 1] * (1 - al) + c[1] * al; D[i + 2] = D[i + 2] * (1 - al) + c[2] * al; D[i + 3] = 255; };
  const mul = (x, y, f) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; D[i] = D[i] * f + 10 * (1 - f); D[i + 1] = D[i + 1] * f + 12 * (1 - f); D[i + 2] = D[i + 2] * f + 30 * (1 - f); };
  const mask = new Uint8Array(W * H); // 0 海、1 永續國、2 AI 國
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y + 1) * GW + x + 1, h = HH[i], [u, v] = toD(x, y), gx = HS[i - GW - 1] - HS[i + GW + 1];
    let c;
    if (h < 0) { const t = 1 - Math.min(1, -h / .3); c = pick(P.water, t * t * .95 + vn(u / 5, v / 3) * .08); if (h > -.025 && hash(x >> 1, y) > .35) c = P.foam; }
    else {
      const e = SIDE[i] === 1; mask[y * W + x] = SIDE[i];
      const M = MM[i] * Math.min(1, h * 3), lit = .5 + gx * (e ? 7 : 5) + (M - .45) * (e ? .5 : .2);
      if (h < .035) c = pick(P.sand, lit);
      else if (e) {
        if (M > .69 || v < 40 + (fb(u * 2, v * 2) - .5) * 40) c = pick(P.snow, lit);
        else if (M > .59) c = pick(P.rock, lit);
        else if (Math.abs(u - riverU(v)) < 1.6 && v > 70 && v < 225) c = pick(P.water, .75 + gx * 4);
        else c = pick(fb(u + 99, v) > .55 ? P.forest : P.grass, lit + (fb(u * 2, v * 2) - .5) * .25);
      } else if (M > .62) c = pick(P.crys, lit + (hash(u | 0, v | 0) > .97 ? .4 : 0));
      else { c = pick(P.slate, lit - .06); // 電路紋：城市周邊的短格線
        const cu = Math.floor((u + 3) / 9), cv = Math.floor((v + 5) / 7), gu = (u + 3) % 9, gv = (v + 5) % 7, near = TOWNS.some((t) => Math.hypot(u - t.u, (v - t.v) * 1.3) < t.r + 14);
        if (near && h > .06 && ((gu < .9 && hash(cu, cv * 3 + 1) > .5) || (gv < .9 && hash(cu * 5 + 2, cv) > .5))) c = c.map((ch, j) => ch * .55 + P.acc[j] * .45);
        const td = townD(u, v, 3); // 城鎮地面：深色鋪面＋街道格線，跟岩地分開；外圈抖點過渡，不是硬邊橢圓
        if (h > .06 && td < 1 && !(td > .75 && hash(x, y) < (td - .75) * 4)) c = td < .8 && ((u + 1) % 7 < 1 || (v + 1) % 3.6 < .8) ? P.slate[2] : P.slate[0]; }
    }
    put(x, y, c);
  }
  // 道路：AI 國聚落之間的磁浮軌道（發光細線，先畫在地上、樓房蓋在上面）；永續國村落之間的土路
  const road = (a, b, col, al, dash) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const nu = -(b[1] - a[1]) / n, nv = (b[0] - a[0]) / n; // 法線方向：路往旁邊彎，加一點雜訊，不是一條直線
    for (let k = 0; k <= n; k++) { const t = k / n, o = Math.sin(t * Math.PI) * 4 + (vn(t * 5, a[0]) - .5) * 5 * Math.sin(t * Math.PI), u = a[0] + (b[0] - a[0]) * t + nu * o, v = a[1] + (b[1] - a[1]) * t + nv * o;
      if ((dash && k % 4 === 3) || townD(u, v, 1) < 1) continue; const [x, y] = toS(u, v); put(x, y, col, al); } }; // 軌道進城就斷，不穿進樓群
  ROADS.forEach(([i, j]) => { const A = [TOWNS[i].u, TOWNS[i].v], B = j < 0 ? DC : [TOWNS[j].u, TOWNS[j].v]; road(A, B, P.warm, .5); }); // 軌道用金色，跟青色電路紋分得開（驗收第 1 輪）
  road(VILLS[0], VILLS[1], P.sand[1], .7, true); road(VILLS[0], SOLAR, P.sand[1], .7, true);
  // ---- 精靈（設計座標放置，畫在螢幕座標；依螢幕 y 排序）----
  const disc = (cx, cy, r, ramp) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.hypot(x, y);
    if (d > r + .4) { if (d < r + 1.3) put(cx + x, cy + y, ramp[0]); continue; } put(cx + x, cy + y, pick(ramp, .62 - (x + y) / (r * 2.4) - d / r * .15)); } };
  const shadow = (cx, cy, rx, ry, f = .6) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) mul(cx + x, cy + y, f); };
  // 樓房：正面（上亮下暗）、右側面、屋頂亮邊；ramp 換色讓樓不全是同一種灰藍；高樓加天線紅燈
  const box = (x0, y0, w, h, win, ramp = P.slate) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, x === 0 ? ramp[0] : pick(ramp, .7 - y / h * .3 + (x === 1 ? .12 : 0))); // 左緣一條深色輪廓，相鄰樓分得開
    for (let y = 0; y < h; y++) for (let x = 0; x < Math.ceil(w / 3); x++) put(x0 + w + x, y0 + y - x, ramp[1]);
    for (let x = 0; x < w + Math.ceil(w / 3); x++) put(x0 + x, y0 - 1 - Math.max(0, x - w + 1), ramp[3]); // 屋頂邊用次亮色，不要一排白尖角
    if (h > 9 && hash(x0, y0) > .55) for (let j = 2; j < 4; j++) for (let k = 1; k < 3; k++) put(x0 + k, y0 - j, ramp[2]); // 部分樓頂加機房小方塊，輪廓不整齊劃一
    if (h > 14) { for (let j = 2; j < 5; j++) put(x0 + (w >> 1), y0 - j, ramp[2]); WIN.push([x0 + (w >> 1), y0 - 5, 2]); }
    if (win) for (let y = 2; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) if (hash(x0 + x, y0 + y) > .3) WIN.push([x0 + x, y0 + y, hash(x, y0 + y) > .8 ? 1 : 0]); };
  // 資料中心廠房：長條矮房、屋頂散熱格柵、側面一排閃燈
  const hall = (x0, y0, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, pick(P.slate, .5 - y / h * .2));
    for (let x = 0; x < w + 2; x++) for (let k = 0; k < 3; k++) put(x0 + x + k, y0 - 1 - k, k === 2 ? P.slate[5] : P.slate[3]);
    for (let x = 2; x < w; x += 3) put(x0 + x + 1, y0 - 2, P.crys[1]);
    for (let x = 1; x < w - 1; x += 2) WIN.push([x0 + x, y0 + h - 2, hash(x0 + x, y0) > .7 ? 1 : 0]); };
  // 村屋：米白牆、斜屋頂（紅或青）、門、煙囪
  const house = (x, y, roof, big) => { const w = big ? 7 : 5, hw = 3;
    shadow(x + w - 1, y + 1, w - 1, 1, .6);
    for (let j = 0; j < hw; j++) for (let k = 0; k < w; k++) put(x + k, y - hw + j, pick(P.wall, .8 - j * .15 - (k === w - 1 ? .3 : 0)));
    put(x + 1, y - 1, P.wood[0]); put(x + 1, y - 2, P.wood[0]); if (big) put(x + 4, y - 2, P.warm);
    for (let j = 0; j < 3; j++) for (let k = -1 + j; k <= w - j; k++) put(x + k, y - hw - 1 - j, pick(roof, .75 - j * .12 - (k > w / 2 ? .25 : 0)));
    put(x + w - 2, y - hw - 3, P.rock[2]); put(x + w - 2, y - hw - 4, P.rock[3]); };
  // 田地：一小塊條紋（綠、黃交錯）
  const field = (x0, y0, w, h, s) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x - y, y0 + y, P.field[(y + s) % 2 ? (s % 2 ? 2 : 3) : 1], .85); };
  const WIN = [], TURB = [], items = [], at = (u, v, f) => { const [x, y] = toS(u, v); items.push({ y, f: () => f(Math.round(x), Math.round(y)) }); };
  for (let v = 70; v < 250; v += 3.2) for (let u = 30; u < 240; u += 3.4) { // 森林
    const ju = u + (hash(u | 0, v | 0) - .5) * 3, jv = v + (hash(v | 0, u | 0) - .5) * 3, h = Math.max(landE(ju, jv), landA(ju, jv)) - .08;
    if (h > .05 && mtn(ju, jv) < .55 && jv > 52 && landE(ju, jv) > landA(ju, jv) && fb(ju + 99, jv) > .55 && Math.abs(ju - riverU(jv)) > 4 && hash(ju | 0, jv | 0) > .25 && !nearAny(ju, jv, VILLS, 13) && !nearAny(ju, jv, [SOLAR], 22))
      at(ju, jv, (x, y) => { const r = Math.round(2 + hash(ju | 0, 3) * 1.5); shadow(x + 2, y + 1, r + 1, Math.max(1, Math.round(r * .6)), .55); put(x, y + r, P.wood[1]); disc(x, y - Math.round(r * .3), r, P.forest); });
  }
  [[48, 120], [44, 140], [52, 160], [62, 182], [58, 100]].forEach(([u, v], i) => at(u, v, (x, y) => { shadow(x + 3, y + 1, 4, 1, .6);
    for (let j = 0; j < 20; j++) { put(x, y - j, P.snow[2]); put(x + 1, y - j, P.snow[0]); } TURB.push([x, y - 20, i * 1.3]); }));
  at(SOLAR[0], SOLAR[1] - 8, () => { for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const [x, y] = toS(SOLAR[0] - 14 + c * 8 - r * 2, SOLAR[1] - 6 + r * 6); // 太陽能田：深藍板面＋格線＋上緣反光，下面有支架
    shadow(x + 4, y + 2, 4, 1, .65); put(x + 1, y + 1, P.rock[1]); put(x + 5, y + 1, P.rock[1]);
    for (let j = 0; j < 7; j++) for (let k = 0; k < 3; k++) put(x + j + k, y - k, k === 2 ? P.pv[3] : j % 3 === 2 ? P.pv[0] : P.pv[1 + (k & 1)]); } });
  at(140, 132, (x, y) => { shadow(x + 6, y + 3, 13, 5, .5); for (let j = 0; j < 14; j++) for (let k = -1; k <= 1; k++) put(x + k, y - j, P.wood[k > 0 ? 0 : 2]); // 生命之樹
    disc(x - 5, y - 16, 7, P.grass); disc(x + 6, y - 15, 6, P.grass); disc(x, y - 22, 9, P.grass); });
  VILLS.forEach(([cu, cv], n) => { // 村落：幾塊田＋3～4 間屋，散在村子中心附近
    for (let f = 0; f < 3; f++) { const fu = cu - 9 + f * 7 + (hash(n, f) - .5) * 4, fv = cv + 5 + (hash(f, n) - .5) * 4; at(fu, fv - 6, () => { const [x, y] = toS(fu, fv); field(x, y, 6, 3, n + f); }); }
    for (let k = 0; k < 4 - (n % 2); k++) { const hu = cu + (hash(n * 7 + k, 1) - .5) * 14, hv = cv + (hash(n * 7 + k, 2) - .5) * 7;
      at(hu, hv, (x, y) => house(x, y, hash(n, k + 3) > .5 ? P.roofR : P.roofT, k === 0)); } });
  TOWNS.forEach((t, n) => { // AI 國城鎮：格狀街區（樓寬 4～6、間距 7，每第三排空成大街），中心高、外圍低；首都中央有尖塔
    for (let du = -t.r; du <= t.r; du += 7) for (let dv = -t.r * .7; dv <= t.r * .7; dv += 3.6) {
      const col = Math.round(du / 7), row = Math.round(dv / 3.6); if (((row % 3) + 3) % 3 === 2 || hash(col * 7 + n, row * 3) > .88) continue; // 大街＋隨機空地，不排成條碼
      const u = t.u + du + Math.round((hash(col, row + n * 5) - .5) * 2), v = t.v + dv, d = Math.hypot(du / t.r, dv / (t.r * .7)) + hash(col, n * 17 + row) * .2, hl = Math.max(landE(u, v), landA(u, v)) - .08;
      if (d > 1 || hl < .06 || landA(u, v) < landE(u, v) || [0, 3, 6].some((k) => mtn(u + k, v) * Math.min(1, hl * 3) > .58) || (t.cap && Math.abs(du) < 7 && Math.abs(dv) < 4.5)) continue; // 首都中央留廣場給尖塔 // 不蓋在海、山脈上
      const w = 4 + Math.floor(hash(col * 3, row + n) * 2.99), hh = Math.round(4 + t.top * Math.pow(1 - Math.min(1, d), 1.2) * (.5 + .5 * hash(row, col + n))), q = hash(col + 11, row * 7 + n);
      at(u, v, (x, y) => { shadow(x + w, y + 1, w + 1, 1, .5); box(x, y - hh, w, hh, true, q > .85 ? P.towerC : q > .72 ? P.towerW : P.tower); }); } // 寬 4～6、高低錯落、少數樓換青／暖色
    if (t.cap) at(t.u, t.v, (x, y) => { shadow(x + 7, y + 2, 9, 2, .5); for (let j = 0; j < 3; j++) for (let k = -6 + j; k <= 6 - j; k++) put(x + k, y - j, pick(P.tower, .5 + j * .12 - k / 20)); // 首都尖塔：底座＋較粗的塔身，站在廣場中央不被擋
      for (let j = 3; j < 36; j++) { const w = Math.max(1, Math.round((1 - (j - 3) / 33) * 4)); for (let k = -w; k <= w; k++) put(x + k, y - j, pick(P.spire, .62 - k / w * .3 - j / 36 * .15)); if (j % 6 === 0) WIN.push([x, y - j, 0]); } SPIRE.push([x, y - 38]); }); });
  // 郊區（使用者 2026-11-19 看完驗收比對圖選「補郊區」）：城鎮外圍平地撒零星矮房，離鎮越遠越稀；不蓋在山脈、海、城鎮內與資料中心上
  const flatA = (u, v) => { const hl = Math.max(landE(u, v), landA(u, v)) - .08; return hl > .07 && landA(u, v) > landE(u, v) && [0, 3].every((k) => mtn(u + k, v) * Math.min(1, hl * 3) < .52); };
  for (let v = 30; v < 230; v += 5.5) for (let u = 270; u < 440; u += 7) {
    const ju = u + (hash(u | 0, v | 0) - .5) * 4, jv = v + (hash(v | 0, u | 0) - .5) * 3, td = townD(ju, jv, 0);
    if (td < 1.25 || td > 3.6 || Math.hypot(ju - DC[0], jv - DC[1]) < 20 || !flatA(ju, jv) || hash(ju | 0, (jv | 0) + 7) > 1.25 - td * .3) continue;
    const w = 3 + (hash(ju | 0, 3) > .6 ? 1 : 0), hh = 2 + Math.round(hash(jv | 0, 5) * 3);
    at(ju, jv, (x, y) => { shadow(x + w, y + 1, w, 1, .55); box(x, y - hh, w, hh, false, P.tower); if (hash(x, y) > .3) WIN.push([x + 1, y - hh + 1, hash(y, x) > .5 ? 1 : 0]); }); }
  // 軌道中繼天線：每條軌道中段一座細塔，頂端閃燈
  ROADS.forEach(([i, j]) => { const A = [TOWNS[i].u, TOWNS[i].v], B = j < 0 ? DC : [TOWNS[j].u, TOWNS[j].v], u = (A[0] + B[0]) / 2, v = (A[1] + B[1]) / 2 + 4;
    if (Math.max(landE(u, v), landA(u, v)) - .08 > .06 && townD(u, v, 2) > 1) at(u, v, (x, y) => { shadow(x + 1, y + 1, 2, 1, .6); for (let j2 = 0; j2 < 9; j2++) put(x, y - j2, P.slate[3]); put(x - 1, y - 6, P.slate[4]); put(x + 1, y - 6, P.slate[4]); WIN.push([x, y - 9, 2]); }); });
  at(DC[0], DC[1], () => { for (let r = 0; r < 3; r++) { const [x, y] = toS(DC[0] - 10 + r * 3, DC[1] - 8 + r * 5); shadow(x + 9, y + 1, 10, 1, .55); hall(x, y - 4, 16, 4); } // 資料中心：三棟廠房＋冷卻塔
    for (let c = 0; c < 2; c++) { const [x, y] = toS(DC[0] + 12 + c * 5, DC[1] - 4 + c * 3); shadow(x + 2, y + 1, 3, 1, .55);
      for (let j = 0; j < 6; j++) for (let k = -2; k <= 2; k++) put(x + k, y - j, pick(P.slate, .7 - k * .12 - (j > 3 ? .1 : 0)));
      for (let k = -1; k <= 1; k++) put(x + k, y - 6, P.cloud[1], .8); } });
  const SPIRE = [];
  items.sort((p, q) => p.y - q.y).forEach((it) => it.f());
  const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d').putImageData(img, 0, 0);
  // 雲：一張比畫面寬的雲圖，每幀往右平移；雲影另外一層
  const CW = W * 2, cloud = document.createElement('canvas'); cloud.width = CW; cloud.height = H;
  { const cg = cloud.getContext('2d'), ci = cg.createImageData(CW, H), cd = ci.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < CW; x++) { const xx = x % W, wrapT = x < W ? 0 : 1, [u, v] = toD(xx, y), uu = u + wrapT * 0; // 雲圖左右兩半相同，平移時無縫
      const c = fb(uu * 1.4 + 900, v * 2.2 + 400) - .2 - Math.abs((portrait ? u : v) - (portrait ? 240 : 130)) / 600; if (c <= .48) continue;
      const col = pick(P.cloud, (c - .48) * 9 - (fb(uu * 1.4 + 901, v * 2.2 + 399) - fb(uu * 1.4 + 899, v * 2.2 + 401)) * 6), i = (y * CW + x) * 4;
      cd[i] = col[0]; cd[i + 1] = col[1]; cd[i + 2] = col[2]; cd[i + 3] = 235; }
    cg.putImageData(ci, 0, 0); }
  // 國境光暈：各國陸地邊緣一圈，滑過時亮起
  const glow = [1, 2].map((s) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), id = g.createImageData(W, H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (mask[k] !== s) continue;
      if (mask[k - 1] !== s || mask[k + 1] !== s || mask[k - W] !== s || mask[k + W] !== s) { const i = k * 4; id.data[i] = 255; id.data[i + 1] = 222; id.data[i + 2] = 150; id.data[i + 3] = 255; } }
    g.putImageData(id, 0, 0); return c; });
  return { W, H, base, cloud, glow, mask, WIN, TURB, SPIRE, toS };
}

// ---- 頁面 ----
const COUNTRY = [
  { id: 'earth', side: 1, name: '地球永續國', en: 'TERRA', href: 'earth.html', key: 'earth-world', world: 'earth-world.json' },
  { id: 'ai', side: 2, name: 'AI 智能國', en: 'NOVA', href: 'ai.html', key: 'ipas-world', world: 'world.json' },
];
const progress = async (c) => { // 熟練幾則／全部幾則；還沒去過就回 null
  let st = null; try { st = JSON.parse(localStorage.getItem(c.key)); } catch {}
  try { const w = await (await fetch(c.world)).json(), all = w.regions.flatMap((r) => r.layers.flatMap((l) => l.notes));
    return { ok: all.filter((id) => st?.notes?.[id]?.s === 'ok').length, all: all.length, seen: !!st }; } catch { return null; }
};

let M = null, frame = 0, timer = 0, FX = null, portrait = null;
const cv = $('#cv'), wrap = $('#mapwrap'), g = cv.getContext('2d');
function draw() {
  g.drawImage(M.base, 0, 0);
  // 雲影＋雲
  const off = Math.round(frame * 0.6) % M.W;
  g.save(); g.globalAlpha = .28; g.globalCompositeOperation = 'multiply'; g.filter = 'brightness(0)';
  g.drawImage(M.cloud, -off + 6, 5); g.restore();
  g.drawImage(M.cloud, -off, 0);
  // 風機葉片
  for (const [x, y, a0] of M.TURB) { const a = a0 + frame * 0.35; for (let b = 0; b < 3; b++) { const t = a + b * 2.094; for (let r = 1; r < 11; r++) { g.fillStyle = '#eef3f2'; g.fillRect(Math.round(x + Math.cos(t) * r), Math.round(y + Math.sin(t) * r), 1, 1); } } g.fillStyle = '#423c50'; g.fillRect(x, y, 1, 1); }
  // 城市燈火：大多亮著，少數輪流閃
  for (const [x, y, k] of M.WIN) { // k：0 青色窗、1 暖色窗、2 高樓天線紅燈（慢閃）
    if (k === 2) { if ((frame + x) % 16 < 8) { g.fillStyle = '#ff6a5a'; g.fillRect(x, y, 1, 1); } continue; }
    if (hash(x * 7 + (frame >> 2), y) > .12) { g.fillStyle = k ? '#ffd38a' : '#7ef0dc'; g.fillRect(x, y, 1, 1); } }
  for (const [x, y] of M.SPIRE) { const p = (Math.sin(frame / 3) + 1) / 2; g.fillStyle = `rgba(126,240,220,${.5 + p * .5})`; g.fillRect(x - 1, y - 1, 3, 3); g.fillStyle = '#e8fff8'; g.fillRect(x, y, 1, 1); }
  FX.update();
}
function layout() {
  const pt = innerWidth < innerHeight * 0.9;
  if (pt !== portrait) { portrait = pt; M = build(pt); cv.width = M.W; cv.height = M.H;
    wrap.querySelectorAll('.fx').forEach((e) => e.remove()); FX?.stop(); FX = mountFx(wrap, cv, { motes: 30 });
    for (const c of COUNTRY) { const gl = $(`#glow-${c.id}`); gl.width = M.W; gl.height = M.H; gl.getContext('2d').drawImage(M.glow[c.side - 1], 0, 0); }
    placeTags(); draw(); }
  // 整張地圖放進視窗（多出來的邊是同色深海），像素放大用 CSS
  const s = Math.min(innerWidth / M.W, innerHeight / M.H);
  wrap.style.width = Math.ceil(M.W * s) + 'px'; wrap.style.height = Math.ceil(M.H * s) + 'px';
}
function placeTags() {
  for (const c of COUNTRY) { const b = $(`#tag-${c.id}`), [u, v] = CENTER[c.id], [x, y] = M.toS(u, v + (portrait ? 0 : 0)), dy = portrait ? 92 : 88;
    const [sx, sy] = portrait ? [x, y + (c.id === 'earth' ? dy : dy)] : [x, y + dy];
    b.style.left = (sx / M.W * 100) + '%'; b.style.top = (Math.min(sy, M.H - 24) / M.H * 100) + '%'; }
}
function hover(id) { for (const c of COUNTRY) { $(`#glow-${c.id}`).classList.toggle('on', c.id === id); $(`#tag-${c.id}`).classList.toggle('on', c.id === id); } }
function enter(c) {
  if (RM) { location.href = c.href; return; }
  const [u, v] = CENTER[c.id], [x, y] = M.toS(u, v);
  wrap.style.transformOrigin = `${x / M.W * 100}% ${y / M.H * 100}%`; document.body.classList.add('going');
  setTimeout(() => { location.href = c.href; }, 650);
}
const sideAt = (e) => { const b = cv.getBoundingClientRect(), x = Math.floor((e.clientX - b.left) / b.width * M.W), y = Math.floor((e.clientY - b.top) / b.height * M.H);
  const s = M.mask[y * M.W + x]; return COUNTRY.find((c) => c.side === s); };
cv.onmousemove = (e) => { const c = sideAt(e); hover(c?.id); cv.style.cursor = c ? 'pointer' : 'default'; };
cv.onmouseleave = () => hover(null);
cv.onclick = (e) => { const c = sideAt(e); if (c) enter(c); };
for (const c of COUNTRY) { const b = $(`#tag-${c.id}`); b.onclick = () => enter(c); b.onmouseenter = b.onfocus = () => hover(c.id); b.onmouseleave = b.onblur = () => hover(null);
  progress(c).then((p) => { b.querySelector('.pg').textContent = !p ? c.en : p.seen ? `${c.en}・熟練 ${p.ok} / ${p.all}` : `${c.en}・${p.all} 則知識點`; }); }
addEventListener('pageshow', (e) => { if (e.persisted) document.body.classList.remove('going'); }); // 按返回鍵回來時把推鏡狀態還原
layout(); addEventListener('resize', layout);
if (!RM) timer = setInterval(() => { frame++; draw(); }, 125);
