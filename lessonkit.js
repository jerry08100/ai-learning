// 互動關卡元件：知識點的「關卡式閱讀」（使用者 2026-11-14 選定：NPC 對話、圖解、互動小算盤、先猜再看）。
// 資料在 earth-lessons.json／ai-lessons.json：{ 知識點 id: { memo, blocks:[...] } }。world.js 把每個 block 當成一張卡，
// 呼叫 mount(block, el, ctx, done)；done() 之後才能按下一張（對話講完、猜題答完、分類全對、時間軸看完）。
// 名詞卡、陷阱卡、記憶點由 world.js 用知識點既有的 terms／pitfalls 與 memo 自動接在最後。

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// ---- 各種卡 ----
const K = {
  // 對話：[["npc"|"me", "台詞"], ...]，點一下下一句
  talk(b, el, ctx, done) {
    const npc = NPC[ctx.region] || NPC.climate, row = h('div', 'lk-talk'), bub = h('div', 'lk-bub');
    row.append(sprite(npc[1]), bub); el.append(row);
    let i = 0, timer = null;
    const show = () => {
      const [who, text] = b.lines[i], me = who === 'me', [name, pal] = me ? ME : npc;
      row.replaceChild(sprite(pal), row.firstChild); bub.className = 'lk-bub' + (me ? ' me' : '');
      bub.innerHTML = `<div class="who">${esc(name)}</div><div class="lk-t"></div><span class="nx">▼ 點一下</span>`;
      const t = bub.querySelector('.lk-t'); let k = 0; clearInterval(timer);
      if (RM()) { t.textContent = text; return; }
      timer = setInterval(() => { t.textContent = text.slice(0, ++k); if (k >= text.length) clearInterval(timer); }, 20);
    };
    const step = () => { const t = bub.querySelector('.lk-t'), full = b.lines[i][1];
      if (t.textContent.length < full.length) { clearInterval(timer); t.textContent = full; return; }
      if (i < b.lines.length - 1) { i++; show(); } else { bub.querySelector('.nx').textContent = '（對話結束）'; bub.onclick = null; bub.onkeydown = null; done(); } };
    bub.tabIndex = 0; bub.setAttribute('role', 'button'); bub.onclick = step; bub.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(); } };
    show();
  },
  // 先猜再看：{q, opts, ans, why}
  guess(b, el, ctx, done) {
    el.append(h('p', 'lk-q', esc(b.q))); const box = h('div', 'lk-opts'); el.append(box);
    b.opts.forEach((o, i) => { const btn = h('button', null, esc(o)); btn.onclick = () => {
      box.querySelectorAll('button').forEach((x, j) => { x.disabled = true; if (j === b.ans) x.classList.add('ok'); });
      if (i !== b.ans) btn.classList.add('no');
      el.append(h('div', 'lk-why', `<b>${i === b.ans ? '✔ 猜對了！' : '✘ 差一點。'}</b> ${esc(b.why)}`)); done(); }; box.append(btn); });
  },
  // 比較表：{cols:[...], rows:[[...], ...]}，第一欄是列標題
  compare(b, el, ctx, done) {
    el.append(h('div', 'lk-tblw', `<table class="lk-cmp"><thead><tr>${b.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, j) => j ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`)); done();
  },
  // 並列卡：{items:[{t, d, s}]}，2～4 張並排（s 是小字補充）
  cards(b, el, ctx, done) {
    el.append(h('div', 'lk-cards', b.items.map((x) => `<div><b>${esc(x.t)}</b>${esc(x.d)}${x.s ? `<small>${esc(x.s)}</small>` : ''}</div>`).join(''))); done();
  },
  // 流程：{steps:[{t, d}]}，箭頭串起來
  flow(b, el, ctx, done) {
    el.append(h('ol', 'lk-flow', b.steps.map((x, i) => `<li><span>${i + 1}</span><b>${esc(x.t)}</b>${x.d ? `<em>${esc(x.d)}</em>` : ''}</li>`).join(''))); done();
  },
  // 分類：{bins:[{k, label}], items:[{t, k}], ok:"全對後的一句話"}，點卡再點籃子
  sort(b, el, ctx, done) {
    const pool = h('div', 'lk-chips'), bins = h('div', 'lk-bins'), msg = h('p', 'lk-small', '點一張卡，再點它該放的籃子。');
    el.append(pool, bins, msg); let pick = null, left = b.items.length;
    shuffle(b.items).forEach((x) => { const c = h('button', 'lk-chip', esc(x.t)); c.dataset.k = x.k;
      c.onclick = () => { pool.querySelectorAll('.lk-chip').forEach((y) => y.classList.remove('pick')); pick = c; c.classList.add('pick'); }; pool.append(c); });
    b.bins.forEach((bin) => { const box = h('div', 'lk-bin', `<span>${esc(bin.label)}</span><div class="lk-chips"></div>`); box.tabIndex = 0; box.setAttribute('role', 'button'); box.dataset.k = bin.k; // 籃子裡要放按鈕，籃子本身不能是 <button>
      box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.click(); } };
      box.onclick = () => { if (!pick) return;
        if (pick.dataset.k === bin.k) { pick.classList.remove('pick'); pick.classList.add('ok'); pick.disabled = true; box.querySelector('.lk-chips').append(pick); pick = null;
          if (--left === 0) { msg.textContent = '✔ ' + (b.ok || '全部分對了！'); done(); } }
        else { pick.classList.remove('no'); void pick.offsetWidth; pick.classList.add('no'); msg.textContent = b.hint || '再想想看，這張應該放哪一邊？'; } };
      bins.append(box); });
  },
  // 時間軸：{events:[{y, t, d}]}，全部點過才算看完
  timeline(b, el, ctx, done) {
    const tl = h('div', 'lk-tl'), box = h('div', 'lk-tlbox'), seen = new Set(); el.append(tl, box);
    b.events.forEach((ev, i) => { const btn = h('button', null, `${esc(ev.y)}<small>${esc(ev.t)}</small>`);
      btn.onclick = () => { tl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn)); seen.add(i);
        box.innerHTML = `<b>${esc(ev.y)}｜${esc(ev.t)}</b><p>${esc(ev.d)}</p><span class="lk-small">已看 ${seen.size}／${b.events.length}</span>`;
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
    const rows = h('div'); el.append(rows);
    b.inputs.forEach((x) => { const id = `lk-${ctx.uid}-${x.k}`, r = h('div', 'lk-row', `<label for="${id}">${esc(x.label)}</label><input id="${id}" type="range" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${x.val}"><span class="v"></span>`);
      r.querySelector('input').oninput = (e) => { val[x.k] = +e.target.value; draw(); }; rows.append(r); });
    const barEl = h('div', 'lk-bars'), outEl = h('div', 'lk-out'), noteEl = h('p', 'lk-small'); el.append(barEl, outEl, noteEl);
    if (b.presets) { const p = h('div', 'lk-pre', '試試這些情境：'); b.presets.forEach((x) => { const btn = h('button', null, esc(x.label)); btn.onclick = () => { Object.assign(val, x.vals); draw(); }; p.append(btn); }); el.append(p); }
    function draw() {
      const v = { ...val, ...(modes[mode].consts || {}) };
      b.inputs.forEach((x) => { const r = el.querySelector(`#lk-${ctx.uid}-${x.k}`); r.value = val[x.k]; r.parentNode.querySelector('.v').textContent = `${fmt(val[x.k], Math.max(2, (String(x.step || 1).split(/[.e-]/)[1] || '').length, x.step < 1e-3 ? 6 : 0))} ${x.unit || ''}`; }); // 小數位跟著 step，0.001 不會被顯示成 0
      const bv = bars.map((o) => [o.label, o.fn(v)]), mx = Math.max(1e-9, ...bv.map((x) => Math.abs(x[1])));
      barEl.innerHTML = bv.map(([l, n]) => `<div class="lk-bar"><span>${esc(l)}</span><i style="width:${Math.abs(n) / mx * 100}%"></i><em>${fmt(n, 1)}</em></div>`).join('');
      outEl.innerHTML = outs.map((o) => `<div><span>${esc(o.label)}</span><b>${fmt(o.fn(v), o.digits ?? 0)}</b> ${esc(o.unit || '')}</div>`).join('');
      const hit = notes.find((n) => n.fn(v)); noteEl.textContent = hit ? hit.text : '';
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
    const grid = h('div', 'lk-tog'), meter = h('div', 'lk-meter', '<i></i>'), msg = h('p', 'lk-small'); el.append(grid, h('div', 'lk-small', esc(b.meterLabel || '')), meter, msg);
    const on = new Set();
    (b.fixed || []).forEach((x) => { const t = h('button', null, `<b>${esc(x.t)}</b><small>${esc(x.s || '')}</small>`); t.onclick = () => (msg.textContent = x.tip); grid.append(t); });
    b.items.forEach((x, i) => { const t = h('button', null, `<b>${esc(x.t)}</b><small>${esc(x.s || '')}</small>`); t.setAttribute('aria-pressed', 'false');
      t.onclick = () => { on.has(i) ? on.delete(i) : on.add(i); t.classList.toggle('on', on.has(i)); t.setAttribute('aria-pressed', on.has(i));
        const lvl = Math.max(5, b.base - [...on].reduce((s, j) => s + b.items[j].cut, 0)); meter.firstChild.style.width = lvl + '%';
        msg.textContent = x.tip + (on.size === b.items.length && b.all ? ' ' + b.all : ''); }; grid.append(t); });
    meter.firstChild.style.width = b.base + '%'; done();
  },
  // 一段短文（不適合做成互動的內容），可含名詞標記
  text(b, el, ctx, done) { el.append(...b.paras.map((p) => h('p', null, ctx.mark ? ctx.mark(p) : esc(p)))); done(); },
};
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const KIND = { talk: '對話', guess: '先猜猜看', compare: '圖解', cards: '圖解', flow: '圖解', sort: '分類小遊戲', timeline: '時間軸', calc: '互動小算盤', balance: '圖解', toggles: '圖解', text: '重點' };
export const GATED = new Set(['talk', 'guess', 'sort', 'timeline']);
export function mount(b, el, ctx, done) {
  if (b.title) el.append(h('h3', 'lk-h', esc(b.title)));
  K[b.type](b, el, ctx, done);
}
// 名詞翻面卡、陷阱卡、記憶點（world.js 自動接在關卡最後）
export function termsCard(list, el) {
  const g = h('div', 'lk-flips');
  list.forEach((x) => { const f = h('button', 'lk-flip', `<span class="in"><span class="f">${esc(x.t)}</span><span class="b">${esc(x.d)}</span></span>`);
    f.setAttribute('aria-label', `${x.t}：點一下看解釋`); f.onclick = () => f.classList.toggle('on'); g.append(f); });
  el.append(h('p', 'lk-small', '點一下翻面。'), g);
}
export function trapsCard(list, el) {
  for (const p of list) { const m = p.match(/^容易(.+?)，其實(.+)$/); el.append(h('div', 'lk-trap', m ? `<b>✘ 以為${esc(m[1].replace(/^以為/, ''))}</b><span>✔ 其實${esc(m[2])}</span>` : `<span>${esc(p)}</span>`)); }
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
      if (b.type === 'talk') { if (!b.lines?.length || b.lines.some((l) => !['npc', 'me'].includes(l[0]) || !l[1])) at(i, 'lines 格式要是 [["npc"|"me","台詞"]]'); }
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
        for (const o of b.notes || []) compile(o.when, names);
        for (const p of b.presets || []) for (const k of Object.keys(p.vals)) if (!names.includes(k)) at(i, `情境 ${p.label} 用到不存在的輸入 ${k}`); }
      if (b.type === 'balance') { if (!b.left || !b.right || !b.max || b.even == null || !b.heavyL || !b.heavyR) at(i, 'balance 欄位不齊'); }
      if (b.type === 'toggles') { if (!b.items?.length || !b.base || b.items.some((x) => !x.t || !(x.cut > 0) || !x.tip)) at(i, 'toggles 欄位不齊'); }
      if (b.type === 'text') { if (!b.paras?.length) at(i, 'text 要有 paras'); }
    } catch (e) { at(i, e.message); }
  });
  return err;
}
