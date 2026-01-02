/* =========================
   data.js（Data画面だけ）
   ========================= */

(async function initData() {
    await window.App.init();
    await window.App.requireLogin(); // 未ログインなら login.html へ飛ばす

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

    function timeValueFromEpoch(epochMs) {
        return epochMs ? window.App.formatTime(epochMs) : "";
    }

    function epochFromWorkDateTime(workDate, timeStr) {
        if (!timeStr) return null;
        const parts = timeStr.split(":").map((v) => Number(v));
        if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
        const [y, m, d] = workDate.split("-").map((v) => Number(v));
        return new Date(y, m - 1, d, parts[0], parts[1], 0, 0).getTime();
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

            const startText = s.startAt ? window.App.formatTime(s.startAt) : "--:--";
            const endText = s.endAt ? window.App.formatTime(s.endAt) : "--:--";

            const tr = document.createElement("tr");
            tr.innerHTML = `
        <td>${s.workDate}</td>
        <td>
          <span class="timeText startAtText">${startText}</span>
          <input class="timeInput startAtInput isHidden" type="time" value="${timeValueFromEpoch(s.startAt)}" disabled>
        </td>
        <td>
          <span class="timeText endAtText">${endText}</span>
          <input class="timeInput endAtInput isHidden" type="time" value="${timeValueFromEpoch(s.endAt)}" disabled>
        </td>
        <td>${workMin == null ? "--:--" : window.App.formatHM(workMin)}</td>
        <td>${diffText}</td>
        <td><button class="editBtn" type="button">edit</button></td>
      `;
            monthTbody.appendChild(tr);

            const startTextEl = tr.querySelector(".startAtText");
            const endTextEl = tr.querySelector(".endAtText");
            const startInput = tr.querySelector(".startAtInput");
            const endInput = tr.querySelector(".endAtInput");
            const editBtn = tr.querySelector(".editBtn");
            if (startInput && endInput && startTextEl && endTextEl && editBtn) {
                let editing = false;

                const setEditing = (value) => {
                    editing = value;
                    startTextEl.classList.toggle("isHidden", value);
                    endTextEl.classList.toggle("isHidden", value);
                    startInput.classList.toggle("isHidden", !value);
                    endInput.classList.toggle("isHidden", !value);
                    startInput.disabled = !value;
                    endInput.disabled = !value;
                    editBtn.textContent = value ? "save" : "edit";
                };

                editBtn.addEventListener("click", async () => {
                    if (!editing) {
                        startInput.value = timeValueFromEpoch(s.startAt);
                        endInput.value = timeValueFromEpoch(s.endAt);
                        setEditing(true);
                        startInput.focus();
                        return;
                    }

                    const newStartAt = epochFromWorkDateTime(s.workDate, startInput.value);
                    const newEndAt = epochFromWorkDateTime(s.workDate, endInput.value);
                    if (newStartAt === s.startAt && newEndAt === s.endAt) {
                        setEditing(false);
                        return;
                    }

                    editBtn.disabled = true;
                    startInput.disabled = true;
                    endInput.disabled = true;

                    const updated = {
                        ...s,
                        startAt: newStartAt,
                        endAt: newEndAt,
                        state: newEndAt ? "DONE" : (newStartAt ? "WORKING" : s.state),
                    };

                    const res = await window.App.saveSession(updated);
                    editBtn.disabled = false;

                    if (!res?.ok) {
                        alert(res?.message || "保存に失敗しました");
                        startInput.value = timeValueFromEpoch(s.startAt);
                        endInput.value = timeValueFromEpoch(s.endAt);
                        setEditing(false);
                        return;
                    }

                    await renderMonth(currentYear, currentMonth);
                });
            }
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
