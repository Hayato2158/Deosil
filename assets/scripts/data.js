/* =========================
   data.js（Data画面だけ）
   ========================= */

(async function initData() {
    await window.App.init();
    const user = await window.App.requireLogin(); // 未ログインなら login.html へ飛ばす
    if (!user) return;

    const titleEl = document.getElementById("dataTitle");
    const monthTbody = document.getElementById("monthTbody");
    const sumOverText = document.getElementById("sumOverText");
    const sumUnderText = document.getElementById("sumUnderText");
    const sumNetOverText = document.getElementById("sumNetOverText");

    const btnPrev = document.getElementById("btnPrevMonth");
    const btnNext = document.getElementById("btnNextMonth");

    const btnAddSession = document.getElementById("btnAddSession");
    const entryDialog = document.getElementById("entryDialog");
    const entryForm = document.getElementById("entryForm");
    const entryWorkDate = document.getElementById("entryWorkDate");
    const entryStartTime = document.getElementById("entryStartTime");
    const entryEndTime = document.getElementById("entryEndTime");
    const entryError = document.getElementById("entryError");
    const entrySave = document.getElementById("entrySave");
    const entryCancel = document.getElementById("entryCancel");
    const duplicateDialog = document.getElementById("duplicateDialog");
    const duplicateYes = document.getElementById("duplicateYes");
    const duplicateNo = document.getElementById("duplicateNo");
    const duplicateOldDate = document.getElementById("duplicateOldDate");
    const duplicateNewDate = document.getElementById("duplicateNewDate");
    const duplicateOldStart = document.getElementById("duplicateOldStart");
    const duplicateNewStart = document.getElementById("duplicateNewStart");
    const duplicateOldEnd = document.getElementById("duplicateOldEnd");
    const duplicateNewEnd = document.getElementById("duplicateNewEnd");
    const sessionActionDialog = document.getElementById("sessionActionDialog");
    const sessionActionDate = document.getElementById("sessionActionDate");
    const sessionActionType = document.getElementById("sessionActionType");
    const sessionActionStart = document.getElementById("sessionActionStart");
    const sessionActionEnd = document.getElementById("sessionActionEnd");
    const sessionActionEdit = document.getElementById("sessionActionEdit");
    const sessionActionDelete = document.getElementById("sessionActionDelete");
    const sessionActionCancel = document.getElementById("sessionActionCancel");
    const deleteSessionDialog = document.getElementById("deleteSessionDialog");
    const deleteSessionDate = document.getElementById("deleteSessionDate");
    const deleteSessionType = document.getElementById("deleteSessionType");
    const deleteSessionStart = document.getElementById("deleteSessionStart");
    const deleteSessionEnd = document.getElementById("deleteSessionEnd");
    const deleteSessionWarning = document.getElementById("deleteSessionWarning");
    const deleteSessionError = document.getElementById("deleteSessionError");
    const deleteSessionYes = document.getElementById("deleteSessionYes");
    const deleteSessionNo = document.getElementById("deleteSessionNo");

    // Dataページ以外なら何もしない
    if (!monthTbody || !sumOverText || !sumUnderText || !sumNetOverText) return;

    let currentYear;
    let currentMonth;
    let pendingDuplicate = null;
    let isSaving = false;
    let selectedSessionAction = null;
    let isDeleting = false;

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

    function formatMonthDay(workDate) {
        if (!workDate || workDate.length !== 10) return workDate;

        const mm = workDate.slice(5, 7);
        const dd = workDate.slice(8, 10);
        return `${mm}/${dd}`;
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

    function showEntryError(message = "") {
        if (entryError) entryError.textContent = message;
    }

    function openEntryDialog() {
        if (!entryDialog || !entryWorkDate || !entryStartTime || !entryEndTime) return;
        entryWorkDate.value = window.App.formatDate(new Date());
        entryStartTime.value = "";
        entryEndTime.value = "";
        showEntryError();
        entryDialog.classList.remove("hidden");
        entryWorkDate.focus();
    }

    function closeEntryDialog() {
        entryDialog?.classList.add("hidden");
        showEntryError();
    }

    function showDuplicateDialog(existing, values) {
        pendingDuplicate = { existing, values };

        if (duplicateOldDate) duplicateOldDate.textContent = existing.workDate || "---";
        if (duplicateNewDate) duplicateNewDate.textContent = values.workDate || "---";
        if (duplicateOldStart) duplicateOldStart.textContent = existing.startAt ? window.App.formatTime(existing.startAt) : "--:--";
        if (duplicateNewStart) duplicateNewStart.textContent = values.startAt ? window.App.formatTime(values.startAt) : "--:--";
        if (duplicateOldEnd) duplicateOldEnd.textContent = existing.endAt ? window.App.formatTime(existing.endAt) : "--:--";
        if (duplicateNewEnd) duplicateNewEnd.textContent = values.endAt ? window.App.formatTime(values.endAt) : "--:--";

        entryDialog?.classList.add("hidden");
        duplicateDialog?.classList.remove("hidden");
        duplicateYes?.focus();
    }

    function returnToEntryDialog() {
        pendingDuplicate = null;
        duplicateDialog?.classList.add("hidden");
        entryDialog?.classList.remove("hidden");
        entryWorkDate?.focus();
    }

    function isLeaveSession(session) {
        return session?.state === "DONE" && !session.startAt && !session.endAt;
    }

    function sessionTypeLabel(session) {
        if (isLeaveSession(session)) return "休暇";
        if (session?.state === "WORKING") return "勤務中";
        return "勤怠";
    }

    function setSessionSummary(session, elements) {
        if (elements.date) elements.date.textContent = session?.workDate || "---";
        if (elements.type) elements.type.textContent = sessionTypeLabel(session);
        if (elements.start) elements.start.textContent = session?.startAt ? window.App.formatTime(session.startAt) : "--:--";
        if (elements.end) elements.end.textContent = session?.endAt ? window.App.formatTime(session.endAt) : "--:--";
    }

    function openSessionActionDialog(session, beginEditing) {
        selectedSessionAction = { session, beginEditing };
        setSessionSummary(session, {
            date: sessionActionDate,
            type: sessionActionType,
            start: sessionActionStart,
            end: sessionActionEnd,
        });
        sessionActionDialog?.classList.remove("hidden");
        sessionActionEdit?.focus();
    }

    function closeSessionActionDialog() {
        sessionActionDialog?.classList.add("hidden");
        selectedSessionAction = null;
    }

    function openDeleteSessionDialog() {
        const session = selectedSessionAction?.session;
        if (!session) return;

        setSessionSummary(session, {
            date: deleteSessionDate,
            type: deleteSessionType,
            start: deleteSessionStart,
            end: deleteSessionEnd,
        });
        if (deleteSessionWarning) {
            deleteSessionWarning.textContent = session.state === "WORKING"
                ? "現在勤務中のデータです。削除すると勤務状態が解除されます。"
                : "削除後は一覧から非表示になります。";
        }
        if (deleteSessionError) deleteSessionError.textContent = "";
        sessionActionDialog?.classList.add("hidden");
        deleteSessionDialog?.classList.remove("hidden");
        deleteSessionNo?.focus();
    }

    function returnToSessionActionDialog() {
        deleteSessionDialog?.classList.add("hidden");
        sessionActionDialog?.classList.remove("hidden");
        sessionActionDelete?.focus();
    }

    function readEntryValues() {
        const workDate = entryWorkDate?.value || "";
        const startTime = entryStartTime?.value || "";
        const endTime = entryEndTime?.value || "";
        const startAt = epochFromWorkDateTime(workDate, startTime);
        const endAt = epochFromWorkDateTime(workDate, endTime);
        return { workDate, startAt, endAt };
    }

    function setSaving(value) {
        isSaving = value;
        if (entrySave) entrySave.disabled = value;
        if (duplicateYes) duplicateYes.disabled = value;
        if (duplicateNo) duplicateNo.disabled = value;
    }

    async function saveEntry(values, existing = null) {
        if (isSaving) return;
        setSaving(true);

        const session = {
            ...(existing || {}),
            userId: window.App.userId,
            workDate: values.workDate,
            startAt: values.startAt,
            endAt: values.endAt,
            state: "DONE",
        };

        try {
            const result = await window.App.saveSession(session);
            if (!result?.ok) throw new Error(result?.message || "保存に失敗しました");

            const [year, month] = values.workDate.split("-").map(Number);
            currentYear = year;
            currentMonth = month;
            pendingDuplicate = null;
            duplicateDialog?.classList.add("hidden");
            closeEntryDialog();
            await renderMonth(currentYear, currentMonth);
        } catch (error) {
            console.error("Failed to save session", error);
            duplicateDialog?.classList.add("hidden");
            entryDialog?.classList.remove("hidden");
            showEntryError(error?.message || "保存に失敗しました");
        } finally {
            setSaving(false);
        }
    }

    async function renderMonth(year, month) {
        renderTitle(year, month);

        const sessions = await window.App.listSessionsInMonth(year, month);
        sessions.sort((a, b) => a.workDate.localeCompare(b.workDate));

        monthTbody.innerHTML = "";

        let overMin = 0;
        let underMin = 0;

        for (const s of sessions) {

            const workDateLabel = formatMonthDay(s.workDate);

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
  <td>${workDateLabel}</td>

  <td>
    <div class="timeCell">
      <span class="timeText startAtText">${startText}</span>
      <input class="timeInput startAtInput" type="time"
        value="${timeValueFromEpoch(s.startAt)}" disabled>
    </div>
  </td>

  <td>
    <div class="timeCell">
      <span class="timeText endAtText">${endText}</span>
      <input class="timeInput endAtInput" type="time"
        value="${timeValueFromEpoch(s.endAt)}" disabled>
    </div>
  </td>

  <td>${workMin == null ? "--:--" : window.App.formatHM(workMin)}</td>
  <td>${diffText}</td>

  <td class="actionCell">
    <div class="actionBox">
      <button class="actionBtn editBtn menuBtn" type="button" aria-label="操作メニュー">︙</button>
    </div>
  </td>
`;
            monthTbody.appendChild(tr);

            const startTextEl = tr.querySelector(".startAtText");
            const endTextEl = tr.querySelector(".endAtText");
            const startInput = tr.querySelector(".startAtInput");
            const endInput = tr.querySelector(".endAtInput");
            const editBtn = tr.querySelector(".editBtn");
            if (startInput && endInput && startTextEl && endTextEl && editBtn) {
                let editing = false;
                editBtn.setAttribute("aria-label", `${s.workDate}の操作メニュー`);

                const displayTimeValue = (value) => value || "--:--";

                const syncTimeText = () => {
                    startTextEl.textContent = displayTimeValue(startInput.value);
                    endTextEl.textContent = displayTimeValue(endInput.value);
                };

                const resetTimeText = () => {
                    startTextEl.textContent = startText;
                    endTextEl.textContent = endText;
                };

                const setEditing = (value) => {
                    editing = value;

                    const startCell = startInput.closest(".timeCell");
                    const endCell = endInput.closest(".timeCell");

                    //spanは常に表示する
                    //inputは表示状態の際は透明で編集時にpointer-eventsでinputを押下可能にする
                    startCell?.classList.toggle("isEditing", value);
                    endCell?.classList.toggle("isEditing", value);

                    startInput.disabled = !value;
                    endInput.disabled = !value;

                    editBtn.classList.toggle("menuBtn", !value);
                    editBtn.textContent = value ? "save" : "︙";
                    editBtn.setAttribute("aria-label", value ? `${s.workDate}の編集内容を保存` : `${s.workDate}の操作メニュー`);
                };

                const beginEditing = () => {
                    startInput.value = timeValueFromEpoch(s.startAt);
                    endInput.value = timeValueFromEpoch(s.endAt);
                    syncTimeText();
                    setEditing(true);
                    startInput.focus();
                };

                startInput.addEventListener("input", syncTimeText);
                startInput.addEventListener("change", syncTimeText);
                endInput.addEventListener("input", syncTimeText);
                endInput.addEventListener("change", syncTimeText);

                editBtn.addEventListener("click", async () => {
                    if (!editing) {
                        openSessionActionDialog(s, beginEditing);
                        return;
                    }

                    const newStartAt = epochFromWorkDateTime(s.workDate, startInput.value);
                    const newEndAt = epochFromWorkDateTime(s.workDate, endInput.value);
                    if (newStartAt === s.startAt && newEndAt === s.endAt) {
                        resetTimeText();
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
                        resetTimeText();
                        setEditing(false);
                        return;
                    }

                    await renderMonth(currentYear, currentMonth);
                });
            }
        }

        sumOverText.textContent = window.App.formatHM(overMin);
        sumUnderText.textContent = window.App.formatHM(underMin);
        sumNetOverText.textContent = window.App.formatHM(overMin - underMin);
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

    btnAddSession?.addEventListener("click", openEntryDialog);
    entryCancel?.addEventListener("click", closeEntryDialog);

    entryForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isSaving || !entryForm.reportValidity()) return;

        showEntryError();
        const values = readEntryValues();
        if (!values.workDate || values.startAt == null || values.endAt == null) {
            showEntryError("日付、出勤時間、退勤時間を入力してください");
            return;
        }
        if (values.endAt < values.startAt) {
            showEntryError("退勤時間は出勤時間より後にしてください");
            return;
        }

        try {
            const existing = await window.App.getSessionByDate(values.workDate);
            if (existing) {
                showDuplicateDialog(existing, values);
                return;
            }
            await saveEntry(values);
        } catch (error) {
            console.error("Failed to check existing session", error);
            showEntryError("データの確認に失敗しました。もう一度お試しください");
        }
    });

    duplicateYes?.addEventListener("click", async () => {
        if (!pendingDuplicate) return;
        const { existing, values } = pendingDuplicate;
        await saveEntry(values, existing);
    });

    duplicateNo?.addEventListener("click", returnToEntryDialog);

    sessionActionEdit?.addEventListener("click", () => {
        const beginEditing = selectedSessionAction?.beginEditing;
        sessionActionDialog?.classList.add("hidden");
        selectedSessionAction = null;
        beginEditing?.();
    });

    sessionActionDelete?.addEventListener("click", openDeleteSessionDialog);
    sessionActionCancel?.addEventListener("click", closeSessionActionDialog);
    deleteSessionNo?.addEventListener("click", returnToSessionActionDialog);

    deleteSessionYes?.addEventListener("click", async () => {
        const session = selectedSessionAction?.session;
        if (!session || isDeleting) return;

        isDeleting = true;
        deleteSessionYes.disabled = true;
        if (deleteSessionNo) deleteSessionNo.disabled = true;
        if (deleteSessionError) deleteSessionError.textContent = "";

        const result = await window.App.softDeleteSessionRemote?.(session.id);
        if (!result?.ok) {
            if (deleteSessionError) {
                deleteSessionError.textContent = result?.message || "削除に失敗しました。";
            }
            deleteSessionYes.disabled = false;
            if (deleteSessionNo) deleteSessionNo.disabled = false;
            isDeleting = false;
            return;
        }

        deleteSessionDialog?.classList.add("hidden");
        sessionActionDialog?.classList.add("hidden");
        selectedSessionAction = null;
        deleteSessionYes.disabled = false;
        if (deleteSessionNo) deleteSessionNo.disabled = false;
        isDeleting = false;
        await renderMonth(currentYear, currentMonth);
    });
})();
