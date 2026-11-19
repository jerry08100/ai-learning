// 互動關卡元件：知識點的「關卡式閱讀」（使用者 2026-11-14 選定：NPC 對話、圖解、互動小算盤、先猜再看）。
// 資料在 earth-lessons.json／ai-lessons.json：{ 知識點 id: { memo, blocks:[...] } }。world.js 把每個 block 當成一張卡，
// 呼叫 mount(block, el, ctx, done)；done() 之後才能按下一張（對話講完、猜題答完、分類全對、時間軸看完）。
// 名詞卡、陷阱卡、記憶點由 world.js 用知識點既有的 terms／pitfalls 與 memo 自動接在最後。

import { makeStage } from './stage.js';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 顯示用文字處理（只動顯示，不改 json）：數字＋單位、數值範圍、（英文縮寫）、英文縮寫＋接著的中文詞 包 nowrap，數字與 % 之間不留空格
const UNIT = '億美元|億度|億元|億噸|億|萬噸|萬|千公噸|公噸|公斤|噸|元|年|月|日|度|倍|成|公里|公頃|千瓦|兆瓦|美元|個|項|國|次|期|名|%|％';
const NB_RE = new RegExp(`[（(][A-Za-z][A-Za-z0-9 .\\-/]*[）)]|\\d[\\d,.]*(?:\\s*[～~]\\s*\\d[\\d,.]*)?\\s*(?:${UNIT})|[A-Za-z][A-Za-z0-9.\\-/]*\\s?[一-鿿]{1,2}`, 'g');
const clean = (s) => String(s).replace(/(\d)\s+([%％])/g, '$1$2');
// 中文詞不在詞中間換行：Intl.Segmenter（zh-TW）斷詞，2～4 字的詞包 nowrap，單字併進相鄰詞避免單字掉行（只處理已跳脫的純文字，不碰標記）
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh-TW', { granularity: 'word' }) : null, SEGC = new Map();
// 詞與詞之間插 <wbr>：卡內文字設 word-break:keep-all，只在詞邊界（與標點、空白）換行，不會把「封存」拆成「封／存」（盲審第 4 輪）
const words = (t) => { if (!SEG || !/[一-鿿]{2}/.test(t)) return t; let r = SEGC.get(t); if (r != null) return r;
  r = ''; let cur = '', prevW = false; const put = (w, isW) => { r += (isW && prevW ? '<wbr>' : '') + w; prevW = isW; };
  const flush = () => { if (cur) put(cur.length >= 2 ? `<bdi class="nw">${cur}</bdi>` : cur, true); cur = ''; };
  for (const g of SEG.segment(t)) { const w = g.segment; if (g.isWordLike && /^[一-鿿]+$/.test(w)) { if (cur && (w.length === 1 || cur.length === 1) && cur.length + w.length <= 4) cur += w; else { flush(); if (w.length <= 4) cur = w; else put(w, true); } } else { flush(); put(w, false); } }
  flush();
  if (SEGC.size > 3000) SEGC.clear(); SEGC.set(t, r); return r; };
// 段尾最後兩字（含收尾標點）綁在一起，避免單字孤行
const wordsT = (s) => { const m = /[一-鿿]{2}[。，、！？；：」』）)]*$/.exec(s); return m && m.index > 0 ? words(s.slice(0, m.index)) + (/[一-鿿]$/.test(s.slice(0, m.index)) ? '<wbr>' : '') + `<bdi class="nw">${m[0]}</bdi>` : words(s); };
// 字串尾端的中文詞（給「詞（縮寫）」綁在一起用）
const lastWord = (t) => { if (!SEG || !/[一-鿿]$/.test(t)) return ''; let w = ''; for (const g of SEG.segment(t)) w = g.segment; return /^[一-鿿]{1,6}$/.test(w) ? w : ''; };
export const tx = (s) => { const e = esc(clean(s)); let out = '', last = 0;
  for (const m of e.matchAll(NB_RE)) { let pre = e.slice(last, m.index), g = m[0]; last = m.index + m[0].length;
    if (/^[（(]/.test(g) && / /.test(g)) { out += words(pre) + g; continue; } // 括號裡是一段英文（有空白）：整段可在空白處換行，前面的詞由 words 保持完整
    if (/^[（(]/.test(g)) { const w = lastWord(pre); pre = pre.slice(0, pre.length - w.length); g = w + g; } // 「封存（CCUS）」整組不拆
    out += words(pre) + (/[一-鿿]$/.test(pre) && /^[一-鿿]/.test(g) ? '<wbr>' : '') + `<bdi class="nw">${g}</bdi>` + (/^[一-鿿]/.test(e.slice(last)) ? '<wbr>' : ''); }
  return out + wordsT(e.slice(last)); };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 回饋句出現時捲到看得見（手機：不被頂部、底部固定列蓋住，扣除量在 CSS 的 scroll-padding）
const seeIt = (e) => requestAnimationFrame(() => e.isConnected && e.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }));

