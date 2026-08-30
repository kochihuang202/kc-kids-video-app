export interface AppEnv {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
  YOUTUBE_API_KEY?: string;
  SESSION_SECRET?: string;
  PARENT_PASSWORD_HASH?: string;
}

export type JsonObject = Record<string, unknown>;

export interface ParentSession {
  id: string;
  expiresAt: string;
}

export interface ChildDevice {
  id: string;
  name: string;
}
