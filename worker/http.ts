import type { JsonObject } from "./types";

export class HttpError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return json({ error: "伺服器暫時發生問題，請稍後再試。" }, { status: 500 });
}

export async function readJson(request: Request): Promise<JsonObject> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError("請使用 JSON 格式送出資料。", 415, "JSON_REQUIRED");
  }
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as JsonObject;
  } catch {
    throw new HttpError("資料格式不正確。", 400, "INVALID_JSON");
  }
}

export function text(value: unknown, field: string, min = 1, max = 4000) {
  if (typeof value !== "string") throw new HttpError(`${field}格式不正確。`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(`${field}長度需為 ${min}～${max} 個字元。`);
  }
  return normalized;
}

export function optionalText(value: unknown, field: string, max = 4000) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, 1, max);
}

export function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(`${field}格式不正確。`);
  }
  return value;
}

export function boolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new HttpError(`${field}格式不正確。`);
  return value;
}

export function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(`${field}格式不正確。`);
  }
  const values = value.map((item) => item.trim()).filter(Boolean);
  if (new Set(values).size !== values.length) throw new HttpError(`${field}不可重複。`);
  return values;
}

export function assertSameOrigin(request: Request, configuredOrigin: string) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || (origin !== requestOrigin && origin !== configuredOrigin)) {
    throw new HttpError("來源驗證失敗，請重新整理後再試。", 403, "INVALID_ORIGIN");
  }
}

export function routeId(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}