// ---- NPC：每區一位，16×16 像素小人，同一副骨架換顏色與帽子 ----
const BASE = ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....hssssssh....', '....seessees....', '....ssssssss....', '.....ssmmss.....',
  '......ssss......', '....cccccccc....', '...ccccaacccc...', '...scccaaccccs..', '...scccaacccs...', '....cccccccc....', '....pppppppp....', '....pp....pp....', '...kkk....kkk...'];
const NPC = {
  // 地球永續國
  climate: ['議員 葛蘭', { H: '#e8c877', h: '#e8c877', c: '#3f8f6a', a: '#e8c877', p: '#2a2232' }],
  disclose: ['港務長 瑪琳', { H: '#1f3a6b', h: '#6b3f2a', c: '#3b5dc9', a: '#f3ead4', p: '#272c48' }],
  inventory: ['測量師 阿哲', { H: '#8a5a2b', h: '#3a2a1a', c: '#a0703c', a: '#e8c877', p: '#4c5272' }],
  footprint: ['林務官 苔絲', { H: '#2f6b3a', h: '#6b3f2a', c: '#5f8f3a', a: '#a7d98a', p: '#3a2a1a' }],
  energy: ['工坊師傅 老鐵', { H: '#e39a62', h: '#3a2a1a', c: '#6c7a8c', a: '#e39a62', p: '#272c48' }],
  renew: ['風場守望者 莉亞', { H: '#f3ead4', h: '#e8c877', c: '#6fb3e8', a: '#f3ead4', p: '#4c5272' }],
  carbon: ['濕地研究員 柏恩', { H: '#5a7a4a', h: '#3a2a1a', c: '#4a8a7a', a: '#8fe3da', p: '#3a2a1a' }],
  // AI 智能國
  plain: ['村長 杜伊', { H: '#c8a25c', h: '#9aa3b8', c: '#a0703c', a: '#e8c877', p: '#3a2a1a' }],
  forest: ['森林賢者 歐蘭', { H: '#2f6b3a', h: '#f3ead4', c: '#2f6b3a', a: '#a7d98a', p: '#1f3a2a' }],
  valley: ['資料官 河川', { H: '#3b5dc9', h: '#2a2232', c: '#3b5dc9', a: '#8fe3da', p: '#272c48' }],
  fort: ['城塞騎士 薇拉', { H: '#9aa3b8', h: '#c8564b', c: '#6c7a8c', a: '#c8564b', p: '#272c48' }],
  mount: ['山脈導師 嵐', { H: '#4a2a3a', h: '#f3ead4', c: '#4a2a5a', a: '#8fe3da', p: '#272c48' }],
  sea: ['海之巫女 汐', { H: '#8fe3da', h: '#1f3a6b', c: '#2a6b8a', a: '#8fe3da', p: '#1f3a6b' }],
  capital: ['王城宰相 艾德', { H: '#c9a85c', h: '#9aa3b8', c: '#6b2a3a', a: '#c9a85c', p: '#2a2232' }],
  claude: ['工坊匠師 克勞', { H: '#d97757', h: '#3a2a1a', c: '#d97757', a: '#f3ead4', p: '#272c48' }],
};
const ME = ['見習生 小禾', { H: '#6b3f2a', h: '#6b3f2a', c: '#3b5dc9', a: '#3b5dc9', p: '#272c48' }];
function sprite(pal) {
  const c = document.createElement('canvas'); c.width = c.height = 16; c.setAttribute('aria-hidden', 'true'); const x = c.getContext('2d');
  const P = { s: '#f2c79a', e: '#1b1b2b', m: '#c8564b', k: '#2a2232', ...pal };
  BASE.forEach((row, y) => [...row].forEach((ch, i) => { if (P[ch]) { x.fillStyle = P[ch]; x.fillRect(i, y, 1, 1); } }));
  return c;
}

