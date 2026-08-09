import { createOpaqueSessionId, decryptJson, encryptJson, hashSessionId } from "./crypto";
import { HttpError } from "./http";
import { refreshSupabaseSession } from "./supabase";
import type { AuthContext, Env, SessionRow, SupabaseSession } from "./types";

const COOKIE_NAME = "__Host-deosil_session";
const IDLE_LIFETIME_SECONDS = 12 * 60 * 60;
const ABSOLUTE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_EARLY_SECONDS = 90;
const REFRESH_LOCK_SECONDS = 10;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parseCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === COOKIE_NAME) return part.slice(separator + 1).trim() || null;
  }
  return null;
}

export function sessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Max-Age=${ABSOLUTE_LIFETIME_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

async function getRow(env: Env, sessionIdHash: string): Promise<SessionRow | null> {
  return env.SESSION_DB.prepare(
    "select * from bff_sessions where session_id_hash = ?1 limit 1",
  ).bind(sessionIdHash).first<SessionRow>();
}

async function deleteRow(env: Env, sessionIdHash: string): Promise<void> {
  await env.SESSION_DB.prepare("delete from bff_sessions where session_id_hash = ?1")
    .bind(sessionIdHash)
    .run();
}

export async function createBffSession(
  request: Request,
  env: Env,
  session: SupabaseSession,
): Promise<string> {
  const previousId = parseCookie(request);
  if (previousId) await deleteRow(env, await hashSessionId(previousId));

  const sessionId = createOpaqueSessionId();
  const sessionIdHash = await hashSessionId(sessionId);
  const now = nowSeconds();
  const encryptedSession = await encryptJson(session, env.SESSION_ENCRYPTION_KEY);

  await env.SESSION_DB.prepare(
    `insert into bff_sessions (
      session_id_hash, user_id, encrypted_session, access_token_expires_at,
      idle_expires_at, absolute_expires_at, created_at, updated_at
    ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(
    sessionIdHash,
    session.user.id,
    encryptedSession,
    session.expires_at,
    now + IDLE_LIFETIME_SECONDS,
    now + ABSOLUTE_LIFETIME_SECONDS,
    now,
  ).run();

  return sessionId;
}

async function waitForConcurrentRefresh(
  env: Env,
  sessionIdHash: string,
  oldRefreshToken: string,
): Promise<SupabaseSession | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const row = await getRow(env, sessionIdHash);
    if (!row) return null;
    const session = await decryptJson<SupabaseSession>(row.encrypted_session, env.SESSION_ENCRYPTION_KEY);
    if (session.refresh_token !== oldRefreshToken || session.expires_at > nowSeconds() + REFRESH_EARLY_SECONDS) {
      return session;
    }
  }
  return null;
}

async function refreshIfNeeded(
  env: Env,
  row: SessionRow,
  session: SupabaseSession,
): Promise<SupabaseSession> {
  const now = nowSeconds();
  if (session.expires_at > now + REFRESH_EARLY_SECONDS) return session;

  const lock = createOpaqueSessionId();
  const lockResult = await env.SESSION_DB.prepare(
    `update bff_sessions
       set refresh_lock = ?1, refresh_lock_expires_at = ?2
     where session_id_hash = ?3
       and (refresh_lock is null or refresh_lock_expires_at < ?4)`,
  ).bind(lock, now + REFRESH_LOCK_SECONDS, row.session_id_hash, now).run();

  if ((lockResult.meta.changes ?? 0) !== 1) {
    const refreshed = await waitForConcurrentRefresh(env, row.session_id_hash, session.refresh_token);
    if (refreshed) return refreshed;
    throw new HttpError(503, "セッション更新が競合しました。もう一度お試しください。");
  }

  try {
    const refreshed = await refreshSupabaseSession(env, session.refresh_token);
    const encrypted = await encryptJson(refreshed, env.SESSION_ENCRYPTION_KEY);
    const updateResult = await env.SESSION_DB.prepare(
      `update bff_sessions
         set user_id = ?1, encrypted_session = ?2, access_token_expires_at = ?3,
             refresh_lock = null, refresh_lock_expires_at = null, updated_at = ?4
       where session_id_hash = ?5 and refresh_lock = ?6`,
    ).bind(
      refreshed.user.id,
      encrypted,
      refreshed.expires_at,
      nowSeconds(),
      row.session_id_hash,
      lock,
    ).run();
    if ((updateResult.meta.changes ?? 0) !== 1) {
      throw new HttpError(401, "セッションが無効です。", true);
    }
    return refreshed;
  } catch (error) {
    await env.SESSION_DB.prepare(
      "update bff_sessions set refresh_lock = null, refresh_lock_expires_at = null where session_id_hash = ?1 and refresh_lock = ?2",
    ).bind(row.session_id_hash, lock).run();
    if (error instanceof HttpError && error.clearSession) await deleteRow(env, row.session_id_hash);
    throw error;
  }
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const sessionId = parseCookie(request);
  if (!sessionId) throw new HttpError(401, "ログインしてください。", true);

  const sessionIdHash = await hashSessionId(sessionId);
  const row = await getRow(env, sessionIdHash);
  if (!row) throw new HttpError(401, "セッションが見つかりません。", true);

  const now = nowSeconds();
  if (row.idle_expires_at <= now || row.absolute_expires_at <= now) {
    await deleteRow(env, sessionIdHash);
    throw new HttpError(401, "セッションの有効期限が切れました。", true);
  }

  let session: SupabaseSession;
  try {
    session = await decryptJson<SupabaseSession>(row.encrypted_session, env.SESSION_ENCRYPTION_KEY);
  } catch {
    await deleteRow(env, sessionIdHash);
    throw new HttpError(401, "セッションを復元できませんでした。", true);
  }

  session = await refreshIfNeeded(env, row, session);

  if (row.idle_expires_at < now + IDLE_LIFETIME_SECONDS / 2) {
    await env.SESSION_DB.prepare(
      "update bff_sessions set idle_expires_at = ?1, updated_at = ?2 where session_id_hash = ?3",
    ).bind(now + IDLE_LIFETIME_SECONDS, now, sessionIdHash).run();
  }

  return { sessionIdHash, session };
}

export async function destroyBffSession(env: Env, sessionIdHash: string): Promise<void> {
  await deleteRow(env, sessionIdHash);
}

export async function deleteExpiredSessions(env: Env): Promise<void> {
  const now = nowSeconds();
  await env.SESSION_DB.prepare(
    "delete from bff_sessions where idle_expires_at <= ?1 or absolute_expires_at <= ?1",
  ).bind(now).run();
}
