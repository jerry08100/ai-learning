// 知識大陸（雛形）：架空世界地圖上逐區學知識點。
// 獨立頁面，進度只存在本機 localStorage 'ipas-world'，不碰主站的練習進度與同步。
// 區域／層／開放條件來自 world.json；知識點內容來自 knowledge.json；小檢查與試煉題來自 questions.json。

import { makeMap, TW, TH, T } from './world-map.js';

const KEY = 'ipas-world';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 解析斷行與粗體，規則同 app.js 的 formatExp（雛形先複製一份；併回主站時改共用）
const formatExp = (t) => esc(t)
  .replace(/\s*(本站補充：)\s*/g, '<br>$1')
  .replace(/(本站補充：)\s*([(（][A-DＡ-Ｄ][)）])/g, '$1<br>$2')
  .replace(/([。；])\s*([(（][A-DＡ-Ｄ][)）])/g, '$1<br>$2')
  .replace(/([。；])\s*(原因\s*[A-DＡ-Ｄ]|選項\s*[A-DＡ-Ｄ])/g, '$1<br>$2')
  .replace(/([。；])\s*(核心概念|核心記憶點|記憶點)/g, '$1<br>$2')
  .replace(/(^|<br>)\s*(正解\s*[(（][A-DＡ-Ｄ][)）]|本站補充|[(（][A-DＡ-Ｄ][)）]|原因\s*[A-DＡ-Ｄ]|選項\s*[A-DＡ-Ｄ]|核心概念|核心記憶點|記憶點)/g, '$1<strong>$2</strong>');
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); };

// ---- 進度 ----
// notes[id] = { s: 'ok' 熟練 | 'fail' 未通過, t }；passed['區域:層'] = 通過試煉時間；cur = 勇者所在區域
const ST = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
ST.notes ||= {}; ST.passed ||= {}; ST.cur ||= 'plain';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch {} };

let W, KN, POOL; // world.json、知識點 id→內容、知識點 id→相關題目
const LN = (i) => W.regions[0].layers[i].name;

// ---- 知識點↔題目對應：與 app.js 的 notesFor 同一套規則（topic 精準命中優先，否則章節內關鍵字重疊） ----
// ponytail: 雛形複製了 app.js 的對應邏輯，併回主站時改成共用一份
function buildPool(notes, questions) {
  const kNorm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const KT = new Map(), KC = new Map(), STOP = new Set(['ai', '訓練', 'in']);
  for (const n of notes) {
    for (const t of n.topics || []) { const k = kNorm(t); if (!k) continue; if (!KT.has(k)) KT.set(k, []); if (!KT.get(k).includes(n)) KT.get(k).push(n); }
    for (const c of n.chapters || []) { if (!KC.has(c)) KC.set(c, []); KC.get(c).push(n); }
  }
  const keys = (n) => n._k || (n._k = [...new Set([...(n.topics || []), ...String(n.title || '').split(/[\s,，、：:（）()／/]+/)])].map(kNorm).filter((s) => s.length >= 2 && !STOP.has(s)));
  const pool = new Map(notes.map((n) => [n.id, []]));
  for (const q of questions) {
    let hit = KT.get(kNorm(q.topic));
    if (hit) hit = hit.slice(0, 2);
    else {
      const p = KC.get(q.chapter) || [], hay = kNorm(`${q.question}${(q.options || []).join('')}${q.explanation || ''}`);
      hit = p.map((n, i) => ({ n, i, s: keys(n).reduce((a, k) => a + (hay.includes(k) ? 1 : 0), 0) }))
        .sort((a, b) => b.s - a.s || a.i - b.i).filter((x) => x.s > 0).slice(0, 2).map((x) => x.n);
    }
    for (const n of hit) pool.get(n.id).push(q);
  }
  return pool;
}

// ---- 規則 ----
const key = (r, i) => `${r.id}:${i}`;
const unlocked = (r, i) => r.layers[i].req.every((k) => ST.passed[k]);
const regionOpen = (r) => unlocked(r, 0);
const noteSt = (id, r, i) => (unlocked(r, i) ? (ST.notes[id]?.s || 'new') : 'lock');
const layerSt = (r, i) => (ST.passed[key(r, i)] ? 'pass' : unlocked(r, i) ? 'learn' : 'lock');
const layerReady = (r, i) => unlocked(r, i) && r.layers[i].notes.every((id) => ST.notes[id]);
const reqText = (req) => req.map((k) => { const [rid, l] = k.split(':'); return `${W.regions.find((x) => x.id === rid).name} ${LN(+l)}`; }).join('、');
const cnt = (r) => { const a = r.layers.flatMap((l, i) => l.notes.map((id) => noteSt(id, r, i)));
  return { all: a.length, ok: a.filter((s) => s === 'ok').length, fail: a.filter((s) => s === 'fail').length, nw: a.filter((s) => s === 'new').length }; };
