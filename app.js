import { nextBox, isMastered, scoreExam, progressStats, wrongQuestionIds, toMarkdown, reviewPriority, MASTER_BOX,
  BANKS, LEVELS, bankOf, levelOf, countIn, firstLevelWith, subjectsIn, resolveSubs, rangeQuestions } from './core.js';

// 同一支程式跑兩座演武島：practice.html（AI 智能國，iPAS AI 應用規劃師）、earth-practice.html（地球永續國，iPAS 淨零碳規劃管理師）
const EARTH = document.documentElement.dataset.quiz === 'earth';
const STORE_KEY = EARTH ? 'earth_quiz_progress' : 'ipas_quiz_progress';
// 同步後端＝獨立 server 04_同步後端/（2026-08-26 從遊戲伺服器抽出，接手同一 Zeabur service，合約逐字相同）。/sync/:code。留空=只用本機。
const SYNC_URL = EARTH ? '' : 'https://ipas-sync-823719914514.asia-east1.run.app'; // ponytail: 永續國先不做雲端同步（同步碼會跟 AI 國互蓋），要做再分 key // 同步後端＝獨立 server（原始碼 04_同步後端/）
const VAPID_PUBLIC = 'BNn4Lwq818aHx8cb0LrcQ6IpRgHb9B3P_BOqusct-uFyJPQ4hlDrIOirliHoNdbbg5tg8zWfzBg5SZ0yBhRq7zA';
const PUSH_ENABLED = false; // Phase 3: 現行同步後端（04_同步後端/）無 push，關閉推播 UI 與 /push/* 呼叫（同步不受影響）
const $ = (sel) => document.querySelector(sel);
const view = $('#view');

let DATA = { meta: {}, questions: [] };
let CONCEPTS = [];
let KNOW = [];                 // 知識延伸：knowledge.json 的 notes
const KTOPIC = new Map();      // 正規化 topic → notes（主要掛載）
const KCHAP = new Map();       // chapter → notes（topic 沒中時的退路）
const KBYQ = new Map();        // 題目 id → notes：知識大陸 world-pool.json 逐題判斷過的對應，有就優先用
let EXAMINFO = null;
// 永續國題庫：earth-quiz.json＋earth-notes.json 轉成跟 questions.json 一樣的形狀（level／round／subject／source），
// 知識延伸直接用題目的 note 欄位對到知識點（KBYQ），不走關鍵字配對。
const EARTH_SUBJ = { L11: '科目1：淨零碳規劃管理基礎概論', L12: '科目2：淨零碳盤查規範與程序概要', L21: '科目1：節能減碳技術實務', L22: '科目2：碳管理制度實務' };
// 讀 JSON：8 秒等不到回應就中止（卡住的請求），回應開始後內容給 45 秒（2.6MB 題庫在慢網路要時間）；主資料最多重試一次；失敗丟錯，由 boot 顯示失敗訊息與「重新載入」
// 用 AbortController＋setTimeout，不用 AbortSignal.timeout（iOS 16 以前沒有，會變成永遠載入失敗）
async function fj(u, tries = 1, ms = 8000) {
  for (let n = 1; ; n++) {
    const ac = new AbortController(); let t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(u, { signal: ac.signal });
      if (!r.ok) throw new Error(`${u} ${r.status}`);
      clearTimeout(t); t = setTimeout(() => ac.abort(), 45000);
      return await r.json();
    } catch (e) { if (n >= tries) throw e; }
    finally { clearTimeout(t); }
  }
}
async function loadEarth() {
  const [qs, notes] = await Promise.all(['earth-quiz.json', 'earth-notes.json'].map((u) => fj(u, 2)));
  const NM = new Map(notes.map((n) => [n.id, n])), code = (n) => String(n?.codes?.[0] || '').slice(0, 3);
  KNOW = notes.map((n) => ({ ...n, subject: EARTH_SUBJ[code(n)] || '其他' }));
  const KM = new Map(KNOW.map((n) => [n.id, n]));
  const questions = qs.map((q) => {
    const ids = [].concat(q.note || []), m = /^(.+?)・(初級|中級) (L\d\d)$/.exec(q.round || '');
    const c = m ? m[3] : code(NM.get(ids[0]));
    KBYQ.set(q.id, ids.map((id) => KM.get(id)).filter(Boolean));
    return { ...q, level: m ? m[2] : (c.startsWith('L2') ? '中級' : '初級'), round: m ? m[1] : '本站自製', subject: EARTH_SUBJ[c] || '其他',
      source: q.src === '官方' ? '歷屆' : '延伸題' };
  });
  return { meta: { title: 'iPAS 淨零碳規劃管理師 模擬考練習', defaultTimeLimitMin: 75,
    note: '題目為 iPAS 115 年淨零碳規劃管理師官方公告試題（答案皆官方）與少量本站自製題；解析為本站自寫，僅供參考。' }, questions };
}
let store = load();
let pushTimer = null;
let dirty = false; // 有未上傳的本機變動才寫 KV(localStorage 才是本機真相,KV 只跨裝置)

// PWA 安裝：接管 beforeinstallprompt，顯示自家「安裝」按鈕（Android/桌面 Chrome）
// 用單機旗標記住「已關掉/已安裝」就別再顯示（install 狀態每台不同，故不進同步 store）
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installBarOff = () => localStorage.getItem('ipas_installbar_off') === '1';
const dismissInstallBar = () => { localStorage.setItem('ipas_installbar_off', '1'); const b = document.getElementById('installbar'); if (b) b.hidden = true; deferredInstall = null; };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  const bar = document.getElementById('installbar');
  if (bar && !isStandalone() && !installBarOff()) bar.hidden = false;
});
window.addEventListener('appinstalled', dismissInstallBar);

// ---- localStorage ----
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    // ranges=舊版章節勾選(已換成 bank/lv/subs 三層)、challenge*=已移除的今日挑戰;清掉不再同步
    if (s && s.q) { delete s.ranges; delete s.challengeDate; delete s.challengeRound; return s; }
  } catch {}
  return { v: 1, syncCode: makeCode(), codeFresh: true, q: {}, recent: [], updatedAt: 0 };
}
// 記一筆最近作答結果(1/0)，保留最近 50 筆，供「近期正確率」
function logRecent(correct) {
  (store.recent ||= []).push(correct ? 1 : 0);
  if (store.recent.length > 50) store.recent = store.recent.slice(-50);
}

// ---- 推播提醒(Web Push)----
const pushSupported = () => PUSH_ENABLED && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function urlB64ToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function pushIsOn() {
  if (!pushSupported() || !SYNC_URL) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
async function enablePush(localHour) {
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: '未允許通知權限' };
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID_PUBLIC) });
  const offsetMin = new Date().getTimezoneOffset();
  let utcMin = (localHour * 60 + offsetMin) % 1440; if (utcMin < 0) utcMin += 1440;
  const r = await fetch(`${SYNC_URL}/push/subscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: store.syncCode, subscription: sub.toJSON(), hourUtc: Math.floor(utcMin / 60), offsetMin }),
  });
  return { ok: r.ok };
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await fetch(`${SYNC_URL}/push/unsubscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: store.syncCode }),
  }).catch(() => {});
}

// ---- 每日目標 / 連續打卡 / 考前倒數 ----
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const dailyGoal = () => (store.settings && store.settings.dailyGoal) || 20;
// 顯示用的連續天數：最後達標日是今天或昨天才還活著，否則歸 0
function liveStreak() {
  const s = store.streak; if (!s || !s.lastDate) return 0;
  return (s.lastDate === today() || s.lastDate === yesterday()) ? s.count : 0;
}
// 每答一題呼叫：累加今日題數、記每日歷史、達標當下更新打卡
function bumpDaily(correct) {
  const t = today();
  store.settings ||= { dailyGoal: 20 };
  if (!store.daily || store.daily.date !== t) store.daily = { date: t, count: 0 };
  store.daily.count++;
  // 每日歷史（答題數/答對數），保留最近 30 天
  store.history ||= {};
  const h = (store.history[t] ||= { a: 0, c: 0 });
  h.a++; if (correct) h.c++;
  const days = Object.keys(store.history).sort();
  if (days.length > 30) delete store.history[days[0]];
  store.streak ||= { count: 0, lastDate: '' };
  if (store.daily.count === dailyGoal() && store.streak.lastDate !== t) {
    store.streak = { count: (store.streak.lastDate === yesterday() ? store.streak.count : 0) + 1, lastDate: t };
  }
}
function save() {
  store.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  dirty = true;
  schedulePush();
}

