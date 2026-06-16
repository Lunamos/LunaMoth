import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA is served by the Python supervisor from src/lunamoth/front/webui/.
// - base "./"          → asset URLs are relative, so the same build works under
//   any mount path (and would survive file:// if ever needed).
// - non-hashed names   → rebuilds overwrite the same paths so git/wheel churn
//   stays low (the dist is bundled into the wheel via package-data; see the plan).
// - hash routing in the app means the server needs NO SPA-fallback route list.
//
// Dev: run `lunamoth desktop --no-open`, read its printed http/ws ports, and
// point these envs at it. RPC is POST /rpc; the WS lives on a separate port.
const BACKEND = process.env.LUNAMOTH_BACKEND || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../../src/lunamoth/front/webui",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    proxy: {
      "/rpc": { target: BACKEND, changeOrigin: true },
      "/asset": { target: BACKEND, changeOrigin: true },
      "/upload": { target: BACKEND, changeOrigin: true },
    },
  },
});
