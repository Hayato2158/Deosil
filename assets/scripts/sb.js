/* =========================
   sb.js（BFF API：Auth/Sync）
   ========================= */

(() => {
    window.App = window.App || {};

    async function apiFetch(path, options = {}) {
        const headers = new Headers(options.headers || {});
        headers.set("Accept", "application/json");
        if (options.body && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(path, {
            ...options,
            headers,
            credentials: "same-origin",
        });
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await response.json() : null;
        if (!response.ok) {
            const error = new Error(data?.error || "サーバー処理に失敗しました。");
            error.status = response.status;
            throw error;
        }
        return data;
    }

    window.App.apiFetch = apiFetch;

    window.App.getAuthedUser = async function getAuthedUser() {
        try {
            const data = await apiFetch("./api/auth/me");
            return data?.user ?? null;
        } catch (error) {
            if (error?.status !== 401) console.warn("[auth] me failed:", error);
            window.App.userId = null;
            return null;
        }
    };

    function apiRowToSession(row) {
        return {
            id: row.id,
            userId: row.user_id ?? window.App.userId,
            workDate: row.work_date,
            startAt: row.start_at ? Date.parse(row.start_at) : null,
            endAt: row.end_at ? Date.parse(row.end_at) : null,
            state: row.state,
            deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
        };
    }

    window.App.upsertSessionRemote = async function upsertSessionRemote(session) {
        try {
            const data = await apiFetch("./api/sessions", {
                method: "POST",
                body: JSON.stringify({
                    workDate: session.workDate,
                    startAt: session.startAt ?? null,
                    endAt: session.endAt ?? null,
                    state: session.state,
                }),
            });
            return { ok: true, session: apiRowToSession(data.session) };
        } catch (error) {
            console.warn("[sync] save failed:", error);
            return { ok: false, message: error.message || "保存に失敗しました。" };
        }
    };

    window.App.getSessionByDateRemote = async function getSessionByDateRemote(workDate) {
        try {
            const data = await apiFetch(`./api/sessions?workDate=${encodeURIComponent(workDate)}`);
            return data?.session ? apiRowToSession(data.session) : null;
        } catch (error) {
            console.warn("[sync] get by date failed:", error);
            return null;
        }
    };

    window.App.getWorkingSessionRemote = async function getWorkingSessionRemote() {
        try {
            const data = await apiFetch("./api/sessions?state=WORKING");
            return data?.session ? apiRowToSession(data.session) : null;
        } catch (error) {
            console.warn("[sync] get working failed:", error);
            return null;
        }
    };

    window.App.listSessionInMonthRemote = async function listSessionInMonthRemote(year, month1to12) {
        try {
            const month = `${year}-${String(month1to12).padStart(2, "0")}`;
            const data = await apiFetch(`./api/sessions?month=${encodeURIComponent(month)}`);
            return (data?.sessions || []).map(apiRowToSession);
        } catch (error) {
            console.warn("[sync] list month failed:", error);
            return null;
        }
    };

    window.App.softDeleteSessionRemote = async function softDeleteSessionRemote(sessionId) {
        if (!sessionId) return { ok: false, message: "削除対象を確認できませんでした。" };
        try {
            await apiFetch(`./api/sessions/${encodeURIComponent(sessionId)}/soft-delete`, {
                method: "PATCH",
                body: JSON.stringify({}),
            });
            return { ok: true };
        } catch (error) {
            console.warn("[sync] soft delete failed:", error);
            return { ok: false, message: error.message || "削除に失敗しました。" };
        }
    };
})();
