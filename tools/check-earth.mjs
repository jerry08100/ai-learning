// 地球永續國資料硬檢查：earth-world.json／earth-notes.json／earth-quiz.json
// 用法：node tools/check-earth.mjs（在 01_網站/ 下跑）。有 FAIL 就 exit 1。
import fs from 'fs';

const W = JSON.parse(fs.readFileSync('earth-world.json', 'utf8'));
const N = JSON.parse(fs.readFileSync('earth-notes.json', 'utf8'));
const Q = JSON.parse(fs.readFileSync('earth-quiz.json', 'utf8'));
const fail = [], warn = [];
const REQ = ['id', 'title', 'codes', 'levels', 'summary', 'body', 'pitfalls', 'terms', 'topics', 'refs'];

// 知識點
const NM = new Map();
for (const n of N) {
  const at = n.id || '(無 id)';
  for (const f of REQ) { const v = n[f]; if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) fail.push(`${at}: 缺 ${f}`); }
  if (NM.has(n.id)) fail.push(`${at}: id 重複`); NM.set(n.id, n);
  if (!/^e-[a-z0-9-]+$/.test(n.id || '')) fail.push(`${at}: id 格式應為 e-xxx`);
  for (const c of n.codes || []) if (!/^L(11|12|21|22)\d{3}$/.test(c)) fail.push(`${at}: 代碼格式錯「${c}」`);
  for (const r of n.refs || []) if (!r.t || !/^https:\/\//.test(r.u || '')) fail.push(`${at}: 出處要有名稱與 https 網址`);
  for (const t of n.terms || []) if (!t.t || !t.d) fail.push(`${at}: 名詞解釋缺欄位`);
  if ((n.summary || '').length > 60) warn.push(`${at}: summary ${n.summary.length} 字，建議 60 字內`);
  const len = (n.body || '').length; if (len < 400) warn.push(`${at}: 內文只有 ${len} 字`);
}

// 地圖：每則知識點恰好出現一次、開放條件指到存在的層、不會卡死
const used = new Map(), layerKeys = new Set();
for (const r of W.regions) r.layers.forEach((l, i) => { layerKeys.add(`${r.id}:${i}`); for (const id of l.notes) { if (!NM.has(id)) fail.push(`world ${r.id}:${i} 引用不存在的知識點 ${id}`); used.set(id, (used.get(id) || 0) + 1); } });
for (const [id, k] of used) if (k > 1) fail.push(`${id} 在地圖上出現 ${k} 次`);
for (const id of NM.keys()) if (!used.has(id)) fail.push(`${id} 沒放進任何區域`);
for (const r of W.regions) r.layers.forEach((l, i) => l.req.forEach((k) => { if (!layerKeys.has(k)) fail.push(`${r.id}:${i} 的開放條件 ${k} 不存在`); }));
{ const ok = new Set(); let grew = true; // 從沒有條件的層開始，一路能通過到全部
  while (grew) { grew = false; for (const r of W.regions) r.layers.forEach((l, i) => { const k = `${r.id}:${i}`; if (!ok.has(k) && l.req.every((x) => ok.has(x))) { ok.add(k); grew = true; } }); }
  for (const k of layerKeys) if (!ok.has(k)) fail.push(`${k} 永遠打不開（開放條件循環）`); }

// 題目
const QI = new Set(), per = new Map([...NM.keys()].map((id) => [id, 0]));
for (const q of Q) {
  const at = q.id || '(無 id)';
  if (QI.has(q.id)) fail.push(`${at}: id 重複`); QI.add(q.id);
  if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !String(o).trim())) fail.push(`${at}: 選項要 4 個且不可空白`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) fail.push(`${at}: answer 要是 0～3 的整數`);
  if (!q.question) fail.push(`${at}: 缺題幹`);
  if (!q.explanation || q.explanation.length < 30) fail.push(`${at}: 解析太短或沒有`);
  const ns = [].concat(q.note || []); if (!ns.length) fail.push(`${at}: 沒有對到知識點`);
  for (const id of ns) { if (!per.has(id)) fail.push(`${at}: note ${id} 不存在`); else per.set(id, per.get(id) + 1); }
}
for (const [id, k] of per) if (k < 3) fail.push(`${id}「${NM.get(id).title}」只有 ${k} 題，至少要 3 題`);
for (const r of W.regions) r.layers.forEach((l, i) => { const ids = new Set(Q.filter((q) => [].concat(q.note).some((n) => l.notes.includes(n))).map((q) => q.id));
  if (ids.size < 8) fail.push(`${r.id}:${i} 試煉只有 ${ids.size} 題，至少要 8 題`); });

const src = Q.reduce((m, q) => (m[q.src || '?'] = (m[q.src || '?'] || 0) + 1, m), {});
console.log(`知識點 ${N.length} 則、題目 ${Q.length} 題（${Object.entries(src).map(([k, v]) => `${k} ${v}`).join('、')}）、區域 ${W.regions.length}、層 ${layerKeys.size}`);
warn.forEach((m) => console.log('WARN', m));
fail.forEach((m) => console.log('FAIL', m));
console.log(fail.length ? `FAIL ${fail.length} 項` : 'PASS');
process.exit(fail.length ? 1 : 0);
