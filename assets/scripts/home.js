(async function initHome() {
    await window.App.init();
    const user = await window.App.requireLogin(); // 未ログインなら login.html へ飛ばす
    if (!user) return;
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

    let currentKind = "NONE";
    let currentSession = null;
    let currentDate = window.App.formatDate(new Date());
    let isBusy = false;

    async function getTodayState() {
        const todayDate = window.App.formatDate(new Date());
        const todaySession = await window.App.getSessionByDate(todayDate);
        if (todaySession) {
            const kind = todaySession.state === "WORKING" ? "WORKING" : "DONE";
            return { kind, todayDate, session: todaySession };
        }

        return { kind: "NONE", todayDate, session: null };
    }

    function renderFromState(kind, todayDate, session) {
        workDateEl.textContent = todayDate;

        if (kind === "NONE") {
            setBadge("未出勤", "warn");
            startAtTextEl.textContent = "--:--";
            endAtTextEl.textContent = "--:--";
            workTimeTextEl.textContent = "--:--";
            diffTextEl.textContent = "--";
            setButton("START");
            return;
        } else if (kind === "WORKING") {
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

    async function renderHome() {
        const { kind, todayDate, session } = await getTodayState();
        currentKind = kind;
        currentSession = session;
        currentDate = todayDate;
        renderFromState(kind, todayDate, session);
    }

    // クリック時：状態に応じて出勤 or 退勤
    btnToggle.addEventListener("click", async () => {
        //ロジック上の二重実行防止
        if (isBusy) return;
        isBusy = true;

        setHint("");
        //ユーザの連打防止
        btnToggle.disabled = true;

        if (currentKind === "NONE") {
            const res = await window.App.createStartSession();
            if (!res.ok) {
                setHint(res.message);
            } else {
                currentKind = "WORKING";
                currentSession = res.session;
            }
        } else if (currentKind === "WORKING") {
            const res = await window.App.closeWorkingSession();
            if (!res.ok) {
                setHint(res.message);
            } else {
                currentKind = "DONE";
                currentSession = res.session;
            }
        } else {
            // DONEは押せない想定（disabled）だけど念のため
            setHint("本日はすでに退勤済みです。");
        }

        renderFromState(currentKind, currentDate, currentSession);
        isBusy = false;
    });

    await renderHome();
})();
