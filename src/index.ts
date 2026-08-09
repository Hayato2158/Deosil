import { HttpError, json } from "./http";
import { deleteOldLoginAttempts } from "./login-throttle";
import { routeApi } from "./routes";
import { clearSessionCookie, deleteExpiredSessions } from "./session";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/") {
        url.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    }

    try {
      return await routeApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        const headers = error.clearSession ? { "Set-Cookie": clearSessionCookie() } : undefined;
        return json({ error: error.message }, error.status, headers);
      }
      console.error("Unhandled API error", error instanceof Error ? error.message : "unknown error");
      return json({ error: "サーバー処理に失敗しました。" }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(Promise.all([
      deleteExpiredSessions(env),
      deleteOldLoginAttempts(env),
    ]).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
