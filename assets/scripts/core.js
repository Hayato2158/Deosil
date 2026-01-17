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

    function normalizeBasePath(path) {
        if (!path) return "";
        let normalized = String(path);
        if (!normalized.startsWith("/")) normalized = `/${normalized}`;
        if (normalized.length > 1 && normalized.endsWith("/")) {
            normalized = normalized.slice(0, -1);
        }
        return normalized;
    }

    function getBasePath() {
        return normalizeBasePath(window.DEOSIL_ENV?.BASE_PATH);
    }

    function applyBasePath() {
        const basePath = getBasePath(); // "" or "/Deosil" or "/Deosil/notify-dev"

        // basePath が空でも「今のページ階層」から決めたいならここで推定も可
        // 今回は getBasePath() を信頼して「絶対パス」で指定する
        const manifestPath = (basePath || "") + "/manifest.webmanifest";

        const link = document.querySelector('link[rel="manifest"]');
        if (link) link.href = manifestPath; // setAttribute より href 代入が安全

        return basePath;
    }


    async function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        const swUrl = new URL('"service-worker.js', location.href);

        try {
            await navigator.serviceWorker.register(swUrl.pathname);
        } catch (err) {
            console.warn("Service worker registration failed", err, swUrl.pathname);
        }
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
    window.App.userId = window.App.userId ?? null;
    window.App.basePath = window.App.basePath ?? "";

    // util を公開
    window.App.formatDate = formatDate;
    window.App.formatTime = formatTime;
    window.App.formatHM = formatHM;
    window.App.calcWorkAndDiff = calcWorkAndDiff;
    window.App.uuid = uuid;

    // init（home.js / data.js / login.js から呼ぶ）
    window.App.init = async function init() {
        window.App.basePath = applyBasePath();
        // IndexedDB 初期化（idb.js が提供）
        if (!window.App.db) {
            if (!window.App.openDb) throw new Error("openDb is not defined. Did you load idb.js before core.js?");
            window.App.db = await window.App.openDb();
        }

        // Supabase 初期化（1回だけ）
        if (!window.App.supabase) {
            const url = window.DEOSIL_ENV?.SUPABASE_URL;
            const anon = window.DEOSIL_ENV?.SUPABASE_ANON_KEY;
            if (url && anon && window.supabase) {
                window.App.supabase = window.supabase.createClient(url, anon);
            }
        }

        if (window.App.supabase) {
            const { data: { session }, error } = await window.App.supabase.auth.getSession();
            if (error) console.warn(error);
            window.App.userId = session?.user?.id ?? null;
        }

        await registerServiceWorker();
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
        window.App.userId = user.id;
        return user;
    };
})();

//通知確認用
async function subscribePushAndSave() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("notification not granted");

    const reg = await navigator.serviceWorker.ready;

    const vapidPublicKey = window.DEOSIL_ENV?.VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) throw new Error("VAPID_PUBLIC_KEY is missing in config.js");

    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const json = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) throw new Error("invalid subscription keys");

    const client = window.App?.supabase;
    if (!client) throw new Error("supabase client not initialized. run App.init() first.");

    const { data: { user }, error: userErr } = await client.auth.getUser();
    if (userErr) throw userErr;
    if (!user) throw new Error("not logged in");

    const { error } = await client
        .from("push_subscriptions")
        .upsert({
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
        }, { onConflict: "user_id,endpoint" });

    if (error) throw error;
    console.log("saved push subscription");

    console.log({ endpoint, p256dh, auth });

}