// ---- 雲端同步（同步碼，免帳號） ----
// 寫入策略:checkpoint(交卷/練習完成/切走關頁)立即 flush;持續作答只在停頓 30s 後補寫一次。
// dirty gating = 沒變動就絕不寫,省 KV 寫入額度。
function schedulePush() {
  if (!SYNC_URL) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, 30000); // ponytail: debounce 30s 只當長 session 的保底;真正的寫在 checkpoint
}
async function pushSync(opts = {}) {
  clearTimeout(pushTimer); pushTimer = null;
  if (!SYNC_URL || !store.syncCode) return false;
  if (!dirty) return true; // 沒有未上傳的變動就不寫 KV
  try {
    const r = await fetch(`${SYNC_URL}/sync/${encodeURIComponent(store.syncCode)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store),
      keepalive: opts.keepalive || false, // 關頁/切走時讓請求活過頁面卸載
    });
    if (r.ok) dirty = false;
    return r.ok;
  } catch { return false; }
}
async function pullSync() {
  if (!SYNC_URL || !store.syncCode) return false;
  try {
    const r = await fetch(`${SYNC_URL}/sync/${encodeURIComponent(store.syncCode)}`);
    if (!r.ok) return false;
    const remote = await r.json();
    if (remote && remote.q && (remote.updatedAt || 0) > (store.updatedAt || 0)) {
      store = remote;
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return true;
    }
  } catch {}
  return false;
}
function qp(id) {
  return (store.q[id] ||= { box: 1, attempts: 0, correct: 0, wrong: 0, note: '', starred: false });
}
// 碼空間 40×40×9000 = 1,440 萬(舊版 10×10×90=9,000,估計已撞出上百對共用碼)
function makeCode() {
  const a = ['fox', 'owl', 'koi', 'elm', 'jade', 'mint', 'sage', 'wren', 'lark', 'reef',
    'ash', 'birch', 'cedar', 'crane', 'deer', 'dove', 'fern', 'finch', 'gull', 'hare',
    'hawk', 'ibis', 'iris', 'kelp', 'kiwi', 'lily', 'lotus', 'lynx', 'mole', 'moss',
    'moth', 'newt', 'orca', 'pine', 'plum', 'quail', 'seal', 'swan', 'teal', 'wolf'];
  const b = ['river', 'cloud', 'stone', 'ember', 'tide', 'grove', 'dune', 'frost', 'maple', 'comet',
    'breeze', 'brook', 'canyon', 'cave', 'cliff', 'coast', 'coral', 'creek', 'delta', 'fjord',
    'gale', 'glade', 'gorge', 'harbor', 'inlet', 'lagoon', 'ledge', 'marsh', 'mesa', 'mist',
    'oasis', 'peak', 'pond', 'rain', 'ridge', 'shore', 'sky', 'snow', 'storm', 'vale'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(a)}-${pick(b)}-${Math.floor(1000 + Math.random() * 9000)}`;
}
// 自動產生的新碼先跟雲端查重再定案(雙保險):只碰 codeFresh 的全新 store,
// 手動輸入的碼與既有使用者一律不動。離線或伺服器出錯就放行,不擋使用者。
async function ensureFreshCode() {
  if (!store.codeFresh) return;
  if (SYNC_URL && !store.updatedAt && !Object.keys(store.q || {}).length) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${SYNC_URL}/sync/${encodeURIComponent(store.syncCode)}`);
        if (!r.ok) break; // 404 = 沒人用,定案;5xx 也放行
        store.syncCode = makeCode(); // 被占用 → 重抽再查
      } catch { break; }
    }
  }
  delete store.codeFresh;
  localStorage.setItem(STORE_KEY, JSON.stringify(store)); // 只落地碼,不動 updatedAt
}

// ---- helpers ----
const subjects = () => [...new Set(DATA.questions.map((q) => q.subject))];
const OFFICIAL_SRC = (q) => q.source !== '自製題' && q.source !== '延伸題'; // 非官方題不出現在模擬考試卷清單
const papers = () => [...new Set(DATA.questions.filter(OFFICIAL_SRC).map((q) => `${q.level}｜${q.round}｜${q.subject}`))];
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// 顯示層：英文詞（Human-over-the-loop、Low-code…）不在連字號斷行；不改資料
const nb = (h) => h.replace(/(?<![\w-])[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+(?![\w-])/g, (m) => (m.length <= 28 ? `<span class="nw">${m}</span>` : m));
// 中文詞不斷行：用 Intl.Segmenter 把 2～6 字的中文詞、數字+單位包成 nowrap span（只動文字節點，不碰標籤）
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;
const zhCache = new Map();
// 中文：在詞邊界插 <wbr>，配合 CSS word-break:keep-all，詞不會被拆成兩行；overflow-wrap:anywhere 保底不溢出
function zhSeg(t) {
  if (!/[㐀-鿿]/.test(t)) return t.replace(/\d[\d.,]*\s?(?:%|[A-Za-z]+)/g, (m) => `<span class="nw">${m}</span>`);
  let c = zhCache.get(t); if (c !== undefined) return c;
  c = '';
  const parts = [...SEG.segment(t)]; let run = 0;
  parts.forEach(({ segment, isWordLike }, k) => { // 詞與詞之間插 <wbr>；兩個單字詞（字典切太碎，如「進/階」）黏在一起，但黏到 3 字就放行，免得整串切不開、手機行尾參差；標點前不插（句號、逗號不落到行首），標點後插（開括號除外）
    const nx = parts[k + 1]; run += segment.length;
    const brk = nx && (isWordLike ? nx.isWordLike && (segment.length > 1 || nx.segment.length > 1 || run >= 3 || !/[㐀-鿿]/.test(segment)) : nx.isWordLike && !/[（(「『【〈《]$/.test(segment));
    c += segment + (brk ? '<wbr>' : ''); if (brk) run = 0;
  });
  if (zhCache.size > 4000) zhCache.clear();
  zhCache.set(t, c);
  return c;
}
const zhWords = (h) => SEG ? h.split(/(<[^>]*>)/).map((p, i) => (i % 2 || !p ? p : zhSeg(p))).join('') : h;
const tx = (s) => zhWords(nb(esc(s)));
// 其他區塊（今日觀念、延伸知識標題、統計表、頁尾、按鈕…）沒走 tx()：在 DOM 層補——新出現的中文文字節點一律在詞邊界插 <wbr>
// 只拆文字節點、不解析 HTML；已含 <wbr> 的父層（tx() 處理過）跳過；配合 CSS body{word-break:keep-all}
const SEG_SKIP = 'script,style,textarea,select,option,.nw';
function segDom(root) {
  if (!root || root.nodeType !== 1 || root.closest(SEG_SKIP)) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), todo = []; let n;
  while ((n = tw.nextNode())) {
    const p = n.parentElement;
    if (/[㐀-鿿]{2}/.test(n.data) && !p.closest(SEG_SKIP) && !p.querySelector(':scope > wbr')) todo.push(n);
  }
  for (const t of todo) {
    const parts = zhSeg(t.data).split('<wbr>'); if (parts.length < 2) continue;
    const f = document.createDocumentFragment();
    parts.forEach((s, k) => { if (k) f.append(document.createElement('wbr')); f.append(s); });
    t.replaceWith(f);
  }
}
if (SEG) {
  segDom(document.body);
  new MutationObserver((ms) => { for (const m of ms) for (const a of m.addedNodes) segDom(a.nodeType === 3 ? a.parentElement : a); })
    .observe(document.body, { childList: true, subtree: true });
}
// 「(B) 選項內容摘要」；有些題的選項本身就是一串數字（排序題），只顯示選項文字會被誤讀成亂碼，所以一律帶字母
const ansLabel = (q) => `(${String.fromCharCode(65 + q.answer)}) ${tx(String(q.options[q.answer]))}`; // 正解全文，不截斷（標題可換行）
// 內嵌 SVG 圖示（RemixIcon，currentColor）
const SVG = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICO_STAR = SVG('M12.0006 18.26L4.94715 22.2082L6.52248 14.2799L0.587891 8.7918L8.61493 7.84006L12.0006 0.5L15.3862 7.84006L23.4132 8.7918L17.4787 14.2799L19.054 22.2082L12.0006 18.26ZM12.0006 15.968L16.2473 18.3451L15.2988 13.5717L18.8719 10.2674L14.039 9.69434L12.0006 5.27502L9.96214 9.69434L5.12921 10.2674L8.70231 13.5717L7.75383 18.3451L12.0006 15.968Z');
const ICO_STAR_ON = SVG('M12.0006 18.26L4.94715 22.2082L6.52248 14.2799L0.587891 8.7918L8.61493 7.84006L12.0006 0.5L15.3862 7.84006L23.4132 8.7918L17.4787 14.2799L19.054 22.2082L12.0006 18.26Z');
const ICO_OK = SVG('M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z');
const ICO_NO = SVG('M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z');
// 半形標點接在中文字旁邊時換成全形（資料裡的 meta.note 有這種寫法）
const zhPunct = (t) => String(t).replace(/([\u3400-\u9fff）」』])\s*,/g, '$1，').replace(/([\u3400-\u9fff）」』])\s*;/g, '$1；').replace(/;(?=[\u3400-\u9fff])/g, '；').replace(/,(?=[\u3400-\u9fff])/g, '，');
// 解析顯示用:在「。/；後面的 (A)-(D) 選項分析」與「記憶點」前斷行並加粗,把長段落變條列(不動資料)
function formatExp(text) {
  return zhWords(nb(esc(text))
    // 學習指引題＝官方原文＋本站補充,兩段之間與補充的第一個選項都要斷開(官方原文結尾不一定有句號)
    .replace(/\s*(本站補充：)\s*/g, '<br>$1')
    .replace(/(本站補充：)\s*([(（][A-DＡ-Ｄ][)）])/g, '$1<br>$2')
    .replace(/([。；])\s*([(（][A-DＡ-Ｄ][)）])/g, '$1<br>$2')
    // 組合題/程式碼題不用 (A) 而是寫「原因 A：」「選項 B 的」,沒這條會整段擠成密文
    .replace(/([。；])\s*(原因\s*[A-DＡ-Ｄ]|選項\s*[A-DＡ-Ｄ])/g, '$1<br>$2')
    .replace(/([。；])\s*(核心概念|核心記憶點|記憶點)/g, '$1<br>$2')
    .replace(/(^|<br>)\s*(正解\s*[(（][A-DＡ-Ｄ][)）]|本站補充|[(（][A-DＡ-Ｄ][)）]|原因\s*[A-DＡ-Ｄ]|選項\s*[A-DＡ-Ｄ]|核心概念|核心記憶點|記憶點)/g, '$1<strong>$2</strong>'));
}
// ---- 知識延伸（knowledge.json）----
// 每題掛 0~2 則延伸知識:先用 topic 對應(精準),沒中才退回 chapter(概括)。索引在載入時建一次。
const kNorm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
function buildKnowIndex() {
  KTOPIC.clear(); KCHAP.clear();
  for (const n of KNOW) {
    for (const t of n.topics || []) {
      const k = kNorm(t); if (!k) continue;
      if (!KTOPIC.has(k)) KTOPIC.set(k, []);
      if (!KTOPIC.get(k).includes(n)) KTOPIC.get(k).push(n);
    }
    for (const c of n.chapters || []) {
      if (!KCHAP.has(c)) KCHAP.set(c, []);
      KCHAP.get(c).push(n);
    }
  }
}
// chapter 退路的相關度排序:同一章節常對到十幾則,照檔案順序取前兩則會掛出不相干的知識點
// (例：問 TCO 的題目掛到「可解釋 AI」)。改用題幹/選項/解析與知識點關鍵字的重疊數排序。
// 太常見的字沒有鑑別力:「ai」出現在 36% 的題目裡、「訓練」36%、「in」25%,拿它們當命中證據
// 等於整章亂掛(2026-09-16 驗收實測:322 題課程題單靠「ai」就被掛上同一張卡)。
// 門檻＝在題庫的出現率超過 15%;tools/check-knowledge.mjs 會重算出現率,超標又不在這張表就 WARN。
const K_STOP = new Set(['ai', '訓練', 'in']);
const kKeys = (n) => n._keys || (n._keys = [...new Set([
  ...(n.topics || []),
  ...String(n.title || '').split(/[\s,，、：:（）()／/]+/),
])].map(kNorm).filter((s) => s.length >= 2 && !K_STOP.has(s)));
function rankByRelevance(list, q) {
  const hay = kNorm(`${q.question}${(q.options || []).join('')}${q.explanation || ''}`);
  return list
    .map((n, i) => ({ n, i, s: kKeys(n).reduce((a, k) => a + (hay.includes(k) ? 1 : 0), 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
}
// 每題掛 0~2 則:topic 命中就直接用(已是精準對應);走 chapter 退路只取真的有關鍵字重疊的,
// 零重疊就不掛 —— 覆蓋率不是目的,相關才是。
//
// 2026-09-16 修回歸:原本零重疊會退而求其次掛「章節的第一則」以湊到 100% 覆蓋,結果 1843 題
// 課程題的六個章節各只對到一則知識點,整章數百題都掛同一張卡且多半不對題
// (問音訊特徵提取 → 掛「機器學習的四種學習類型」),使用者回報「裡面全部都是一樣的內容」。
function notesFor(q) {
  if (KBYQ.has(q.id)) return KBYQ.get(q.id).slice(0, 2); // ponytail: 沒在對應表的題目退回舊的 topic/章節規則
  const exact = KTOPIC.get(kNorm(q.topic));
  if (exact) return exact.slice(0, 2);
  const pool = KCHAP.get(q.chapter);
  if (!pool) return [];
  return rankByRelevance(pool, q).filter((x) => x.s > 0).slice(0, 2).map((x) => x.n);
}
// 一則知識的內容(延伸頁與題卡共用)
function noteBodyHtml(n) {
  const paras = String(n.body || '').split('\n').filter(Boolean).map((t) => `<p>${tx(t)}</p>`).join('');
  const pit = (n.pitfalls || []).length
    ? `<ul class="kpit">${n.pitfalls.map((x) => `<li>${tx(x)}</li>`).join('')}</ul>` : '';
  const refs = (n.refs || []).length
    ? `<p class="krefs">出處：${n.refs.map((r) => r.u
        ? `<a href="${esc(r.u)}" target="_blank" rel="noopener">${esc(r.t)} ↗</a>` : esc(r.t)).join('、')}</p>` : '';
  const terms = (n.terms || []).length
    ? `<dl class="kterms">${n.terms.map((x) => `<dt>${esc(x.t)}</dt><dd>${tx(x.d)}</dd>`).join('')}</dl>` : '';
  return `<p class="ksum">${tx(n.summary || '')}</p>${paras}${terms}${pit}${refs}`;
}
// 題卡下方的摺疊區塊(預設收合,不干擾作答節奏)
function knowHtml(q) {
  return notesFor(q).map((n) =>
    `<details class="kext"><summary>延伸知識・${esc(n.title)}</summary><div class="kbody">${noteBodyHtml(n)}</div></details>`).join('');
}
// 教材對應：指到該題所屬科目的學習指引章節 + 開啟官方 PDF
function guideLine(q) {
  const url = DATA.meta && DATA.meta.guides && DATA.meta.guides[q.subject];
  if (!url && !q.chapter) return '';
  const ch = q.chapter ? `—『${esc(q.chapter)}』章` : '';
  const link = url ? ` <a href="${esc(url)}" target="_blank" rel="noopener">開啟學習指引 ↗</a>` : '';
  return `<p class="guide">教材對應：${esc(q.subject)} ${ch}${link}</p>`;
}
// 快速做題：首頁一顆按鈕，用目前範圍偏好（首訪＝初級全題庫）智慧複習挑 QUICK_N 題直接開練。
const QUICK_N = 10;
// 智慧複習排序：錯題 → 沒做過 → 做過未掌握 → 已掌握，同級隨機。練習頁與快速做題共用。
const smartSort = (pool) => pool
  .map((q) => ({ q, pr: reviewPriority(store.q[q.id]), r: Math.random() }))
  .sort((a, b) => a.pr - b.pr || a.r - b.r)
  .map((x) => x.q);
// 今日觀念卡：優先挑「你還沒掌握的章節」(錯題 + 練過未掌握)，逐日輪過；沒練過則全站輪播
function todayConcept() {
  if (!CONCEPTS.length) return null;
  const dayNum = Math.floor(new Date(today() + 'T00:00:00').getTime() / 86400000);
  const byCh = {};
  for (const q of DATA.questions) {
    const p = store.q[q.id]; if (!p) continue;
    const c = (byCh[q.chapter || q.subject] ||= { attempted: 0, mastered: 0, wrongNow: 0 });
    if (p.attempts > 0) c.attempted++;
    if (isMastered(p.box)) c.mastered++;
    else if (p.wrong > 0) c.wrongNow++;
  }
  const weak = Object.entries(byCh)
    .map(([ch, c]) => ({ ch, score: c.attempted ? c.wrongNow * 2 + (c.attempted - c.mastered) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (weak.length) {
    const chosen = weak[dayNum % weak.length].ch;
    const pool = CONCEPTS.filter((c) => c.chapter === chosen);
    if (pool.length) return { ...pool[dayNum % pool.length], weak: true };
  }
  return CONCEPTS[((dayNum % CONCEPTS.length) + CONCEPTS.length) % CONCEPTS.length];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// ---- views ----
// 作答畫面要整頁不捲：把頁首、安裝列、頁尾與內容上下距的實際高度寫進 --chrome，
// practice.css 用 calc(100dvh - var(--chrome)) 算欄高（頁首會因寬度換行，不能寫死）。
function watchChrome() {
  const els = ['.top', '#installbar', '.site-footer'].map((s) => $(s)).filter(Boolean);
  const set = () => {
    // 大螢幕依比例放大（和關卡頁同一比例）：min(寬/1500, 高/800)，下限 1
    document.documentElement.style.setProperty('--s', Math.max(1, Math.min(innerWidth / 1500, innerHeight / 800)).toFixed(3));
    const cs = getComputedStyle(view);
    const h = els.reduce((a, e) => a + (e.hidden ? 0 : e.offsetHeight), 0) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    document.documentElement.style.setProperty('--chrome', `${Math.ceil(h) + 1}px`);
    regrow();
  };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(set); els.forEach((e) => ro.observe(e)); }
  window.addEventListener('resize', set);
  set();
  // 欄內可捲且還沒捲到底時，給 .qa-col 加 .more（CSS 畫底部漸層＋「往下還有內容」）
  const more = () => view.querySelectorAll('.qa-col').forEach((e) => e.classList.toggle('more', e.scrollHeight > e.clientHeight + 2 && e.scrollTop + e.clientHeight < e.scrollHeight - 4));
  view.addEventListener('scroll', more, true); view.addEventListener('toggle', more, true);
  new MutationObserver(more).observe(view, { childList: true, subtree: true });
  window.addEventListener('resize', more);
  if ('ResizeObserver' in window) new ResizeObserver(more).observe(view);
}
// 大螢幕留白（2560×1300 等）：雙欄畫面某欄內容只佔一部分高時，把該欄自己的 --s 調大（字、間距一起放大）到剛好填滿，
// 條件是欄內不捲、整頁不捲；不縮小、最多 ×cap；單欄（<1000 寬）不動。視窗變動時重算。
const GROWN = new Map();
function grow(el, cap = 1.4) {
  if (!el) return;
  GROWN.set(el, cap);
  if (document.fonts && document.fonts.status === 'loading') document.fonts.ready.then(regrow); // 像素字還沒載完時量的高不準，載完重算
  el.style.removeProperty('--s'); el.style.removeProperty('font-size');
  if (innerWidth < 1000 || innerHeight <= 760) return; // 矮視窗（≤760）觀念卡有 line-clamp、本來就緊，不放大
  const base = parseFloat(document.documentElement.style.getPropertyValue('--s')) || 1, de = document.documentElement;
  el.style.fontSize = 'calc(18px * var(--s))'; // 內文字級從 body 繼承的是算好的 px，要在這層重算才會跟著局部 --s 放大
  const fits = (k) => { el.style.setProperty('--s', (base * k).toFixed(3)); return el.scrollHeight <= el.clientHeight + 1 && de.scrollHeight <= innerHeight; };
  if (!fits(1)) { el.style.removeProperty('--s'); el.style.removeProperty('font-size'); return; }
  let lo = 1, hi = cap;
  if (fits(hi)) return;
  for (let n = 0; n < 7; n++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  fits(lo);
  if (lo < 1.02) { el.style.removeProperty('--s'); el.style.removeProperty('font-size'); }
}
function regrow() { for (const [el, cap] of [...GROWN]) { if (el.isConnected) grow(el, cap); else GROWN.delete(el); } }
// 手機分頁列單列橫向捲動：右側淡出提示還有內容，捲到底就拿掉
function tabsEdge() { const t = $('.tabs'); if (t) { t.classList.toggle('end', t.scrollLeft + t.clientWidth >= t.scrollWidth - 4); t.classList.toggle('sl', t.scrollLeft > 4); } }
function setNav(active) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === active));
  const on = $('.tabs button.on'); if (on) { const t = $('.tabs'); t.scrollLeft = Math.max(0, on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2); tabsEdge(); }
  window.scrollTo(0, 0);
}

// 範圍 = 章節（若題目尚未分類則退回科目），供「選擇練習範圍」用
const rangeKey = (q) => q.chapter || q.subject;
const srcOf = (q) => q.source || '歷屆';
// 卡片來源標籤(練習卡與背題卡共用):非官方來源都要標示,其餘(歷屆)無標籤
const SRC_TAG = { 學習指引: '學習指引範例', 自製題: '本站自製・非官方', 延伸題: '延伸練習・非官方' };
const srcTag = (q) => SRC_TAG[q.source] ? ` <span class="src-tag">${SRC_TAG[q.source]}</span>` : '';
// ---- 範圍選單 UI:題庫 → 級別 → 科目(三層,取代原本 31 個章節 checkbox)----
// 練習頁、背題頁、快速做題共用同一份偏好:store.bank(單選) / store.lv(單選) / store.subs(多選,null=該層全選)。
// 篩選邏輯在 core.js(有測);這裡只負責把 store 綁到 DOM。非官方題的隔離改由「題庫」這層負責(預設 official)。
const curBank = () => bankOf(store.bank);
const curLv = () => levelOf(store.lv);
const curSubs = () => resolveSubs(DATA.questions, curBank(), curLv(), store.subs);
// 目前選到的題目池;關鍵字之類的額外條件由各頁自己再濾
const rangePool = () => rangeQuestions(DATA.questions, { bank: store.bank, lv: store.lv, subs: store.subs });
function rangePickerHtml() {
  const bank = curBank(), lv = curLv(), subs = curSubs();
  const banks = BANKS.filter((b) => b.key === bank.key || (DATA.questions.some((q) => b.test(q)) && !(EARTH && b.key === '歷屆'))).map((b) => // 只列有題目的題庫；永續國官方題只有公告試題，「只練歷屆」跟官方題重複就不列
    `<option value="${esc(b.key)}"${b.key === bank.key ? ' selected' : ''}>${esc(EARTH && b.key === 'official' ? '官方題（115 年公告試題）' : b.label)} ${DATA.questions.filter((q) => b.test(q)).length} 題</option>`).join('');
  const lvs = LEVELS.map(([k, label]) => {
    const n = countIn(DATA.questions, bank, k);
    return `<button type="button" class="chip lv${k === lv ? ' on' : ''}" data-lv="${esc(k)}"${n ? '' : ' disabled'}>${label} <b>${n}</b></button>`;
  }).join('');
  const ss = subjectsIn(DATA.questions, bank, lv).map((s) =>
    `<button type="button" class="chip sub${subs.has(s.subject) ? ' on' : ''}" data-sub="${esc(s.subject)}">${esc(s.subject).replace('規劃管理', '規劃管理<wbr>')} <b>${s.count}</b></button>`).join('');
  return `<div class="pick-grid">
    <label class="pk"><span class="pick-lb">題庫</span><select id="bank-sel">${banks}</select></label>
    <div class="pk"><span class="pick-lb">級別</span><div class="chip-row">${lvs}</div></div>
    <div class="pk wide"><span class="pick-lb">科目<span class="muted">（可多選，至少留一個）</span></span><div class="chip-row">${ss}</div></div>
    </div>`;
}
// 綁事件:任一項改動 → 存 store → 重繪選單 → 回呼(更新題數/清單)。重繪會換掉 DOM,所以要重新綁一次。
function wireRangePicker(onChange) {
  const redraw = () => { $('#range-picker').innerHTML = rangePickerHtml(); wireRangePicker(onChange); onChange(); };
  $('#bank-sel').onchange = (e) => {
    store.bank = e.target.value; store.subs = null; // 換題庫→科目回全選
    // 該題庫沒這個級別(例:課程題沒中級)就自動跳到有題的級別,免得停在 0 題
    if (!countIn(DATA.questions, curBank(), curLv())) store.lv = firstLevelWith(DATA.questions, curBank());
    save(); redraw();
  };
  view.querySelectorAll('.chip.lv').forEach((b) => (b.onclick = () => {
    store.lv = b.dataset.lv; store.subs = null; save(); redraw();
  }));
  view.querySelectorAll('.chip.sub').forEach((b) => (b.onclick = () => {
    const cur = curSubs(), k = b.dataset.sub;
    if (cur.has(k)) { if (cur.size === 1) return; cur.delete(k); } else cur.add(k); // 不准把科目全取消
    store.subs = [...cur]; save(); redraw();
  }));
}

function home() {
  setNav('home');
  // 首頁不再顯示每日戰績條與今日挑戰;數據照常累計,要看去「統計」頁
  const quickCard = `
    <section class="card quick">
      <p class="big">快速做題 ${QUICK_N} 題</p>
      <p class="muted" style="margin:0">用「練習模式」裡的範圍設定，優先出錯題與沒做過的，按了就開始。</p>
      <button class="primary" id="quick-start">開始</button>
    </section>`;
  const cc = todayConcept();
  const conceptCard = cc ? `
    <section class="card concept-card">
      <div class="ck"><span>今日 AI 觀念${cc.chapter ? ' · ' + esc(cc.chapter) : ''}${cc.weak ? ' · 針對你還沒掌握的範圍' : ''}</span><button type="button" class="cc-more" hidden>看全文</button></div>
      <h3>${esc(cc.title)}</h3>
      <p class="cc-body">${esc(cc.body)}</p>
    </section>` : '';
  const nImg = DATA.questions.filter((q) => q.image).length;
  view.innerHTML = `<div class="home-grid">
    <div class="col">${quickCard}${conceptCard}</div>
    <div class="col"><section class="card practice">
      <div><div class="ttl"><h2>練習模式</h2><p class="muted">即時看答案與解析。先挑題庫，再挑級別跟科目。</p></div>
      <div id="range-picker">${rangePickerHtml()}</div></div>
      <div class="form-row">
        <label><span>關鍵字（選填）</span>
          <input id="pr-kw" placeholder="例如 RAG、特徵工程、Transformer">
        </label>
        <label><span>出題方式</span>
          <select id="pr-mode">
            <option value="smart">智慧複習（優先錯題與沒做過的）</option>
            <option value="random">隨機</option>
          </select>
        </label>
        <label><span>題數</span>
          <select id="pr-count"><option value="10">10</option><option value="20">20</option><option value="0">全部（選取範圍）</option></select>
        </label>
      </div>
      <div class="btns">
        <button class="primary" id="pr-start">開始練習</button>
        ${nImg ? `<button class="primary alt" id="pr-images">只練看圖題（${nImg} 題，全中級）</button>` : ''}
        <p class="muted range-sum" id="range-sum"></p>
      </div>
    </section></div>
    </div>`;
  { // 驗收第 1 輪：矮視窗觀念卡內文先顯示 5 行，超過才出現「看全文」，展開後可收回
    const ccp = view.querySelector('.cc-body'), ccb = view.querySelector('.cc-more');
    if (ccp && ccb) { const chk = () => { ccb.hidden = !ccp.classList.contains('open') && ccp.scrollHeight <= ccp.clientHeight + 1; }; chk(); addEventListener('resize', chk);
      ccb.onclick = () => { const o = ccp.classList.toggle('open'); ccb.textContent = o ? '收起' : '看全文'; chk(); }; }
  }
  grow(view.querySelector('.concept-card') || view.querySelector('.home-grid .quick'), 1.4); grow(view.querySelector('.home-grid .practice'), 1.25);
  const kw = () => $('#pr-kw').value.trim().toLowerCase();
  const matchKw = (q) => {
    const k = kw();
    if (!k) return true;
    return `${q.question}${q.topic || ''}${q.chapter || ''}${q.options.join(' ')}`.toLowerCase().includes(k);
  };
  const pickPool = () => rangePool().filter(matchKw);
  const updateSum = () => { $('#range-sum').textContent = `目前範圍共 ${pickPool().length} 題`; };
  wireRangePicker(updateSum); // 題庫/級別/科目改動 → 存 store + 更新題數
  $('#pr-kw').oninput = updateSum;
  $('#pr-start').onclick = () => {
    const count = +$('#pr-count').value;
    let pool = $('#pr-mode').value === 'smart' ? smartSort(pickPool()) : shuffle(pickPool());
    if (count) pool = pool.slice(0, count);
    runPractice(pool);
  };
  if ($('#pr-images')) $('#pr-images').onclick = () => runPractice(shuffle(DATA.questions.filter((q) => q.image)));
  // 快速做題:跳過下面所有選項,直接用目前範圍偏好智慧複習挑 QUICK_N 題
  $('#quick-start').onclick = () => runPractice(smartSort(rangePool()).slice(0, QUICK_N));
  updateSum();
}

function runPractice(pool, opts = {}) {
  let i = 0;
  let right = 0, wrong = 0;
  const sessionWrong = [];
  const results = []; // 本組每題的對錯（右欄進度條用）
  if (!pool.length) {
    view.innerHTML = `<section class="card"><p>沒有符合的題目。</p></section>`;
    return;
  }
  const render = () => {
    window.scrollTo(0, 0);
    const q = pool[i];
    const p = qp(q.id);
    const segs = pool.map((_, n) => `<i class="${n < i ? (results[n] ? 'ok' : 'bad') : n === i ? 'cur' : ''}"></i>`).join('');
    const lvl = q.level ? `<dt>級別</dt><dd>${esc(q.level)}</dd>` : '';
    const rng = q.chapter ? `<dt>章節</dt><dd>${esc(q.chapter)}</dd>` : '';
    const rec = p.attempts ? `作答 ${p.attempts} 次・答對 ${p.correct} 次` : '新題，還沒做過';
    const mas = !p.attempts ? '' : isMastered(p.box) ? '已掌握' : `練習中（再連對 ${Math.max(1, MASTER_BOX - (p.box || 1))} 次就掌握）`;
    view.innerHTML = `<div class="qa">
      <section class="card qa-col">
        <div class="row"><p class="qmeta muted"><b>${i + 1} / ${pool.length}</b>・${esc(q.subject)}${q.topic ? '・' + esc(q.topic) : ''}${srcTag(q)}</p>
          <button class="star ${p.starred ? 'on' : ''}" id="star" aria-pressed="${!!p.starred}">${p.starred ? ICO_STAR_ON + '已標記' : ICO_STAR + '標記'}</button></div>
        <div class="qbody">
          <h3 class="qtext">${tx(q.question)}</h3>
          ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
          <div id="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}"><span class="ot">${tx(o)}</span></button>`).join('')}</div>
        </div>
      </section>
      <section class="card qa-col pre" id="fb">
        <h3 class="sys">作答提示</h3>
        <p class="hint-line">選一個答案，這裡會顯示正解與解析。</p>
        <dl class="facts">${lvl}${rng}<dt>這題紀錄</dt><dd>${rec}</dd>${mas ? `<dt>掌握度</dt><dd>${mas}</dd>` : ''}</dl>
        <h3 class="sys">本組進度</h3>
        <div class="segbar" aria-hidden="true">${segs}</div>
        <p class="muted" style="margin:0">答對 ${right}・答錯 ${wrong}・還有 ${pool.length - i} 題（含這題）</p>
      </section>
      </div>`;
    $('#star').onclick = () => { p.starred = !p.starred; save(); render(); };
    view.querySelectorAll('.opt').forEach((btn) =>
      (btn.onclick = () => answer(q, +btn.dataset.k)));
    grow(view.querySelector('.qa-col'));
  };
  const answer = (q, k) => {
    const p = qp(q.id);
    const correct = k === q.answer;
    p.attempts++;
    if (correct) { p.correct++; right++; } else { p.wrong++; wrong++; sessionWrong.push(q); }
    results[i] = correct;
    p.box = nextBox(p.box, correct);
    logRecent(correct);
    bumpDaily(correct);
    save();
    view.querySelectorAll('.opt').forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.answer) b.classList.add('correct');
      if (idx === k && !correct) b.classList.add('wrong');
    });
    $('#fb').classList.remove('pre');
    $('#fb').innerHTML = `
      <div class="fb-top"><p class="fb-res ${correct ? 'ok' : 'bad'}">${correct ? ICO_OK + '答對' : ICO_NO + '答錯'}（正解：${ansLabel(q)}）</p>
        <button class="primary" id="next">${i + 1 < pool.length ? '下一題' : '完成'}</button></div>
      ${q.explanation ? `<p class="exp">${formatExp(q.explanation)}</p>` : ''}
      ${knowHtml(q)}
      ${guideLine(q)}
      <label class="note">筆記<textarea id="note" rows="2" placeholder="寫下你的理解或記憶點…">${esc(p.note || '')}</textarea></label>`;
    $('#note').oninput = (e) => { p.note = e.target.value; save(); };
    if (window.innerWidth < 1000) $('#fb').scrollIntoView({ block: 'start', behavior: 'smooth' }); // 單欄（手機）：把解析與「下一題」捲進畫面
    $('#next').onclick = () => { i++; i < pool.length ? render() : finish(); };
    grow($('#fb'));
  };
  const finish = () => {
    pushSync(); // checkpoint:練習完成立即上傳
    const total = right + wrong;
    const pct = total ? Math.round((right / total) * 1000) / 10 : 0;
    view.innerHTML = `
      <section class="card result">
        <h2>練習完成</h2>
        <p class="score">${pct}％</p>
        <p>這組 ${total} 題，答對 ${right}、答錯 ${wrong}${sessionWrong.length ? '' : '，全對，讚！'}</p>
        <div class="btns">
          ${sessionWrong.length ? '<button class="primary" id="redo-wrong">只練這次錯的</button>' : ''}
          <button id="again">再練一次</button>
          <button id="back">回首頁</button>
        </div>
      </section>`;
    if (sessionWrong.length) $('#redo-wrong').onclick = () => runPractice(sessionWrong.slice());
    $('#again').onclick = () => runPractice(shuffle(pool.slice()));
    $('#back').onclick = home;
  };
  render();
}

