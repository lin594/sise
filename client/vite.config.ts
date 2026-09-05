import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
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
    plugins: [vue()],
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".vue"],
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
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
