(() => {
    const LEGACY_HOST = "hayato2158.github.io";
    const LEGACY_AUTH_PREFIX = "sb-bllysyzdusuregqlraoi-auth-token";

    if (location.hostname !== LEGACY_HOST) {
        location.replace("./home.html");
        return;
    }

    // GitHub Pages版で発行された旧Supabaseセッションだけを削除する。
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(LEGACY_AUTH_PREFIX)) localStorage.removeItem(key);
        }
    } catch {
        // Storageがブラウザ設定で無効でも、移行案内は表示する。
    }

    // 旧オリジンのService WorkerとPush購読を退役させる。
    if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
            for (const registration of registrations) {
                try {
                    const subscription = await registration.pushManager?.getSubscription();
                    if (subscription) await subscription.unsubscribe();
                    await registration.unregister();
                } catch {
                    // 個別解除に失敗しても、ほかの登録と移行案内を処理する。
                }
            }
        });
    }

    document.title = "Deosilは移行しました";
    document.body.classList.add("migrationPage");
    document.getElementById("entryLoader")?.setAttribute("hidden", "");
    document.getElementById("migrationNotice")?.removeAttribute("hidden");
})();
