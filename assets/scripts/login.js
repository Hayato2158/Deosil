(async function initLogin() {
    await window.App.init();

    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPassword");
    const btnEl = document.getElementById("btnLogin");
    const errEl = document.getElementById("loginError");

    // すでにログイン済みなら Home へ
    let already = null;
    try {
        already = await window.App.getAuthedUser();
    } catch (error) {
        console.warn("Authentication status check failed", error);
        errEl.textContent = "ログイン状態を確認できませんでした。必要であれば再度ログインしてください。";
    }
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

        try {
            await window.App.apiFetch("./api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
        } catch (error) {
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