// 背題模式:把題目+選項+正解攤開成清單背誦。純閱讀——不寫作答紀錄、不動 dirty/同步、不影響錯題本統計。
// 範圍選單與練習頁共用同一份 store.bank/lv/subs;分批渲染每批 50 題、底部「載入更多」,換範圍時重置清單。
function study() {
  setNav('study');
  let showExp = store.studyExp !== false; // 顯示解說開關,預設開(true);關則每題解說整段不渲染
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>背題模式</h2><p class="muted">把題目、選項與正解直接攤開來背，不作答、不計分。範圍與練習頁共用同一份選擇。</p></div>
      <div id="range-picker">${rangePickerHtml()}</div>
      <div class="study-bar">
        <label class="study-toggle"><input type="checkbox" id="exp-toggle"${showExp ? ' checked' : ''}> 顯示解說</label>
        <p class="muted range-sum" id="range-sum"></p>
      </div>
    </section>
    <div id="study-list" class="cards"></div>
    <div id="study-more"></div>`;
  const listEl = $('#study-list'), moreEl = $('#study-more');
  let pool = [], shown = 0;
  const cardHtml = (q) => {
    const meta = `${esc(q.level)}・${esc(q.subject)}${q.chapter ? '・' + esc(q.chapter) : ''}`
      + srcTag(q);
    const opts = q.options.map((o, k) =>
      `<div class="opt${k === q.answer ? ' correct' : ''}"><span class="ot">${tx(o)}</span></div>`).join('');
    return `<section class="card">
      <p class="qmeta muted">${meta}</p>
      <h3>${tx(q.question)}</h3>
      ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
      <div class="study-opts">${opts}</div>
      ${showExp && q.explanation ? `<details class="study-exp" open><summary>解析</summary><div class="exp">${formatExp(q.explanation)}</div></details>` : ''}
      ${showExp ? knowHtml(q) : ''}
    </section>`;
  };
  const renderMore = () => {
    const next = pool.slice(shown, shown + 50); // 每批 50 題,避免整批一次塞爆 DOM
    listEl.insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
    shown += next.length;
    const rest = pool.length - shown;
    moreEl.innerHTML = rest > 0 ? `<button class="primary" id="load-more">載入更多（剩 ${rest} 題）</button>` : '';
    if (rest > 0) $('#load-more').onclick = renderMore;
  };
  const reset = () => {
    pool = rangePool();
    $('#range-sum').textContent = `目前範圍共 ${pool.length} 題`;
    listEl.innerHTML = ''; shown = 0;
    renderMore();
  };
  // 範圍變動:wireRangePicker 已存回共用的 store.bank/lv/subs,這裡只重置清單(不寫任何作答紀錄)
  wireRangePicker(reset);
  // 顯示解說開關:存回 store.studyExp(沿用既有 save 持久化)後重渲染清單
  $('#exp-toggle').onchange = (e) => { showExp = e.target.checked; store.studyExp = showExp; save(); reset(); };
  reset();
}

function mockSetup() {
  setNav('mock');
  const opts = papers().map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  const lim = DATA.meta.defaultTimeLimitMin || 60;
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>模擬考模式</h2><p class="muted">整份計時作答，交卷前不顯示答案。練臨場與時間分配。</p></div>
      <div class="mk-row">
        <label><span>試卷</span><select id="mk-paper">${opts}</select></label>
        <label><span>時間（分鐘）</span><input id="mk-min" type="number" value="${lim}" min="1"></label>
        <button class="primary" id="mk-start">開始模擬考</button>
      </div>
    </section>`;
  $('#mk-start').onclick = () => {
    const paper = $('#mk-paper').value;
    const mins = +$('#mk-min').value || lim;
    const pool = DATA.questions.filter((q) => `${q.level}｜${q.round}｜${q.subject}` === paper);
    runMock(pool, mins);
  };
}

