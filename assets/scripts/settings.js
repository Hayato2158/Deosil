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
        if (!App.supabase) return;

        logoutYes.disabled = true;
        if (logoutNo) logoutNo.disabled = true;

        try {
            const { error } = await App.supabase.auth.signOut({ scope: "local" });
            if (error) throw error;

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
    if (!("serviceWorker" in navigator)) {
        toggle.disabled = true;
        hint.textContent = "このブラウザはService Workerに対応していません。";
        return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.endpoint;

    if (!endpoint) {
        toggle.disabled = true;
        hint.textContent = "この端末はPush購読が未登録です（subscribe未実施）。";
        return;
    }

    // 現在値を取得
    const { data, error } = await App.supabase
        .from("push_subscriptions")
        .select("enabled")
        .eq("user_id", user.id)
        .eq("endpoint", endpoint)
        .maybeSingle();

    if (error) {
        console.warn(error);
        hint.textContent = "通知設定の読み込みに失敗しました。";
        return;
    }

    toggle.checked = (data?.enabled ?? true);

    // 変更を保存
    toggle.addEventListener("change", async () => {
        toggle.disabled = true;

        const { error: upErr } = await App.supabase
            .from("push_subscriptions")
            .update({
                enabled: toggle.checked,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);

        toggle.disabled = false;

        if (upErr) {
            console.warn(upErr);
            hint.textContent = "保存に失敗しました。";
            toggle.checked = !toggle.checked;
            return;
        }

    });
});
