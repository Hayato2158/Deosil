export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly clearSession = false,
  ) {
    super(message);
  }
}

const API_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export function json(data: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(API_HEADERS);
  if (additionalHeaders) {
    new Headers(additionalHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function noContent(additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(API_HEADERS);
  headers.delete("Content-Type");
  if (additionalHeaders) {
    new Headers(additionalHeaders).forEach((value, key) => headers.set(key, value));
  }
  return new Response(null, { status: 204, headers });
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type は application/json を指定してください。");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new HttpError(413, "リクエストが大きすぎます。");

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "リクエストが大きすぎます。");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "JSONが不正です。");
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin !== expectedOrigin) {
    throw new HttpError(403, "許可されていないオリジンです。");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new HttpError(403, "クロスサイトリクエストは許可されていません。");
  }
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: "許可されていないHTTPメソッドです。" },
    405,
    { Allow: allowed.join(", ") },
  );
}
