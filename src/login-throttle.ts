import { hashSessionId } from "./crypto";
import { HttpError } from "./http";
import type { Env } from "./types";

interface AttemptRow {
  failures: number;
  blocked_until: number;
  last_attempt_at: number;
}

const WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function loginAttemptKey(request: Request, email: string): Promise<string> {
  const clientIp = request.headers.get("cf-connecting-ip") ?? "local-development";
  return hashSessionId(`${clientIp}\0${email.toLowerCase()}`);
}

export async function assertLoginAllowed(env: Env, attemptKey: string): Promise<void> {
  const row = await env.SESSION_DB.prepare(
    "select failures, blocked_until, last_attempt_at from login_attempts where attempt_key = ?1 limit 1",
  ).bind(attemptKey).first<AttemptRow>();
  if (row && row.blocked_until > nowSeconds()) {
    throw new HttpError(429, "ログイン試行回数が多すぎます。しばらく待ってからお試しください。");
  }
}

export async function recordLoginFailure(env: Env, attemptKey: string): Promise<void> {
  const now = nowSeconds();
  const existing = await env.SESSION_DB.prepare(
    "select failures, blocked_until, last_attempt_at from login_attempts where attempt_key = ?1 limit 1",
  ).bind(attemptKey).first<AttemptRow>();
  const failures = existing && existing.last_attempt_at >= now - WINDOW_SECONDS
    ? existing.failures + 1
    : 1;
  const blockedUntil = failures >= MAX_FAILURES ? now + BLOCK_SECONDS : 0;

  await env.SESSION_DB.prepare(
    `insert into login_attempts (attempt_key, failures, blocked_until, last_attempt_at)
     values (?1, ?2, ?3, ?4)
     on conflict(attempt_key) do update set
       failures = excluded.failures,
       blocked_until = excluded.blocked_until,
       last_attempt_at = excluded.last_attempt_at`,
  ).bind(attemptKey, failures, blockedUntil, now).run();
}

export async function clearLoginFailures(env: Env, attemptKey: string): Promise<void> {
  await env.SESSION_DB.prepare("delete from login_attempts where attempt_key = ?1")
    .bind(attemptKey)
    .run();
}

export async function deleteOldLoginAttempts(env: Env): Promise<void> {
  await env.SESSION_DB.prepare("delete from login_attempts where last_attempt_at < ?1")
    .bind(nowSeconds() - 24 * 60 * 60)
    .run();
}
