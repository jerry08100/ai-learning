// 知識大陸：架空地圖上逐區學知識點。兩個國家共用這支，頁面 <body data-country> 決定是哪一國：
// - ai（ai.html）：AI 智能國。world.json＋knowledge.json＋questions.json，進度存 'ipas-world'（沿用舊 key，舊進度不動）
// - earth（earth.html）：地球永續國。earth-world.json＋earth-notes.json＋earth-quiz.json，進度存 'earth-world'
// 進度只存在本機，不碰主站的練習進度與同步；兩國互不解鎖。

import { mountFx } from './fx.js';
import { mount, termsCard, trapsCard, KIND, GATED, tx } from './lessonkit.js';

const CC = document.body.dataset.country === 'earth' ? 'earth' : 'ai';
const CFG = {
  ai: { key: 'ipas-world', start: 'plain', map: './world-map.js', name: '知識大陸', port: { id: 'arena', name: '演武島', domain: 'iPAS 題庫練習' } },
  earth: { key: 'earth-world', start: 'climate', map: './earth-map.js', name: '地球永續國', port: { id: 'arena', name: '演武島', domain: 'iPAS 淨零碳題庫練習' } },
}[CC];
let makeMap, TW, TH, LAYOUT; // 地圖繪製器依國家動態載入
const KEY = CFG.key;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 解析斷行與粗體，規則同 app.js 的 formatExp（雛形先複製一份；併回主站時改共用）
const unesc = (s) => s.replace(/&(amp|lt|gt|quot);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"' }[k]));
// 標記之間的文字交給 lessonkit 的 tx() 插詞邊界 <wbr>（CSS .fb keep-all），解析不再把「基線」拆成兩行
const formatExp = (t) => fmtExp0(t).split(/(<[^>]+>)/).map((p, i) => (i % 2 || !p ? p : tx(unesc(p)))).join('');
const fmtExp0 = (t) => esc(t)
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
ST.notes ||= {}; ST.passed ||= {}; ST.cur ||= CFG.start;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch {} };

let W, KN, POOL, LS = new Map(); // world.json、知識點 id→內容、知識點 id→相關題目、知識點 id→互動關卡（*-lessons.json）
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
let MAP = null, FX = null, frame = 0, timer = null;
// 演武島（只有 AI 國）：原本的 iPAS 題庫練習（practice.html），不走知識點與試煉，一開始就能進
const PORT = CFG.port;
const drawMap = () => { MAP.draw({ open: { ...Object.fromEntries(W.regions.map((r) => [r.id, regionOpen(r)])), ...(PORT ? { [PORT.id]: true } : {}) }, marks: W.regions.filter(needsMark).map((r) => r.id), hero: ST.cur, frame }); FX?.update(); };

// ---- 畫面：地圖 ----
let selId = null, foldList = false;
// 區域清單照學習順序由上往下：開放前要先通過的層數少的在上（使用者 2026-11-14）；層數相同再照地圖由上往下、由左往右
const need = (k, seen = new Set()) => { const [rid, i] = k.split(':'); for (const x of W.regions.find((r) => r.id === rid).layers[+i].req) if (!seen.has(x)) { seen.add(x); need(x, seen); } return seen; };
const byMap = () => [...W.regions].map((r) => [r, need(`${r.id}:0`).size]).sort(([a, na], [b, nb]) => { if (na !== nb) return na - nb;
  const A = LAYOUT[a.id] || { sx: 0, sy: 99 }, B = LAYOUT[b.id] || { sx: 0, sy: 99 }; return Math.abs(A.sy - B.sy) < 4 ? A.sx - B.sx : A.sy - B.sy; }).map(([r]) => r);
