export interface Env {
  ASSETS: Fetcher;
  SESSION_DB: D1Database;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SESSION_ENCRYPTION_KEY: string;
}

export interface SupabaseUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in?: number;
  token_type?: string;
  user: SupabaseUser;
}

export interface SessionRow {
  session_id_hash: string;
  user_id: string;
  encrypted_session: string;
  access_token_expires_at: number;
  idle_expires_at: number;
  absolute_expires_at: number;
  refresh_lock: string | null;
  refresh_lock_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AuthContext {
  sessionIdHash: string;
  session: SupabaseSession;
}
