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
for (const [ch, n] of miss) warn.push(`章節「${ch}」的 ${n} 題連章節層級都對不到知識點`);

// 相關度：走 chapter 退路的題，知識點關鍵字有沒有真的出現在題幹／選項／解析裡。
// 與 app.js 的 rankByRelevance() 同規則；重疊為零＝掛的是「同章節但不對題」的知識點。
const keysOf = new Map(notes.map((n) => [n.id, [...new Set([
  ...(n.topics || []),
  ...String(n.title || '').split(/[\s,，、：:（）()／/]+/),
])].map(norm).filter((s) => s.length >= 2)]));
// 實際掛載數：app.js 的 notesFor() 只掛關鍵字真的有重疊的（零重疊寧可不掛，不硬湊覆蓋率）。
let fbHit = 0, fbNone = 0;
const bySrc = new Map();
for (const q of Q.questions) {
  const src = q.source || '歷屆';
  if (!bySrc.has(src)) bySrc.set(src, [0, 0]);
  const row = bySrc.get(src);
  row[0]++;
  if (byTopic.has(norm(q.topic))) { row[1]++; continue; }
  const pool = byChap.get(q.chapter);
  if (!pool) { fbNone++; continue; }
  const hay = norm(`${q.question}${(q.options || []).join('')}${q.explanation || ''}`);
  const best = Math.max(...pool.map((id) => keysOf.get(id).filter((k) => hay.includes(k)).length));
  if (best > 0) { fbHit++; row[1]++; } else fbNone++;
}

const tHit = Q.questions.filter((q) => byTopic.has(norm(q.topic))).length;
console.log(`知識點 ${notes.length} 則｜topic 索引 ${byTopic.size} 個｜chapter 索引 ${byChap.size} 個`);
console.log(`題目 ${Q.questions.length} 題：topic 精準掛載 ${tHit} 題、chapter 且關鍵字有重疊 ${fbHit} 題、不掛任何知識點 ${fbNone} 題`);
console.log('各來源實際掛得到知識點的比例：');
for (const [src, [t, h]] of [...bySrc].sort((a, b) => b[1][0] - a[1][0])) {
  console.log(`  ${src.padEnd(6)} ${h}/${t} = ${(h / t * 100).toFixed(0)}%`);
}
for (const w of warn) console.log('WARN ' + w);
if (fail.length) { console.error(`\nFAIL ${fail.length} 項：`); fail.forEach((f) => console.error('  - ' + f)); process.exit(1); }
console.log('OK');
