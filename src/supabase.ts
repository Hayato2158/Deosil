import { HttpError } from "./http";
import type { Env, SupabaseSession, SupabaseUser } from "./types";

function baseHeaders(env: Env): Headers {
  const headers = new Headers();
  headers.set("apikey", env.SUPABASE_PUBLISHABLE_KEY);
  headers.set("Content-Type", "application/json");
  return headers;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: "Supabase returned a non-JSON response" };
  }
}

function assertSession(value: unknown): SupabaseSession {
  const session = value as Partial<SupabaseSession> | null;
  if (
    !session?.access_token ||
    !session.refresh_token ||
    !Number.isFinite(session.expires_at) ||
    !session.user?.id
  ) {
    throw new HttpError(502, "認証サーバーから不正なレスポンスを受信しました。");
  }
  return session as SupabaseSession;
}

export async function signInWithPassword(env: Env, email: string, password: string): Promise<SupabaseSession> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new HttpError(401, "メールアドレスまたはパスワードが正しくありません。");
    }
    throw new HttpError(502, "認証サーバーに接続できませんでした。");
  }
  return assertSession(data);
}

export async function refreshSupabaseSession(env: Env, refreshToken: string): Promise<SupabaseSession> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new HttpError(401, "セッションの有効期限が切れました。", true);
    }
    throw new HttpError(503, "認証セッションを更新できませんでした。");
  }
  return assertSession(data);
}

export async function fetchSupabaseUser(env: Env, accessToken: string): Promise<SupabaseUser> {
  const headers = baseHeaders(env);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  const data = await parseResponse(response);
  if (!response.ok || !(data as Partial<SupabaseUser> | null)?.id) {
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(401, "セッションが無効です。", true);
    }
    throw new HttpError(502, "ユーザー情報を確認できませんでした。");
  }
  return data as SupabaseUser;
}

export async function signOutSupabaseSession(env: Env, accessToken: string): Promise<void> {
  const headers = baseHeaders(env);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers,
  });
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new HttpError(502, "認証サーバーからログアウトできませんでした。");
  }
}

export async function supabaseRest<T>(
  env: Env,
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = baseHeaders(env);
  headers.set("Authorization", `Bearer ${accessToken}`);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401) throw new HttpError(401, "セッションが無効です。", true);
    if (response.status === 403) throw new HttpError(403, "この操作は許可されていません。");
    console.error("Supabase REST request failed", { status: response.status, path: path.split("?")[0] });
    throw new HttpError(502, "データベース処理に失敗しました。");
  }
  return data as T;
}
