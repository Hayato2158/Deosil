const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importEncryptionKey(encodedKey: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64UrlToBytes(encodedKey.trim());
  } catch {
    throw new Error("SESSION_ENCRYPTION_KEY must be base64 encoded");
  }
  if (keyBytes.byteLength !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function createOpaqueSessionId(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSessionId(sessionId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(sessionId));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function encryptJson(value: unknown, encodedKey: string): Promise<string> {
  const key = await importEncryptionKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptJson<T>(encrypted: string, encodedKey: string): Promise<T> {
  const [encodedIv, encodedCiphertext, extra] = encrypted.split(".");
  if (!encodedIv || !encodedCiphertext || extra) throw new Error("Invalid encrypted session format");
  const key = await importEncryptionKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(encodedIv)) },
    key,
    toArrayBuffer(base64UrlToBytes(encodedCiphertext)),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
