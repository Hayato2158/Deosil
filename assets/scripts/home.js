(async function initHome() {
    await window.App.init();
    await window.App.requireLogin(); // 未ログインなら login.html へ飛ばす
    const user = await window.App.getAuthedUser();
    const loginInfoEl = document.getElementById("loginInfo");
    if (loginInfoEl && user) loginInfoEl.textContent = `ログイン中: ${user.email ?? user.id}`;

    // DOM
    const workDateEl = document.getElementById("workDate");
    const stateBadgeEl = document.getElementById("stateBadge");
    const startAtTextEl = document.getElementById("startAtText");
    const endAtTextEl = document.getElementById("endAtText");
    const workTimeTextEl = document.getElementById("workTimeText");
    const diffTextEl = document.getElementById("diffText");
    const hintTextEl = document.getElementById("hintText");
    const btnToggle = document.getElementById("btnToggle");

    // Homeページ以外なら何もしない
    if (!workDateEl || !stateBadgeEl || !btnToggle) return;

    function setBadge(text, kind) {
        stateBadgeEl.textContent = text;
        stateBadgeEl.className = `badge ${kind}`;
    }
    function setHint(text) {
        if (!hintTextEl) return;
        hintTextEl.textContent = text ?? "";
    }

    // stateに応じてボタン見た目を更新
    function setButton(mode) {
        // mode: "START" | "END" | "DONE"
        const dot = btnToggle.querySelector(".dot");

        if (mode === "START") {
            btnToggle.disabled = false;
            btnToggle.className = "btn btnStart";
            btnToggle.innerHTML = `<span class="dot"></span>出勤`;
        } else if (mode === "END") {
            btnToggle.disabled = false;
            btnToggle.className = "btn btnEnd";
            btnToggle.innerHTML = `<span class="dot"></span>退勤`;
        } else {
            // DONE（1日1勤務ルールなので押せない）
            btnToggle.disabled = true;
            btnToggle.className = "btn btnStart"; // disabledなので見た目はどっちでも
            btnToggle.innerHTML = `<span class="dot"></span>完了`;
        }
    }

    async function getTodayState() {
        const todayDate = window.App.formatDate(new Date());
        const working = await window.App.getWorkingSession();
        if (working) return { kind: "WORKING", todayDate, session: working };

        const todaySession = await window.App.getSessionByDate(todayDate);
        if (todaySession) return { kind: "DONE", todayDate, session: todaySession };

        return { kind: "NONE", todayDate, session: null };
    }

    async function renderHome() {
        const { kind, todayDate, session } = await getTodayState();
        workDateEl.textContent = todayDate;

        if (kind === "NONE") {
            setBadge("未出勤", "warn");
            startAtTextEl.textContent = "--:--";
            endAtTextEl.textContent = "--:--";
            workTimeTextEl.textContent = "--:--";
            diffTextEl.textContent = "--";
            setButton("START");
            return;
        }

        if (kind === "WORKING") {
            setBadge("勤務中", "ok");
            setButton("END");
        } else {
            setBadge("退勤済", "danger");
            setButton("DONE");
        }

        startAtTextEl.textContent = window.App.formatTime(session.startAt);
        endAtTextEl.textContent = session.endAt ? window.App.formatTime(session.endAt) : "--:--";

        const { workMin, diffMin } = window.App.calcWorkAndDiff(session);
        workTimeTextEl.textContent = workMin == null ? "--:--" : window.App.formatHM(workMin);

        if (diffMin == null) diffTextEl.textContent = "--";
        else if (diffMin > 0) diffTextEl.textContent = `+${window.App.formatHM(diffMin)}（残業）`;
        else if (diffMin < 0) diffTextEl.textContent = `${window.App.formatHM(diffMin)}（早上がり）`;
        else diffTextEl.textContent = "±0:00（定時）";
    }

    // クリック時：状態に応じて出勤 or 退勤
    btnToggle.addEventListener("click", async () => {
        setHint("");

        const { kind } = await getTodayState();

        if (kind === "NONE") {
            const res = await window.App.createStartSession();
            if (!res.ok) setHint(res.message);
        } else if (kind === "WORKING") {
            const res = await window.App.closeWorkingSession();
            if (!res.ok) setHint(res.message);
        } else {
            // DONEは押せない想定（disabled）だけど念のため
            setHint("本日はすでに退勤済みです。");
        }

        await renderHome();
    });

    await renderHome();
})();