// ---- 安全的小算式：只准數字、運算子、括號、輸入名稱與少數 Math 函式 ----
const FN = { min: Math.min, max: Math.max, round: Math.round, abs: Math.abs, pow: Math.pow, floor: Math.floor, ceil: Math.ceil };
export function compile(expr, names) {
  if (!/^[\w\s+\-*/().,<>=?:!&|%]*$/.test(expr)) throw new Error(`算式含不允許的字元：${expr}`);
  for (const id of expr.match(/[A-Za-z_]\w*/g) || []) if (!names.includes(id) && !(id in FN)) throw new Error(`算式用到未定義的名稱 ${id}：${expr}`);
  // eslint-disable-next-line no-new-func
  const f = new Function(...Object.keys(FN), ...names, `return (${expr});`);
  return (vals) => f(...Object.values(FN), ...names.map((n) => vals[n]));
}
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
// 小算盤的「計算過程」（使用者 2026-11-16：要看到怎麼算，不是只有數字在變）。
// 輸出有 steps（字串陣列，{算式} 會代入當下數值，可加 |位數，例 {e-25000|0}）就照它寫；
// 沒有 steps 且公式只有加減乘除，就自動把數值代進公式；其餘（有條件、max/min）一定要寫 steps，check-lessons 會擋。
export const SIMPLE_F = (f) => /^[\w\s+\-*/().]*$/.test(f) && !/\b(max|min|round|abs|floor|ceil|pow|sqrt|log|exp)\b/.test(f);
function stepLines(o, names, v, digits) {
  if (o.steps?.length) return o.steps.map((s) => esc(s).replace(/\{([^}|]+)(?:\|(\d))?\}/g, (_, e, d) => `<b>${fmt(compile(e.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'), names)(v), d == null ? 2 : +d)}</b>`));
  if (!SIMPLE_F(o.f)) return [];
  const sym = { '*': ' × ', '/': ' ÷ ', '+': ' ＋ ', '-': ' － ' };
  const s = o.f.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|[-+*/()]/g).map((t) => (t in sym ? sym[t] : /^[A-Za-z_]/.test(t) ? `<b>${fmt(v[t], 4)}</b>` : /\d/.test(t) ? fmt(+t, 4) : t)).join('').replace(/\s+/g, ' ').trim();
  return [s.replace(/\( /g, '(').replace(/ \)/g, ')')];
}

