import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.XDG_CONFIG_HOME ||= path.join(import.meta.dirname, ".wrangler-test");

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
						MEDIA_SERVER_BASE_URL: "https://media.test",
						// Keep the historical recording suite as a rollback regression test.
						// Production explicitly sets this to "false" in wrangler.jsonc.
						RECORDING_ENABLED: "true",
					},
				},
			}),
		],
		test: {
			include: ["test/**/*.spec.ts"],
			setupFiles: ["./test/apply-migrations.ts"],
		},
	};
});
