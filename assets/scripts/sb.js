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

    // upsert（今の実装そのまま：getSession ベース）
    window.App.tryUpsertToSupabase = async function tryUpsertToSupabase(session) {
        console.log("[sync] tryUpsertToSupabase called");

        const supabase = window.App.supabase;
        if (!supabase) {
            console.log("[sync] Supabase client is not initialized");
            return;
        }

        const { data: sdata, error: serr } = await supabase.auth.getSession();
        if (serr) {
            console.warn("[sync] getSession error:", serr);
            return;
        }
        const sbSession = sdata?.session;
        console.log("[sync] session.user:", sbSession?.user?.id);

        if (!sbSession?.user) {
            console.log("[sync] ユーザーが認証されていません（sessionがnull）");
            return;
        }

        const row = {
            user_id: sbSession.user.id,
            work_date: session.workDate,
            start_at: session.startAt ? new Date(session.startAt).toISOString() : null,
            end_at: session.endAt ? new Date(session.endAt).toISOString() : null,
            state: session.state,
        };

        const res = await supabase
            .from("sessions")
            .upsert(row, { onConflict: "user_id,work_date" });

        console.log("[sync] upsert result:", res);

        if (res.error) {
            console.warn("[sync] upsert failed:", res.error);
        }
    };

    // Supabase の行データを session オブジェクトに変換
    function sbRowToSession(row) {
        return {
            id: row.id,
            testerId: window.App.testerId,
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
            .select("id, work_date, start_at, end_at, state")
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
            .select("id, work_date, start_at, end_at, state")
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
            .select("id, work_date, start_at, end_at, state")
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
