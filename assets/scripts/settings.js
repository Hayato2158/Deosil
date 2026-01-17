document.addEventListener("DOMContentLoaded", async () => {
    await App.init();

    const user = await App.requireLogin();
    if (!user) return;

    const toggle = document.getElementById("pushEnabledToggle");
    const hint = document.getElementById("pushHint");

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
