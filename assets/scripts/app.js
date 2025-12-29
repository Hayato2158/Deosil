/* =========================
   app.js（共通：DB/Util/API）
   ========================= */

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

    req.onupgradeneeded = () => {
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
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  return crypto?.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function calcWorkAndDiff(session) {
  if (!session?.startAt || !session?.endAt) return { workMin: null, diffMin: null };
  const grossMin = Math.floor((session.endAt - session.startAt) / 60000);
  const workMin = Math.max(0, grossMin - BREAK_MIN);
  const diffMin = workMin - REQUIRED_MIN;
  return { workMin, diffMin };
}

// ===== 共通API（window.App に集約） =====
window.App = {
  db: null,
  testerId: null,

  // util
  formatDate,
  formatTime,
  formatHM,
  calcWorkAndDiff,

  // db helpers
  openDb,
  tx,
  reqToPromise,

  // init（home.js / data.js から呼ぶ）
  async init() {
    if (window.App.db && window.App.testerId) return; // 多重初期化防止
    window.App.db = await openDb();
    window.App.testerId = await window.App.getOrCreateTesterId();
  },

  // meta
  async getOrCreateTesterId() {
    const store = tx(window.App.db, STORE_META, "readwrite");
    const existing = await reqToPromise(store.get("testerId"));
    if (existing?.value) return existing.value;

    const id = uuid();
    await reqToPromise(store.put({ key: "testerId", value: id }));
    return id;
  },

  // queries
  async getWorkingSession() {
    const store = tx(window.App.db, STORE_SESSIONS);
    const idx = store.index("byTesterState");
    const range = IDBKeyRange.only([window.App.testerId, "WORKING"]);
    const cursorReq = idx.openCursor(range);

    return new Promise((resolve, reject) => {
      cursorReq.onsuccess = () => resolve(cursorReq.result ? cursorReq.result.value : null);
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  async getSessionByDate(workDate) {
    const store = tx(window.App.db, STORE_SESSIONS);
    const idx = store.index("byTesterDate");
    return reqToPromise(idx.get([window.App.testerId, workDate]));
  },

  async listSessionsInMonth(year, month1to12) {
    const start = new Date(year, month1to12 - 1, 1);
    const end = new Date(year, month1to12, 1);
    const startMs = start.getTime();
    const endMs = end.getTime();

    const store = tx(window.App.db, STORE_SESSIONS);
    const idx = store.index("byTesterStartAt");
    const range = IDBKeyRange.bound(
      [window.App.testerId, startMs],
      [window.App.testerId, endMs],
      false,
      true
    );

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
  },

  // mutations（home.jsが使う想定）
  async createStartSession() {
    const workDate = formatDate(new Date());

    const working = await window.App.getWorkingSession();
    if (working) return { ok: false, message: "退勤が未記録です。先に退勤してください。" };

    const already = await window.App.getSessionByDate(workDate);
    if (already) return { ok: false, message: "本日は既に記録があります（1日1勤務）。" };

    const session = {
      id: uuid(),
      testerId: window.App.testerId,
      workDate,
      startAt: Date.now(),
      endAt: null,
      state: "WORKING",
    };

    const store = tx(window.App.db, STORE_SESSIONS, "readwrite");
    await reqToPromise(store.put(session));

    return { ok: true, session };
  },

  async closeWorkingSession() {
    const working = await window.App.getWorkingSession();
    if (!working) return { ok: false, message: "出勤が未記録です。" };

    working.endAt = Date.now();
    working.state = "DONE";

    const store = tx(window.App.db, STORE_SESSIONS, "readwrite");
    await reqToPromise(store.put(working));

    return { ok: true, session: working };
  },
};
