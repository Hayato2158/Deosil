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
})();
