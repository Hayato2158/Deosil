/* =========================
   data.js（Data画面だけ）
   ========================= */

(async function initData() {
    await window.App.init();

    const titleEl = document.getElementById("dataTilte");
    const monthTbody = document.getElementById("monthTbody");
    const sumOverText = document.getElementById("sumOverText");
    const sumUnderText = document.getElementById("sumUnderText");

    // Dataページ以外なら何もしない
    if (!monthTbody || !sumOverText || !sumUnderText) return;

    function renderTitle() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        if (titleEl) {
            titleEl.textContent = `${year}年${String(month).padStart(2, "0")}月`;
        }
    }

    async function renderMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

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

    renderTitle();
    await renderMonth();
})();
