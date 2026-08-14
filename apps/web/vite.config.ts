import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.ESTIA_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  build: {
    // Written straight where core-api serves it from (ADR 0010).
    emptyOutDir: true,
    outDir: "../core-api/public",
    sourcemap: true,
  },
  plugins: [react()],
  server: {
    // In development the client runs on its own port and forwards the API to
    // the instance, so the same relative URLs work in both settings.
    proxy: {
      "/api": { changeOrigin: true, target: API_TARGET },
    },
  },
});
