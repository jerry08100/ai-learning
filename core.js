// 純邏輯,無 DOM、無 localStorage,方便用 node 測。app.js 與 core.test.mjs 都 import 這裡。

export const MASTER_BOX = 3; // box 從 1 起,到 3 視為「已掌握」= 連續答對 2 次

// Leitner 盒子：答對升一格(上限 MASTER_BOX)、答錯掉回 1。
export function nextBox(box, correct) {
  const b = box || 1;
  return correct ? Math.min(b + 1, MASTER_BOX) : 1;
}

// 出題優先序(數字小先練):答錯未掌握 > 沒做過 > 做過未掌握 > 已掌握。供「智慧複習」排序。
export function reviewPriority(p) {
  const x = p || { box: 1, attempts: 0, wrong: 0 };
  if (isMastered(x.box)) return 3;
  if (x.wrong > 0) return 0;        // 錯過又沒掌握 → 最該練
  if ((x.attempts || 0) === 0) return 1; // 沒做過
  return 2;                          // 做過但還沒掌握
}

export function isMastered(box) {
  return (box || 1) >= MASTER_BOX;
}

// 模擬考計分。questions 為出題順序,answers[i] 為該題選的選項 index(null=未作答)。
export function scoreExam(questions, answers) {
  let correct = 0;
  const wrongIds = [];
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) correct++;
    else wrongIds.push(q.id);
  });
  const total = questions.length;
  return {
    total,
    correct,
    wrong: total - correct,
    percent: total ? Math.round((correct / total) * 1000) / 10 : 0,
    wrongIds,
  };
}

// 依科目彙整正確率與掌握度。progress 為 { [id]: {box, attempts, correct, wrong} }。
export function progressStats(questions, progress) {
  const bySubject = {};
  let practiced = 0, mastered = 0, wrongNow = 0;
  for (const q of questions) {
    const p = progress[q.id] || { box: 1, attempts: 0, correct: 0, wrong: 0 };
    const s = (bySubject[q.subject] ||= { subject: q.subject, total: 0, attempts: 0, correct: 0, mastered: 0 });
    s.total++;
    s.attempts += p.attempts;
    s.correct += p.correct;
    if (isMastered(p.box)) s.mastered++;
    if (p.attempts > 0) practiced++;
    if (isMastered(p.box)) mastered++;
    else if (p.wrong > 0) wrongNow++;
  }
  const subjects = Object.values(bySubject).map((s) => ({
    ...s,
    accuracy: s.attempts ? Math.round((s.correct / s.attempts) * 1000) / 10 : null,
  }));
  return { total: questions.length, practiced, mastered, wrongNow, subjects };
}

// 目前的錯題清單(答錯過、尚未掌握),供「只練錯題 / 錯題本」用。
export function wrongQuestionIds(questions, progress) {
  return questions
    .filter((q) => {
      const p = progress[q.id];
      return p && p.wrong > 0 && !isMastered(p.box);
    })
    .map((q) => q.id);
}

// ---- 練習範圍:題庫 → 級別 → 科目(三層)。純篩選,UI 在 app.js。----
// 非官方題(模擬題/課程題)的隔離改由「題庫」這層負責,預設 official,不再靠章節名比對。
export const BANKS = [
  { key: 'official', label: '官方題（歷屆＋學習指引）', test: (q) => q.source !== '模擬題' && q.source !== '課程題' },
  { key: '歷屆', label: '官方・只練歷屆考古題', test: (q) => (q.source || '歷屆') === '歷屆' },
  { key: '學習指引', label: '官方・只練學習指引範例', test: (q) => q.source === '學習指引' },
  { key: '課程題', label: '課程練習題（非官方）', test: (q) => q.source === '課程題' },
  { key: '模擬題', label: '模擬題（非官方）', test: (q) => q.source === '模擬題' },
  { key: 'all', label: '全部（官方＋非官方）', test: () => true },
];
export const LEVELS = [['初級', '初級'], ['中級', '中級'], ['all', '全部']];
// 首訪預設 = 初級 + 全題庫(官方+非官方),使用者要求;改選後記在 store
export const DEFAULT_BANK = 'all';
export const bankOf = (key) => BANKS.find((b) => b.key === key) || BANKS.find((b) => b.key === DEFAULT_BANK);
export const levelOf = (lv) => (LEVELS.some(([k]) => k === lv) ? lv : '初級'); // 認不得就回初級
const inLevel = (q, lv) => lv === 'all' || q.level === lv;
export const countIn = (questions, bank, lv) => questions.filter((q) => bank.test(q) && inLevel(q, lv)).length;
// 換題庫後若目前級別是空的(例:課程題沒有中級),跳到第一個有題的級別
export const firstLevelWith = (questions, bank) =>
  (LEVELS.find(([k]) => countIn(questions, bank, k)) || ['all'])[0];
// 該題庫＋級別下有哪些科目(帶題數)。科目名跨級別唯一(初級科目1≠中級科目1),故直接拿科目名當 key。
export function subjectsIn(questions, bank, lv) {
  const m = new Map();
  for (const q of questions) if (bank.test(q) && inLevel(q, lv)) m.set(q.subject, (m.get(q.subject) || 0) + 1);
  return [...m].map(([subject, count]) => ({ subject, count }));
}
// 沒選過、或存的科目已不在目前題庫/級別內 → 當成全選,免得換題庫後一題都選不到。
export function resolveSubs(questions, bank, lv, subs) {
  const all = subjectsIn(questions, bank, lv).map((s) => s.subject);
  const kept = Array.isArray(subs) ? subs.filter((s) => all.includes(s)) : [];
  return new Set(kept.length ? kept : all);
}
// 依偏好 {bank, lv, subs} 篩出題目池(練習頁、背題頁、今日挑戰共用同一份)。
export function rangeQuestions(questions, pref = {}) {
  const bank = bankOf(pref.bank), lv = levelOf(pref.lv);
  const subs = resolveSubs(questions, bank, lv, pref.subs);
  return questions.filter((q) => bank.test(q) && inLevel(q, lv) && subs.has(q.subject));
}

// 把「有星標或有筆記」的題 + 解析 + 筆記整理成 markdown,供匯出。
export function toMarkdown(questions, progress, title = 'iPAS 筆記') {
  const lines = [`# ${title}`, ''];
  let n = 0;
  for (const q of questions) {
    const p = progress[q.id];
    if (!p || (!p.starred && !p.note)) continue;
    n++;
    lines.push(`## ${n}. [${q.subject}] ${q.question}`);
    if (q.image) lines.push('- (此題含附圖,請對照站上題目)');
    q.options.forEach((o, i) => lines.push(`- ${'ABCD'[i]}. ${o}${i === q.answer ? ' ✓（正解）' : ''}`));
    if (q.explanation) lines.push(`- 解析：${q.explanation}`);
    if (p.note) lines.push(`- 我的筆記：${p.note}`);
    lines.push('');
  }
  if (n === 0) lines.push('_(還沒有星標或筆記的題目)_');
  return lines.join('\n');
}