const LOCK = '<i class="lk" aria-hidden="true"></i>';
function hud() {
  const all = W.regions.flatMap((r) => r.layers.flatMap((l) => l.notes)), ok = all.filter((id) => ST.notes[id]?.s === 'ok').length;
  $('#hud').innerHTML = `熟練 <b>${ok}</b>/${all.length}<br>開放 <b>${W.regions.filter(regionOpen).length}</b>/${W.regions.length} 區`;
}
const regionStatus = (r) => { if (!regionOpen(r)) return '未開放'; const n = r.layers.filter((_, i) => ST.passed[key(r, i)]).length; return n === 3 ? '全部通過' : `已過 ${n}/3 層`; };
function showMap() {
  clearInterval(timer); FX?.stop(); $('#app').classList.add('map-mode'); hud();
  const na = nextAction();
  $('#view').innerHTML = `
    <div class="side-col win ${foldList ? 'fold' : ''}">
      <button class="fold-btn" id="fold" aria-expanded="${!foldList}">${foldList ? '展開清單' : '收合清單'}</button>
      <button class="pbtn" id="go" ${na ? '' : 'disabled'}>繼續冒險<small>${na ? `${esc(na.r.name)}<br>${esc(na.label)}` : '目前沒有可做的事了'}</small></button>
      <ul class="rlist" aria-label="區域列表">${byMap().map((r) => { const c = cnt(r), open = regionOpen(r);
        return `<li><button data-id="${r.id}" class="${r.id === selId ? 'sel' : ''}"><span class="rname ${open ? '' : 'lock'}">${open ? '' : LOCK}${esc(r.name)}</span>
          <span class="rst">${regionStatus(r)}</span>${open ? `<span class="seg">${segs(c, 12)}</span>` : ''}</button></li>`; }).join('')}
        ${PORT ? `<li><button data-id="${PORT.id}" class="${PORT.id === selId ? 'sel' : ''}"><span class="rname">${PORT.name}</span><span class="rst">${PORT.domain}</span></button></li>` : ''}</ul>
      <p class="foot"><span>進度只存在這台裝置</span><button class="lite" id="reset">重設進度</button></p>
    </div>
    <div class="mapbox" id="mapbox"><div class="mapview" id="mapview"><div class="mapwrap" id="mapwrap"><canvas id="cv" aria-label="地圖，點區域看進度；可拖曳或滾輪移動"></canvas></div></div></div>`;
  const cv = $('#cv'); MAP = makeMap(cv);
  const wrap = $('#mapwrap'), view = $('#mapview'), box = $('#mapbox');
  // 電腦版：地圖滿版吃滿頁首以下（使用者 2026-11-14），寬度貼齊、高度超出就拖曳／滾輪上下移動，像遊戲鏡頭；清單與區域面板浮在上面
  // 手機：地圖滿寬、清單放在地圖下面、區域面板從底部滑上來
  const layout = () => { const desk = innerWidth >= 900, V = $('#view');
    // 電腦版寬度＝左右兩個浮動面板之間的空間（至少整張塞滿高度），外圍是同色深海，看起來一樣滿版
    const w = Math.max(240, Math.floor(desk ? Math.min(V.clientWidth, Math.max(V.clientHeight * TW / TH, V.clientWidth - 2 * Math.min(380, V.clientWidth * .28))) : V.clientWidth - 20)), h = Math.round(w * TH / TW);
    cv.style.width = w + 'px'; cv.style.height = h + 'px'; wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
    if (desk) { box.style.width = box.style.height = ''; document.documentElement.style.setProperty('--maptop', Math.round($('header').getBoundingClientRect().bottom + 12) + 'px'); }
    else { box.style.width = w + 'px'; box.style.height = h + 'px'; } };
  if (innerWidth < 900) $('#view').appendChild($('.side-col'));
  $('#fold').onclick = () => { foldList = !foldList; const sc = $('.side-col'); sc.classList.toggle('fold', foldList); $('#fold').textContent = foldList ? '展開清單' : '收合清單'; $('#fold').setAttribute('aria-expanded', !foldList); };
  layout(); window.onresize = layout;
  FX = mountFx(wrap, cv, { outer: box });
  { const P = MAP.tagPos(ST.cur) || { top: 50 }; view.scrollTop = P.top / 100 * wrap.offsetHeight - view.clientHeight / 2; } // 鏡頭先對準勇者所在區域
  // 滑鼠拖曳移動鏡頭；拖過就不算點擊
  let drag = null, dragged = false;
  view.onpointerdown = (e) => { if (e.pointerType !== 'mouse' || e.button) return; drag = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop }; dragged = false; };
  view.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { dragged = true; view.classList.add('drag'); }
    if (dragged) { view.scrollLeft = drag.l - dx; view.scrollTop = drag.t - dy; } };
  view.onpointerup = view.onpointerleave = () => { drag = null; view.classList.remove('drag'); };
  W.regions.forEach((r) => {
    const P = MAP.tagPos(r.id), t = document.createElement('div'), c = cnt(r);
    t.className = 'tag' + (regionOpen(r) ? '' : ' lock') + (r.id === selId ? ' sel' : ''); t.dataset.id = r.id;
    t.style.left = P.left + '%'; t.style.top = P.top + '%';
    t.innerHTML = regionOpen(r) ? `${esc(r.name)}<span class="seg">${segs(c, 8)}</span>` : `${LOCK}${esc(r.name)}`;
    t.setAttribute('aria-hidden', 'true'); wrap.appendChild(t);
    if (r.id === ST.cur) { // 目前所在區域：聚落上方插一支會跳的「你在這裡」旗標（使用者 2026-11-15：只有小人看不出在哪）
      t.classList.add('here'); const pin = document.createElement('div'); pin.className = 'here-pin'; pin.innerHTML = '<span>你在這裡</span>';
      pin.style.left = P.left + '%'; pin.style.top = Math.max(2, P.top - 12) + '%'; pin.setAttribute('aria-hidden', 'true'); wrap.appendChild(pin); }
  });
  if (PORT) { const P = MAP.tagPos(PORT.id), t = document.createElement('div'); t.className = 'tag' + (selId === PORT.id ? ' sel' : ''); t.dataset.id = PORT.id;
    t.style.left = P.left + '%'; t.style.top = P.top + '%'; t.textContent = PORT.name; t.setAttribute('aria-hidden', 'true'); wrap.appendChild(t); }
  document.querySelectorAll('.rlist button').forEach((b) => (b.onclick = () => openSheet(b.dataset.id)));
  cv.onclick = (e) => { if (dragged) { dragged = false; return; } const id = MAP.regionAt(e.clientX, e.clientY); if (id && (id === PORT?.id || W.regions.some((r) => r.id === id))) openSheet(id); };
  $('#go').onclick = () => { if (na) run(na); };
  $('#reset').onclick = () => { if (confirm(`確定清除${CFG.name}的全部進度？這個動作無法復原（不影響${CC === 'ai' ? '題庫練習的紀錄' : '另一國的進度'}）。`)) { ST.notes = {}; ST.passed = {}; ST.cur = CFG.start; save(); selId = null; showMap(); } };
  drawMap();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { frame++; drawMap(); }, 450);
  $('#sheet').hidden = false;
  if (selId) openSheet(selId); else if (matchMedia('(min-width:900px)').matches) openSheet(ST.cur); else $('#sheet').classList.remove('on');
}
const LYT = { pass:['通過試煉','t-pass'], learn:['冒險中','t-learn'], lock:['未開放','t-lock'] };
function portSheet() {
  $('#sh-head').innerHTML = `<h2><span>${PORT.name}</span><button class="x" id="sh-x" aria-label="關閉">✕</button></h2><div class="dom">${PORT.domain}</div>`;
  $('#sh-body').innerHTML = `<div class="layer"><div class="lc plain">${CC === 'earth' ? 'iPAS 淨零碳規劃管理師 115 年官方試題都在這座島：照科目練習、背題、模擬考、錯題本和筆記。紀錄跟永續國地圖分開存。' : '原本的 iPAS AI 應用規劃師題庫都在這座島：照章節練習、背題、模擬考、錯題本和筆記。紀錄跟知識大陸分開存。'}</div>
    <a class="pbtn trial" href="${CC === 'earth' ? 'earth-practice.html' : 'practice.html'}">進入演武島</a></div>`;
}
function openSheet(id) {
  if (id === PORT?.id) { selId = id; document.querySelectorAll('.tag, .rlist button').forEach((t) => t.classList.toggle('sel', t.dataset.id === id)); portSheet(); bindSheetX(); $('#sheet').classList.add('on'); return; }
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
  bindSheetX();
  $('#sh-body').querySelectorAll('li').forEach((li) => { const go = () => { if (li.classList.contains('s-lock')) return toast('這層還沒開放'); run({ kind:'lesson', r, i:+li.dataset.i, id:li.dataset.id }); };
    li.onclick = go; li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  $('#sh-body').querySelectorAll('button.trial').forEach((b) => b.onclick = () => { if (!b.disabled) run({ kind:'trial', r, i:+b.dataset.i }); });
  $('#sheet').classList.add('on');
}
function bindSheetX() { $('#sh-x').onclick = () => { selId = null; $('#sheet').classList.remove('on'); document.querySelectorAll('.tag, .rlist button').forEach((t) => t.classList.remove('sel')); }; }
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
  clearInterval(timer); FX?.stop(); $('#sheet').classList.remove('on'); $('#sheet').hidden = true; $('#app').classList.remove('map-mode'); scrollTo(0, 0);
  if (!POOL || !lsDone) { $('#view').innerHTML = '<p class="loading">題目載入中…</p>';
    try { await Promise.all([poolReady, lsReady]); } catch { $('#view').innerHTML = '<p class="loading">題目載入失敗，請重新整理。</p>'; return; } }
  a.kind === 'lesson' ? lesson(a.r, a.i, a.id) : trial(a.r, a.i);
}

// ---- 題目卡（小檢查與試煉共用）：答完一定顯示解析 ----
function qHtml(q, ghost) { // ghost：把解析先隱形排進去撐版，作答前後版面一樣大（小檢查卡用，才能依空間放大字級）
  const gh = ghost ? `<div class="fb ghost" aria-hidden="true"><div class="res">答錯了，正解是 (A)</div>${q.explanation ? formatExp(q.explanation) : ''}</div>` : '';
  return `<div class="qwrap"><p class="q">${esc(q.question)}</p>${q.image ? `<img src="${esc(q.image)}" alt="題目附圖">` : ''}
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">(${'ABCD'[k]}) ${esc(o)}</button>`).join('')}</div><div id="fbx"><div class="fb-ph">${gh}<span class="fb-ph-t">選好答案後，解析會顯示在這裡。</span></div></div></div>`;
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
  { const cd = $('#card'); $('.nav').insertAdjacentHTML('afterbegin', '<div class="scrollcue" aria-hidden="true">▼ 往下還有內容</div>'); cd.onscroll = cue; } // 提示放在卡片外（按鈕列上方的空條），不蓋內容
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
// 名詞小視窗：滑鼠移過去或鍵盤聚焦就顯示；手機點一下顯示、點別處關掉
const tip = document.createElement('div'); tip.className = 'tip win'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip);
let tipFor = null, tipAt = 0;
function showTip(el) {
  if (tipFor !== el) tipAt = Date.now(); tipFor = el; tip.textContent = el.dataset.d; tip.hidden = false;
  const b = el.getBoundingClientRect(), w = Math.min(420, innerWidth - 24); tip.style.width = w + 'px';
  tip.style.left = Math.max(12, Math.min(b.left + b.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
  const h = tip.offsetHeight; tip.style.top = (b.bottom + 8 + h < innerHeight ? b.bottom + 8 : b.top - h - 8) + 'px';
}
function hideTip() { tip.hidden = true; tipFor = null; }
document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('.tm'); if (t) showTip(t); else if (tipFor) hideTip(); });
document.addEventListener('focusin', (e) => { const t = e.target.closest?.('.tm'); if (t) showTip(t); });
document.addEventListener('focusout', (e) => { if (e.target.closest?.('.tm')) hideTip(); });
document.addEventListener('click', (e) => { const t = e.target.closest?.('.tm'); if (!t) return hideTip(); if (tipFor === t && !tip.hidden && Date.now() - tipAt > 400) hideTip(); else showTip(t); }); // 手機點一下會先觸發 mouseover，0.4 秒內的點擊不當成關閉
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
addEventListener('scroll', hideTip, true);
// 關卡卡片內容依卡片可用高度放大（電腦版卡片固定一屏高；手機照常捲動不放大）。作答後會長內容的卡型留一點空間
const GROW = new Set(['guess', 'sort', 'timeline', 'calc', 'toggles']);
// 卡內放不下要能捲時，底部出現漸層與「往下還有」提示（使用者看得出能捲）
function cue() { const c = $('#card'); if (!c) return; c.classList.toggle('more', matchMedia('(min-width:900px)').matches && c.scrollHeight > c.clientHeight + 4 && c.scrollTop + c.clientHeight < c.scrollHeight - 4); }
// 流程步驟換行後，每列最後一步不畫往右的箭頭（箭頭會指到框外）
const flowArrows = (only) => (only ? [only] : document.querySelectorAll('.lk-flow')).forEach((ol) => { const li = [...ol.children]; li.forEach((x, i) => x.classList.toggle('eol', i === li.length - 1 || li[i + 1].offsetTop !== x.offsetTop)); });
function fitCard(shrinkOnly) { const cd = $('#card'); if (cd) { cd.style.flex = ''; cd.classList.remove('fill'); } fitCard0(shrinkOnly);
  // 記憶點、開關卡內容少：字級到頂後讓內容撐滿卡片（CSS .fill），其他卡內容矮就收高面板
  if (cd && matchMedia('(min-width:900px)').matches && cd.querySelector('.lk-fit > .lk-memo, #lkb > .lk-tog')) cd.classList.add('fill'); else collapseCard();
  flowArrows(); cue(); }
// 進卡先粗算一次，等字型、卡內圖片載完、再過兩個 frame（版面穩定）後完整重算；換卡太快時舊卡的延後重算用代號擋掉
let fitGen = 0;
function fitCardSettled() {
  const g = ++fitGen, cd = $('#card'); fitCard();
  const imgs = [...(cd?.querySelectorAll('img') || [])].filter((x) => !x.complete).map((x) => new Promise((ok) => { x.addEventListener('load', ok, { once: true }); x.addEventListener('error', ok, { once: true }); }));
  Promise.all([document.fonts?.ready, ...imgs]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (g === fitGen && cd?.isConnected) fitCard(); })));
}
// 內容（字級已到上限）比卡片矮很多時，面板依內容收高，按鈕列仍貼底，不留一大片空白
function collapseCard() { const card = $('#card'), last = card?.lastElementChild; if (!last || !document.querySelector('#card .lk-fit') || !matchMedia('(min-width:900px)').matches) return;
  const need = last.getBoundingClientRect().bottom - card.getBoundingClientRect().top + parseFloat(getComputedStyle(card).paddingBottom); if (need < card.clientHeight * 0.9) card.style.flex = 'none'; }
function fitCard0(shrinkOnly) { // shrinkOnly：作答後內容變長時只往小調（到 18px 為止），不往大調，避免畫面跳動
  const box = document.querySelector('#card .lk-fit'); if (!box) return;
  if (!shrinkOnly) box.style.fontSize = '';
  if (!matchMedia('(min-width:900px)').matches) return;
  const card = $('#card'), cs = getComputedStyle(card), head = card.firstElementChild;
  const avail = (card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - head.offsetHeight - 16) * (box.dataset.grow && !shrinkOnly && !box.classList.contains('solved') ? (box.dataset.grow === 'calc' ? 0.96 : 0.82) : 0.97);
  // 流程卡：先依當下版面重算列尾箭頭再量（列尾箭頭會伸出框外，用上一次版面留下的 eol 判會誤判溢出，字卡在小號、拉大視窗與直接進卡結果不同；v117）；步驟內文字不准溢出步驟框
  const ol = box.querySelector('.lk-flow'), olt = ol ? ol.querySelectorAll('b, em') : [];
  // 步驟框至少 7 個字寬（18px 時不限），免得排成一列窄柱、每行只有四五個字
  const wide = () => { const fs = parseFloat(getComputedStyle(box).fontSize); return fs <= 18.5 || ol.firstElementChild.clientWidth >= 7 * fs; };
  const ok = () => { if (ol) flowArrows(ol); return box.scrollHeight <= avail && box.scrollWidth <= box.clientWidth + 1 && (!ol || ([...olt].every((e) => e.scrollWidth <= e.clientWidth + 1) && wide())); };
  const top = Math.round(Math.min(64, 40 * Math.max(1, Math.min(innerWidth / 1500, innerHeight / 800)))); // 上限 40px，超大螢幕再放大到 64px，免得內容縮在中間留一大片空
  let lo = 18, hi = top;
  if (shrinkOnly) { if (ok()) return; hi = parseFloat(box.style.fontSize) || top; }
  const search = () => { for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; box.style.fontSize = mid + 'px'; if (ok()) lo = mid; else hi = mid; } box.style.fontSize = Math.floor(lo) + 'px'; };
  // 流程卡排法：一列、兩列、三列、四列（每列步數平均，最後一列至少半列，不排「8＋1」）各找最大字級，取字最大的；v117 驗收：步驟一列排開時字小、卡片只佔一半高
  // 陷阱卡、先認識名詞也比 1～3 欄：字到上限時取撐得較滿的排法（2560 三張陷阱並排只佔半張卡）
  const G = ol || box.querySelector('.lk-traps, .lk-pre-terms dl'), gp = G?.classList.contains('lk-traps') ? '--n' : '--cols', n = G ? G.children.length : 0;
  const COLS = shrinkOnly || !G ? [] : ol ? [...new Set([1, 2, 3, 4].map((r) => Math.ceil(n / r)))].filter((c) => c >= 2 && (n % c === 0 || n % c >= c / 2)) : [...new Set([Math.min(n, 3), 2, 1])].filter((c) => c <= n);
  // 收緊與否看卡片實際會不會捲（ok() 為作答後變長的卡多留了餘量，流程卡不會變長，用它判會在放得下時誤收緊）
  const fitsCard = () => card.scrollHeight <= card.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
  // 排法優先序：完全放得下 ＞ 卡片不捲 ＞ 都不行；同級取字大，再同取撐得滿
  const searchCols = () => { if (!COLS.length) return search(); let best = null;
    for (const c of COLS) { G.style.setProperty(gp, c); lo = 18; hi = hi0; search(); const f = parseFloat(box.style.fontSize), fit = ok() ? 2 : fitsCard() ? 1 : 0, hgt = box.scrollHeight;
      if (!best || fit > best[2] || (fit === best[2] && (f > best[1] || (f === best[1] && hgt > best[3])))) best = [c, f, fit, hgt]; }
    G.style.setProperty(gp, best[0]); box.style.fontSize = best[1] + 'px'; if (ol) flowArrows(ol); };
  // 流程卡收緊（.tight）不沿用上一次的結論：每次先不收緊找字級，18px 仍放不下才收緊再找一次（驗收第 3 輪：進卡瞬間誤收緊後不再重判）
  const hi0 = hi, ghost = box.querySelector('.fb-ph .ghost'); box.classList.remove('tight'); if (ghost && !shrinkOnly) ghost.hidden = false; searchCols();
  if (!ok() && !fitsCard() && ol) { box.classList.add('tight'); lo = 18; hi = hi0; searchCols(); }
  // 小檢查：右欄先用隱形解析撐高（作答前後不跳版），題目長到 18px 也放不下時拿掉它，進卡不用捲（驗收第 3 輪 e-cl-ghg-co2e）
  if (!ok() && !fitsCard() && ghost && !ghost.hidden) { ghost.hidden = true; lo = 18; hi = hi0; search(); }
}
let fitObs = null, fitRaf = 0;
let fitT = 0; addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitCardSettled, 150); });
// 大螢幕的放大比例（跟 fitCard 字級上限同一個式子）給 CSS 用：系統介面跟著內容一起放大
const setScale = () => document.documentElement.style.setProperty('--s', Math.max(1, Math.min(innerWidth / 1500, innerHeight / 800)).toFixed(3));
setScale(); addEventListener('resize', setScale);
const refT = (t) => esc(t).replace(/[^\s、]*[（(][^）)]*[）)]/g, (m) => `<bdi class="nw">${m}</bdi>`); // 出處裡的（縮寫）跟前一個詞綁一起不斷行
function lesson(r, i, id, plain = false) {
  const n = KN.get(id), qs = shuffle(POOL.get(id) || []).slice(0, 2), LK = plain ? null : LS.get(id);
  // 有互動關卡就用關卡（使用者 2026-11-14 選定）；隨時可切回原本的全文閱讀
  const modeBtn = LS.has(id) ? `<button class="pbtn-s lk-mode" id="lkmode">${plain ? '互動版' : '看全文'}</button>` : '';
  // 一段一頁、單欄。名詞在內文標色，滑鼠移過去（手機點一下）跳出解釋；每個名詞只標第一次出現的地方
  const seen = new Set(), TERMS = (n.terms || []).slice().sort((x, y) => y.t.length - x.t.length);
  const mark = (raw) => { let h = esc(raw); const slots = [];
    for (const x of TERMS) { if (seen.has(x.t)) continue; const k = esc(x.t), p = h.indexOf(k); if (p < 0) continue;
      seen.add(x.t); slots.push(`<span class="tm" tabindex="0" role="button" data-d="${esc(x.d)}">${k}</span>`);
      h = h.slice(0, p) + `\u0000${slots.length - 1}\u0001` + h.slice(p + k.length); }
    return h.replace(/\u0000(\d+)\u0001/g, (_, j) => slots[+j]); };
  // 閱讀內容切成區塊（重點、各段、容易搞混、補充名詞、出處），再依畫面高度把放得下的區塊排在同一頁，放不下才換頁
  const blocks = [`<p class="big">${mark(n.summary)}</p>`, ...String(n.body || '').split(/\n/).filter(Boolean).map((p) => `<p>${mark(p)}</p>`)];
  if ((n.pitfalls || []).length) blocks.push(`<h3 class="ph">容易搞混</h3><ul>${n.pitfalls.map((x) => `<li>${mark(x)}</li>`).join('')}</ul>`);
  const left = (n.terms || []).filter((x) => !seen.has(x.t)); // 沒在內文出現的名詞，最後列出
  if (left.length) blocks.push(`<h3 class="ph th">名詞解釋</h3><dl class="terms">${left.map((x) => `<dt>${esc(x.t)}</dt><dd>${esc(x.d)}</dd>`).join('')}</dl>`);
  if ((n.refs || []).length) blocks.push(`<div class="refs">出處：${n.refs.map((x) => x.u ? `<a href="${esc(x.u)}" target="_blank" rel="noopener">${refT(x.t)}</a>` : refT(x.t)).join('、')}</div>`);
  let cards;
  if (LK) {
    // 對話（小劇場）前先認識名詞：這段對話第一次用到、但台詞裡沒解釋的名詞，先插一張名詞小卡（使用者 2026-11-15）
    const keys = (t) => [t, ...t.split(/[（）()／/]/)].map((x) => x.trim()).filter((x) => x.length >= 2);
    const said = new Set(); cards = [];
    for (const b of LK.blocks) {
      const txt = JSON.stringify(b);
      if (b.type === 'talk') {
        const lines = b.lines.map((l) => l[1]);
        const need = (n.terms || []).filter((x) => !said.has(x.t) && keys(x.t).some((k) => txt.includes(k))
          && !keys(x.t).some((k) => lines.some((l) => { const p = l.indexOf(k); return p >= 0 && /^[」』）)]?\s*(就是|是指|是|指的是|指|意思是|叫做)/.test(l.slice(p + k.length, p + k.length + 6)); })));
        if (need.length) cards.push({ kind: '先認識名詞', html: `<div class="lk-pre-terms"><p class="lk-small lk-pre-hd">下面的對話會用到這幾個詞，先看一下：</p><dl>${need.map((x) => `<div><dt>${tx(x.t)}</dt><dd>${tx(x.d)}</dd></div>`).join('')}</dl></div>` });
      }
      (n.terms || []).forEach((x) => { if (keys(x.t).some((k) => txt.includes(k))) said.add(x.t); });
      cards.push({ kind: KIND[b.type], blk: b });
    }
    if ((n.terms || []).length) cards.push({ kind: '名詞卡', fn: (el) => termsCard(n.terms, el) });
    if ((n.pitfalls || []).length) cards.push({ kind: '陷阱卡', pit: true, fn: (el) => trapsCard(n.pitfalls, el) });
    cards.push({ kind: '記憶點', html: `<div class="lk-memo">${tx(LK.memo)}</div>${(n.refs || []).length ? `<div class="refs">出處：${n.refs.map((x) => x.u ? `<a href="${esc(x.u)}" target="_blank" rel="noopener">${refT(x.t)}</a>` : refT(x.t)).join('、')}</div>` : ''}` });
  } else {
  page({ title: n.title, main:'<span class="kind">閱讀</span><div id="meas"></div>', nav:'<button class="pbtn">下一張</button>' });
  const meas = $('#meas'), navH = $('.nav').offsetHeight, groups = [[]];
  // 寬螢幕（≥1200）用左右兩欄排滿整張卡：固定高度的分欄容器，溢出成第三欄就代表這頁放不下
  const wide = matchMedia('(min-width:1200px)').matches, H = Math.floor($('#card').getBoundingClientRect().bottom - 18 - meas.getBoundingClientRect().top);
  if (wide) { meas.className = 'flow'; meas.style.height = H + 'px'; }
  const fits = wide ? () => meas.scrollWidth <= meas.clientWidth + 1
    : () => meas.getBoundingClientRect().bottom <= Math.min($('#card').getBoundingClientRect().bottom - 18, innerHeight - navH - 16);
  for (const b of blocks) {
    const g = groups[groups.length - 1]; meas.insertAdjacentHTML('beforeend', b);
    if (g.length && !fits()) { meas.innerHTML = b; groups.push([b]); } else g.push(b); // 單一區塊本身就太長時照樣放，卡片內可捲
  }
  cards = groups.map((g, j) => ({ kind: groups.length > 1 ? `閱讀 ${j + 1}/${groups.length}` : '閱讀', html: wide ? `<div class="flow" style="height:${H}px">${g.join('')}</div>` : g.join('') }));
  }
  const refs = '', refAt = -1;
  qs.forEach((q, j) => cards.push({ kind:`小檢查 ${j + 1}/${qs.length}`, chk:true, q }));
  if (!qs.length) cards.push({ kind:'小檢查', html:'<p>這則目前沒有對應的題目，讀完就算學過。</p>' });
  let at = 0, wrongs = 0; const answered = new Set(), cleared = new Set(); // cleared：互動卡已完成（對話講完、猜題答完…）
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
      main: `<div style="display:flex;align-items:flex-start;gap:10px"><span class="kind ${c.pit ? 'pit' : ''} ${c.chk ? 'chk' : ''}">${esc(c.kind)}</span>${at === 0 ? modeBtn : ''}</div>${c.q ? `<div id="lkb" class="lk-fit">${qHtml(c.q, true)}</div>` : c.blk || c.fn ? `<div id="lkb" class="lk-fit"${c.blk && GROW.has(c.blk.type) || c.fn ? ` data-grow="${c.blk?.type === 'calc' ? 'calc' : 1}"` : ''}></div>` : LK ? `<div class="lk-fit">${c.html}</div>` : c.html}${at === refAt ? refs : ''}`,
      nav: `<button class="pbtn sec" id="prev" ${at === 0 ? 'disabled' : ''}>上一張</button>
        <button class="pbtn" id="next" ${(c.q && !answered.has(at)) || (c.blk && GATED.has(c.blk.type) && !cleared.has(at)) ? 'disabled' : ''}>${last ? '完成' : c.q ? '下一題' : '下一張'}</button>`,
      side: outline + layerSide(r, i, id) });
    if ($('#lkmode')) $('#lkmode').onclick = () => lesson(r, i, id, !plain);
    if (c.blk) { const here = at; mount(c.blk, $('#lkb'), { region: r.id, uid: `${id}-${at}` }, () => { cleared.add(here); if (at === here) $('#next').disabled = false; }); }
    if (c.fn) c.fn($('#lkb'));
    fitCardSettled();
    fitObs?.disconnect(); fitObs = null; // 作答、展開、換提示後內容會變長：只往小調，保證不出現卡內捲動
    if ($('#lkb')) { fitObs = new MutationObserver(() => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => { const k = $('#lkb'); if (k) fitCard(!k.classList.contains('solved')); }); }); // 換卡瞬間 #lkb 已不在就跳過（驗收第 3 輪前自查：曾偶發 classList of null）
      fitObs.observe($('#lkb'), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] }); }
    $('#prev').onclick = () => { if (at > 0) { at--; draw(); } };
    $('#next').onclick = () => { if (last) finish(); else { at++; draw(); } };
    document.querySelectorAll('.lside button[data-j]').forEach((b) => (b.onclick = () => { at = +b.dataset.j; draw(); }));
    if (c.q) {
      if (answered.has(at)) { $('#card').innerHTML = `<span class="kind chk">${esc(c.kind)}</span><p class="q">${esc(c.q.question)}</p><p>這題答過了。</p>`; }
      else bindQ(c.q, (ok) => { answered.add(at); if (!ok) wrongs++; $('#next').disabled = false; });
    }
    // 左右滑換卡（作答中的卡不能滑走）
    const card = $('#card'); let x0 = null;
    card.onpointerdown = (e) => { x0 = e.target.closest('input, button, .lk-tl, .lk-tblw') ? null : e.clientX; }; // 拉滑桿、捲時間軸、點按鈕不當成換卡
    card.onpointerup = (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) < 60 || (c.q && !answered.has(at)) || (c.blk && GATED.has(c.blk.type) && !cleared.has(at))) return;
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
// 每個資料檔失敗重試兩次（網路不穩、伺服器一次收太多請求時偶發 Failed to fetch）
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const get1 = (u) => fetch(u).then((x) => { if (!x.ok) throw new Error(u); return x.json(); });
const getJSON = (u) => get1(u).catch(() => wait(800).then(() => get1(u))).catch(() => wait(2000).then(() => get1(u)));
// 互動關卡資料（1MB 上下）背景載入；點進知識點時先等它，免得還沒到就被當成「沒有關卡」退回閱讀模式（驗收第 3 輪疑義）
let poolReady = null, lsReady = null, lsDone = false;
const loadLS = (u) => (lsReady = getJSON(u).then((o) => { LS = new Map(Object.entries(o)); }, () => toast('互動關卡載入失敗，先用全文閱讀')).then(() => { lsDone = true; }));
(async () => {
  try {
    ({ makeMap, TW, TH, LAYOUT } = await import(CFG.map));
    if (CC === 'earth') { // 永續國：知識點與題目都是獨立檔；題目的 note 可以是一個 id 或多個 id 的陣列
      const [w, notes] = await Promise.all([getJSON('earth-world.json'), getJSON('earth-notes.json')]);
      W = w; KN = new Map(notes.map((n) => [n.id, n]));
      await loadLS('earth-lessons.json'); // 關卡資料到了才顯示地圖，點進去一定是互動版
      poolReady = getJSON('earth-quiz.json').then((q) => { POOL = new Map(notes.map((n) => [n.id, []])); q.forEach((x) => [].concat(x.note).forEach((id) => POOL.get(id)?.push(x))); });
      return showMap();
    }
    const [w, k, cn] = await Promise.all([getJSON('world.json'), getJSON('knowledge.json'), getJSON('claude-notes.json').catch(() => null)]);
    W = w; KN = new Map(k.notes.map((n) => [n.id, n]));
    await loadLS('ai-lessons.json');
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
