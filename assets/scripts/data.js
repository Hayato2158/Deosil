/* =========================
   data.js（Data画面だけ）
   ========================= */

(async function initData() {
    await window.App.init();

    const titleEl = document.getElementById("dataTitle");
    const monthTbody = document.getElementById("monthTbody");
    const sumOverText = document.getElementById("sumOverText");
    const sumUnderText = document.getElementById("sumUnderText");

    const btnPrev = document.getElementById("btnPrevMonth");
    const btnNext = document.getElementById("btnNextMonth");

    // Dataページ以外なら何もしない
    if (!monthTbody || !sumOverText || !sumUnderText) return;

    let currentYear;
    let currentMonth;

    function setCurrentToNow() {
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth() + 1;
    }

    function shiftMonth(delta) {
        const d = new Date(currentYear, currentMonth - 1 + delta, 1);
        currentYear = d.getFullYear();
        currentMonth = d.getMonth() + 1;
    }

    function renderTitle(year, month) {
        if (!titleEl) return;
        titleEl.textContent = `${year}年${String(month).padStart(2, "0")}月`;
    }

    async function renderMonth(year, month) {
        renderTitle(year, month);

        const sessions = await window.App.listSessionsInMonth(year, month);
        sessions.sort((a, b) => a.workDate.localeCompare(b.workDate));

        monthTbody.innerHTML = "";

        let overMin = 0;
        let underMin = 0;

        for (const s of sessions) {
            const { workMin, diffMin } = window.App.calcWorkAndDiff(s);

            let diffText = "--";
            if (diffMin != null) {
                if (diffMin > 0) { diffText = `+${window.App.formatHM(diffMin)}`; overMin += diffMin; }
                else if (diffMin < 0) { diffText = window.App.formatHM(diffMin); underMin += (-diffMin); }
                else diffText = "±0:00";
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
        <td>${s.workDate}</td>
        <td>${window.App.formatTime(s.startAt)}</td>
        <td>${s.endAt ? window.App.formatTime(s.endAt) : "--:--"}</td>
        <td>${workMin == null ? "--:--" : window.App.formatHM(workMin)}</td>
        <td>${diffText}</td>
      `;
            monthTbody.appendChild(tr);
        }

        sumOverText.textContent = window.App.formatHM(overMin);
        sumUnderText.textContent = window.App.formatHM(underMin);
    }

    setCurrentToNow();
    await renderMonth(currentYear, currentMonth);

    if (btnPrev) {
        btnPrev.addEventListener("click", async () => {
            shiftMonth(-1);
            await renderMonth(currentYear, currentMonth);
        });
    }
    if (btnNext) {
        btnNext.addEventListener("click", async () => {
            shiftMonth(+1);
            await renderMonth(currentYear, currentMonth);
        });
    }
})();
