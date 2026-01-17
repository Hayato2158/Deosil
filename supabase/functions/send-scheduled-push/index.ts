import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

/**
 * JSTの「今日」を YYYY-MM-DD で返す（UTC+9で日付切替）
 */
function jstWorkDate(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type SubRow = { user_id: string; endpoint: string; p256dh: string; auth: string };

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE) return new Response("missing SUPABASE env", { status: 500 });
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return new Response("missing VAPID env", { status: 500 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") ?? "morning") as "morning" | "night" | "regular";
    const workDate = jstWorkDate();

    // ---- 母集団：通知できるユーザー（enabled=true）に寄せる（スケール優先） ----
    const { data: enabledSubs, error: esErr } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .eq("enabled", true);

    if (esErr) return new Response(`push_subscriptions select failed: ${esErr.message}`, { status: 500 });

    const candidateUserIds = Array.from(new Set((enabledSubs ?? []).map((x: any) => x.user_id)));
    if (candidateUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, mode, workDate, picked: 0, sent: 0, failed: 0, marked: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 既送信（同日同kind）をまとめて取る ----
    const { data: marks, error: mErr } = await supabase
      .from("notification_marks")
      .select("user_id")
      .eq("work_date", workDate)
      .eq("kind", mode)
      .in("user_id", candidateUserIds);

    if (mErr) return new Response(`marks select failed: ${mErr.message}`, { status: 500 });

    const already = new Set((marks ?? []).map((x: any) => x.user_id));

    let title = "Deosil";
    let body = "";
    let targetUserIds: string[] = [];

    // =========================
    // mode: morning
    // 10:00 時点で state が null → 「まだ勤務開始ができていません！」
    // ※ sessions が存在しない人も「未開始」として含める（仕様により調整可）
    // =========================
    if (mode === "morning") {
      body = "まだ勤務開始ができていません！";

      const { data: todays, error: sErr } = await supabase
        .from("sessions")
        .select("user_id,state")
        .eq("work_date", workDate)
        .in("user_id", candidateUserIds);

      if (sErr) return new Response(`sessions select failed: ${sErr.message}`, { status: 500 });

      const byUser = new Map<string, { state: string | null }>();
      for (const row of todays ?? []) {
        byUser.set((row as any).user_id, { state: (row as any).state ?? null });
      }

      // 未開始判定：
      // - 今日のsessionが無い
      // - もしくは state が null
      targetUserIds = candidateUserIds
        .filter((uid) => !already.has(uid))
        .filter((uid) => {
          const s = byUser.get(uid);
          if (!s) return true;              // session無し → 未開始
          return s.state === null;          // state null → 未開始
        });
    }

    // =========================
    // mode: night
    // 22:00 時点で state が working → 「退勤が確認できていません！」
    // =========================
    else if (mode === "night") {
      body = "退勤が確認できていません！";

      const { data: working, error: wErr } = await supabase
        .from("sessions")
        .select("user_id")
        .eq("work_date", workDate)
        .eq("state", "working")
        .in("user_id", candidateUserIds);

      if (wErr) return new Response(`sessions select failed: ${wErr.message}`, { status: 500 });

      const workingIds = Array.from(new Set((working ?? []).map((x: any) => x.user_id)));
      targetUserIds = workingIds.filter((uid) => !already.has(uid));
    }

    // =========================
    // mode: regular
    // start_at から 8時間経過後 → 「定時です！」
    // ※ end_at が入ってたら対象外（退勤済み）
    // =========================
    else if (mode === "regular") {
      body = "定時です！";

      // 今日の working かつ start_at がある人を取得
      const { data: working, error: wErr } = await supabase
        .from("sessions")
        .select("user_id,start_at,end_at,state")
        .eq("work_date", workDate)
        .eq("state", "working")
        .in("user_id", candidateUserIds);

      if (wErr) return new Response(`sessions select failed: ${wErr.message}`, { status: 500 });

      const nowMs = Date.now();
      const eightHoursMs = 8 * 60 * 60 * 1000;

      const dueIds: string[] = [];
      for (const row of working ?? []) {
        const userId = (row as any).user_id as string;
        if (already.has(userId)) continue;

        const startAt = (row as any).start_at; // timestamptz -> string/Dateっぽく返る場合あり
        const endAt = (row as any).end_at;

        if (endAt) continue; // 退勤済みは対象外
        if (!startAt) continue;

        const startMs = typeof startAt === "string" ? Date.parse(startAt) : Number(startAt);
        if (!Number.isFinite(startMs)) continue;

        if (nowMs - startMs >= eightHoursMs) {
          dueIds.push(userId);
        }
      }

      targetUserIds = Array.from(new Set(dueIds));
    } else {
      return new Response("mode must be morning|night|regular", { status: 400 });
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, mode, workDate, picked: 0, sent: 0, failed: 0, marked: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 対象ユーザーの購読（enabled=true）のみ取得 ----
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("user_id,endpoint,p256dh,auth")
      .eq("enabled", true)
      .in("user_id", targetUserIds);

    if (subErr) return new Response(`subs select failed: ${subErr.message}`, { status: 500 });

    const byUserSubs = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
    for (const s of (subs ?? []) as any[]) {
      const arr = byUserSubs.get(s.user_id) ?? [];
      arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
      byUserSubs.set(s.user_id, arr);
    }

    webpush.setVapidDetails("mailto:deosil@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

    // payload：url は SW 側で scope 解決される前提
    const payload = JSON.stringify({ title, body, url: "home.html" });

    let sent = 0;
    let failed = 0;
    const successUserIds: string[] = [];

    for (const uid of targetUserIds) {
      const list = byUserSubs.get(uid) ?? [];
      if (list.length === 0) continue;

      let anyOk = false;
      for (const sub of list) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          sent++;
          anyOk = true;
        } catch (e) {
          failed++;
          console.error("push failed", uid, String(e));
        }
      }
      if (anyOk) successUserIds.push(uid);
    }

    // ---- 成功した user_id だけ marks を upsert（重複してもOK） ----
    if (successUserIds.length > 0) {
      const rows = successUserIds.map((user_id) => ({
        user_id,
        work_date: workDate,
        kind: mode,
      }));

      const { error: upErr } = await supabase
        .from("notification_marks")
        .upsert(rows, { onConflict: "user_id,work_date,kind" });

      if (upErr) {
        console.error("upsert marks failed", upErr);
        return new Response("upsert marks failed", { status: 500 });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        workDate,
        picked: targetUserIds.length,
        sent,
        failed,
        marked: successUserIds.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fatal", e);
    return new Response("Internal Server Error", { status: 500 });
  }
});
