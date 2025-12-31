(async function initLogin() {
    await window.App.init(); // DB + Supabase 初期化（後述の app.js 変更込み）

    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPassword");
    const btnEl = document.getElementById("btnLogin");
    const errEl = document.getElementById("loginError");

    // すでにログイン済みなら Home へ
    const already = await window.App.getAuthedUser();
    if (already) {
        location.href = "./home.html"; // home.html にしたいならここを変更
        return;
    }

    btnEl.addEventListener("click", async () => {
        errEl.textContent = "";
        btnEl.disabled = true;

        const email = (emailEl.value || "").trim();
        const password = passEl.value || "";

        if (!email || !password) {
            errEl.textContent = "Email と Password を入力してください。";
            btnEl.disabled = false;
            return;
        }

        const { error } = await window.App.supabase.auth.signInWithPassword({ email, password });

        if (error) {
            errEl.textContent = error.message || "ログインに失敗しました。";
            btnEl.disabled = false;
            return;
        }

        // ログイン成功 → Home へ
        location.href = "./home.html"; // home.html にしたいならここを home.html に
    });

    // Enter でログイン
    [emailEl, passEl].forEach(el => {
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") btnEl.click();
        });
    });
})();
