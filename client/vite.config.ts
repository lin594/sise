import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const inviteProxy = {
    "/invite": {
      target: env.VITE_SERVER_HTTP_URL || "http://127.0.0.1:2567",
      changeOrigin: false,
    },
  };

  return {
    plugins: [
      vue(),
      VitePWA({
        strategies: "generateSW",
        injectRegister: false,
        registerType: "prompt",
        manifest: false,
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [
            /^\/invite(?:\/|$)/,
            /^\/(?:api|health|matchmake|private-state|guest-profile|product-events|reset-room|room-id|rooms|share)(?:\/|$)/,
          ],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".vue"],
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@game-core": fileURLToPath(new URL("../server/src/game-core", import.meta.url)),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
      proxy: inviteProxy,
    },
    preview: { proxy: inviteProxy },
  };
});
