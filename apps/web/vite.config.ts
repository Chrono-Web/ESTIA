import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.ESTIA_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig(({ mode }) => ({
  build: {
    // Written straight where core-api serves it from (ADR 0010).
    emptyOutDir: true,
    outDir: "../core-api/public",
    sourcemap: true,
  },
  define: {
    // Solo in `vite` (dev): se il proxy punta a un NAS, gli inviti usano
    // quell'origine anche quando la UI è su 127.0.0.1. In build resta vuoto —
    // l'istanza e la SPA condividono già l'origine (ADR 0010).
    __ESTIA_INSTANCE_ORIGIN__: JSON.stringify(
      mode === "development" ? new URL(API_TARGET).origin : "",
    ),
  },
  plugins: [react()],
  server: {
    // In development the client runs on its own port and forwards the API to
    // the instance, so the same relative URLs work in both settings.
    host: true,
    proxy: {
      "/api": { changeOrigin: true, target: API_TARGET },
    },
  },
}));