function runMock(pool, mins) {
  const answers = new Array(pool.length).fill(null);
  let i = 0;
  let remaining = mins * 60;
  const fmt = () => `${String((remaining / 60) | 0).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const timer = setInterval(() => {
    remaining--;
    const t = $('#timer');
    if (t) t.textContent = fmt();
    if (remaining <= 0) { clearInterval(timer); submit(); }
  }, 1000);

  const render = () => {
    window.scrollTo(0, 0);
    const q = pool[i];
    const nDone = answers.filter((a) => a !== null).length;
    view.innerHTML = `<div class="qa mock">
      <section class="card qa-col">
        <div class="row"><p class="qmeta muted"><b>${i + 1} / ${pool.length}</b>・${esc(q.subject)}</p><span id="timer" class="timer">${fmt()}</span></div>
        <div class="qbody">
          <h3 class="qtext">${tx(q.question)}</h3>
          ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
        </div>
        <div class="qnav"><h3 class="sys">題號（已答 ${nDone} / ${pool.length}，點題號可跳題）</h3>
          <div class="qnav-g">${pool.map((_, n) => `<button class="qj${answers[n] !== null ? ' done' : ''}${n === i ? ' now' : ''}" data-n="${n}" aria-label="第 ${n + 1} 題${answers[n] !== null ? '，已作答' : ''}"${n === i ? ' aria-current="true"' : ''}>${n + 1}</button>`).join('')}</div></div>
      </section>
      <section class="card qa-col">
        <div class="qbody"><div id="opts">${q.options.map((o, k) =>
          `<button class="opt ${answers[i] === k ? 'picked' : ''}" data-k="${k}"><span class="ot">${tx(o)}</span></button>`).join('')}</div></div>
        <div class="row qa-nav">
          <button id="prev" ${i === 0 ? 'disabled' : ''}>上一題</button>
          ${i + 1 < pool.length ? '<button class="primary" id="next">下一題</button>' : '<button class="primary" id="submit">交卷</button>'}
        </div>
      </section>
      </div>`;
    // 點選項只切換 picked class,不整卡重 render(否則 #timer 被重建會閃 --:--)
    view.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      answers[i] = +b.dataset.k;
      view.querySelectorAll('.opt').forEach((x) => x.classList.toggle('picked', +x.dataset.k === answers[i]));
      const qj = view.querySelector(`.qj[data-n="${i}"]`); if (qj) qj.classList.add('done');
      const h = view.querySelector('.qnav .sys'); if (h) h.textContent = `題號（已答 ${answers.filter((a) => a !== null).length} / ${pool.length}，點題號可跳題）`;
    }));
    view.querySelectorAll('.qj').forEach((b) => (b.onclick = () => { i = +b.dataset.n; render(); }));
    if ($('#prev')) $('#prev').onclick = () => { i--; render(); };
    if ($('#next')) $('#next').onclick = () => { i++; render(); };
    if ($('#submit')) $('#submit').onclick = submit;
  };
  function submit() {
    clearInterval(timer);
    // 計入進度（模擬考也更新 Leitner / 統計）
    pool.forEach((q, idx) => {
      const p = qp(q.id);
      const correct = answers[idx] === q.answer;
      p.attempts++;
      if (correct) p.correct++; else p.wrong++;
      p.box = nextBox(p.box, correct);
      logRecent(correct);
      bumpDaily(correct);
    });
    save();
    pushSync(); // checkpoint:交卷立即上傳
    const r = scoreExam(pool, answers);
    view.innerHTML = `
      <section class="card result">
        <h2>結果</h2>
        <p class="score">${r.percent}％</p>
        <p>答對 ${r.correct} / ${r.total}，答錯 ${r.wrong}</p>
        <div class="btns">
          <button class="primary" id="review">重做錯題</button>
          <button id="review-all">整份檢討（含答對）</button>
          <button id="back">回首頁</button>
        </div>
      </section>`;
    $('#back').onclick = home;
    $('#review').onclick = () => runPractice(pool.filter((q) => r.wrongIds.includes(q.id)));
    $('#review-all').onclick = () => examReview(pool, answers);
  }
  render();
}

// 模擬考整份檢討:交卷後原本只能「重做錯題」,答對的題目永遠看不到解析(使用者 2026-09-20 回報)。
// 這裡把整份攤開,標出你選的與正解,每題都附解析與延伸知識;純閱讀,不再計分也不動進度。
function examReview(pool, answers) {
  setNav('mock');
  const cards = pool.map((q, idx) => {
    const picked = answers[idx];
    const done = picked !== undefined && picked !== null;
    const ok = picked === q.answer;
    const opts = q.options.map((o, k) => {
      const cls = k === q.answer ? ' correct' : (k === picked ? ' wrong' : '');
      return `<div class="opt${cls}"><span class="ot">${tx(o)}</span></div>`;
    }).join('');
    const state = !done ? '未作答' : (ok ? '答對' : '答錯');
    return `<section class="card">
      <p class="qmeta muted">第 ${idx + 1} 題・<span class="${ok ? 'ok' : 'bad'}">${state}</span>${ok ? '' : `・正解：${ansLabel(q)}`}${srcTag(q)}</p>
      <h3>${tx(q.question)}</h3>
      ${q.image ? `<img class="qfig" src="${esc(q.image)}" alt="題目附圖" loading="lazy">` : ''}
      <div class="study-opts">${opts}</div>
      ${q.explanation ? `<details class="study-exp" open><summary>解析</summary><div class="exp">${formatExp(q.explanation)}</div></details>` : ''}
      ${knowHtml(q)}
    </section>`;
  }).join('');
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>整份檢討</h2><p class="muted">${pool.length} 題全部列出，答對的也看得到解析。綠色打勾是正解，紅色打叉是你選的。</p>
        <div class="act"><button id="back">回首頁</button></div></div>
    </section><div class="cards">${cards}</div>`;
  $('#back').onclick = home;
  window.scrollTo(0, 0);
}