const segs = (c, n) => { const ok = Math.round(n * c.ok / c.all), bad = Math.round(n * c.fail / c.all);
  return Array.from({ length: n }, (_, i) => `<i class="${i < ok ? 'on' : i < ok + bad ? 'bad' : ''}"></i>`).join(''); };
const needsMark = (r) => r.layers.some((l, i) => layerSt(r, i) !== 'lock' && (l.notes.some((id) => ST.notes[id]?.s === 'fail') || (layerSt(r, i) === 'learn' && layerReady(r, i))));

// 「繼續冒險」：先補未通過的，再學目前區域的新知識點，再挑戰可挑戰的試煉，最後才換區
function nextAction() {
  const regs = [W.regions.find((r) => r.id === ST.cur), ...W.regions.filter((r) => r.id !== ST.cur)];
  for (const r of regs) for (let i = 0; i < 3; i++) if (layerSt(r, i) !== 'lock') { // 已通過的層裡沒過的也要補
    const f = r.layers[i].notes.find((id) => ST.notes[id]?.s === 'fail'); if (f) return { kind: 'lesson', r, i, id: f, label: `重讀「${KN.get(f).title}」` };
  }
  for (const r of regs) for (let i = 0; i < 3; i++) if (layerSt(r, i) === 'learn') {
    const n = r.layers[i].notes.find((id) => !ST.notes[id]); if (n) return { kind: 'lesson', r, i, id: n, label: `學習「${KN.get(n).title}」` };
    if (layerReady(r, i)) return { kind: 'trial', r, i, label: `挑戰「${LN(i)}」試煉` };
  }
  return null;
}

// ---- 地圖（繪圖在 world-map.js）----
let MAP = null, frame = 0, timer = null;
const drawMap = () => MAP.draw({ open: Object.fromEntries(W.regions.map((r) => [r.id, regionOpen(r)])), marks: W.regions.filter(needsMark).map((r) => r.id), hero: ST.cur, frame });

