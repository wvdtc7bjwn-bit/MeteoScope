import { defineConfig } from "vite";

const cloudflareApiTarget = process.env.METEOSCOPE_API_TARGET || "https://meteoscope.pages.dev";

export default defineConfig({
  plugins: [],
  base: process.env.GITHUB_PAGES === "true" ? "/MeteoScope/" : "/",
  server: {
    proxy: {
      "/api": {
        target: cloudflareApiTarget,
        changeOrigin: true,
        secure: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin.html"
      }
    }
  }
});
