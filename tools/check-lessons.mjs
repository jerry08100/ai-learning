// 檢查互動關卡資料（earth-lessons.json、ai-lessons.json）：格式、算式、對到的知識點存在。用法：node tools/check-lessons.mjs
import { readFileSync } from 'node:fs';
import { validate } from '../lessonkit.js';
const rd = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const notes = new Set([...rd('earth-notes.json').map((n) => n.id), ...rd('knowledge.json').notes.map((n) => n.id), ...rd('claude-notes.json').map((n) => n.id)]);
const fail = []; let total = 0;
for (const f of ['earth-lessons.json', 'ai-lessons.json']) {
  const L = rd(f);
  for (const [id, l] of Object.entries(L)) { total++; if (!notes.has(id)) fail.push(`${f}: ${id} 不是知識點`); fail.push(...validate(id, l).map((e) => `${f}: ${e}`)); }
}
for (const x of fail) console.log('FAIL ' + x);
console.log(fail.length ? `FAIL ${fail.length} 筆` : `PASS 關卡 ${total} 則`);
process.exit(fail.length ? 1 : 0);
