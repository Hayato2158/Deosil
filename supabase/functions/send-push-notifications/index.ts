import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// 本番の一斉テスト送信口は廃止した。定期通知は send-scheduled-push のみを使用する。
serve(() => new Response("Gone", {
  status: 410,
  headers: {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
  },
}));
