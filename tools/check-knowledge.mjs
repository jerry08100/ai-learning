// knowledge.json 硬檢查：schema、id 唯一、出處必附、題目掛載覆蓋率。
// 用法：node tools/check-knowledge.mjs（在 01_網站/ 下跑）
import fs from 'fs';

const K = JSON.parse(fs.readFileSync('knowledge.json', 'utf8'));
const Q = JSON.parse(fs.readFileSync('questions.json', 'utf8'));
const notes = K.notes || [];
const fail = [];
const warn = [];
const REQ = ['id', 'title', 'levels', 'subject', 'topics', 'chapters', 'summary', 'body', 'refs'];

const seen = new Set();
for (const n of notes) {
  const at = n.id || '(無 id)';
  for (const f of REQ) {
    const v = n[f];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) fail.push(`${at}: 缺 ${f}`);
  }
  if (seen.has(n.id)) fail.push(`${at}: id 重複`);
  seen.add(n.id);
  if (!/^k-[a-z0-9-]+$/.test(n.id || '')) fail.push(`${at}: id 格式應為 k-xxx（小寫英數與連字號）`);
  for (const l of n.levels || []) if (!['初級', '中級'].includes(l)) fail.push(`${at}: levels 只能是 初級／中級，出現「${l}」`);
  for (const r of n.refs || []) {
    if (!r.t) fail.push(`${at}: refs 少了來源名稱`);
    if (r.u && !/^https:\/\//.test(r.u)) fail.push(`${at}: 來源網址必須是 https（${r.u}）`);
  }
  if ((n.summary || '').length > 60) warn.push(`${at}: summary 偏長（${n.summary.length} 字），建議一句話收掉`);
}

// 掛載：topic 精準對應優先，chapter 當退路；與 app.js 的 notesFor() 同規則
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const byTopic = new Map(), byChap = new Map();
for (const n of notes) {
  for (const t of n.topics || []) { const k = norm(t); if (k) (byTopic.get(k) || byTopic.set(k, []).get(k)).push(n.id); }
  for (const c of n.chapters || []) (byChap.get(c) || byChap.set(c, []).get(c)).push(n.id);
}
const miss = new Map();
for (const q of Q.questions) {
  if (byTopic.has(norm(q.topic)) || byChap.has(q.chapter)) continue;
  const k = q.chapter || q.subject || '(無章節)';
  miss.set(k, (miss.get(k) || 0) + 1);
}
for (const [ch, n] of miss) fail.push(`章節「${ch}」的 ${n} 題掛不到任何知識點（topic 與 chapter 都沒對應）`);

// 相關度：走 chapter 退路的題，知識點關鍵字有沒有真的出現在題幹／選項／解析裡。
// 與 app.js 的 rankByRelevance() 同規則；重疊為零＝掛的是「同章節但不對題」的知識點。
const keysOf = new Map(notes.map((n) => [n.id, [...new Set([
  ...(n.topics || []),
  ...String(n.title || '').split(/[\s,，、：:（）()／/]+/),
])].map(norm).filter((s) => s.length >= 2)]));
// 池只有 1 則時排序無意義（掛誰都一樣），真正要看的是「池 >= 2 則」那批有沒有挑對。
let fbTotal = 0, fbMulti = 0, fbMultiWeak = 0;
for (const q of Q.questions) {
  if (byTopic.has(norm(q.topic))) continue;
  const pool = byChap.get(q.chapter);
  if (!pool) continue;
  fbTotal++;
  if (pool.length < 2) continue;
  fbMulti++;
  const hay = norm(`${q.question}${(q.options || []).join('')}${q.explanation || ''}`);
  const best = Math.max(...pool.map((id) => keysOf.get(id).filter((k) => hay.includes(k)).length));
  if (best === 0) fbMultiWeak++;
}

const tHit = Q.questions.filter((q) => byTopic.has(norm(q.topic))).length;
console.log(`知識點 ${notes.length} 則｜topic 索引 ${byTopic.size} 個｜chapter 索引 ${byChap.size} 個`);
console.log(`題目 ${Q.questions.length} 題：topic 精準掛載 ${tHit} 題，其餘走 chapter 退路，未覆蓋 ${[...miss.values()].reduce((a, b) => a + b, 0)} 題`);
console.log(`chapter 退路 ${fbTotal} 題，其中章節對到 2 則以上、需要排序的有 ${fbMulti} 題：挑得到關鍵字重疊 ${fbMulti - fbMultiWeak} 題，零重疊 ${fbMultiWeak} 題`);
if (fbMulti && fbMultiWeak / fbMulti > 0.4) warn.push(`需要排序的 ${fbMulti} 題裡有 ${(fbMultiWeak / fbMulti * 100).toFixed(0)}% 挑不出相關知識點，建議補該章節的知識點或補題目 topic`);
for (const w of warn) console.log('WARN ' + w);
if (fail.length) { console.error(`\nFAIL ${fail.length} 項：`); fail.forEach((f) => console.error('  - ' + f)); process.exit(1); }
console.log('OK');
