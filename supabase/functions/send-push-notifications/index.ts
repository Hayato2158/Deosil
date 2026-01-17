import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edge Function(Deno)で npm パッケージを使う
import webpush from "npm:web-push";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // invokeやブラウザから叩けるように（必要に応じて絞ってOK）
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY (set via supabase secrets)" }, 500);

  // 送信元メール（適当に自分のものにしてOK）
  webpush.setVapidDetails("mailto:you@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // とりあえず全件送る（後で user_id 絞り込みや条件送信にする）
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id");

  if (error) return json({ error: error.message }, 500);
  if (!subs || subs.length === 0) return json({ ok: true, message: "no subscriptions" });

  const payload = JSON.stringify({
    title: "Deosil Test Push",
    body: "Edge Function から Push 飛んだ！",
    url: "index.html",
  });

  const results: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = [];

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload,
      );
      results.push({ endpoint: s.endpoint, ok: true });
    } catch (e) {
      // 410 Gone などは期限切れ subscription の可能性
      const status = (e as any)?.statusCode ?? (e as any)?.status;
      results.push({ endpoint: s.endpoint, ok: false, status, error: String(e) });
    }
  }

  return json({ ok: true, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
});
