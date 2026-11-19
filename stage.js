// 對話小劇場（使用者 2026-11-15：對話要搭配示意畫面，像敘事型教學影片，不要聲音）。
// 2026-11-16 換成俯視角 RPG 像素圖塊（使用者選樣張 B）：每區一張圖塊拼的背景、Kenney 人物（待機 2 格＋說話 2 格）、
// 道具查 sprite 表（emoji → 格子）；表上沒有的道具退回 emoji 畫法。素材在 assets/pixel/，由 06_設計稿/舞台美術/build_stage.py 產生。
// 畫布是邏輯 160×60，一個邏輯像素＝整數個螢幕像素（不准非整數縮放，不然像素會糊）。
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
const T = 16, SW = 160, SH = 120; // 背景圖是 160×120；舞台平常 160×60（露出背景下半），手機會依空間調寬高
/* <sprites> 由 06_設計稿/舞台美術/build_stage.py 產生，別手改 */
const PROPS = {'🎯': 0, '🌳': 1, '🌲': 2, '🧪': 3, '🐄': 4, '🪨': 5, '🔑': 6, '🍄': 7, '🌻': 8, '🌽': 9, '🥕': 10, '🐔': 11, '🐑': 12, '🧱': 13, '🪓': 14, '⛏️': 15, '🔨': 16, '🏹': 17, '🗝️': 18, '💣': 19, '🍅': 20, '🌾': 21, '🪵': 22, '🗡️': 23, '⚔️': 24, '💀': 25, '🪧': 26, '🍯': 27, '🛢': 28, '🌱': 29, '🪙': 30, '📜': 31, '🏭': 32, '💰': 33, '❓': 34, '⚡': 35, '☀️': 36, '🌍': 37, '🌐': 38, '🏛️': 39, '🏦': 40, '🌬️': 41, '💨': 42, '📈': 43, '📉': 44, '📊': 45, '🛡️': 46, '📰': 47, '💸': 48, '🚢': 49, '⚖️': 50, '📦': 51, '📅': 52, '🌊': 53, '⛽': 54, '🛢️': 55, '🕐': 56, '✅': 57, '❌': 58, '✖️': 59, '➕': 60, '📋': 61, '🌡️': 62, '🧺': 63, '🤝': 64, '👷': 65, '🏢': 66, '🌙': 67, '☢️': 68, '🔥': 69, '🏠': 70, '🔬': 71, '🔋': 72, '🚩': 73, '⚠️': 74, '🔄': 75, '🔁': 76, '🤖': 77, '🔍': 78, '🔎': 79, '📝': 80, '🔧': 81, '📏': 82, '🔢': 83, '🧠': 84, '📄': 85, '🏷️': 86, '🧩': 87, '💬': 88, '🔒': 89, '📚': 90, '✂️': 91, '📍': 92, '🔌': 93, '⏳': 94, '🔗': 95, '🖼️': 96, '👀': 97, '👤': 98, '👥': 99, '📷': 100, '🧮': 101, '✍️': 102, '🔤': 103, '⏱️': 104, '🗑️': 105, '💻': 106, '🖥️': 107, '🧾': 108, '🛒': 109, '💧': 110, '📐': 111, '🎲': 112, '🚀': 113, '💳': 114, '🕳️': 115, '➡️': 116, '🗺️': 117, '⚙️': 118, '📖': 119, '🔲': 120, '🔀': 121, '💾': 122, '🗂️': 123, '❄️': 124, '📥': 125, '🚪': 126, '🏆': 127, '🔐': 128, '📘': 129, '🧊': 130, '🍵': 131, '🎭': 132, '🚫': 133, '🆚': 134, '🧭': 135, '➗': 136, '⏰': 137, '🐢': 138, '☁️': 139, '📱': 140, '🐱': 141, '🌀': 142, '📁': 143, '💡': 144, '📣': 145, '🏗️': 146, '🗄️': 147, '📡': 148, '🛠️': 149, '➖': 150, '🏥': 151, '🧹': 152, '🗜️': 153, '🙈': 154, '🎓': 155, '🎫': 156, '🏅': 157, '📑': 158, '🌏': 159, '🔮': 160, '🪟': 161, '🧑': 162, '🧑‍💼': 163, '🆕': 164, '🔓': 165, '🎨': 166, '📤': 167, '🔔': 168, '🎬': 169, '🌫️': 170, '+': 171, '🌿': 172};
const ACTORS = {me: 0, climate: 1, disclose: 2, inventory: 3, footprint: 4, energy: 5, renew: 6, carbon: 7, plain: 8, forest: 9, valley: 10, fort: 11, mount: 12, sea: 13, capital: 14, claude: 15};
const SCENES = new Set(['climate', 'disclose', 'inventory', 'footprint', 'energy', 'renew', 'carbon', 'plain', 'forest', 'valley', 'fort', 'mount', 'sea', 'capital', 'claude']);
const GLYPHS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~±²³·¹×÷αβλ—…⁰₀₁₂₃₄₅₆₇₈₉→−≈≤≥、。「」一七三上下乘九二五以份位例個倍倫假價億元克全兩八公六分列別到則前力加化十千升卜原及口只名向含告品單器噸四型報場墓增墳多夜大天失子字學室家小尺層差巴市幅年幾店度式張很後成或戰持損搖數料新方日是時普暖更最會月期杯松條業標機欄次步歲每比毫氣沼法淨減源準溫澤烷無煤燃版瓦瓩產甲略疇百的碳示秒種第筆範籃總美習股能至萬虛行西設貝資起超距轉進過道配量鍵鐘門間關零電面項類體高％（），：～", GW = "eeghhihegggieheihghhhhhhhheeihihiihhihhiiehhhkiihihhiiikhihgiggheggggggggeegeiggggfgfggkgggigihiffheiknnnnnffeffffffffninnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn";
/* </sprites> */
const THEME = { // 還沒有圖塊背景的區域：天空、地面兩色
  climate: ['#79a7e8', '#84c669'], disclose: ['#79a7e8', '#c0cbdc'], inventory: ['#99d8f8', '#84c669'], footprint: ['#79a7e8', '#4e974c'],
  energy: ['#8b9bb4', '#5a6988'], renew: ['#99d8f8', '#c6e58d'], carbon: ['#79a7e8', '#4e974c'], plain: ['#99d8f8', '#84c669'],
  forest: ['#79a7e8', '#4e974c'], valley: ['#99d8f8', '#479f4a'], fort: ['#8b9bb4', '#5a6988'], mount: ['#8b9bb4', '#52607c'],
  sea: ['#79a7e8', '#79a7e8'], capital: ['#c0cbdc', '#eaa56c'], claude: ['#f28462', '#bd6c4a'],
};
const C = { ink: '#3f2631', navy: '#262b44', cream: '#ebeff8', gold: '#fdbe53', orange: '#e38628', green: '#84c669' };
const PIX = new URL('./assets/pixel/', import.meta.url);
const IMG = new Map();
function img(name, onload) { // 圖片只載一次；載好前先畫退路
  let i = IMG.get(name);
  if (!i) { i = new Image(); i.src = new URL(name, PIX).href; IMG.set(name, i); }
  if (onload && !ok(i)) i.addEventListener('load', onload, { once: true });
  return i;
}
const ok = (i) => i && i.complete && i.naturalWidth > 0;
const FONT = '12px "DotGothic16",monospace'; // 字表外的字才用（國旗代碼、看板缺字）
const EMO = new Map();
// 像素小國旗：28×18 的簡化旗樣，縮成 14×9 插在旗桿上
const FLAGS = {
  TW: ['#d6303d', (f) => { f('#2a4fa8', 0, 0, 14, 9); f('#fff', 5, 3, 4, 3); f('#fff', 6, 2, 2, 5); }],
  JP: ['#f6f2ea', (f, c) => { c('#d6303d', 14, 9, 5); }],
  DE: ['#111', (f) => { f('#d6303d', 0, 6, 28, 6); f('#f2c22e', 0, 12, 28, 6); }],
  BR: ['#2f9a4a', (f, c) => { f('#f2c22e', 8, 4, 12, 2); f('#f2c22e', 4, 6, 20, 6); f('#f2c22e', 8, 12, 12, 2); c('#2a4fa8', 14, 9, 4); }],
  AU: ['#1d3a8a', (f) => { f('#fff', 0, 4, 14, 2); f('#fff', 6, 0, 2, 10); f('#d6303d', 0, 4, 14, 2); f('#fff', 8, 12, 2, 2); f('#fff', 20, 6, 2, 2); f('#fff', 22, 12, 2, 2); }],
  TR: ['#d6303d', (f, c) => { c('#fff', 11, 9, 5); c('#d6303d', 13, 9, 4); f('#fff', 18, 8, 2, 2); }],
  AE: ['#fff', (f) => { f('#2f9a4a', 6, 0, 22, 6); f('#111', 6, 12, 22, 6); f('#d6303d', 0, 0, 6, 18); }],
  AZ: ['#2a4fa8', (f) => { f('#d6303d', 0, 6, 28, 6); f('#2f9a4a', 0, 12, 28, 6); f('#fff', 12, 8, 4, 2); }],
  EG: ['#d6303d', (f) => { f('#f6f2ea', 0, 6, 28, 6); f('#111', 0, 12, 28, 6); f('#c9a85c', 12, 8, 4, 2); }],
  EU: ['#2a4fa8', (f) => { for (let i = 0; i < 8; i++) f('#f2c22e', 14 + Math.round(6 * Math.sin(i * Math.PI / 4)) - 1, 9 - Math.round(6 * Math.cos(i * Math.PI / 4)) - 1, 2, 2); }],
  GB: ['#1d3a8a', (f) => { f('#fff', 0, 6, 28, 6); f('#fff', 10, 0, 8, 18); f('#d6303d', 0, 8, 28, 2); f('#d6303d', 12, 0, 4, 18); }],
  CN: ['#d6303d', (f) => { f('#f2c22e', 4, 4, 4, 4); f('#f2c22e', 10, 2, 2, 2); f('#f2c22e', 12, 6, 2, 2); }],
  ES: ['#c0392b', (f) => { f('#f2c22e', 0, 4, 28, 10); }],
  US: ['#f6f2ea', (f) => { for (let i = 0; i < 18; i += 4) f('#d6303d', 0, i, 28, 2); f('#1d3a8a', 0, 0, 12, 10); }],
};
function flag(x, code) { // 16×16：旗桿＋14×9 旗面
  const F = FLAGS[code], o = document.createElement('canvas'); o.width = 28; o.height = 18; const y = o.getContext('2d');
  y.fillStyle = F ? F[0] : C.cream; y.fillRect(0, 0, 28, 18);
  if (F) F[1]((col, a, b, w, hh) => { y.fillStyle = col; y.fillRect(a, b, w, hh); }, (col, cx, cy, rr) => { y.fillStyle = col; y.beginPath(); y.arc(cx, cy, rr, 0, 7); y.fill(); });
  x.fillStyle = C.ink; x.fillRect(1, 1, 3, 15); x.fillRect(3, 2, 13, 11);
  x.fillStyle = '#bd6c4a'; x.fillRect(2, 2, 1, 14);
  x.imageSmoothingEnabled = false; x.drawImage(o, 0, 0, 28, 18, 3, 3, 12, 9);
  if (!F) { x.fillStyle = C.ink; x.font = FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(code, 9, 8); crisp(x, 16, 16); }
}
function crisp(x, w, h) { // 文字與 emoji 的半透明邊一律切成全有或全無，放大後才不會糊
  const d = x.getImageData(0, 0, w, h), a = d.data;
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 110 ? 255 : 0;
  x.putImageData(d, 0, 0);
}
function emoji(e) { // 退路：sprite 表沒有的道具，emoji 畫成 16×16 小圖
  if (EMO.has(e)) return EMO.get(e);
  const c = document.createElement('canvas'); c.width = c.height = T; const x = c.getContext('2d');
  const cp = [...e].map((ch) => ch.codePointAt(0));
  if (cp.length === 2 && cp.every((v) => v >= 0x1F1E6 && v <= 0x1F1FF)) flag(x, cp.map((v) => String.fromCharCode(v - 0x1F1E6 + 65)).join('')); // Windows 沒有國旗 emoji
  else { x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '14px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.fillText(e, 8, 9); crisp(x, T, T); }
  EMO.set(e, c); return c;
}
const TXT = new Map();
function text(s, color) { // 看板字：俐方體字表（glyphs.png，build_stage.py 預先畫好）逐字貼；字表沒有的字退回系統字再切邊
  const atlas = img('glyphs.png'), k = s + ok(atlas); if (TXT.has(k)) return TXT.get(k);
  const c = document.createElement('canvas'), x = c.getContext('2d'), chs = [...s];
  const wOf = (ch) => { const i = GLYPHS.indexOf(ch); if (i >= 0 && ok(atlas)) return GW.charCodeAt(i) - 97; x.font = FONT; return Math.ceil(x.measureText(ch).width); };
  c.width = Math.max(1, chs.reduce((a, ch) => a + wOf(ch), 0)); c.height = 14;
  let px = 0;
  for (const ch of chs) {
    const i = GLYPHS.indexOf(ch), w = wOf(ch);
    if (i >= 0 && ok(atlas)) x.drawImage(atlas, (i % 32) * 13, Math.floor(i / 32) * 14, w, 14, px, 0, w, 14);
    else { const o = document.createElement('canvas'), y = o.getContext('2d'); o.width = w; o.height = 14; y.font = FONT; y.fillStyle = color; y.textBaseline = 'top'; y.fillText(ch, 0, 1); crisp(y, w, 14); x.drawImage(o, px, 0); }
    px += w;
  }
  if (TXT.size > 200) TXT.clear(); TXT.set(k, c); return c;
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
  const box = document.createElement('div'); box.className = 'lk-stage'; box.setAttribute('aria-hidden', 'true');
  let sc = parse(''), t0 = 0, speaker = 'npc', meX = SW + 12, raf = 0, stopped = false;
  let W = SW, H = 60, GROUND = H - 8, TOP = 0; // TOP：舞台長高時，看板與記號跟著往下，貼近道具
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; box.append(cv);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  // 整數倍放大：一個邏輯像素＝k 個裝置像素。寬螢幕可以多放大一級（最多超出容器 4%），手機一律往下取整，免得橫捲
  const fit = () => {
    const dpr = devicePixelRatio || 1, avail = (box.clientWidth - 4) * dpr; if (avail <= 0) return;
    let k, w = SW, hgt = 60;
    if (innerWidth >= 900) { k = Math.max(1, Math.floor(avail / SW)); if ((k + 1) * SW <= avail * 1.04) k++; }
    else { // 手機：寬度在 136～160 間挑，讓倍率吃滿卡片寬；高度吃掉「下一張」按鈕下面的空白（最多 120）
      k = Math.max(1, Math.floor(avail / 136)); w = Math.min(SW, Math.floor(avail / k / 2) * 2);
      cv.style.height = `${k * 60 / dpr}px`; const nx = document.getElementById('next');
      if (nx) hgt = Math.max(60, Math.min(SH, 60 + Math.floor((innerHeight - nx.getBoundingClientRect().bottom - 12) * dpr / k)));
    }
    if (w !== W || hgt !== H) { W = w; H = hgt; GROUND = H - 8; TOP = H - 60; cv.width = W; cv.height = H; g.imageSmoothingEnabled = false; if (meX < W + 12) meX = Math.min(meX, W - 14); redraw(); }
    cv.style.width = `${k * W / dpr}px`; cv.style.height = `${k * H / dpr}px`;
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; if (ro) ro.observe(box);
  const redraw = () => { if (still && t0) { frame(performance.now()); cancelAnimationFrame(raf); } }; // 動畫關掉時只畫一張，圖載好要補畫
  const sheet = img('props.png', redraw), actors = img('actors.png', redraw), scene = SCENES.has(region) ? img(`scene-${region}.png`, redraw) : null;
  img('glyphs.png', redraw);
  const [sky, grd] = THEME[region] || THEME.climate;
  const P = []; // 粒子
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  function bg() {
    if (ok(scene)) return void g.drawImage(scene, (SW - W) / 2, SH - H, W, H, 0, 0, W, H);
    g.fillStyle = sky; g.fillRect(0, 0, W, TOP + 38); g.fillStyle = grd; g.fillRect(0, TOP + 38, W, 22); g.fillStyle = 'rgba(38,43,68,.25)'; g.fillRect(0, TOP + 38, W, 1);
  }
  function prop(e, x, y) {
    const n = PROPS[e];
    if (n != null && ok(sheet)) g.drawImage(sheet, (n % 16) * T, (n >> 4) * T, T, T, x, y, T, T);
    else g.drawImage(emoji(e), x, y);
  }
  function actor(who, x, talking, t, flip) {
    const n = ACTORS[who === 'me' ? 'me' : region] ?? ACTORS.climate, f = talking ? 2 + (Math.floor(t / 160) % 2) : Math.floor(t / 600) % 2;
    g.save(); if (flip) { g.translate(x * 2, 0); g.scale(-1, 1); }
    if (ok(actors)) g.drawImage(actors, f * T, n * T, T, T, x - 8, GROUND - T, T, T);
    else g.drawImage(who === 'me' ? meSprite : npcSprite, x - 8, GROUND - T, T, T);
    g.restore();
    if (talking) { // 頭上的對話泡泡，三個點輪流亮
      const by = GROUND - T - 9, bx = x - 5;
      g.fillStyle = C.ink; g.fillRect(bx - 1, by - 1, 13, 8); g.fillRect(bx + 4, by + 7, 3, 2);
      g.fillStyle = C.cream; g.fillRect(bx, by, 11, 6); g.fillRect(bx + 5, by + 6, 1, 1);
      const ph = Math.floor(t / 220) % 3; for (let d = 0; d < 3; d++) { g.fillStyle = d === ph ? C.ink : '#8b9bb4'; g.fillRect(bx + 2 + d * 3, by + 2, 2, 2); }
    }
  }
  const chart = () => sc.bar && sc.bar.length > 1 && sc.bar.length === sc.items.length; // 道具數＝長條數：每根長條頂端放對應道具
  function chevron(x, y, ph) { // 流程箭頭：白色 > 加墨色影子，往右一格一格走
    const pts = [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]], dx = ph % 2;
    g.fillStyle = C.ink; for (const [a, b] of pts) g.fillRect(x + a + dx, y + b + 1, 2, 1);
    g.fillStyle = C.cream; for (const [a, b] of pts) g.fillRect(x + a + dx, y + b, 2, 1);
  }
  function props(t) {
    const k = t - t0, n = sc.items.length; if (!n || chart()) return;
    const side = sc.bar || sc.tilt != null, span = side ? 60 : W - 48, cx = side ? Math.round(W * 0.325) : W / 2;
    const rows = n * T + (n - 1) * 2 > span ? 2 : 1, per = Math.ceil(n / rows);
    const gap = Math.max(0, Math.min(sc.flow ? 8 : 4, Math.floor((span - per * T) / Math.max(1, per - 1))));
    sc.items.forEach((e, i) => {
      const r = Math.floor(i / per), j = i - r * per, cnt = Math.min(per, n - r * per), x0 = Math.round(cx - (cnt * T + (cnt - 1) * gap) / 2);
      const a = ease((k - i * 140) / 320); if (a <= 0) return;
      const x = x0 + j * (T + gap), y = GROUND - T - (rows - 1 - r) * 18 - Math.round((1 - a) * 6);
      g.globalAlpha = a < 0.5 ? 0.5 : 1; prop(e, x, y); g.globalAlpha = 1;
      if (sc.flow && j < cnt - 1 && a >= 1 && gap >= 5) chevron(x + T + Math.floor((gap - 4) / 2), y + 5, Math.floor(k / 260));
    });
  }
  const COLS = [C.gold, '#43e1b3', '#79a7e8', C.orange, C.green];
  function bars(t) {
    const v = sc.bar; if (!v || !v.length) return; const k = t - t0, ch = chart(), mx = Math.max(...v.map(Math.abs), 1e-9);
    const bw = ch ? 10 : 8, gap = ch ? 14 : 4, total = v.length * bw + (v.length - 1) * gap, x0 = Math.round((sc.items.length && !ch ? W - 48 : W / 2) - total / 2), hmax = (ch ? 18 : 24) - (sc.n ? 6 : 0);
    v.forEach((val, i) => {
      const hgt = Math.max(1, Math.round(ease((k - i * 150) / 500) * hmax * Math.abs(val) / mx)), x = x0 + i * (bw + gap), top = GROUND - hgt;
      g.fillStyle = C.ink; g.fillRect(x - 1, top - 1, bw + 2, hgt + 1);
      g.fillStyle = COLS[i % 5]; g.fillRect(x, top, bw, hgt); g.fillStyle = 'rgba(235,239,248,.45)'; g.fillRect(x, top, 2, hgt);
      if (ch) prop(sc.items[i], x + bw / 2 - 8, top - T - 2);
    });
  }
  function balance(t) {
    if (sc.tilt == null) return; const k = t - t0, sl = ease(k / 600) * sc.tilt * 0.2, cx = sc.items.length ? W - 48 : W / 2, cy = GROUND - 22;
    g.fillStyle = C.ink; g.fillRect(cx - 2, cy - 1, 4, 23); g.fillRect(cx - 7, GROUND - 3, 14, 3); g.fillStyle = C.gold; g.fillRect(cx - 1, cy, 2, 21); g.fillRect(cx - 6, GROUND - 2, 12, 1);
    for (let dx = -20; dx <= 20; dx++) { const y = cy + Math.round(dx * sl); g.fillStyle = C.ink; g.fillRect(cx + dx, y - 1, 1, 4); g.fillStyle = C.gold; g.fillRect(cx + dx, y, 1, 2); }
    for (const s of [-1, 1]) {
      const px = cx + s * 19, py = cy + Math.round(s * 19 * sl);
      g.fillStyle = C.ink; g.fillRect(px, py + 2, 1, 5); g.fillRect(px - 6, py + 7, 13, 3);
      g.fillStyle = s < 0 ? C.orange : C.green; g.fillRect(px - 5, py + 8, 11, 1);
    }
  }
  function board(t) {
    if (!sc.n) return; const k = t - t0, m = /^([\d,.]+)(.*)$/.exec(sc.n);
    let txt = sc.n;
    if (m) { const num = +m[1].replace(/,/g, ''), dec = (m[1].split('.')[1] || '').length; txt = (num * ease(k / 900)).toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[2]; }
    const full = text(sc.n, C.cream), lines = full.width > W - 12 && txt.includes(' ') ? split(txt) : [txt]; // 太長就拆兩行
    const ws = lines.map((s) => text(s, C.cream)), w = Math.min(W - 4, Math.max(...ws.map((c) => c.width), lines.length > 1 ? 0 : full.width) + 8), hh = 13 * lines.length + 3;
    const x = Math.round(W / 2 - w / 2), y = TOP + (sc.items.length || sc.bar || sc.tilt != null ? 2 : 12);
    g.fillStyle = C.ink; g.fillRect(x - 1, y - 1, w + 2, hh + 2); g.fillStyle = C.navy; g.fillRect(x, y, w, hh); g.fillStyle = C.gold; g.fillRect(x, y + hh - 1, w, 1);
    ws.forEach((c, i) => g.drawImage(c, Math.round(W / 2 - c.width / 2), y + 1 + i * 13));
  }
  const split = (s) => { const mid = s.length / 2; let best = -1; for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; return [s.slice(0, best), s.slice(best + 1)]; };
  function particles() {
    for (const [key, dir] of [['up', -1], ['down', 1]]) if (sc[key] && Math.random() < 0.05) P.push({ e: splitEmoji(sc[key])[0] || '•', x: Math.round(W / 2 - 24 + Math.random() * 48), y: dir < 0 ? GROUND - 18 : TOP + 2, v: dir * (0.2 + Math.random() * 0.25), life: 1 });
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.y += p.v; p.life -= 0.012; if (p.life <= 0) { P.splice(i, 1); continue; } g.globalAlpha = p.life > 0.35 ? 1 : 0.5; prop(p.e, p.x, Math.round(p.y)); }
    g.globalAlpha = 1;
  }
  function mark(t) {
    if (!sc.mark) return; const a = ease((t - t0 - 250) / 300); if (a <= 0) return;
    prop({ ok: '✅', no: '❌', '?': '❓' }[sc.mark], W / 2 + 26, TOP + 16 - Math.round((1 - a) * 8));
  }
  function frame(t) {
    if (stopped || !box.isConnected && t0 && t - t0 > 1000) { stopped = true; if (ro) ro.disconnect(); return; }
    bg();
    if (meX > W - 14) meX = Math.max(W - 14, meX - 1); // 見習生走進場
    balance(t); bars(t); props(t); particles(); mark(t); board(t);
    actor('npc', 14, speaker === 'npc', t, false); actor('me', Math.round(meX), speaker === 'me', t, true);
    raf = requestAnimationFrame(frame);
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    el: box,
    say(who, fx) { // 換一句台詞：有畫面指令就換場景，沒有就沿用
      speaker = who; if (fx != null && fx !== '') { sc = parse(fx); P.length = 0; }
      t0 = performance.now();
      if (still) { t0 -= 5000; meX = W - 14; cancelAnimationFrame(raf); frame(performance.now()); cancelAnimationFrame(raf); }
      else if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { stopped = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); },
  };
}
