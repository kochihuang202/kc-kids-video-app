import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						SESSION_SECRET: "test-session-secret-with-enough-entropy",
						PARENT_PASSWORD_HASH: "",
						YOUTUBE_API_KEY: "test-youtube-key",
					},
				},
			}),
		],
		test: { setupFiles: ["./test/apply-migrations.ts"] },
	};
});