function wrongbook() {
  setNav('wrong');
  const ids = wrongQuestionIds(DATA.questions, store.q);
  const list = ids.map((id) => DATA.questions.find((q) => q.id === id));
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>錯題本</h2><p class="muted">答錯過、還沒掌握的題會留在這。同一題之後「連續答對 ${MASTER_BOX - 1} 次」就算掌握、自動移出。</p>
        ${ids.length ? `<div class="act"><button class="primary" id="drill">只練這些錯題（${ids.length} 題）</button></div>` : ''}</div>
      ${ids.length ? '' : '<p>目前沒有錯題，繼續加油。</p>'}
      <ul class="wrong">${list.map((q) => `<li>${tx(q.question)}<span class="muted">（${esc(q.subject)}・再連對 ${Math.max(1, MASTER_BOX - (qp(q.id).box || 1))} 次就掌握）</span></li>`).join('')}</ul>
    </section>`;
  if (ids.length) $('#drill').onclick = () => runPractice(shuffle(list));
}

function notes() {
  setNav('notes');
  const items = DATA.questions.filter((q) => { const p = store.q[q.id]; return p && (p.note || p.starred); });
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>我的筆記</h2><p class="muted">有寫筆記、或加上星標的題目都在這。筆記可直接在下面改，會自動存。</p>
        ${items.length ? '<div class="act"><button id="exp-notes">匯出筆記（Markdown）</button></div>' : ''}</div>
      ${items.length ? '' : '<p>還沒有筆記或星標題。練習時在題目下方寫筆記、或按「標記」加星標，就會出現在這。</p>'}
      <div class="note-list">${items.map((q) => {
        const p = qp(q.id);
        return `<div class="note-item">
          <div class="row"><span class="muted">${p.starred ? ICO_STAR_ON.replace('class="ico"', 'class="ico" style="color:var(--y)"') + ' ' : ''}${esc(q.subject)}</span>
            <button class="goto" data-id="${esc(q.id)}">前往該題</button></div>
          <p class="qn">${tx(q.question)}</p>
          <textarea class="note-edit" data-id="${esc(q.id)}" rows="2" placeholder="寫下你的理解或記憶點…">${esc(p.note || '')}</textarea>
        </div>`;
      }).join('')}</div>
    </section>`;
  view.querySelectorAll('.note-edit').forEach((t) => (t.oninput = (e) => { qp(e.target.dataset.id).note = e.target.value; save(); }));
  view.querySelectorAll('.goto').forEach((b) => (b.onclick = () => { const q = DATA.questions.find((x) => x.id === b.dataset.id); if (q) runPractice([q]); }));
  if (items.length) $('#exp-notes').onclick = () => download('ipas-notes.md', toMarkdown(DATA.questions, store.q), 'text/markdown');
}

