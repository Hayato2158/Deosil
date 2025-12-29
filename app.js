// ===== 固定値（MVP） =====
const REQUIRED_MIN = 480; // 8h
const BREAK_MIN = 60;     // 1h

// ===== IndexedDB =====
const DB_NAME = "time-helper";
const DB_VERSION = 1;
const STORE_SESSIONS = "sessions";
const STORE_META = "meta";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;

      // sessions
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        s.createIndex("byTesterDate", ["testerId", "workDate"], { unique: true });
        s.createIndex("byTesterState", ["testerId", "state"], { unique: false });
        s.createIndex("byTesterStartAt", ["testerId", "startAt"], { unique: false });
      }

      // meta
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== util =====
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function formatTime(epochMs) {
  if (!epochMs) return "--:--";
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatHM(min) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${pad2(m)}`;
}
function uuid() {
  // 依存なしで雑に一意（MVP用）
  return crypto?.randomUUID ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function calcWorkAndDiff(session) {
  if (!session?.startAt || !session?.endAt) {
    return { workMin: null, diffMin: null };
  }
  const grossMin = Math.floor((session.endAt - session.startAt) / 60000);
  const workMin = Math.max(0, grossMin - BREAK_MIN);
  const diffMin = workMin - REQUIRED_MIN;
  return { workMin, diffMin };
}

// ===== state =====
let db;
let testerId;

// ===== DOM =====
const el = (id) => document.getElementById(id);
const workDateEl = el("workDate");
const stateTextEl = el("stateText");
const startAtTextEl = el("startAtText");
const endAtTextEl = el("endAtText");
const workTimeTextEl = el("workTimeText");
const diffTextEl = el("diffText");
const hintTextEl = el("hintText");
const btnStart = el("btnStart");
const btnEnd = el("btnEnd");
const monthTbody = el("monthTbody");
const sumOverText = el("sumOverText");
const sumUnderText = el("sumUnderText");

// ===== meta (testerId) =====
async function getOrCreateTesterId() {
  const store = tx(db, STORE_META, "readwrite");
  const existing = await reqToPromise(store.get("testerId"));
  if (existing?.value) return existing.value;

  const id = uuid();
  await reqToPromise(store.put({ key: "testerId", value: id }));
  return id;
}

// ===== queries =====
async function getWorkingSession() {
  const store = tx(db, STORE_SESSIONS);
  const idx = store.index("byTesterState");
  const range = IDBKeyRange.only([testerId, "WORKING"]);
  const cursorReq = idx.openCursor(range);
  return new Promise((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      resolve(cur ? cur.value : null);
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function getSessionByDate(workDate) {
  const store = tx(db, STORE_SESSIONS);
  const idx = store.index("byTesterDate");
  return reqToPromise(idx.get([testerId, workDate]));
}

async function listSessionsInMonth(year, month1to12) {
  // month1to12: 1..12
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 1);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const store = tx(db, STORE_SESSIONS);
  const idx = store.index("byTesterStartAt");

  // startAtでざっくり範囲抽出（workDateでなくstartAtでOK：出勤日の月を表示）
  const range = IDBKeyRange.bound([testerId, startMs], [testerId, endMs], false, true);

  const items = [];
  const req = idx.openCursor(range);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(items);
      items.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ===== commands =====
async function startWork() {
  hintTextEl.textContent = "";

  const today = new Date();
  const workDate = formatDate(today);

  const working = await getWorkingSession();
  if (working) {
    hintTextEl.textContent = "退勤が未記録です。先に退勤してください。";
    return;
  }

  const already = await getSessionByDate(workDate);
  if (already) {
    hintTextEl.textContent = "本日は既に記録があります（1日1勤務）。";
    return;
  }

  const session = {
    id: uuid(),
    testerId,
    workDate,
    startAt: Date.now(),
    endAt: null,
    state: "WORKING",
  };

  const store = tx(db, STORE_SESSIONS, "readwrite");
  await reqToPromise(store.put(session));
  await render();
}

async function endWork() {
  hintTextEl.textContent = "";

  const working = await getWorkingSession();
  if (!working) {
    hintTextEl.textContent = "出勤が未記録です。";
    return;
  }

  // 日跨ぎOK：endAtはそのままnow
  working.endAt = Date.now();
  working.state = "DONE";

  const store = tx(db, STORE_SESSIONS, "readwrite");
  await reqToPromise(store.put(working));
  await render();
}

// ===== render =====
async function renderToday() {
  const today = new Date();
  const todayDate = formatDate(today);
  workDateEl.textContent = todayDate;

  const working = await getWorkingSession();
  const todaySession = await getSessionByDate(todayDate);

  let s = null;
  if (working) s = working;
  else if (todaySession) s = todaySession;

  if (!s) {
    stateTextEl.textContent = "未出勤";
    startAtTextEl.textContent = "--:--";
    endAtTextEl.textContent = "--:--";
    workTimeTextEl.textContent = "--:--";
    diffTextEl.textContent = "--";
    btnStart.disabled = false;
    btnEnd.disabled = true;
    return;
  }

  if (s.state === "WORKING") {
    stateTextEl.textContent = "勤務中";
    btnStart.disabled = true;
    btnEnd.disabled = false;
  } else {
    stateTextEl.textContent = "退勤済";
    btnStart.disabled = true; // 1日1勤務
    btnEnd.disabled = true;
  }

  startAtTextEl.textContent = formatTime(s.startAt);
  endAtTextEl.textContent = s.endAt ? formatTime(s.endAt) : "--:--";

  const { workMin, diffMin } = calcWorkAndDiff(s);
  workTimeTextEl.textContent = workMin == null ? "--:--" : formatHM(workMin);
  if (diffMin == null) {
    diffTextEl.textContent = "--";
  } else if (diffMin > 0) {
    diffTextEl.textContent = `+${formatHM(diffMin)}（残業）`;
  } else if (diffMin < 0) {
    diffTextEl.textContent = `${formatHM(diffMin)}（早上がり）`;
  } else {
    diffTextEl.textContent = "±0:00（定時）";
  }
}

async function renderMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const sessions = await listSessionsInMonth(year, month);
  // workDateで昇順
  sessions.sort((a, b) => a.workDate.localeCompare(b.workDate));

  monthTbody.innerHTML = "";

  let overMin = 0;
  let underMin = 0;

  for (const s of sessions) {
    const { workMin, diffMin } = calcWorkAndDiff(s);

    let diffText = "--";
    if (diffMin != null) {
      if (diffMin > 0) { diffText = `+${formatHM(diffMin)}`; overMin += diffMin; }
      else if (diffMin < 0) { diffText = formatHM(diffMin); underMin += (-diffMin); }
      else diffText = "±0:00";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.workDate}</td>
      <td>${formatTime(s.startAt)}</td>
      <td>${s.endAt ? formatTime(s.endAt) : "--:--"}</td>
      <td>${workMin == null ? "--:--" : formatHM(workMin)}</td>
      <td>${diffText}</td>
    `;
    monthTbody.appendChild(tr);
  }

  sumOverText.textContent = formatHM(overMin);
  sumUnderText.textContent = formatHM(underMin);
}

async function render() {
  await renderToday();
  await renderMonth();
}

// ===== init =====
(async function init() {
  db = await openDb();
  testerId = await getOrCreateTesterId();

  btnStart.addEventListener("click", startWork);
  btnEnd.addEventListener("click", endWork);

  await render();
})();
