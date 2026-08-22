import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Assumiamo che core-api generi il suo HTTPS ora
const API_TARGET = process.env.ESTIA_API_TARGET ?? "https://127.0.0.1:3000";

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: "../core-api/public",
    sourcemap: true,
  },
  define: {
    __ESTIA_INSTANCE_ORIGIN__: JSON.stringify(
      mode === "development" ? new URL(API_TARGET).origin : "",
    ),
  },
  plugins: [react(), basicSsl()],
  server: {
    proxy: {
      "/api": { changeOrigin: true, target: API_TARGET, secure: false },
    },
  },
}));
