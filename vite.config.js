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
        secure: true,
        ws: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin.html"
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("/node_modules/maplibre-gl/")) {
            return "map-engine";
          }
          if (normalizedId.includes("/node_modules/pdfjs-dist/")) {
            return "document-viewer";
          }
          if (/\/src\/map\/data\/world(?:Land|Countries)GeoJson\.js$/u.test(normalizedId)) {
            return "world-geometry";
          }
          return undefined;
        }
      }
    }
  }
});
