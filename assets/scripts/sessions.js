/* =========================
   sessions.js（勤怠データの取得・保存・操作）
   ========================= */

(() => {
    window.App = window.App || {};

    window.App.getWorkingSession = async function getWorkingSession() {
        if (!window.App.getWorkingSessionRemote) {
            console.warn("getWorkingSessionRemote is not defined. Did you load sb.js?");
            return null;
        }
        return await window.App.getWorkingSessionRemote();
    };

    window.App.getSessionByDate = async function getSessionByDate(workDate) {
        if (!window.App.getSessionByDateRemote) {
            console.warn("getSessionByDateRemote is not defined. Did you load sb.js?");
            return null;
        }
        return await window.App.getSessionByDateRemote(workDate);
    };

    window.App.listSessionsInMonth = async function listSessionsInMonth(year, month1to12) {
        if (!window.App.listSessionInMonthRemote) {
            console.warn("listSessionInMonthRemote is not defined. Did you load sb.js?");
            return null;
        }
        return await window.App.listSessionInMonthRemote(year, month1to12);
    };

    window.App.saveSession = async function saveSession(session) {
        if (!session?.workDate) return { ok: false, message: "勤務日が不正です。" };
        if (!window.App.upsertSessionRemote) {
            return { ok: false, message: "保存処理を初期化できませんでした。" };
        }
        return await window.App.upsertSessionRemote(session);
    };

    window.App.createStartSession = async function createStartSession() {
        if (!window.App.userId) {
            return { ok: false, message: "ユーザーIDが取得できません。再ログインしてください。" };
        }

        const workDate = window.App.formatDate(new Date());
        const working = await window.App.getWorkingSession();
        if (working) return { ok: false, message: "退勤が未記録です。先に退勤してください。" };

        const already = await window.App.getSessionByDate(workDate);
        if (already) return { ok: false, message: "本日は既に記録があります（1日1勤務）。" };

        return await window.App.saveSession({
            userId: window.App.userId,
            workDate,
            startAt: Date.now(),
            endAt: null,
            state: "WORKING",
        });
    };

    window.App.createLeaveSession = async function createLeaveSession() {
        if (!window.App.userId) {
            return { ok: false, message: "ユーザーIDが取得できません。再ログインしてください。" };
        }

        const workDate = window.App.formatDate(new Date());
        const working = await window.App.getWorkingSession();
        if (working) return { ok: false, message: "勤務中のため休暇を登録できません。先に退勤してください。" };

        const already = await window.App.getSessionByDate(workDate);
        if (already) return { ok: false, message: "本日は既に記録があります（1日1勤務）。" };

        return await window.App.saveSession({
            userId: window.App.userId,
            workDate,
            startAt: null,
            endAt: null,
            state: "DONE",
        });
    };

    window.App.closeWorkingSession = async function closeWorkingSession() {
        if (!window.App.userId) {
            return { ok: false, message: "ユーザーIDが取得できません。再ログインしてください。" };
        }

        const working = await window.App.getWorkingSession();
        if (!working) return { ok: false, message: "出勤が未記録です。" };

        working.endAt = Date.now();
        working.state = "DONE";
        return await window.App.saveSession(working);
    };
})();
