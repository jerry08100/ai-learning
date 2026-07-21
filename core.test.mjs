// node core.test.mjs  — 邏輯壞掉就會 throw。
import assert from 'node:assert';
import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown, reviewPriority,
  bankOf, levelOf, countIn, firstLevelWith, subjectsIn, resolveSubs, rangeQuestions } from './core.js';

// 出題優先序:錯題(0) < 沒做過(1) < 做過未掌握(2) < 已掌握(3)
assert.equal(reviewPriority({ box: 1, attempts: 2, wrong: 1 }), 0);
assert.equal(reviewPriority({ box: 1, attempts: 0, wrong: 0 }), 1);
assert.equal(reviewPriority({ box: 2, attempts: 1, wrong: 0 }), 2);
assert.equal(reviewPriority({ box: 3, attempts: 3, wrong: 0 }), 3);

// Leitner(MASTER_BOX=3:連對 2 次即掌握)
assert.equal(nextBox(1, true), 2);
assert.equal(nextBox(2, true), 3, '連對 2 次到頂');
assert.equal(nextBox(3, true), 3, '已到頂不超過 3');
assert.equal(nextBox(2, false), 1, '答錯掉回 1');
assert.equal(isMastered(3), true);
assert.equal(isMastered(2), false);

// 計分
const qs = [
  { id: 'a', subject: 'S1', answer: 1, options: ['x', 'y'], question: 'qa' },
  { id: 'b', subject: 'S1', answer: 0, options: ['x', 'y'], question: 'qb' },
  { id: 'c', subject: 'S2', answer: 1, options: ['x', 'y'], question: 'qc', explanation: 'because' },
];
const r = scoreExam(qs, [1, 1, null]); // a 對、b 錯、c 未作答(錯)
assert.equal(r.correct, 1);
assert.equal(r.wrong, 2);
assert.deepEqual(r.wrongIds, ['b', 'c']);
assert.equal(r.percent, 33.3);

// 統計 + 錯題
const prog = {
  a: { box: 5, attempts: 5, correct: 5, wrong: 0 },
  b: { box: 1, attempts: 2, correct: 0, wrong: 2 },
};
const st = progressStats(qs, prog);
assert.equal(st.practiced, 2);
assert.equal(st.mastered, 1);
assert.equal(st.wrongNow, 1);
const s1 = st.subjects.find((s) => s.subject === 'S1');
assert.equal(s1.accuracy, 71.4); // 5 correct / 7 attempts
assert.deepEqual(wrongQuestionIds(qs, prog), ['b']);

// markdown 匯出(收星標)
const md = toMarkdown(qs, { c: { starred: true, note: '記得 RAG' } });
assert.ok(md.includes('[S2]'));
assert.ok(md.includes('A. x'), '要列出所有選項');
assert.ok(md.includes('B. y ✓（正解）'), '正解選項要標 ✓');
assert.ok(md.includes('我的筆記：記得 RAG'));
assert.ok(!md.includes('qa'), '沒星標也沒筆記的不該出現');

// 有筆記但沒星標也要收(筆記不漏)
const md2 = toMarkdown(qs, { a: { note: '只有筆記沒星標' } });
assert.ok(md2.includes('只有筆記沒星標'), '有筆記就該收');
assert.ok(md2.includes('qa'));

// ---- 練習範圍:題庫 → 級別 → 科目 ----
const bank = [
  { id: 'p1', level: '初級', subject: '初1' },                    // 歷屆(無 source 欄)
  { id: 'p2', level: '初級', subject: '初1', source: '學習指引' },
  { id: 'p3', level: '初級', subject: '初2' },
  { id: 'c1', level: '初級', subject: '初1', source: '課程題' },
  { id: 'c2', level: '初級', subject: '初2', source: '課程題' },
  { id: 'm1', level: '初級', subject: '初1', source: '模擬題' },
  { id: 'g1', level: '中級', subject: '中1' },
  { id: 'g2', level: '中級', subject: '中2' },
];
const ids = (pref) => rangeQuestions(bank, pref).map((q) => q.id);
// 預設(沒設過偏好)= 全題庫 + 初級 + 科目全選
assert.deepEqual(ids({}), ['p1', 'p2', 'p3', 'c1', 'c2', 'm1'], '預設出初級全題庫');
assert.equal(bankOf(undefined).key, 'all');
assert.equal(bankOf('亂填').key, 'all', '認不得的題庫回全題庫');
assert.equal(levelOf('亂填'), '初級', '認不得的級別回初級');
// 級別
assert.deepEqual(ids({ lv: '中級' }), ['g1', 'g2']);
assert.deepEqual(ids({ lv: 'all' }).length, 8, '全部級別+預設全題庫=整包');
// 選官方題就一題非官方都不能漏進來
assert.deepEqual(ids({ bank: 'official' }), ['p1', 'p2', 'p3'], '官方題只出官方');
assert.deepEqual(ids({ bank: 'official', lv: 'all' }), ['p1', 'p2', 'p3', 'g1', 'g2']);
// 題庫
assert.deepEqual(ids({ bank: '課程題' }), ['c1', 'c2']);
assert.deepEqual(ids({ bank: '模擬題' }), ['m1']);
assert.deepEqual(ids({ bank: '歷屆' }), ['p1', 'p3'], '歷屆=沒有 source 欄的題');
assert.deepEqual(ids({ bank: '學習指引' }), ['p2']);
assert.deepEqual(ids({ bank: 'all', lv: 'all' }).length, 8);
// 科目多選(釘住題庫,只測科目那層)
assert.deepEqual(ids({ bank: 'official', subs: ['初2'] }), ['p3']);
assert.deepEqual(ids({ bank: 'official', subs: ['初1', '初2'] }), ['p1', 'p2', 'p3']);
assert.deepEqual(ids({ subs: ['初2'] }), ['p3', 'c2'], '全題庫時科目篩選也含非官方');
// 存的科目不屬於目前題庫/級別 → 當全選(不能變成 0 題)
assert.deepEqual(ids({ lv: '中級', subs: ['初1'] }), ['g1', 'g2'], '換級別後舊科目失效就全選');
assert.deepEqual(ids({ bank: 'official', subs: [] }), ['p1', 'p2', 'p3'], '空陣列也當全選');
// 科目清單與題數
assert.deepEqual(subjectsIn(bank, bankOf('official'), '初級'),
  [{ subject: '初1', count: 2 }, { subject: '初2', count: 1 }]);
assert.deepEqual([...resolveSubs(bank, bankOf('課程題'), '初級', null)], ['初1', '初2']);
// 級別題數 + 該題庫沒中級時自動跳級
assert.equal(countIn(bank, bankOf('official'), '中級'), 2);
assert.equal(countIn(bank, bankOf('課程題'), '中級'), 0, '課程題沒有中級');
assert.equal(firstLevelWith(bank, bankOf('課程題')), '初級');
assert.equal(firstLevelWith(bank, bankOf('official')), '初級');

console.log('PASS');
