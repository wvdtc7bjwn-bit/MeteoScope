import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  base: process.env.GITHUB_PAGES === "true" ? "/MeteoScope/" : "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin.html"
      }
    }
  }
});
