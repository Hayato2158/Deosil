document.addEventListener("DOMContentLoaded", async () => {
    await App.init();

    const user = await App.requireLogin();
    if (!user) return;

    const toggle = document.getElementById("pushEnabledToggle");
    const hint = document.getElementById("pushHint");
    const accountInfo = document.getElementById("accountInfo");
    const btnLogout = document.getElementById("btnLogout");
    const logoutHint = document.getElementById("logoutHint");
    const logoutDialog = document.getElementById("logoutDialog");
    const logoutYes = document.getElementById("logoutYes");
    const logoutNo = document.getElementById("logoutNo");

    if (accountInfo) {
        accountInfo.textContent = user.email || "ログイン中";
    }

    btnLogout?.addEventListener("click", () => {
        if (logoutHint) logoutHint.textContent = "";
        logoutDialog?.classList.remove("hidden");
        logoutYes?.focus();
    });

    logoutNo?.addEventListener("click", () => {
        logoutDialog?.classList.add("hidden");
        btnLogout?.focus();
    });

    logoutYes?.addEventListener("click", async () => {
        logoutYes.disabled = true;
        if (logoutNo) logoutNo.disabled = true;

        try {
            await App.apiFetch("./api/auth/logout", {
                method: "POST",
                body: JSON.stringify({}),
            });

            App.userId = null;
            location.replace("./login.html");
        } catch (error) {
            console.warn(error);
            logoutDialog?.classList.add("hidden");
            if (logoutHint) logoutHint.textContent = "ログアウトに失敗しました。もう一度お試しください。";
            logoutYes.disabled = false;
            if (logoutNo) logoutNo.disabled = false;
        }
    });

    // この端末のendpointを取る
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        toggle.disabled = true;
        hint.textContent = "このブラウザはPush通知に対応していません。";
        return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint;

    if (!endpoint) {
        toggle.checked = false;
        toggle.disabled = false;
        hint.textContent = Notification.permission === "denied"
            ? "ブラウザの設定で、このサイトの通知を許可してください。"
            : "ONにすると、この端末で通知を受け取れます。";

        toggle.addEventListener("change", async () => {
            if (!toggle.checked) return;

            toggle.disabled = true;
            hint.textContent = "通知を有効化しています…";

            try {
                await subscribePushAndSave();
                hint.textContent = "この端末の通知を有効にしました。";
                location.reload();
            } catch (error) {
                console.warn(error);
                toggle.checked = false;
                hint.textContent = Notification.permission === "denied"
                    ? "通知が拒否されています。ブラウザのサイト設定から許可してください。"
                    : "通知の有効化に失敗しました。もう一度お試しください。";
                toggle.disabled = false;
            }
        });
        return;
    }

    // 現在値を取得
    let pushSettings;
    try {
        pushSettings = await App.apiFetch(`./api/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`);
        if (!pushSettings?.registered) {
            await subscribePushAndSave();
            pushSettings = { enabled: true, registered: true };
        }
    } catch (error) {
        console.warn(error);
        hint.textContent = "通知設定の読み込みに失敗しました。";
        return;
    }

    toggle.checked = (pushSettings?.enabled ?? true);

    // 変更を保存
    toggle.addEventListener("change", async () => {
        toggle.disabled = true;

        try {
            await App.apiFetch("./api/push-subscriptions", {
                method: "PATCH",
                body: JSON.stringify({ endpoint, enabled: toggle.checked }),
            });
            hint.textContent = toggle.checked
                ? "この端末の通知を有効にしました。"
                : "この端末の通知を無効にしました。";
        } catch (error) {
            console.warn(error);
            hint.textContent = "保存に失敗しました。";
            toggle.checked = !toggle.checked;
        }
        toggle.disabled = false;
    });
});
