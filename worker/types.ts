export interface AppEnv {
  DB: D1Database;
  MEDIA_ASSETS?: R2Bucket;
  ASSETS?: Fetcher;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
  YOUTUBE_API_KEY?: string;
  SESSION_SECRET?: string;
  PARENT_PASSWORD_HASH?: string;
  MEDIA_SERVER_BASE_URL?: string;
  RECORDING_ENABLED?: string;
  DIAGNOSTICS_READ_TOKEN?: string;
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
