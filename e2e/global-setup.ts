import type { FullConfig } from "@playwright/test";
import { createServer } from "vite";

export default async function globalSetup(_config: FullConfig) {
  if (process.env.PLAYWRIGHT_BASE_URL) return;

  const server = await createServer({
    configFile: "vite.e2e.config.ts",
    server: { host: "127.0.0.1", port: 5175, strictPort: true },
  });
  await server.listen();

  return async () => {
    await server.close();
  };
}