// ---- 畫面：地圖 ----
let selId = null;
const LOCK = '<i class="lk" aria-hidden="true"></i>';
function hud() {
  const all = W.regions.flatMap((r) => r.layers.flatMap((l) => l.notes)), ok = all.filter((id) => ST.notes[id]?.s === 'ok').length;
  $('#hud').innerHTML = `熟練 <b>${ok}</b>/${all.length}<br>開放 <b>${W.regions.filter(regionOpen).length}</b>/${W.regions.length} 區`;
}
const regionStatus = (r) => { if (!regionOpen(r)) return '未開放'; const n = r.layers.filter((_, i) => ST.passed[key(r, i)]).length; return n === 3 ? '全部通過' : `已過 ${n}/3 層`; };
function showMap() {
  clearInterval(timer); $('#app').classList.add('map-mode'); hud();
  const na = nextAction();
  $('#view').innerHTML = `
    <div class="side-col">
      <button class="pbtn" id="go" ${na ? '' : 'disabled'}>繼續冒險<small>${na ? `${esc(na.r.name)}<br>${esc(na.label)}` : '目前沒有可做的事了'}</small></button>
      <ul class="rlist" aria-label="區域列表">${W.regions.map((r) => { const c = cnt(r), open = regionOpen(r);
        return `<li><button data-id="${r.id}" class="${r.id === selId ? 'sel' : ''}"><span class="rname ${open ? '' : 'lock'}">${open ? '' : LOCK}${esc(r.name)}</span>
          <span class="rst">${regionStatus(r)}</span>${open ? `<span class="seg">${segs(c, 12)}</span>` : ''}</button></li>`; }).join('')}</ul>
      <p class="foot"><span>進度只存在這台裝置</span><button class="lite" id="reset">重設進度</button></p>
    </div>
    <div class="mapwrap" id="mapwrap"><canvas id="cv" aria-label="世界地圖，點區域看進度"></canvas></div>`;
  const cv = $('#cv'); MAP = makeMap(cv);
  const wrap = $('#mapwrap');
  // 手機：地圖滿寬；電腦：地圖依視窗高度放到最大（≥1200 左欄放按鈕與區域列表）
  const layout = () => { const wide = innerWidth >= 1200, desk = innerWidth >= 900, V = $('#view');
    let w = V.clientWidth - (wide ? $('.side-col').offsetWidth + 36 : 20); if (desk) w = Math.min(w, (innerHeight - $('header').getBoundingClientRect().bottom - 30) * TW / TH);
    w = Math.max(240, Math.floor(w)); cv.style.width = w + 'px'; cv.style.height = w * TH / TW + 'px'; wrap.style.width = w + 'px'; };
  // 手機與窄螢幕把列表放到地圖下面
  if (innerWidth < 1200) $('#view').appendChild($('.side-col'));
  layout(); window.onresize = layout;
  W.regions.forEach((r) => {
    const P = MAP.tagPos(r.id), t = document.createElement('div'), c = cnt(r);
    t.className = 'tag' + (regionOpen(r) ? '' : ' lock') + (r.id === selId ? ' sel' : ''); t.dataset.id = r.id;
    t.style.left = P.left + '%'; t.style.top = P.top + '%';
    t.innerHTML = regionOpen(r) ? `${esc(r.name)}<span class="seg">${segs(c, 8)}</span>` : `${LOCK}${esc(r.name)}`;
    t.setAttribute('aria-hidden', 'true'); wrap.appendChild(t);
  });
  document.querySelectorAll('.rlist button').forEach((b) => (b.onclick = () => openSheet(b.dataset.id)));
  cv.onclick = (e) => { const id = MAP.regionAt(e.clientX, e.clientY); if (id && W.regions.some((r) => r.id === id)) openSheet(id); };
  $('#go').onclick = () => { if (na) run(na); };
  $('#reset').onclick = () => { if (confirm('確定清除知識大陸的全部進度？這個動作無法復原（不影響題庫練習的紀錄）。')) { ST.notes = {}; ST.passed = {}; ST.cur = 'plain'; save(); selId = null; showMap(); } };
  drawMap();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { frame++; drawMap(); }, 450);
  $('#sheet').hidden = false;
  if (selId) openSheet(selId); else if (matchMedia('(min-width:900px)').matches) openSheet(ST.cur); else $('#sheet').classList.remove('on');
}
const LYT = { pass:['通過試煉','t-pass'], learn:['冒險中','t-learn'], lock:['未開放','t-lock'] };
function openSheet(id) {
  const r = W.regions.find((x) => x.id === id), c = cnt(r), open = regionOpen(r); selId = id;
  document.querySelectorAll('.tag, .rlist button').forEach((t) => t.classList.toggle('sel', t.dataset.id === id));
  $('#sh-head').innerHTML = `
    <h2><span>${open ? '' : LOCK}${esc(r.name)}</span><button class="x" id="sh-x" aria-label="關閉">✕</button></h2>
    <div class="dom">${esc(r.domain)}</div>
    <div class="hp"><span>熟練</span><div class="bar">${segs(c, 12)}</div><span>${c.ok}/${c.all}</span></div>
    <div class="nums"><span class="ok">熟練 ${c.ok}</span><span class="bad">未通過 ${c.fail}</span><span>未學 ${c.nw}</span></div>
    ${open ? '' : `<div class="cond">開放條件：通過「${esc(reqText(r.layers[0].req))}」試煉</div>`}`;
  $('#sh-body').innerHTML = (r.cert ? certHtml(r) : '') + r.layers.map((l, i) => {
    const st = layerSt(r, i), [tag, cls] = LYT[st], ready = layerReady(r, i);
    return `<div class="layer ${st === 'lock' ? 'lock' : ''}">
      <div class="ly-h"><span>${esc(l.name)}　${l.notes.length} 則</span><span class="t ${cls}">${tag}</span></div>
      ${st === 'lock' && open ? `<div class="lc">通過「${esc(reqText(l.req))}」試煉後開放</div>` : ''}
      <ul class="pts">${l.notes.map((nid) => { const s = noteSt(nid, r, i);
        return `<li class="s-${s}" data-id="${nid}" data-i="${i}" ${s === 'lock' ? '' : 'tabindex="0" role="button"'}><span class="ic">${{ ok:'✓', fail:'!', new:'', lock:'' }[s]}</span><span>${esc(KN.get(nid).title)}</span>${s === 'fail' ? '<span class="hint">重讀</span>' : ''}</li>`; }).join('')}</ul>
      ${st === 'learn' ? `<button class="pbtn trial" data-i="${i}" ${ready ? '' : 'disabled'}>${ready ? `挑戰試煉（答對 ${Math.round(W.meta.passRate * 100)}% 通過）` : `讀完這層 ${l.notes.length} 則才能挑戰試煉，還差 ${l.notes.filter((n) => !ST.notes[n]).length} 則`}</button>` : ''}
      ${st === 'pass' ? `<button class="pbtn sec trial" data-i="${i}">再挑戰一次試煉</button>` : ''}
    </div>`;
  }).join('');
  $('#sh-x').onclick = () => { selId = null; $('#sheet').classList.remove('on'); document.querySelectorAll('.tag, .rlist button').forEach((t) => t.classList.remove('sel')); };
  $('#sh-body').querySelectorAll('li').forEach((li) => { const go = () => { if (li.classList.contains('s-lock')) return toast('這層還沒開放'); run({ kind:'lesson', r, i:+li.dataset.i, id:li.dataset.id }); };
    li.onclick = go; li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  $('#sh-body').querySelectorAll('button.trial').forEach((b) => b.onclick = () => { if (!b.disabled) run({ kind:'trial', r, i:+b.dataset.i }); });
  $('#sheet').classList.add('on');
}
// 官方證書由 Anthropic 在 Skilljar 發放，本站無法代為登錄完成狀態，只能帶使用者過去
function certHtml(r) {
  const done = r.layers.every((_, i) => ST.passed[key(r, i)]);
  return `<div class="layer"><div class="ly-h"><span>官方證書</span><span class="t ${done ? 't-pass' : 't-lock'}">${done ? '可以領取' : '三層都通過後解鎖'}</span></div>
    <div class="lc plain">${done
      ? `你已經走完 ${esc(r.name)}。證書由 Anthropic 在 Skilljar 發放，本站沒辦法替你登錄完成，請到官方課程頁註冊（免費）、完成「${esc(r.cert.name)}」並通過課程測驗。<br><a href="${esc(r.cert.url)}" target="_blank" rel="noopener">前往 ${esc(r.cert.name)} 官方課程</a>`
      : `這座島對應 Anthropic 官方的「${esc(r.cert.name)}」課程。三層試煉都通過後，這裡會帶你去官方課程頁考測驗、領證書。`}</div></div>`;
}
async function run(a) {
  ST.cur = a.r.id; save();
  clearInterval(timer); $('#sheet').classList.remove('on'); $('#sheet').hidden = true; $('#app').classList.remove('map-mode'); scrollTo(0, 0);
  if (!POOL) { $('#view').innerHTML = '<p class="loading">題目載入中…</p>';
    try { await poolReady; } catch { $('#view').innerHTML = '<p class="loading">題目載入失敗，請重新整理。</p>'; return; } }
  a.kind === 'lesson' ? lesson(a.r, a.i, a.id) : trial(a.r, a.i);
}

// ---- 題目卡（小檢查與試煉共用）：答完一定顯示解析 ----
function qHtml(q) {
  return `<p class="q">${esc(q.question)}</p>${q.image ? `<img src="${esc(q.image)}" alt="題目附圖">` : ''}
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">(${'ABCD'[k]}) ${esc(o)}</button>`).join('')}</div><div id="fbx"></div>`;
}
function bindQ(q, onDone) {
  document.querySelectorAll('.opt').forEach((b) => b.onclick = () => {
    const k = +b.dataset.k, right = k === q.answer;
    document.querySelectorAll('.opt').forEach((x) => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.answer) x.classList.add('right'); else if (kk === k) x.classList.add('wrong'); });
    $('#fbx').innerHTML = `<div class="fb"><div class="res ${right ? 'ok' : 'bad'}">${right ? '答對了' : `答錯了，正解是 (${'ABCD'[q.answer]})`}</div>${q.explanation ? formatExp(q.explanation) : ''}</div>`;
    onDone(right);
  });
}
// 學習與試煉頁的共用骨架：頂端一條（回地圖、標題、進度點），左卡片＋下方按鈕列，寬螢幕右側大綱
function page({ title, dots = '', main, nav, side = '', onBack }) {
  $('#view').innerHTML = `<div class="lbar win"><button class="back" id="back">回地圖</button><span class="ttl">${esc(title)}</span><span class="dots" aria-hidden="true">${dots}</span>${side ? '<button class="pbtn-s" id="prog" aria-expanded="false" aria-controls="lside">進度</button>' : ''}</div>
    <div class="lgrid"><div class="lmain"><div class="card win" id="card">${main}</div><div class="nav">${nav}</div></div></div>
    ${side ? `<aside class="lside win" id="lside" aria-label="這一則的大綱與進度" hidden>${side}</aside>` : ''}`;
  $('#back').onclick = onBack || showMap;
  const pb = $('#prog'), ls = $('#lside');
  if (pb) {
    const set = (on) => { ls.hidden = !on; pb.setAttribute('aria-expanded', on); };
    pb.onclick = (e) => { e.stopPropagation(); set(ls.hidden); };
    ls.onclick = (e) => e.stopPropagation();
    $('#view').onclick = () => set(false);
    $('#view').onkeydown = (e) => { if (e.key === 'Escape' && !ls.hidden) { set(false); pb.focus(); } };
  }
}
// 右側：這一層的知識點與狀態
function layerSide(r, i, curId) {
  const L = r.layers[i];
  return `<section><h3>${esc(r.name)}　${esc(L.name)}</h3><ul class="olist">${L.notes.map((nid) => { const s = noteSt(nid, r, i);
    return `<li><span class="it ${nid === curId ? 'cur' : s === 'new' ? 'dim' : ''}"><span class="ic ${''}" style="flex:none">${{ ok:'✓', fail:'!', new:'', lock:'' }[s]}</span>${esc(KN.get(nid).title)}</span></li>`; }).join('')}</ul></section>`;
}

// ---- 畫面：學一則知識點（滑卡）----
function lesson(r, i, id) {
  const n = KN.get(id), qs = shuffle(POOL.get(id) || []).slice(0, 2);
  const cards = [{ kind:'重點', html:`<p class="big">${esc(n.summary)}</p>` }];
  String(n.body || '').split('\n').filter(Boolean).forEach((p, j, a) => cards.push({ kind:`內容 ${j + 1}/${a.length}`, html:`<p>${esc(p)}</p>` }));
  if ((n.pitfalls || []).length) cards.push({ kind:'容易搞混', pit:true, html:`<ul>${n.pitfalls.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` });
  const refs = (n.refs || []).length ? `<div class="refs">出處：${n.refs.map((x) => x.u ? `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>` : esc(x.t)).join('、')}</div>` : '';
  let refAt = cards.length - 1; // 出處掛在最後一張閱讀卡
  // 電腦版畫面寬：整則閱讀內容放同一張卡（左：重點＋內容；右：容易搞混＋出處），不必一段一段翻
  if (matchMedia('(min-width:900px)').matches) {
    const body = String(n.body || '').split(/\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const pit = (n.pitfalls || []).length ? `<h3>容易搞混</h3><ul>${n.pitfalls.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    cards.length = 0; cards.push({ kind:'閱讀', html:`<div class="read"><div><p class="big">${esc(n.summary)}</p>${body}</div><div class="pitcol">${pit}${refs}</div></div>` }); refAt = -1;
  }
  qs.forEach((q, j) => cards.push({ kind:`小檢查 ${j + 1}/${qs.length}`, chk:true, q }));
  if (!qs.length) cards.push({ kind:'小檢查', html:'<p>這則目前沒有對應的題目，讀完就算學過。</p>' });
  let at = 0, wrongs = 0; const answered = new Set();
  const finish = () => {
    const pass = wrongs === 0; ST.notes[id] = { s: pass ? 'ok' : 'fail', t: Date.now() }; save();
    const ready = layerSt(r, i) === 'learn' && layerReady(r, i), nx = r.layers[i].notes.find((x) => !ST.notes[x]);
    page({ title: n.title, side: layerSide(r, i, id),
      main: `<div class="result"><h2>${pass ? '熟練！' : '再讀一次就好'}</h2>
        <p>${pass ? '這則知識點點亮了。' : `小檢查答錯 ${wrongs} 題，這則先標成「未通過」，之後重讀再檢查一次就好。`}</p>
        ${ready ? `<div class="unlock">「${esc(r.name)}　${esc(LN(i))}」的 ${r.layers[i].notes.length} 則都讀過了，可以挑戰試煉。</div>` : ''}</div>`,
      nav: `${ready ? '<button class="pbtn" id="r-trial">挑戰試煉</button>' : nx ? '<button class="pbtn" id="r-next">下一則</button>' : ''}
        ${pass ? '' : '<button class="pbtn sec" id="r-again">重讀</button>'}<button class="pbtn sec" id="r-map">回地圖</button>` });
    $('#r-map').onclick = showMap;
    if ($('#r-trial')) $('#r-trial').onclick = () => trial(r, i);
    if ($('#r-next')) $('#r-next').onclick = () => lesson(r, i, nx);
    if ($('#r-again')) $('#r-again').onclick = () => lesson(r, i, id);
  };
  const draw = () => {
    const c = cards[at], last = at === cards.length - 1;
    const outline = `<section><h3>這一則</h3><ul class="olist">${cards.map((x, j) => {
      const can = !x.chk || answered.has(j) || j <= at, cls = j === at ? 'cur' : j > at ? 'dim' : '';
      return `<li>${can && j !== at ? `<button data-j="${j}" class="${cls}">${esc(x.kind)}</button>` : `<span class="it ${cls}">${esc(x.kind)}</span>`}</li>`; }).join('')}</ul></section>`;
    page({ title: n.title, dots: cards.map((_, j) => `<i class="${j === at ? 'on' : j < at ? 'done' : ''}"></i>`).join(''),
      main: `<span class="kind ${c.pit ? 'pit' : ''} ${c.chk ? 'chk' : ''}">${esc(c.kind)}</span>${c.q ? qHtml(c.q) : c.html}${at === refAt ? refs : ''}`,
      nav: `<button class="pbtn sec" id="prev" ${at === 0 ? 'disabled' : ''}>上一張</button>
        <button class="pbtn" id="next" ${c.q && !answered.has(at) ? 'disabled' : ''}>${last ? '完成' : c.q ? '下一題' : '下一張'}</button>`,
      side: outline + layerSide(r, i, id) });
    $('#prev').onclick = () => { if (at > 0) { at--; draw(); } };
    $('#next').onclick = () => { if (last) finish(); else { at++; draw(); } };
    document.querySelectorAll('.lside button[data-j]').forEach((b) => (b.onclick = () => { at = +b.dataset.j; draw(); }));
    if (c.q) {
      if (answered.has(at)) { $('#card').innerHTML = `<span class="kind chk">${esc(c.kind)}</span><p class="q">${esc(c.q.question)}</p><p>這題答過了。</p>`; }
      else bindQ(c.q, (ok) => { answered.add(at); if (!ok) wrongs++; $('#next').disabled = false; });
    }
    // 左右滑換卡（作答中的卡不能滑走）
    const card = $('#card'); let x0 = null;
    card.onpointerdown = (e) => { x0 = e.clientX; };
    card.onpointerup = (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) < 60 || (c.q && !answered.has(at))) return;
      if (dx < 0 && !last) { at++; draw(); } else if (dx > 0 && at > 0) { at--; draw(); } };
  };
  draw();
}