function stats() {
  setNav('stats');
  const s = progressStats(DATA.questions, store.q);
  const cover = s.total ? Math.round((s.practiced / s.total) * 1000) / 10 : 0;
  const rec = store.recent || [];
  const recAcc = rec.length ? Math.round((rec.reduce((a, b) => a + b, 0) / rec.length) * 1000) / 10 : null;
  // 各章節（範圍）正確率與掌握度
  const byCh = new Map();
  for (const q of DATA.questions) {
    const k = rangeKey(q);
    const p = store.q[q.id] || {};
    const c = byCh.get(k) || { key: k, total: 0, attempts: 0, correct: 0, mastered: 0 };
    c.total++; c.attempts += p.attempts || 0; c.correct += p.correct || 0;
    if (isMastered(p.box)) c.mastered++;
    byCh.set(k, c);
  }
  const chList = [...byCh.values()].sort((a, b) => (a.attempts ? a.correct / a.attempts : 2) - (b.attempts ? b.correct / b.attempts : 2) || a.key.localeCompare(b.key, 'zh-Hant')); // 弱的排前面，沒練過的排最後
  const chRows = chList.map((x) =>
    `<tr><td>${esc(x.key)}</td><td>${x.attempts ? Math.round((x.correct / x.attempts) * 1000) / 10 + '％' : '—'}</td><td>${x.mastered}/${x.total}</td></tr>`).join('');
  // 成就徽章
  const strk = liveStreak();
  const badges = [
    { on: s.practiced >= 50, t: '練習 50 題' },
    { on: s.practiced >= 200, t: '練習 200 題' },
    { on: s.practiced >= s.total, t: '全部練過' },
    { on: strk >= 3, t: '連續 3 天' },
    { on: strk >= 7, t: '連續 7 天' },
    { on: strk >= 30, t: '連續 30 天' },
    { on: recAcc != null && recAcc >= 80, t: '近期 80% 命中' },
    { on: [...byCh.values()].some((c) => c.total > 0 && c.mastered === c.total), t: '某範圍全掌握' },
  ];
  const LOCK = '<svg class="lk" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 0h4v1h1v3h1v6H1V4h1V1h1zm1 1v3h2V1zM4 6h2v2H4z" fill-rule="evenodd"/></svg>'; // 像素鎖頭（10×10 格）
  const badgeHtml = badges.map((b) => `<span class="badge ${b.on ? 'on' : 'lock'}">${b.on ? '' : LOCK}${b.t}<span class="sr-only"> ${b.on ? '已解鎖' : '未解鎖'}</span></span>`).join('');
  // 最近 14 天題數趨勢
  const days14 = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(today() + 'T00:00:00'); d.setDate(d.getDate() - i); days14.push(ymd(d)); }
  const hist = store.history || {};
  const maxA = Math.max(1, ...days14.map((d) => (hist[d] && hist[d].a) || 0));
  const bars = days14.map((d) => {
    const a = (hist[d] && hist[d].a) || 0;
    const p = a ? Math.max(4, Math.round((a / maxA) * 100)) : 0;
    return `<div class="tcol${a ? '' : ' zero'}" title="${d}：${a} 題" style="--p:${p}">${a ? `<span class="tnum">${a}</span>` : ''}<div class="bar"></div></div>`;
  }).join('');
  const noTrend = days14.every((d) => !((hist[d] && hist[d].a) || 0));
  view.innerHTML = `
    <section class="card stats">
      <div class="stats-grid"><div>
      <h2>學習統計</h2>
      <div class="grid">
        <div><b>${cover}％</b><span>涵蓋率</span><small>練過 ${s.practiced} / ${s.total} 題</small></div>
        <div><b>${recAcc == null ? '—' : recAcc + '％'}</b><span>近期正確率</span><small>最近 ${rec.length} 題</small></div>
        <div><b>${s.wrongNow}</b><span>目前錯題</span><small>還沒掌握的錯題</small></div>
        <div><b>${s.mastered}</b><span>已掌握</span><small>連續答對 2 次</small></div>
      </div>
      <p class="muted stats-note">${tx('「掌握」= 同一題連續答對 2 次。用「智慧複習」會優先讓你重做沒掌握與答錯的題，掌握數才會往上跑。')}</p>
      </div><div>
      <h3>成就</h3>
      <div class="badges">${badgeHtml}</div>
      <h3>最近 14 天題數</h3>
      <div class="trend-box"><div class="trend">${bars}</div>${noTrend ? '<p class="trend-empty">還沒有作答紀錄，答題後這裡會顯示每天的題數。</p>' : ''}
        <div class="trend-lab"><span>${days14[0].slice(5)}</span><span>${days14[6].slice(5)}</span><span>今天</span></div></div>
      </div><div>
      <h3>各範圍弱點</h3>
      <p class="tbl-cap">共 ${chList.length} 個範圍，正確率低的排前面，沒練過的在最後<span class="tbl-hint">（表格可往下捲）</span>。</p>
      <div class="tbl-box"><div class="tbl-wrap"><table>
        <thead><tr><th>範圍</th><th>正確率</th><th>掌握</th></tr></thead>
        <tbody>${chRows}</tbody>
      </table></div><div class="tbl-fade" aria-hidden="true"></div></div>
      </div></div>
    </section>`;
  const tw = $('.tbl-wrap'), tb = $('.tbl-box');
  const upd = () => { if (tw && tb.isConnected) tb.classList.toggle('scrolls', tw.scrollHeight > tw.clientHeight + 2); if (tw && tb.isConnected) tb.classList.toggle('more', tw.scrollHeight > tw.clientHeight + 2 && tw.scrollTop + tw.clientHeight < tw.scrollHeight - 4); };
  if (tw) { tw.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); requestAnimationFrame(upd); setTimeout(upd, 300); }
}

