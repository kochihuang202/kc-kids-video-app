declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
    APP_ORIGIN: string;
    ENVIRONMENT: string;
    SESSION_SECRET: string;
    PARENT_PASSWORD_HASH: string;
    YOUTUBE_API_KEY: string;
  }
}