// ---- 畫面：試煉 ----
function trial(r, i) {
  const L = r.layers[i], N = 8, picks = [], owner = new Map(), res = [];
  const pools = shuffle(L.notes).map((id) => ({ id, qs: shuffle(POOL.get(id) || []) }));
  for (let round = 0; picks.length < N && pools.some((p) => p.qs.length); round++)
    for (const p of pools) { if (picks.length >= N) break; const q = p.qs.shift(); if (q && !owner.has(q.id)) { owner.set(q.id, p.id); picks.push(q); } }
  let at = 0, right = 0; const missed = new Set(), need = () => Math.ceil(picks.length * W.meta.passRate);
  const title = `${r.name}　${L.name}試煉`;
  const draw = () => {
    const q = picks[at];
    page({ title, onBack: () => { if (confirm('離開會放棄這次試煉，確定嗎？')) showMap(); },
      dots: picks.map((_, j) => `<i class="${j === at ? 'on' : res[j] === true ? 'ok' : res[j] === false ? 'bad' : ''}"></i>`).join(''),
      main: `<span class="kind chk">試煉 ${at + 1}/${picks.length}</span>${qHtml(q)}`,
      nav: `<button class="pbtn" id="next" disabled>${at === picks.length - 1 ? '看結果' : '下一題'}</button>`,
      side: `<section><h3>試煉進度</h3><p style="margin:0 0 8px">答對 ${right} 題，要答對 ${need()} 題才通過（${Math.round(W.meta.passRate * 100)}%）。</p>
        <ul class="olist">${picks.map((_, j) => `<li><span class="it ${j === at ? 'cur' : j > at ? 'dim' : ''}">第 ${j + 1} 題　${res[j] === true ? '答對' : res[j] === false ? '答錯' : j === at ? '作答中' : ''}</span></li>`).join('')}</ul></section>` });
    bindQ(q, (ok) => { res[at] = ok; if (ok) right++; else missed.add(owner.get(q.id)); $('#next').disabled = false; });
    $('#next').onclick = () => { if (at < picks.length - 1) { at++; draw(); } else done(); };
  };
  const done = () => {
    const before = new Set(W.regions.filter(regionOpen).map((x) => x.id)), pass = right / picks.length >= W.meta.passRate;
    missed.forEach((id) => (ST.notes[id] = { s:'fail', t:Date.now() }));
    if (pass) ST.passed[key(r, i)] ||= Date.now();
    save();
    const opened = W.regions.filter((x) => regionOpen(x) && !before.has(x.id));
    const nextLayer = pass && i < 2 && unlocked(r, i + 1) ? `${r.name}　${LN(i + 1)}` : '';
    page({ title, side: layerSide(r, i, null),
      main: `<div class="result"><h2>${pass ? '試煉通過！' : '試煉未通過'}</h2>
        <div class="score" style="color:${pass ? 'var(--g)' : 'var(--r)'}">${right}/${picks.length}</div>
        <p>要答對 ${need()} 題（${Math.round(W.meta.passRate * 100)}%）。</p>
        ${nextLayer ? `<div class="unlock">開放了「${esc(nextLayer)}」</div>` : ''}
        ${opened.map((x) => `<div class="unlock">新區域開放：${esc(x.name)}（${esc(x.domain)}）</div>`).join('')}
        ${missed.size ? `<p>答錯的題目來自這些知識點，已標成「未通過」，回去重讀就好：</p><ul>${[...missed].map((id) => `<li>${esc(KN.get(id).title)}</li>`).join('')}</ul>` : ''}</div>`,
      nav: '<button class="pbtn" id="r-map">回地圖</button>' });
    $('#r-map').onclick = showMap;
  };
  if (!picks.length) { toast('這層沒有可用的試煉題'); return showMap(); }
  draw();
}

