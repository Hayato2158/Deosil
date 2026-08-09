import { HttpError, json, noContent, readJson, requireSameOrigin } from "./http";
import {
  assertLoginAllowed,
  clearLoginFailures,
  loginAttemptKey,
  recordLoginFailure,
} from "./login-throttle";
import {
  authenticate,
  clearSessionCookie,
  createBffSession,
  destroyBffSession,
  sessionCookie,
} from "./session";
import {
  fetchSupabaseUser,
  signInWithPassword,
  signOutSupabaseSession,
  supabaseRest,
} from "./supabase";
import type { AuthContext, Env } from "./types";

interface SessionRow {
  id: string;
  user_id: string;
  work_date: string;
  start_at: string | null;
  end_at: string | null;
  state: "WORKING" | "DONE";
  deleted_at: string | null;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface SessionBody {
  workDate?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  state?: unknown;
}

interface PushSubscriptionBody {
  endpoint?: unknown;
  p256dh?: unknown;
  auth?: unknown;
  enabled?: unknown;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIsoTimestamp(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${fieldName}が不正です。`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, `${fieldName}が不正です。`);
  return date.toISOString();
}

function queryPath(table: string, params: Record<string, string>): string {
  return `${table}?${new URLSearchParams(params).toString()}`;
}

function minimalUser(user: { id: string; email?: string }): { id: string; email: string | null } {
  return { id: user.id, email: user.email ?? null };
}

async function login(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const body = await readJson<LoginBody>(request);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || email.length > 254 || !password || password.length > 1_024) {
    throw new HttpError(400, "メールアドレスとパスワードを確認してください。");
  }

  const attemptKey = await loginAttemptKey(request, email);
  await assertLoginAllowed(env, attemptKey);

  let session;
  try {
    session = await signInWithPassword(env, email, password);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await recordLoginFailure(env, attemptKey);
    }
    throw error;
  }
  await clearLoginFailures(env, attemptKey);
  const sessionId = await createBffSession(request, env, session);
  return json(
    { user: minimalUser(session.user) },
    200,
    { "Set-Cookie": sessionCookie(sessionId) },
  );
}

async function me(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  try {
    const user = await fetchSupabaseUser(env, auth.session.access_token);
    return json({ user: minimalUser(user) });
  } catch (error) {
    if (error instanceof HttpError && error.clearSession) {
      await destroyBffSession(env, auth.sessionIdHash);
    }
    throw error;
  }
}

async function logout(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const auth = await authenticate(request, env);

  try {
    await signOutSupabaseSession(env, auth.session.access_token);
  } catch (error) {
    console.warn(
      "Supabase sign-out failed; continuing local session destruction",
      error instanceof HttpError ? error.status : "network_error",
    );
  }

  try {
    await destroyBffSession(env, auth.sessionIdHash);
  } catch (error) {
    console.error("BFF session destruction failed during logout", error instanceof Error ? error.message : "unknown");
    return json(
      { error: "サーバー側セッションの破棄に失敗しました。" },
      503,
      { "Set-Cookie": clearSessionCookie() },
    );
  }

  return noContent({ "Set-Cookie": clearSessionCookie() });
}

async function listSessions(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const workDate = url.searchParams.get("workDate");
  const state = url.searchParams.get("state");
  const month = url.searchParams.get("month");
  const filters = [workDate, state, month].filter(Boolean);
  if (filters.length !== 1) throw new HttpError(400, "検索条件を1つ指定してください。");

  const params: Record<string, string> = {
    select: "id,user_id,work_date,start_at,end_at,state,deleted_at",
    user_id: `eq.${auth.session.user.id}`,
    deleted_at: "is.null",
  };

  if (workDate) {
    if (!isDate(workDate)) throw new HttpError(400, "勤務日が不正です。");
    params.work_date = `eq.${workDate}`;
    params.limit = "1";
  } else if (state) {
    if (state !== "WORKING") throw new HttpError(400, "勤務状態が不正です。");
    params.state = `eq.${state}`;
    params.limit = "1";
  } else if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "対象月が不正です。");
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (monthNumber < 1 || monthNumber > 12) throw new HttpError(400, "対象月が不正です。");
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    params.and = `(work_date.gte.${month}-01,work_date.lte.${month}-${String(lastDay).padStart(2, "0")})`;
    params.order = "work_date.asc";
  }

  const rows = await supabaseRest<SessionRow[]>(
    env,
    auth.session.access_token,
    queryPath("sessions", params),
  );
  return month ? json({ sessions: rows }) : json({ session: rows[0] ?? null });
}

async function upsertSession(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireSameOrigin(request);
  const body = await readJson<SessionBody>(request);
  if (!isDate(body.workDate)) throw new HttpError(400, "勤務日が不正です。");
  if (body.state !== "WORKING" && body.state !== "DONE") {
    throw new HttpError(400, "勤務状態が不正です。");
  }
  const startAt = toIsoTimestamp(body.startAt, "出勤時刻");
  const endAt = toIsoTimestamp(body.endAt, "退勤時刻");
  if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) {
    throw new HttpError(400, "退勤時刻は出勤時刻以降にしてください。");
  }
  if (body.state === "WORKING" && (!startAt || endAt)) {
    throw new HttpError(400, "勤務中セッションの時刻が不正です。");
  }

  const row = {
    user_id: auth.session.user.id,
    work_date: body.workDate,
    start_at: startAt,
    end_at: endAt,
    state: body.state,
    deleted_at: null,
  };
  const path = queryPath("sessions", {
    on_conflict: "user_id,work_date",
    select: "id,user_id,work_date,start_at,end_at,state,deleted_at",
  });
  const rows = await supabaseRest<SessionRow[]>(env, auth.session.access_token, path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!rows[0]) throw new HttpError(502, "保存結果を取得できませんでした。");
  return json({ session: rows[0] });
}

async function softDeleteSession(
  request: Request,
  env: Env,
  auth: AuthContext,
  sessionId: string,
): Promise<Response> {
  requireSameOrigin(request);
  if (!isUuid(sessionId)) throw new HttpError(400, "削除対象が不正です。");
  const path = queryPath("sessions", {
    id: `eq.${sessionId}`,
    user_id: `eq.${auth.session.user.id}`,
    deleted_at: "is.null",
    select: "id",
  });
  const rows = await supabaseRest<Array<{ id: string }>>(env, auth.session.access_token, path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  if (!rows[0]) throw new HttpError(404, "削除対象が見つかりませんでした。");
  return noContent();
}

function validateEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 4_096) throw new HttpError(400, "Push endpointが不正です。");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Push endpointが不正です。");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "Push endpointはHTTPSである必要があります。");
  return value;
}

async function getPushSubscription(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const endpoint = validateEndpoint(new URL(request.url).searchParams.get("endpoint"));
  const path = queryPath("push_subscriptions", {
    select: "enabled",
    user_id: `eq.${auth.session.user.id}`,
    endpoint: `eq.${endpoint}`,
    limit: "1",
  });
  const rows = await supabaseRest<Array<{ enabled: boolean }>>(env, auth.session.access_token, path);
  return json({ enabled: rows[0]?.enabled ?? true, registered: Boolean(rows[0]) });
}

async function savePushSubscription(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireSameOrigin(request);
  const body = await readJson<PushSubscriptionBody>(request);
  const endpoint = validateEndpoint(body.endpoint);
  if (typeof body.p256dh !== "string" || !body.p256dh || body.p256dh.length > 512) {
    throw new HttpError(400, "Push公開鍵が不正です。");
  }
  if (typeof body.auth !== "string" || !body.auth || body.auth.length > 512) {
    throw new HttpError(400, "Push認証情報が不正です。");
  }

  const path = queryPath("push_subscriptions", { on_conflict: "user_id,endpoint" });
  await supabaseRest(env, auth.session.access_token, path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: auth.session.user.id,
      endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 512),
    }),
  });
  return noContent();
}

async function updatePushSubscription(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireSameOrigin(request);
  const body = await readJson<PushSubscriptionBody>(request);
  const endpoint = validateEndpoint(body.endpoint);
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "通知設定が不正です。");

  const path = queryPath("push_subscriptions", {
    user_id: `eq.${auth.session.user.id}`,
    endpoint: `eq.${endpoint}`,
  });
  await supabaseRest(env, auth.session.access_token, path, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ enabled: body.enabled, updated_at: new Date().toISOString() }),
  });
  return noContent();
}

export async function routeApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/auth/login") {
    if (request.method !== "POST") throw new HttpError(405, "POSTだけが許可されています。");
    return login(request, env);
  }
  if (path === "/api/auth/me") {
    if (request.method !== "GET") throw new HttpError(405, "GETだけが許可されています。");
    return me(request, env);
  }
  if (path === "/api/auth/logout") {
    if (request.method !== "POST") throw new HttpError(405, "POSTだけが許可されています。");
    return logout(request, env);
  }

  const auth = await authenticate(request, env);

  try {
    if (path === "/api/sessions") {
      if (request.method === "GET") return listSessions(request, env, auth);
      if (request.method === "POST") return upsertSession(request, env, auth);
      throw new HttpError(405, "GETまたはPOSTだけが許可されています。");
    }

    const deleteMatch = path.match(/^\/api\/sessions\/([^/]+)\/soft-delete$/);
    if (deleteMatch) {
      if (request.method !== "PATCH") throw new HttpError(405, "PATCHだけが許可されています。");
      return softDeleteSession(request, env, auth, decodeURIComponent(deleteMatch[1]));
    }

    if (path === "/api/push-subscriptions") {
      if (request.method === "GET") return getPushSubscription(request, env, auth);
      if (request.method === "POST") return savePushSubscription(request, env, auth);
      if (request.method === "PATCH") return updatePushSubscription(request, env, auth);
      throw new HttpError(405, "GET、POST、PATCHだけが許可されています。");
    }

    throw new HttpError(404, "APIが見つかりません。");
  } catch (error) {
    if (error instanceof HttpError && error.clearSession) {
      await destroyBffSession(env, auth.sessionIdHash);
    }
    throw error;
  }
}
