import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// UI regression tests intercept their API calls and therefore only need the
// browser bundle. D1/Worker behavior remains covered by the Vitest integration suite.
export default defineConfig({
  plugins: [react()],
});
