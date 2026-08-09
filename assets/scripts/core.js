/* =========================
   core.js（共通：App骨格/定数/Util/init）
   ========================= */

(() => {
    // ===== 固定値（MVP） =====
    const REQUIRED_MIN = 480; // 8h

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

    function breakMinForGross(grossMin) {
        if (grossMin <= 360) return 0;
        return 60;
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

        const swUrl = new URL('service-worker.js', location.href);

        try {
            await navigator.serviceWorker.register(swUrl.pathname);
        } catch (err) {
            console.warn("Service worker registration failed", err, swUrl.pathname);
        }
    }

    function calcWorkAndDiff(session) {
        if (!session?.startAt || !session?.endAt) return { workMin: null, diffMin: null };
        const grossMin = Math.floor((session.endAt - session.startAt) / 60000);
        const workMin = Math.max(0, grossMin - breakMinForGross(grossMin));
        const diffMin = workMin - REQUIRED_MIN;
        return { workMin, diffMin };
    }

    // ===== window.App（公開APIの器）=====
    window.App = window.App || {};

    // 状態
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

        // 旧GitHub Pages版が保存したSupabaseセッションを移行時に確実に破棄する。
        try {
            const legacyPrefix = "sb-bllysyzdusuregqlraoi-auth-token";
            for (let index = localStorage.length - 1; index >= 0; index -= 1) {
                const key = localStorage.key(index);
                if (key?.startsWith(legacyPrefix)) localStorage.removeItem(key);
            }
        } catch (error) {
            console.warn("Legacy auth storage cleanup failed", error);
        }

        // IndexedDB 初期化（idb.js が提供）
        if (!window.App.db) {
            if (!window.App.openDb) throw new Error("openDb is not defined. Did you load idb.js before core.js?");
            window.App.db = await window.App.openDb();
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
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const raw = atob(base64);
        const output = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) {
            output[i] = raw.charCodeAt(i);
        }
        return output;
    }
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

    if (!window.App?.apiFetch) throw new Error("BFF API client is not initialized.");
    await window.App.apiFetch("./api/push-subscriptions", {
        method: "POST",
        body: JSON.stringify({ endpoint, p256dh, auth }),
    });
    console.log("saved push subscription");
}