// ---- 各種卡 ----
const K = {
  // 對話：[["npc"|"me", "台詞"], ...]，點一下下一句
  talk(b, el, ctx, done) {
    const LINES = b.lines.map((l) => [l[0], clean(l[1]), l[2]]), npc = NPC[ctx.region] || NPC.climate, row = h('div', 'lk-talk'), bub = h('div', 'lk-bub');
    // 小劇場：NPC 與見習生站在舞台上，每句台詞的第三格是畫面指令（stage.js）
    const stage = makeStage(ctx.region, sprite(npc[1]), sprite(ME[1])); el.append(stage.el);
    row.append(bub); el.append(row);
    let i = 0, timer = null, ended = false;
    const longest = LINES.reduce((m, l) => (l[1].length > m.length ? l[1] : m), '');
    const show = () => {
      const [who, text, fx] = LINES[i], me = who === 'me', [name] = me ? ME : npc;
      stage.say(who, fx); bub.className = 'lk-bub' + (me ? ' me' : '');
      bub.innerHTML = `<div class="who">${esc(name)}</div><div class="lk-tw"><div class="lk-ghost" aria-hidden="true">${tx(longest)}</div><div class="lk-t"></div></div><div class="lk-foot"><span class="nx">▼ 點畫面任何地方、按空白鍵或 → 繼續</span></div>`;
      const t = bub.querySelector('.lk-t'); let k = 0; clearInterval(timer);
      if (RM()) { t.innerHTML = tx(text); return; }
      timer = setInterval(() => { t.innerHTML = tx(text.slice(0, ++k)); if (k >= text.length) clearInterval(timer); }, 20);
    };
    const replay = () => { ended = false; i = 0; show(); };
    const step = () => { if (ended) return; const t = bub.querySelector('.lk-t'), full = LINES[i][1];
      if (t.textContent.length < full.length) { clearInterval(timer); t.innerHTML = tx(full); return; }
      if (i < LINES.length - 1) { i++; show(); return; }
      ended = true; const nx = bub.querySelector('.nx'); nx.textContent = '（對話結束）'; nx.classList.add('end');
      const rb = h('button', 'lk-replay', '↻ 重看'); rb.type = 'button'; rb.onclick = (e) => { e.stopPropagation(); replay(); }; nx.parentNode.append(rb);
      done(); };
    // 使用者 2026-11-15：整張卡點任何地方都能下一句（按鈕、連結、輸入框除外）；空白鍵、方向鍵右也行；看完可以重看
    const card = el.closest('.card') || el;
    card.addEventListener('click', (e) => { if (!el.isConnected || e.target.closest('button, a, input, select, textarea, label, .lk-mode')) return; step(); });
    const onKey = (e) => {
      if (!el.isConnected) return document.removeEventListener('keydown', onKey);
      if (e.target.closest?.('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (!ended) step(); else if (e.key === 'ArrowRight') document.querySelector('#next:not([disabled])')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    bub.tabIndex = 0; bub.setAttribute('role', 'button'); bub.setAttribute('aria-label', '下一句');
    bub.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); step(); } };
    show();
  },
  // 先猜再看：{q, opts, ans, why}
  guess(b, el, ctx, done) {
    el.append(h('p', 'lk-q', tx(b.q))); const box = h('div', 'lk-opts'); el.append(box);
    b.opts.forEach((o, i) => { const btn = h('button', null, tx(o)); btn.onclick = () => {
      box.querySelectorAll('button').forEach((x, j) => { x.disabled = true; if (j === b.ans) x.classList.add('ok'); });
      if (i !== b.ans) btn.classList.add('no');
      const why = h('div', i === b.ans ? 'lk-why' : 'lk-why no', `<b>${i === b.ans ? '✔ 猜對了！' : '✘ 差一點。'}</b> ${tx(b.why)}`); el.append(why); done(); seeIt(why); }; box.append(btn); });
  },
  // 比較表：{cols:[...], rows:[[...], ...]}，第一欄是列標題
  compare(b, el, ctx, done) {
    el.append(h('div', 'lk-tblw', `<table class="lk-cmp"><thead><tr>${b.cols.map((c) => `<th>${tx(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, j) => j ? `<td data-l="${esc(b.cols[j])}">${tx(c)}</td>` : `<th>${tx(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`)); done();
  },
  // 並列卡：{items:[{t, d, s}]}，2～4 張並排（s 是小字補充）
  cards(b, el, ctx, done) {
    el.append(h('div', 'lk-cards', b.items.map((x) => `<div><b>${tx(x.t)}</b>${tx(x.d)}${x.s ? `<small>${tx(x.s)}</small>` : ''}</div>`).join(''))); done();
  },
  // 流程：{steps:[{t, d}]}，箭頭串起來
  flow(b, el, ctx, done) {
    const ol = h('ol', 'lk-flow', b.steps.map((x, i) => `<li><span>${i + 1}</span><b>${tx(x.t)}</b>${x.d ? `<em>${tx(x.d)}</em>` : ''}</li>`).join('')); ol.dataset.n = b.steps.length; el.append(ol); done();
  },
  // 分類：{bins:[{k, label}], items:[{t, k}], ok:"全對後的一句話"}，點卡再點籃子
  sort(b, el, ctx, done) {
    // 使用者 2026-11-15：提示要對得上剛剛那一步，換卡就清掉；放對的卡不留紅框
    const TIP = '點一張卡，再點它該放的籃子。';
    const pool = h('div', 'lk-chips'), bins = h('div', 'lk-bins'), msg = h('p', 'lk-small', TIP);
    bins.style.setProperty('--n', b.bins.length > 7 ? Math.ceil(b.bins.length / 2) : b.bins.length); // 籃子盡量排成一列
    el.append(pool, bins, msg); let pick = null, left = b.items.length, wrong = 0;
    const say = (t, cls = '') => { msg.textContent = t; msg.className = 'lk-small ' + cls; if (cls) seeIt(msg); };
    shuffle(b.items).forEach((x) => { const c = h('button', 'lk-chip', tx(x.t)); c.dataset.k = x.k;
      c.onclick = () => { pool.querySelectorAll('.lk-chip').forEach((y) => y.classList.remove('pick', 'no')); pick = c; c.classList.add('pick'); say(`選了「${x.t}」，現在點它該放的籃子。`); }; pool.append(c); });
    b.bins.forEach((bin) => { const box = h('div', 'lk-bin', `<span>${tx(bin.label)}</span><div class="lk-chips"></div>`); box.tabIndex = 0; box.setAttribute('role', 'button'); box.dataset.k = bin.k; // 籃子裡要放按鈕，籃子本身不能是 <button>
      box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.click(); } };
      box.onclick = () => { if (!pick) return say(TIP);
        const name = pick.textContent;
        if (pick.dataset.k === bin.k) { pick.classList.remove('pick', 'no'); pick.classList.add('ok'); pick.disabled = true; box.querySelector('.lk-chips').append(pick); pick = null; wrong = 0;
          if (--left === 0) { say('✔ ' + (b.ok || '全部分對了！'), 'lk-good'); el.classList.add('solved'); done(); } else say(`✔「${name}」放對了。剩 ${left} 張。`, 'lk-good'); }
        else { pick.classList.remove('no'); void pick.offsetWidth; pick.classList.add('no'); wrong++;
          say(`✘「${name}」不屬於「${bin.label}」，再想想。`, 'lk-bad'); } };
      bins.append(box); });
  },
  // 時間軸：{events:[{y, t, d}]}，全部點過才算看完
  timeline(b, el, ctx, done) {
    const tl = h('div', 'lk-tl'), box = h('div', 'lk-tlbox'), seen = new Set(); el.append(tl, box);
    b.events.forEach((ev, i) => { const btn = h('button', null, `${tx(ev.y)}<small>${tx(ev.t)}</small>`);
      btn.onclick = () => { tl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn)); seen.add(i);
        box.innerHTML = `<b>${tx(ev.y)}｜${tx(ev.t)}</b><p>${tx(ev.d)}</p><span class="lk-small">已看 ${seen.size}／${b.events.length}</span>`;
        if (seen.size === b.events.length) done(); }; tl.append(btn); });
    tl.firstChild.click();
  },
  // 小算盤：{inputs:[{k,label,unit,min,max,step,val}], modes?:[{label, consts}], outputs:[{label,f,unit,digits}], bars?:[{label,f}], presets?:[{label, vals}], notes?:[{when,text}]}
  calc(b, el, ctx, done) {
    const modes = b.modes || [{ label: '', consts: {} }], cnames = Object.keys(modes[0].consts || {}), names = [...b.inputs.map((x) => x.k), ...cnames];
    const outs = b.outputs.map((o) => ({ ...o, fn: compile(o.f, names) })), bars = (b.bars || []).map((o) => ({ ...o, fn: compile(o.f, names) }));
    const notes = (b.notes || []).map((o) => ({ ...o, fn: compile(o.when, names) }));
    const val = Object.fromEntries(b.inputs.map((x) => [x.k, x.val])); let mode = 0;
    if (modes.length > 1) { const seg = h('div', 'lk-seg'); modes.forEach((m, i) => { const s = h('button', i ? '' : 'on', esc(m.label)); s.onclick = () => { mode = i; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === s)); draw(); }; seg.append(s); }); el.append(seg); }
    // 左欄：模式、滑桿、情境；右欄：長條、結果、提示（寬螢幕左右並排，窄螢幕上下疊）
    const colL = h('div', 'lk-cl'), colR = h('div', 'lk-cr'), calcBox = h('div', 'lk-calc'); calcBox.append(colL, colR); el.append(calcBox);
    const sg = el.querySelector('.lk-seg'); if (sg) colL.append(sg);
    const rows = h('div', 'lk-rows'); colL.append(rows);
    b.inputs.forEach((x) => { const id = `lk-${ctx.uid}-${x.k}`, r = h('div', 'lk-row', `<label for="${id}">${tx(x.label)}</label><input id="${id}" type="range" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${x.val}"><span class="v"></span><span class="lim"><i>${fmt(x.min, 2)}${/^[%％]/.test(x.unit || '') ? '' : ' '}${esc(x.unit || '')}</i><i>${fmt(x.max, 2)}${/^[%％]/.test(x.unit || '') ? '' : ' '}${esc(x.unit || '')}</i></span>`);
      r.querySelector('input').oninput = (e) => { val[x.k] = +e.target.value; draw(); }; rows.append(r); });
    const bu = b.inputs.every((x) => x.unit && x.unit === b.inputs[0].unit) && b.outputs[0].unit === b.inputs[0].unit ? b.inputs[0].unit : '', barEl = h('div', 'lk-bars'), outEl = h('div', 'lk-out'), noteEl = h('p', 'lk-small'); colR.append(outEl, noteEl); { const L = Math.ceil(b.inputs.length / 2) * 80 + (b.presets ? 70 : 0) + (modes.length > 1 ? 50 : 0), R = bars.length * 33 + outs.length * 40 + 30, mv = bars.length * 33; // 估兩欄高度，搬長條能讓較高那欄變矮才搬
      if (bars.length && Math.max(L + mv, R - mv) < Math.max(L, R)) rows.after(barEl); else colR.prepend(barEl); }
    if (b.presets) { const p = h('div', 'lk-pre', '<div>試試這些情境：</div>'), pb = h('div', 'lk-pre-b'); p.append(pb); b.presets.forEach((x) => { const btn = h('button', null, tx(x.label)); btn.onclick = () => { Object.assign(val, x.vals); draw(); }; pb.append(btn); }); colL.append(p); }
    function draw() {
      const v = { ...val, ...(modes[mode].consts || {}) };
      b.inputs.forEach((x) => { const r = el.querySelector(`#lk-${ctx.uid}-${x.k}`); r.value = val[x.k]; r.parentNode.querySelector('.v').textContent = `${fmt(val[x.k], Math.max(2, (String(x.step || 1).split(/[.e-]/)[1] || '').length, x.step < 1e-3 ? 6 : 0))}${/^[%％]/.test(x.unit || '') ? '' : ' '}${x.unit || ''}`; }); // 小數位跟著 step，0.001 不會被顯示成 0
      // 拉到 0 讓分母為 0 時（例：沒有節省→回收年限）不顯示「—」，直接寫無法計算（驗收第 1 輪觀察）
      const NA = '分母為 0，無法計算', bv = bars.map((o) => [o.label, o.fn(v)]), mx = Math.max(1e-9, ...bv.map((x) => Math.abs(x[1])).filter(Number.isFinite));
      barEl.innerHTML = bv.map(([l, n]) => `<div class="lk-bar"><span>${tx(l)}</span><i style="width:${Number.isFinite(n) ? Math.abs(n) / mx * 100 : 0}%"></i><em>${Number.isFinite(n) ? `${fmt(n, 1)}${/^[%％]/.test(bu) ? '' : bu ? ' ' : ''}${esc(bu)}` : '無法計算'}</em></div>`).join('');
      outEl.innerHTML = outs.map((o) => { const n = o.fn(v), fin = Number.isFinite(n), res = fin ? `${fmt(n, o.digits ?? 0)}${/^[%％]/.test(o.unit || '') ? '' : ' '}${esc(o.unit || '')}` : NA, st = stepLines(o, names, v);
        return `<div><span>${tx(o.label)}</span><bdi class="nw">${fin ? `<b>${fmt(n, o.digits ?? 0)}</b>${/^[%％]/.test(o.unit || '') ? '' : ' '}${esc(o.unit || '')}` : '<b>無法計算</b>'}</bdi>${st.length ? `<div class="lk-step"><i>算式</i>${st.map((l, j) => `<div>${l}${j === st.length - 1 ? ` ＝ <b>${res}</b>` : ''}</div>`).join('')}</div>` : fin ? '' : `<div class="lk-step"><i>算式</i><div>${NA}</div></div>`}</div>`; }).join('');
      const hit = notes.find((n) => n.fn(v)); noteEl.innerHTML = hit ? tx(hit.text) : '';
    }
    draw(); done();
  },
  // 天平：{left, right, max, lv, rv, unit, even, heavyL, heavyR}
  balance(b, el, ctx, done) {
    const id = `lk-${ctx.uid}`;
    el.append(h('div', 'lk-scale', `<div class="pan l">${esc(b.left)}</div><div class="ful"></div><div class="pan r">${esc(b.right)}</div><div class="beam"></div>`));
    const rows = h('div'); [['l', b.left, b.lv], ['r', b.right, b.rv]].forEach(([k, lab, v]) => rows.append(h('div', 'lk-row', `<label for="${id}-${k}">${esc(lab)}（${esc(b.unit || '')}）</label><input id="${id}-${k}" type="range" min="0" max="${b.max}" value="${v}"><span class="v"></span>`)));
    const st = h('p', 'lk-st'); el.append(rows, st);
    const f = () => { const L = +el.querySelector(`#${id}-l`).value, R = +el.querySelector(`#${id}-r`).value;
      el.querySelectorAll('.lk-row .v').forEach((s, j) => (s.textContent = j ? R : L));
      const deg = Math.max(-12, Math.min(12, (R - L) / (b.max / 25))), beam = el.querySelector('.beam'), dy = Math.sin(deg * Math.PI / 180) * beam.offsetWidth / 2;
      beam.style.transform = `rotate(${deg}deg)`; el.querySelector('.pan.l').style.transform = `translateY(${-dy}px)`; el.querySelector('.pan.r').style.transform = `translateY(${dy}px)`;
      st.textContent = L === R ? b.even : L > R ? b.heavyL.replace('{d}', L - R) : b.heavyR.replace('{d}', R - L); st.classList.toggle('ok', L === R); };
    el.querySelectorAll('input').forEach((i) => (i.oninput = f)); requestAnimationFrame(f); done();
  },
  // 開關：{base, items:[{t, s, cut, tip}], fixed?:[{t,s,tip}], meterLabel, all}：打開項目會降低量表
  toggles(b, el, ctx, done) {
    const grid = h('div', 'lk-tog'); grid.dataset.n = (b.fixed || []).length + b.items.length; const meter = h('div', 'lk-meter', '<i></i>'), msg = h('p', 'lk-small'); el.append(grid, h('div', 'lk-small', tx(b.meterLabel || '')), meter, msg);
    const on = new Set();
    (b.fixed || []).forEach((x) => { const t = h('button', 'fixed', `<b>${tx(x.t)}</b><small>${tx(x.s || '')}</small>`); t.onclick = () => (msg.innerHTML = tx(x.tip)); grid.append(t); });
    b.items.forEach((x, i) => { const t = h('button', null, `<b>${tx(x.t)}</b><small>${tx(x.s || '')}</small>`); t.setAttribute('aria-pressed', 'false');
      t.onclick = () => { on.has(i) ? on.delete(i) : on.add(i); t.classList.toggle('on', on.has(i)); t.setAttribute('aria-pressed', on.has(i));
        const lvl = Math.max(5, b.base - [...on].reduce((s, j) => s + b.items[j].cut, 0)); meter.firstChild.style.width = lvl + '%';
        msg.innerHTML = tx(x.tip + (on.size === b.items.length && b.all ? ' ' + b.all : '')); }; grid.append(t); });
    meter.firstChild.style.width = b.base + '%'; done();
  },
  // 一段短文（不適合做成互動的內容），可含名詞標記
  text(b, el, ctx, done) { el.append(...b.paras.map((p) => h('p', null, ctx.mark ? ctx.mark(p) : tx(p)))); done(); },
};
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const KIND = { talk: '對話', guess: '先猜猜看', compare: '圖解', cards: '圖解', flow: '圖解', sort: '分類小遊戲', timeline: '時間軸', calc: '互動小算盤', balance: '圖解', toggles: '圖解', text: '重點' };
export const GATED = new Set(['talk', 'guess', 'sort', 'timeline']);
export function mount(b, el, ctx, done) {
  if (b.title) el.append(h('h3', 'lk-h', esc(b.title)));
  K[b.type](b, el, ctx, done);
}
// 名詞翻面卡、陷阱卡、記憶點（world.js 自動接在關卡最後）
export function termsCard(list, el) { // 名詞方塊：點一下在原地展開解釋（使用者 2026-11-15：翻面小卡字太小、空間浪費）
  const g = h('div', 'lk-terms'), all = h('button', 'lk-allopen', '全部展開'); all.type = 'button';
  list.forEach((x) => { const f = h('button', 'lk-term', `<b>${tx(x.t)}</b><span class="lk-hint">點一下看解釋</span><span class="d">${tx(x.d)}</span>`); f.type = 'button';
    f.setAttribute('aria-expanded', 'false'); f.onclick = () => { const on = f.classList.toggle('on'); f.setAttribute('aria-expanded', on); }; g.append(f); });
  all.onclick = () => { const open = all.textContent === '全部展開'; g.querySelectorAll('.lk-term').forEach((f) => { f.classList.toggle('on', open); f.setAttribute('aria-expanded', open); }); all.textContent = open ? '全部收起' : '全部展開'; };
  const top = h('div', 'lk-terms-top'); top.append(h('span', 'lk-small', '點名詞看解釋。'), all); el.append(top, g);
}
export function trapsCard(list, el) {
  const box = h('div', 'lk-traps'); box.style.setProperty('--n', list.length <= 3 ? list.length : 2); el.append(box);
  for (const p of list) { const m = p.match(/^容易(.+?)，其實(.+)$/); box.append(h('div', 'lk-trap', m ? `<b>✘ 以為${tx(m[1].replace(/^以為/, ''))}</b><span>✔ 其實${tx(m[2])}</span>` : `<span>${tx(p)}</span>`)); }
}
export const NPC_OF = (r) => (NPC[r] || NPC.climate)[0];
// 檢查用：驗證一份關卡資料，回傳錯誤字串陣列（tools/check-lessons.mjs 也用這支）
export function validate(id, L) {
  const err = [], at = (i, m) => err.push(`${id} 第 ${i + 1} 張：${m}`);
  if (!L || !Array.isArray(L.blocks) || !L.blocks.length) return [`${id}：沒有 blocks`];
  if (!L.memo || L.memo.length > 60) err.push(`${id}：memo 要有且 ≤60 字`);
  L.blocks.forEach((b, i) => {
    if (!K[b.type]) return at(i, `未知類型 ${b.type}`);
    try {
      if (b.type === 'talk') { if (!b.lines?.length || b.lines.some((l) => !['npc', 'me'].includes(l[0]) || !l[1] || (l[2] != null && typeof l[2] !== 'string'))) at(i, 'lines 格式要是 [["npc"|"me","台詞","畫面指令（可省略）"]]'); }
      if (b.type === 'talk') for (const [j, l] of b.lines.entries()) for (const tk of String(l[2] || '').split(/\s+/).filter(Boolean)) { // 畫面指令：關鍵字或純 emoji；n= 的數字要出自這句台詞
        const m = /^n=(.*)$/.exec(tk);
        if (m) { for (const d of m[1].match(/\d[\d,.]*/g) || []) if (!l[1].replace(/,/g, '').includes(d.replace(/,/g, '').replace(/\.$/, ''))) at(i, `第 ${j + 1} 句畫面 n= 的數字 ${d} 不在台詞裡`); }
        else if (!/^(bar|tilt|up|down)=|^(ok|no|\?|clear)$/.test(tk) && /[A-Za-z0-9一-鿿]/.test(tk.replace(/[>⃣️]/g, '').replace(/[#*0-9]️?⃣/g, ''))) at(i, `第 ${j + 1} 句畫面指令「${tk}」不是 emoji 也不是關鍵字`);
      }
      if (b.type === 'guess') { if (!b.q || b.opts?.length < 2 || !(b.ans >= 0 && b.ans < b.opts.length) || !b.why) at(i, 'guess 要有 q、opts、ans、why'); }
      if (b.type === 'compare') { if (!b.cols?.length || !b.rows?.length || b.rows.some((r) => r.length !== b.cols.length)) at(i, 'compare 每列欄數要跟 cols 一樣'); }
      if (b.type === 'cards') { if (!(b.items?.length >= 2 && b.items.length <= 4) || b.items.some((x) => !x.t || !x.d)) at(i, 'cards 要 2～4 張且有 t、d'); }
      if (b.type === 'flow') { if (!(b.steps?.length >= 2) || b.steps.some((x) => !x.t)) at(i, 'flow 至少 2 步'); }
      if (b.type === 'sort') { const ks = new Set((b.bins || []).map((x) => x.k)); if (ks.size < 2 || !(b.items?.length >= 3) || b.items.some((x) => !ks.has(x.k))) at(i, 'sort 至少 2 籃 3 卡，卡的 k 要對到籃子'); }
      if (b.type === 'timeline') { if (!(b.events?.length >= 2) || b.events.some((x) => !x.y || !x.t || !x.d)) at(i, 'timeline 至少 2 點且有 y、t、d'); }
      if (b.type === 'calc') { const modes = b.modes || [{ consts: {} }], names = [...(b.inputs || []).map((x) => x.k), ...Object.keys(modes[0].consts || {})];
        if (!b.inputs?.length || !b.outputs?.length) at(i, 'calc 要有 inputs、outputs');
        for (const x of b.inputs || []) if (!(x.min <= x.val && x.val <= x.max)) at(i, `輸入 ${x.k} 的 val 不在 min～max`);
        for (const m of modes) if (Object.keys(m.consts || {}).join() !== Object.keys(modes[0].consts || {}).join()) at(i, '每個 mode 的 consts 名稱要一樣');
        const v = Object.fromEntries(names.map((n) => [n, 1]));
        for (const o of [...b.outputs, ...(b.bars || [])]) { const r = compile(o.f, names)(v); if (typeof r !== 'number') at(i, `算式 ${o.f} 沒算出數字`); }
        for (const o of b.outputs) { if (!SIMPLE_F(o.f) && !o.steps?.length) at(i, `輸出「${o.label}」的算式有條件或 max/min，要寫 steps 顯示計算過程`);
          for (const s of o.steps || []) for (const m of s.matchAll(/\{([^}|]+)(?:\|\d)?\}/g)) compile(m[1], names); }
        for (const o of b.notes || []) compile(o.when, names);
        for (const p of b.presets || []) for (const k of Object.keys(p.vals)) if (!names.includes(k)) at(i, `情境 ${p.label} 用到不存在的輸入 ${k}`); }
      if (b.type === 'balance') { if (!b.left || !b.right || !b.max || b.even == null || !b.heavyL || !b.heavyR) at(i, 'balance 欄位不齊'); }
      if (b.type === 'toggles') { if (!b.items?.length || !b.base || b.items.some((x) => !x.t || !(x.cut > 0) || !x.tip)) at(i, 'toggles 欄位不齊'); }
      if (b.type === 'text') { if (!b.paras?.length) at(i, 'text 要有 paras'); }
    } catch (e) { at(i, e.message); }
  });
  return err;
}
