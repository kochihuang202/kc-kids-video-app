import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { offlineShell } from "./scripts/offline-shell.js";

export default defineConfig({
  plugins: [react(), cloudflare(), offlineShell()],
});
