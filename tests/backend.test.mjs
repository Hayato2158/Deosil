import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const [{ default: worker }, { encryptJson, hashSessionId }] = await Promise.all([
  import("../.test-dist/index.js"),
  import("../.test-dist/crypto.js"),
]);

class MockD1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim().toLowerCase();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.startsWith("select * from bff_sessions")) {
      const row = this.database.sessions.get(this.values[0]);
      return row ? { ...row } : null;
    }
    throw new Error(`Unsupported D1 first(): ${this.sql}`);
  }

  async run() {
    const [sessionIdHash] = this.values;

    if (this.sql.startsWith("delete from bff_sessions where session_id_hash")) {
      if (this.database.failDelete) throw new Error("D1 delete failed");
      const changed = this.database.sessions.delete(sessionIdHash) ? 1 : 0;
      return { meta: { changes: changed } };
    }

    if (this.sql.includes("set refresh_lock = ?1, refresh_lock_expires_at = ?2")) {
      const [lock, lockExpiresAt, hash, now] = this.values;
      const row = this.database.sessions.get(hash);
      if (!row || (row.refresh_lock && row.refresh_lock_expires_at > now)) {
        return { meta: { changes: 0 } };
      }
      row.refresh_lock = lock;
      row.refresh_lock_expires_at = lockExpiresAt;
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("set user_id = ?1, encrypted_session = ?2")) {
      const [userId, encryptedSession, expiresAt, updatedAt, hash, lock] = this.values;
      const row = this.database.sessions.get(hash);
      if (!row || row.refresh_lock !== lock) return { meta: { changes: 0 } };
      Object.assign(row, {
        user_id: userId,
        encrypted_session: encryptedSession,
        access_token_expires_at: expiresAt,
        refresh_lock: null,
        refresh_lock_expires_at: null,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("set refresh_lock = null, refresh_lock_expires_at = null")) {
      const [hash, lock] = this.values;
      const row = this.database.sessions.get(hash);
      if (!row || row.refresh_lock !== lock) return { meta: { changes: 0 } };
      row.refresh_lock = null;
      row.refresh_lock_expires_at = null;
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes("set idle_expires_at = ?1")) {
      const [idleExpiresAt, updatedAt, hash] = this.values;
      const row = this.database.sessions.get(hash);
      if (!row) return { meta: { changes: 0 } };
      row.idle_expires_at = idleExpiresAt;
      row.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unsupported D1 run(): ${this.sql}`);
  }
}

class MockD1 {
  constructor(row, { failDelete = false } = {}) {
    this.sessions = new Map(row ? [[row.session_id_hash, row]] : []);
    this.failDelete = failDelete;
  }

  prepare(sql) {
    return new MockD1Statement(this, sql);
  }
}

const encryptionKey = Buffer.alloc(32, 7).toString("base64url");
const sessionId = "test-session-id";
const sessionIdHash = await hashSessionId(sessionId);

async function createEnvironment({ expiresAt, failDelete = false }) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "old-access-token",
    refresh_token: "old-refresh-token",
    expires_at: expiresAt,
    user: { id: "user-1", email: "user@example.com" },
  };
  const row = {
    session_id_hash: sessionIdHash,
    user_id: session.user.id,
    encrypted_session: await encryptJson(session, encryptionKey),
    access_token_expires_at: session.expires_at,
    idle_expires_at: now + 30_000,
    absolute_expires_at: now + 60_000,
    refresh_lock: null,
    refresh_lock_expires_at: null,
    created_at: now,
    updated_at: now,
  };
  const database = new MockD1(row, { failDelete });
  return {
    database,
    env: {
      ASSETS: { fetch: async () => new Response("asset") },
      SESSION_DB: database,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      SESSION_ENCRYPTION_KEY: encryptionKey,
    },
  };
}

function apiRequest(path, method = "GET") {
  return new Request(`https://deosil.example${path}`, {
    method,
    headers: {
      Cookie: `__Host-deosil_session=${sessionId}`,
      Origin: "https://deosil.example",
      "Sec-Fetch-Site": "same-origin",
    },
  });
}

test("logout clears the BFF session when Supabase logout fails", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const { database, env } = await createEnvironment({ expiresAt: now + 3_600 });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("network failed");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(apiRequest("/api/auth/logout", "POST"), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(database.sessions.has(sessionIdHash), false);
});

test("logout clears the cookie even if D1 deletion fails", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const { env } = await createEnvironment({ expiresAt: now + 3_600, failDelete: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(apiRequest("/api/auth/logout", "POST"), env);
  assert.equal(response.status, 503);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("concurrent requests wait longer than one second for a session refresh", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const { env } = await createEnvironment({ expiresAt: now + 30 });
  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("grant_type=refresh_token")) {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_250));
      return Response.json({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3_600,
        user: { id: "user-1", email: "user@example.com" },
      });
    }
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ id: "user-1", email: "user@example.com" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const [first, second] = await Promise.all([
    worker.fetch(apiRequest("/api/auth/me"), env),
    worker.fetch(apiRequest("/api/auth/me"), env),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(refreshCalls, 1);
});