// ---- 啟動 ----
// 地圖只需要 world.json 與知識點；3.5MB 的題庫在背景下載，進入小檢查或試煉時才等它
const getJSON = (u) => fetch(u).then((x) => { if (!x.ok) throw new Error(u); return x.json(); });
let poolReady = null;
(async () => {
  try {
    const [w, k, cn] = await Promise.all([getJSON('world.json'), getJSON('knowledge.json'), getJSON('claude-notes.json').catch(() => null)]);
    W = w; KN = new Map(k.notes.map((n) => [n.id, n]));
    // Claude 工坊島：知識點與題目放獨立檔，不混進 iPAS 題庫；題目直接用 note 欄位對到知識點
    if (cn) cn.forEach((n) => KN.set(n.id, n)); else W.regions = W.regions.filter((x) => x.id !== 'claude');
    // 小檢查與試煉題優先用 world-pool.json（逐題人工判斷過「考的就是這則」的對應表），沒有才退回關鍵字自動配對
    poolReady = Promise.all([getJSON('questions.json'), cn ? getJSON('claude-quiz.json') : [], getJSON('world-pool.json').catch(() => null)]).then(([q, cq, wp]) => {
      if (wp) { const QM = new Map(q.questions.map((x) => [x.id, x])); POOL = new Map(k.notes.map((n) => [n.id, (wp[n.id] || []).map((id) => QM.get(id)).filter(Boolean)])); }
      else POOL = buildPool(k.notes, q.questions);
      if (cn) { cn.forEach((n) => POOL.set(n.id, [])); cq.forEach((x) => POOL.get(x.note)?.push(x)); }
    });
    showMap();
  } catch (e) { $('#view').innerHTML = `<p class="center" style="margin-top:40px">載入失敗：${esc(e.message)}，請重新整理。</p>`; }
})();
