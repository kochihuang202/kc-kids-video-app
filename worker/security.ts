import { HttpError } from "./http";
import type { AppEnv, ChildDevice, ParentSession } from "./types";

const encoder = new TextEncoder();
const PARENT_COOKIE = "parent_session";
const DEVICE_COOKIE = "kid_device";
const SESSION_SECONDS = 12 * 60 * 60;
const DEVICE_SECONDS = 365 * 24 * 60 * 60;
export const MAX_PBKDF2_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64ToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function parseCookies(request: Request) {
  const result: Record<string, string> = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const parentCookie = (token: string) => cookie(PARENT_COOKIE, token, SESSION_SECONDS);
export const deviceCookie = (token: string) => cookie(DEVICE_COOKIE, token, DEVICE_SECONDS);
export const clearParentCookie = () => cookie(PARENT_COOKIE, "", 0);
export const clearDeviceCookie = () => cookie(DEVICE_COOKIE, "", 0);

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function tokenHash(token: string, env: AppEnv) {
  if (!env.SESSION_SECRET) throw new HttpError("尚未設定 SESSION_SECRET。", 503, "SERVER_NOT_CONFIGURED");
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), encoder.encode(token));
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyParent(request: Request, env: AppEnv): Promise<ParentSession> {
  const token = parseCookies(request)[PARENT_COOKIE];
  if (!token) throw new HttpError("請先登入家長區。", 401, "PARENT_LOGIN_REQUIRED");
  const hash = await tokenHash(token, env);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT id, expires_at FROM admin_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?",
  ).bind(hash, now).first<{ id: string; expires_at: string }>();
  if (!row) throw new HttpError("家長登入已過期，請重新登入。", 401, "PARENT_LOGIN_REQUIRED");
  await env.DB.prepare("UPDATE admin_sessions SET last_used_at = ? WHERE id = ?").bind(now, row.id).run();
  return { id: row.id, expiresAt: row.expires_at };
}

export async function getChildDevice(request: Request, env: AppEnv, required = true): Promise<ChildDevice | null> {
  const token = parseCookies(request)[DEVICE_COOKIE];
  if (!token) {
    if (required) throw new HttpError("這台裝置尚未經家長授權。", 403, "DEVICE_AUTH_REQUIRED");
    return null;
  }
  const hash = await tokenHash(token, env);
  const row = await env.DB.prepare(
    "SELECT id, name FROM child_devices WHERE token_hash = ? AND revoked_at IS NULL",
  ).bind(hash).first<{ id: string; name: string }>();
  if (!row) {
    if (required) throw new HttpError("這台裝置的授權已失效，請家長重新授權。", 403, "DEVICE_AUTH_REQUIRED");
    return null;
  }
  await env.DB.prepare("UPDATE child_devices SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id).run();
  return row;
}

export async function getOrCreateChildDevice(request: Request, env: AppEnv): Promise<{ device: ChildDevice; cookieHeader?: string }> {
  const existing = await getChildDevice(request, env, false);
  if (existing) return { device: existing };

  const token = randomToken();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const hash = await tokenHash(token, env);
  await env.DB.prepare(`
    INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at)
    VALUES (?, ?, '家庭裝置', ?, ?)
  `).bind(id, hash, now, now).run();

  return {
    device: { id, name: "家庭裝置" },
    cookieHeader: deviceCookie(token),
  };
}

export async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new HttpError("家長密碼雜湊設定不符合執行環境限制。", 503, "PARENT_PASSWORD_NOT_CONFIGURED");
  }
  const source = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations }, source, 256);
  return new Uint8Array(bits);
}

export async function makePasswordRecord(password: string, iterations = MAX_PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt), iterations };
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string, iterations: number) {
  const actual = await pbkdf2(password, base64ToBytes(salt), iterations);
  return timingSafeEqual(actual, base64ToBytes(hash));
}

export function parsePasswordSecret(secret: string | undefined) {
  if (!secret) return null;
  const [algorithm, iterationText, salt, hash] = secret.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations)
    || iterations < 100_000 || iterations > MAX_PBKDF2_ITERATIONS || !salt || !hash) return null;
  return { hash, salt, iterations };
}

export async function consumeRateLimit(
  env: AppEnv,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + windowSeconds * 1000).toISOString();
  await env.DB.prepare(`
    INSERT INTO rate_limit_buckets (bucket_key, count, window_started_at, expires_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      count = CASE WHEN expires_at <= excluded.window_started_at THEN 1 ELSE count + 1 END,
      window_started_at = CASE WHEN expires_at <= excluded.window_started_at THEN excluded.window_started_at ELSE window_started_at END,
      expires_at = CASE WHEN expires_at <= excluded.window_started_at THEN excluded.expires_at ELSE expires_at END
  `).bind(key, nowIso, expires).run();
  const row = await env.DB.prepare("SELECT count, expires_at FROM rate_limit_buckets WHERE bucket_key = ?")
    .bind(key).first<{ count: number; expires_at: string }>();
  if (row && row.count > limit) {
    throw new HttpError("操作太頻繁，請稍後再試。", 429, "RATE_LIMITED");
  }
}

export async function rateKey(env: AppEnv, scope: string, identity: string) {
  return `${scope}:${await tokenHash(identity, env)}`;
}

export const sessionExpiry = () => new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
