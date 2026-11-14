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
};
const pick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

// ---- 地形（設計座標）----
const det = (u, v) => (vn(u / 9, v / 9) - .5) * .28 + (vn(u / 4, v / 4) - .5) * .1;
const landE = (u, v) => 1 - Math.hypot((u - 138) / 104, (v - 142) / 108) + (fb(u, v) - .5) * .9 + det(u, v);
const landA = (u, v) => 1 - Math.hypot((u - 352) / 100, (v - 132) / 100) + (fb(u + 600, v + 300) - .5) * .9 + det(u + 300, v);
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
        const cu = Math.floor((u + 3) / 9), cv = Math.floor((v + 5) / 7), gu = (u + 3) % 9, gv = (v + 5) % 7, near = Math.hypot(u - 352, (v - 130) * 1.3) < 62;
        if (near && h > .06 && ((gu < .9 && hash(cu, cv * 3 + 1) > .5) || (gv < .9 && hash(cu * 5 + 2, cv) > .5))) c = c.map((ch, j) => ch * .55 + P.acc[j] * .45); }
    }
    put(x, y, c);
  }
  // ---- 精靈（設計座標放置，畫在螢幕座標；依螢幕 y 排序）----
  const disc = (cx, cy, r, ramp) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.hypot(x, y);
    if (d > r + .4) { if (d < r + 1.3) put(cx + x, cy + y, ramp[0]); continue; } put(cx + x, cy + y, pick(ramp, .62 - (x + y) / (r * 2.4) - d / r * .15)); } };
  const shadow = (cx, cy, rx, ry, f = .6) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) mul(cx + x, cy + y, f); };
  const box = (x0, y0, w, h, win) => { const ramp = P.slate;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, pick(ramp, .55 - y / h * .25 + (x === 0 ? .1 : 0)));
    for (let y = 0; y < h; y++) for (let x = 0; x < Math.ceil(w / 3); x++) put(x0 + w + x, y0 + y - x, ramp[1]);
    for (let x = 0; x < w + Math.ceil(w / 3); x++) put(x0 + x, y0 - 1 - Math.max(0, x - w + 1), ramp[ramp.length - 1]);
    if (win) for (let y = 2; y < h - 2; y += 3) for (let x = 1; x < w - 1; x += 2) if (hash(x0 + x, y0 + y) > .35) WIN.push([x0 + x, y0 + y, hash(x, y0 + y) > .8]); };
  const WIN = [], TURB = [], items = [], at = (u, v, f) => { const [x, y] = toS(u, v); items.push({ y, f: () => f(Math.round(x), Math.round(y)) }); };
  for (let v = 70; v < 250; v += 3.2) for (let u = 30; u < 240; u += 3.4) { // 森林
    const ju = u + (hash(u | 0, v | 0) - .5) * 3, jv = v + (hash(v | 0, u | 0) - .5) * 3, h = Math.max(landE(ju, jv), landA(ju, jv)) - .08;
    if (h > .05 && mtn(ju, jv) < .55 && jv > 52 && landE(ju, jv) > landA(ju, jv) && fb(ju + 99, jv) > .55 && Math.abs(ju - riverU(jv)) > 4 && hash(ju | 0, jv | 0) > .25)
      at(ju, jv, (x, y) => { const r = Math.round(2 + hash(ju | 0, 3) * 1.5); shadow(x + 2, y + 1, r + 1, Math.max(1, Math.round(r * .6)), .55); put(x, y + r, P.wood[1]); disc(x, y - Math.round(r * .3), r, P.forest); });
  }
  [[48, 120], [44, 140], [52, 160], [62, 182], [58, 100]].forEach(([u, v], i) => at(u, v, (x, y) => { shadow(x + 3, y + 1, 4, 1, .6);
    for (let j = 0; j < 20; j++) { put(x, y - j, P.snow[2]); put(x + 1, y - j, P.snow[0]); } TURB.push([x, y - 20, i * 1.3]); }));
  at(160, 205, (x0, y0) => { for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const [x, y] = toS(146 + c * 8 - r * 2, 192 + r * 6); // 太陽能田
    shadow(x + 3, y + 2, 3, 1, .7); for (let j = 0; j < 6; j++) for (let k = 0; k < 3; k++) put(x + j + k, y - k, k === 2 ? P.slate[5] : P.slate[2 + (j % 2)]); } });
  at(140, 132, (x, y) => { shadow(x + 6, y + 3, 13, 5, .5); for (let j = 0; j < 14; j++) for (let k = -1; k <= 1; k++) put(x + k, y - j, P.wood[k > 0 ? 0 : 2]); // 生命之樹
    disc(x - 5, y - 16, 7, P.grass); disc(x + 6, y - 15, 6, P.grass); disc(x, y - 22, 9, P.grass); });
  [[96, 168], [102, 172], [92, 176], [124, 186]].forEach(([u, v]) => at(u, v, (x, y) => { shadow(x + 4, y + 1, 4, 2, .6); // 村落
    for (let j = 0; j < 4; j++) for (let k = 0; k < 5; k++) put(x + k, y - 4 + j, pick(P.sand, .7 - j * .1));
    for (let j = 0; j < 3; j++) for (let k = -j; k < 5 + j; k++) put(x + k, y - 7 + j, P.wood[j === 2 ? 0 : 2 - (j % 2)]); }));
  for (let i = 0; i < 70; i++) { const a = hash(i, 5) * 6.283, rr = Math.sqrt(hash(i, 9)) * 34, u = 352 + Math.cos(a) * rr * 1.3, v = 128 + Math.sin(a) * rr * .8; // 城市
    if (Math.max(landE(u, v), landA(u, v)) - .08 < .06 || landA(u, v) < landE(u, v)) continue;
    at(u, v, (x, y) => { const w = Math.round(3 + hash(i, 1) * 4), hh = Math.round(6 + (1 - rr / 34) * 18 * hash(i, 2) + 3); shadow(x + w, y + 1, w + 2, 2, .55); box(x, y - hh, w, hh, true); }); }
  at(352, 129, (x, y) => { shadow(x + 8, y + 2, 10, 2, .5); for (let j = 0; j < 40; j++) { const w = Math.max(1, Math.round((1 - j / 40) * 4)); // 中央尖塔
    for (let k = -w; k <= w; k++) put(x + k, y - j, pick(P.slate, .7 - k / w * .35 - j / 40 * .1)); } SPIRE.push([x, y - 42]); });
  at(380, 175, () => { for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const [x, y] = toS(372 + c * 8 + r * 3, 168 + r * 6); box(x, y, 5, 4, true); } }); // 伺服器農場
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
  for (const [x, y, warm] of M.WIN) if (hash(x * 7 + (frame >> 2), y) > .12) { g.fillStyle = warm ? '#ffd38a' : '#7ef0dc'; g.fillRect(x, y, 1, 1); }
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
