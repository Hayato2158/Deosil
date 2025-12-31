/* =========================
   core.js（共通：App骨格/定数/Util/init）
   ========================= */

(() => {
    // ===== 固定値（MVP） =====
    const REQUIRED_MIN = 480; // 8h
    const BREAK_MIN = 60;     // 1h

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

    // ===== window.App（公開APIの器）=====
    window.App = window.App || {};

    // 状態
    window.App.supabase = window.App.supabase ?? null;
    window.App.db = window.App.db ?? null;
    window.App.testerId = window.App.testerId ?? null;

    // util を公開
    window.App.formatDate = formatDate;
    window.App.formatTime = formatTime;
    window.App.formatHM = formatHM;
    window.App.calcWorkAndDiff = calcWorkAndDiff;
    window.App.uuid = uuid;

    // init（home.js / data.js / login.js から呼ぶ）
    window.App.init = async function init() {
        // IndexedDB 初期化（idb.js が提供）
        if (!window.App.db) {
            if (!window.App.openDb) throw new Error("openDb is not defined. Did you load idb.js before core.js?");
            window.App.db = await window.App.openDb();
        }
        if (!window.App.testerId) {
            if (!window.App.getOrCreateTesterId) throw new Error("getOrCreateTesterId is not defined. Did you load idb.js?");
            window.App.testerId = await window.App.getOrCreateTesterId();
        }

        // Supabase 初期化（1回だけ）
        if (!window.App.supabase) {
            const url = window.DEOSIL_ENV?.SUPABASE_URL;
            const anon = window.DEOSIL_ENV?.SUPABASE_ANON_KEY;
            if (url && anon && window.supabase) {
                window.App.supabase = window.supabase.createClient(url, anon);
            }
        }
    };

    // 認証ガード（sb.js の getAuthedUser に依存）
    window.App.requireLogin = async function requireLogin() {
        if (!window.App.getAuthedUser) throw new Error("getAuthedUser is not defined. Did you load sb.js?");
        const user = await window.App.getAuthedUser();

        if (!user) {
            const isLoginPage = location.pathname.endsWith("/login.html");
            if (!isLoginPage) location.href = "./login.html";
            return null;
        }
        return user;
    };
})();