// 官方考試資訊小區塊:及格標準(穩定)+ 官方考試資訊連結。原「一鍵設倒數日期」已隨首頁倒數移除而拿掉。
function examInfoHtml() {
  if (!EXAMINFO) return '';
  return `<div class="guide" style="white-space:normal">
    ${EXAMINFO.pass ? `<p style="margin:0 0 6px">${esc(EXAMINFO.pass)}</p>` : ''}
    <a href="https://ipd.nat.gov.tw/ipas/certification/AIAP/exam-info" target="_blank" rel="noopener">官方考試資訊 ↗</a>
  </div>`;
}

function settings() {
  setNav('settings');
  if (SYNC_URL) pushSync(); // 打開設定頁就把最新進度上傳，確保拿碼去別台時雲端已是最新
  const remHour = (store.settings && store.settings.reminderHour) || 20;
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>設定</h2></div>
      <div class="set-grid"><div class="set-sec">
      <h3>安裝成 App</h3>
      <p class="muted">裝起來有 App icon、可全螢幕、離線也能刷。</p>
      <button id="set-install">安裝</button>
      <span id="set-install-msg" class="muted"></span>

      <h3>學習目標</h3>
      <label>每日目標題數
        <input id="set-goal" type="number" min="1" max="790" value="${dailyGoal()}">
      </label>
      ${examInfoHtml()}

      ${pushSupported() ? `<h3>每日提醒（推播）</h3>
      <p class="muted">到設定時間若今天還沒練，會推播提醒你刷題。iPhone 需先把本站「加到主畫面」，並從安裝後的 App 開啟才收得到。</p>
      <label>提醒時間
        <select id="rem-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === remHour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
      </label>
      <button id="rem-toggle">載入中…</button>
      <button id="rem-test">傳測試通知</button>
      <span id="rem-msg" class="muted"></span>` : ''}
      </div><div class="set-sec">
      <h3>同步碼</h3>
      <p class="muted">${SYNC_URL
        ? '平常背景自動同步（答完題、切走 App、打開本頁時都會上傳；停在畫面沒動則最多 30 秒補傳一次）。換新裝置時：先在舊裝置打開這頁（會上傳），再到新裝置輸入這組碼。'
        : EARTH ? '永續國題庫的進度只存在這台裝置，換裝置請用下方「匯出/匯入」轉移。' : '雲端同步尚未啟用（需在 app.js 填入 Worker 網址）。目前可用下方「匯出/匯入」轉移。'}</p>
      <p class="code" id="code">${esc(store.syncCode)}</p>
      <label>在新裝置輸入既有同步碼
        <input id="code-in" placeholder="例如 fox-river-82">
      </label>
      <button id="code-set">套用此碼</button>
      ${SYNC_URL ? '<button id="sync-now">立即同步</button>' : ''}
      <span id="sync-msg" class="muted"></span>
      </div><div class="set-sec">
      <h3>備份 / 轉移</h3>
      <button id="exp">匯出進度（JSON）</button>
      <button id="imp-btn">匯入進度（JSON）</button>
      <input id="imp" type="file" accept="application/json" hidden>
      <button id="exp-md">匯出筆記（Markdown）</button>

      <h3>重設統計</h3>
      <p class="muted">把作答統計歸零、重新練到 100%，但<strong>保留你的筆記與星標</strong>。</p>
      <button id="reset-stats">重設統計（保留筆記與星標）</button>

      <h3 class="danger">重設</h3>
      <button class="danger" id="reset">清除本機所有進度</button>
      </div></div>
    </section>`;
  const insBtn = $('#set-install'), insMsg = $('#set-install-msg');
  if (insBtn) {
    if (isStandalone()) { insBtn.textContent = '已安裝'; insBtn.disabled = true; }
    else if (deferredInstall) {
      insBtn.onclick = async () => {
        deferredInstall.prompt();
        const c = await deferredInstall.userChoice.catch(() => ({}));
        if (c && c.outcome === 'accepted') { insBtn.textContent = '已安裝'; insBtn.disabled = true; dismissInstallBar(); }
        deferredInstall = null;
      };
    } else {
      insBtn.disabled = true;
      insBtn.textContent = '由瀏覽器選單安裝';
      insMsg.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? '（iPhone:Safari 分享鈕 → 加入主畫面）'
        : '（Chrome ⋮ 選單 → 安裝應用程式 / 加到主畫面）';
    }
  }
  $('#set-goal').onchange = (e) => { store.settings ||= {}; store.settings.dailyGoal = Math.max(1, +e.target.value || 20); save(); };
  if ($('#rem-hour')) $('#rem-hour').onchange = async (e) => {
    store.settings ||= {}; store.settings.reminderHour = +e.target.value; save();
    if (await pushIsOn()) { await enablePush(+e.target.value); $('#rem-msg').textContent = '提醒時間已更新'; }
  };
  if (pushSupported() && $('#rem-toggle')) {
    const btn = $('#rem-toggle');
    pushIsOn().then((on) => { btn.textContent = on ? '關閉提醒' : '開啟提醒'; });
    btn.onclick = async () => {
      btn.disabled = true; $('#rem-msg').textContent = '處理中…';
      try {
        if (await pushIsOn()) { await disablePush(); btn.textContent = '開啟提醒'; $('#rem-msg').textContent = '已關閉提醒'; }
        else {
          const r = await enablePush((store.settings && store.settings.reminderHour) || 20);
          if (r.ok) { btn.textContent = '關閉提醒'; $('#rem-msg').textContent = '已開啟，每天到點提醒'; }
          else { $('#rem-msg').textContent = '開啟失敗：' + (r.reason || '請稍後再試'); }
        }
      } catch { $('#rem-msg').textContent = '發生錯誤，請稍後再試'; }
      btn.disabled = false;
    };
  }
  if ($('#rem-test')) $('#rem-test').onclick = async () => {
    $('#rem-msg').textContent = '傳送測試中…';
    try {
      const r = await fetch(`${SYNC_URL}/push/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: store.syncCode }) });
      const j = await r.json().catch(() => ({}));
      $('#rem-msg').textContent = r.ok ? '已傳送，看通知有沒有跳出' : (j.error === 'not_subscribed' ? '請先「開啟提醒」' : '失敗：' + (j.error || r.status));
    } catch { $('#rem-msg').textContent = '傳送失敗'; }
  };
  $('#code-set').onclick = async () => {
    const v = $('#code-in').value.trim();
    if (!v) return;
    store.syncCode = v;
    store.updatedAt = 0; // 讓開啟時的 pull 一定採用雲端那份
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    if (SYNC_URL) await pullSync();
    settings();
  };
  if ($('#sync-now')) $('#sync-now').onclick = async () => {
    $('#sync-msg').textContent = '同步中…';
    const pulled = await pullSync();
    const pushed = await pushSync();
    $('#sync-msg').textContent = pushed || pulled ? '已同步' : '同步失敗（檢查網路或同步碼）';
    if (pulled) setTimeout(settings, 600);
  };
  $('#exp').onclick = () => download('ipas-progress.json', JSON.stringify(store, null, 2), 'application/json');
  $('#exp-md').onclick = () => download('ipas-notes.md', toMarkdown(DATA.questions, store.q), 'text/markdown');
  $('#imp-btn').onclick = () => $('#imp').click();
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s && s.q) { store = s; save(); alert('已匯入。'); home(); }
      else alert('檔案格式不符。');
    } catch { alert('讀取失敗。'); }
  };
  $('#reset').onclick = async () => {
    if (!confirm('確定清除本機所有作答進度與筆記？')) return;
    store = { v: 1, syncCode: makeCode(), codeFresh: true, q: {} };
    await ensureFreshCode(); // 新碼先查重,再 save(save 會標 dirty 上傳)
    save(); settings();
  };
  $('#reset-stats').onclick = () => {
    if (!confirm('重設統計？掌握度、正確率、錯題本、打卡、趨勢都歸零；保留筆記、星標與設定。')) return;
    for (const id in store.q) {
      const p = store.q[id];
      if (p.note || p.starred) store.q[id] = { box: 1, attempts: 0, correct: 0, wrong: 0, note: p.note || '', starred: !!p.starred };
      else delete store.q[id];
    }
    store.recent = []; store.history = {}; store.streak = { count: 0, lastDate: '' }; store.daily = null;
    save(); settings();
  };
}

