/* =========================
   sb.js（Supabase：Auth/Sync）
   ========================= */

(() => {
    window.App = window.App || {};

    // 認証ユーザー取得
    window.App.getAuthedUser = async function getAuthedUser() {
        if (!window.App.supabase) return null;
        const { data: { user } } = await window.App.supabase.auth.getUser();
        return user ?? null;
    };

    // Supabaseを正として保存し、DBが確定したIDを含むセッションを返す
    window.App.upsertSessionRemote = async function upsertSessionRemote(session) {
        const supabase = window.App.supabase;
        if (!supabase) {
            return { ok: false, message: "Supabaseに接続できません。" };
        }

        try {
            const { data: sdata, error: serr } = await supabase.auth.getSession();
            if (serr) {
                console.warn("[sync] getSession error:", serr);
                return { ok: false, message: "認証情報の確認に失敗しました。再ログインしてください。" };
            }
            const sbSession = sdata?.session;

            if (!sbSession?.user) {
                return { ok: false, message: "ログイン情報が確認できません。再ログインしてください。" };
            }

            const row = {
                user_id: sbSession.user.id,
                work_date: session.workDate,
                start_at: session.startAt ? new Date(session.startAt).toISOString() : null,
                end_at: session.endAt ? new Date(session.endAt).toISOString() : null,
                state: session.state,
            };

            const { data, error } = await supabase
                .from("sessions")
                .upsert(row, { onConflict: "user_id,work_date" })
                .select("id, user_id, work_date, start_at, end_at, state")
                .single();

            if (error) {
                console.warn("[sync] upsert failed:", error);
                return { ok: false, message: "保存に失敗しました。通信状態を確認して、もう一度お試しください。" };
            }

            return { ok: true, session: sbRowToSession(data) };
        } catch (error) {
            console.warn("[sync] unexpected save error:", error);
            return { ok: false, message: "保存に失敗しました。通信状態を確認して、もう一度お試しください。" };
        }
    };

    // Supabase の行データを session オブジェクトに変換
    function sbRowToSession(row) {
        return {
            id: row.id,
            userId: row.user_id ?? window.App.userId,
            workDate: row.work_date,
            startAt: row.start_at ? Date.parse(row.start_at) : null,
            endAt: row.end_at ? Date.parse(row.end_at) : null,
            state: row.state,
        };
    }

    //指定日のセッション取得（リモート）
    window.App.getSessionByDateRemote = async function (workDate) {
        const supabase = window.App.supabase;
        if (!supabase) return null;

        const user = await window.App.getAuthedUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("sessions")
            .select("id, user_id, work_date, start_at, end_at, state")
            .eq("user_id", user.id)
            .eq("work_date", workDate)
            .limit(1);

        if (error) {
            console.warn("[sync] getSessionByDateRemote error:", error);
            return null;
        }
        return data?.[0] ? sbRowToSession(data[0]) : null;
    };

    //勤務中セッション 取得（リモート）
    window.App.getWorkingSessionRemote = async function () {
        const supabase = window.App.supabase;
        if (!supabase) return null;

        const user = await window.App.getAuthedUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from("sessions")
            .select("id, user_id, work_date, start_at, end_at, state")
            .eq("user_id", user.id)
            .eq("state", "WORKING")
            .limit(1);

        if (error) {
            console.warn("[sync] getWorkingSessionRemote error:", error);
            return null;
        }
        return data?.[0] ? sbRowToSession(data[0]) : null;
    };

    window.App.listSessionInMonthRemote = async function (year, month1to12) {
        const supabase = window.App.supabase;
        if (!supabase) return null;

        const user = await window.App.getAuthedUser();
        if (!user) return null;

        const start = `${year}-${String(month1to12).padStart(2, "0")}-01`;
        const endDate = new Date(year, month1to12, 0);
        const end = `${year}-${String(month1to12).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

        const { data, error } = await supabase
            .from("sessions")
            .select("id, user_id, work_date, start_at, end_at, state")
            .eq("user_id", user.id)
            .gte("work_date", start)
            .lte("work_date", end)
            .order("work_date", { ascending: true });

        if (error) {
            console.warn("[sync] listSessionInMonthRemote failed:", error);
            return null;
        }

        return (data || []).map(sbRowToSession);
    };

})();
