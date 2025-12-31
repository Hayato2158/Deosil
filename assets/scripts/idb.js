/* =========================
   idb.js（IndexedDB：DB/Meta/Local CRUD）
   ========================= */

(() => {
    // ===== IndexedDB =====
    const DB_NAME = "time-helper";
    const DB_VERSION = 2;
    const STORE_SESSIONS = "sessions";
    const STORE_META = "meta";

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = () => {
                const db = req.result;

                // sessions
                if (db.objectStoreNames.contains(STORE_SESSIONS)) {
                    db.deleteObjectStore(STORE_SESSIONS);
                }
                const s = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
                s.createIndex("byUserIdDate", ["userId", "workDate"], { unique: true });
                s.createIndex("byUserIdState", ["userId", "state"], { unique: false });
                s.createIndex("byUserIdStartAt", ["userId", "startAt"], { unique: false });

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

    // ===== window.App に公開 =====
    window.App = window.App || {};

    window.App.openDb = openDb;
    window.App.tx = tx;
    window.App.reqToPromise = reqToPromise;

    // meta(後で消す)
    // window.App.getOrCreateTesterId = async function getOrCreateTesterId() {
    //     const store = tx(window.App.db, STORE_META, "readwrite");
    //     const existing = await reqToPromise(store.get("testerId"));
    //     if (existing?.value) return existing.value;

    //     const id = window.App.uuid(); // core.js 側
    //     await reqToPromise(store.put({ key: "testerId", value: id }));
    //     return id;
    // };

    // queries
    window.App.getWorkingSession = async function getWorkingSession() {
        //supabaseを優先して確認
        if (window.App.getWorkingSessionRemote) {
            const remoteSession = await window.App.getWorkingSessionRemote();
            if (remoteSession) return remoteSession;
        }

        const store = tx(window.App.db, STORE_SESSIONS);
        const idx = store.index("byUserIdState");
        const range = IDBKeyRange.only([window.App.userId, "WORKING"]);
        const cursorReq = idx.openCursor(range);

        return new Promise((resolve, reject) => {
            cursorReq.onsuccess = () => resolve(cursorReq.result ? cursorReq.result.value : null);
            cursorReq.onerror = () => reject(cursorReq.error);
        });
    };

    window.App.getSessionByDate = async function getSessionByDate(workDate) {
        //supabaseを優先確認
        if (window.App.getSessionByDateRemote) {
            const remoteSession = await window.App.getSessionByDateRemote(workDate);
            if (remoteSession) return remoteSession;
        }

        const store = tx(window.App.db, STORE_SESSIONS);
        const idx = store.index("byUserIdDate");
        return reqToPromise(idx.get([window.App.userId, workDate]));
    };

    window.App.listSessionsInMonth = async function listSessionsInMonth(year, month1to12) {
        //supabaseを優先確認
        if (window.App.listSessionInMonthRemote) {
            const remonteSession = await window.App.listSessionInMonthRemote(year, month1to12);
            if (remonteSession) return remonteSession;
        }

        const start = new Date(year, month1to12 - 1, 1);
        const end = new Date(year, month1to12, 1);
        const startMs = start.getTime();
        const endMs = end.getTime();

        const store = tx(window.App.db, STORE_SESSIONS);
        const idx = store.index("byUserIdStartAt");
        const range = IDBKeyRange.bound(
            [window.App.userId, startMs],
            [window.App.userId, endMs],
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
    };

    // mutations（home.js が使う想定）
    window.App.createStartSession = async function createStartSession() {

        //userId確認してnullならエラー
        if (!window.App.userId) return { ok: false, message: "ユーザーIDが取得できません。再ログインしてください。" };

        const workDate = window.App.formatDate(new Date());

        const working = await window.App.getWorkingSession();
        if (working) return { ok: false, message: "退勤が未記録です。先に退勤してください。" };

        const already = await window.App.getSessionByDate(workDate);
        if (already) return { ok: false, message: "本日は既に記録があります（1日1勤務）。" };

        const session = {
            id: window.App.uuid(),
            userId: window.App.userId,
            workDate,
            startAt: Date.now(),
            endAt: null,
            state: "WORKING",
        };

        const store = tx(window.App.db, STORE_SESSIONS, "readwrite");
        await reqToPromise(store.put(session));

        // Supabase 同期（sb.js が提供）
        if (window.App.tryUpsertToSupabase) window.App.tryUpsertToSupabase(session);

        return { ok: true, session };
    };

    window.App.closeWorkingSession = async function closeWorkingSession() {

        //userId確認してnullならエラー
        if (!window.App.userId) return { ok: false, message: "ユーザーIDが取得できません。再ログインしてください。" };

        const working = await window.App.getWorkingSession();
        if (!working) return { ok: false, message: "出勤が未記録です。" };

        working.endAt = Date.now();
        working.state = "DONE";

        const store = tx(window.App.db, STORE_SESSIONS, "readwrite");
        await reqToPromise(store.put(working));

        // Supabase 同期（sb.js が提供）
        if (window.App.tryUpsertToSupabase) window.App.tryUpsertToSupabase(working);

        return { ok: true, session: working };
    };
})();