// 知識庫:把 knowledge.json 的延伸知識整份攤開瀏覽(考題之外的觀念補充)。
// 純閱讀,不寫任何進度;篩選與搜尋只存在本次瀏覽,不進 store。
function knowledge() {
  setNav('knowledge');
  let lv = '全部', subj = '全部', kw = '';
  const subjects = ['全部', ...new Set(KNOW.map((n) => n.subject))];
  view.innerHTML = `
    <section class="card">
      <div class="ttl"><h2>知識庫</h2><p class="muted">考題之外的觀念延伸，每則附可查證出處。練習與背題頁的題目下方也會掛上對應的這幾則。</p></div>
      ${KNOW.length ? `
      <div class="kfilter">
        <div class="chips" id="k-lv">${['全部', '初級', '中級'].map((x) =>
          `<button type="button" class="chip${x === lv ? ' on' : ''}" data-lv="${x}">${x}</button>`).join('')}</div>
        <label class="ksel">科目
          <select id="k-subj">${subjects.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>
        </label>
        <label class="ksel">搜尋
          <input id="k-kw" type="search" placeholder="關鍵字，例如 RAG、過擬合">
        </label>
        <p class="muted" id="k-count"></p>
      </div>` : '<p class="bad">knowledge.json 尚未載入。</p>'}
    </section>
    <div id="k-list" class="cards"></div>`;
  if (!KNOW.length) return;
  const listEl = $('#k-list'), countEl = $('#k-count');
  const draw = () => {
    const q = kNorm(kw);
    const hit = KNOW.filter((n) =>
      (lv === '全部' || (n.levels || []).includes(lv))
      && (subj === '全部' || n.subject === subj)
      && (!q || kNorm(`${n.title}${n.summary}${n.body}${(n.topics || []).join('')}`).includes(q)));
    countEl.textContent = `共 ${KNOW.length} 則，符合 ${hit.length} 則`;
    listEl.innerHTML = hit.map((n) => `<section class="card knote">
      <p class="qmeta muted">${esc((n.levels || []).join('／'))}・${esc(n.subject)}</p>
      <h3>${esc(n.title)}</h3>
      <div class="kbody">${noteBodyHtml(n)}</div>
    </section>`).join('') || '<section class="card full"><p class="muted">沒有符合的知識點。</p></section>';
  };
  $('#k-lv').onclick = (e) => {
    const b = e.target.closest('[data-lv]'); if (!b) return;
    lv = b.dataset.lv;
    $('#k-lv').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.lv === lv));
    draw();
  };
  $('#k-subj').onchange = (e) => { subj = e.target.value; draw(); };
  $('#k-kw').oninput = (e) => { kw = e.target.value; draw(); };
  draw();
}

const ROUTES = { home, study, knowledge, mock: mockSetup, wrong: wrongbook, notes, stats, settings };

// ---- boot ----
async function boot() {
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => ROUTES[b.dataset.v]()));
  watchChrome();
  { const t = $('.tabs'); if (t) { t.addEventListener('scroll', tabsEdge, { passive: true }); window.addEventListener('resize', tabsEdge); tabsEdge(); } }
  if (isStandalone() || installBarOff()) { const b = document.getElementById('installbar'); if (b) b.hidden = true; }
  const ib = document.getElementById('install-btn');
  if (ib) ib.onclick = async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    dismissInstallBar();
  };
  const ix = document.getElementById('install-x');
  if (ix) ix.onclick = dismissInstallBar;
  $('#title').innerHTML = `<span class="t-main">${EARTH ? '淨零碳演武島' : 'AI 演武島'}</span><span class="t-sub">${EARTH ? 'iPAS 淨零碳規劃管理師模擬考' : 'iPAS AI 應用規劃師模擬考'}</span>`;
  // 資料載入：先顯示「讀取中」；每個請求 8 秒逾時、自動重試一次；仍失敗顯示訊息與「重新載入」
  for (;;) {
    view.innerHTML = '<section class="card" role="status"><p class="sys">讀取題庫中…</p></section>';
    try { DATA = EARTH ? await loadEarth() : await fj('questions.json', 2); break; }
    catch {
      await new Promise((ok) => {
        view.innerHTML = '<section class="card" role="alert"><p class="bad">題庫載入失敗（網路太慢或連不上）。</p><button class="primary" id="reload">重新載入</button></section>';
        $('#reload').onclick = ok;
      });
    }
  }
  if (!EARTH) try { CONCEPTS = ((await fj('concepts.json')).cards) || []; } catch { CONCEPTS = []; }
  if (!EARTH) try { KNOW = ((await fj('knowledge.json')).notes) || []; } catch { KNOW = []; }
  buildKnowIndex();
  if (!EARTH) try { const wp = await fj('world-pool.json'), KM = new Map(KNOW.map((n) => [n.id, n]));
    for (const [nid, qids] of Object.entries(wp)) { const n = KM.get(nid); if (n) for (const qid of qids) { if (!KBYQ.has(qid)) KBYQ.set(qid, []); KBYQ.get(qid).push(n); } }
  } catch { KBYQ.clear(); }
  if (!EARTH) try { EXAMINFO = await fj('exam-dates.json'); } catch { EXAMINFO = null; }
  if (DATA.meta?.note) { const n = $('#banner'); n.textContent = zhPunct(DATA.meta.note); n.hidden = false; }
  localStorage.setItem(STORE_KEY, JSON.stringify(store)); // 落地可能新生成的 syncCode(不動 updatedAt)
  await ensureFreshCode(); // 全新自動碼先查重(要在 pull 之前,否則撞碼會拉到陌生人的進度)
  if (SYNC_URL) await pullSync(); // 開啟先拉雲端，單人多裝置就不會互蓋
  document.addEventListener('visibilitychange', () => { if (document.hidden) pushSync({ keepalive: true }); }); // checkpoint:切走/關頁前 flush
  home();
}
boot();
