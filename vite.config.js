import { defineConfig } from "vite";
import { onRequest as handleWeeklyWeatherRequest } from "./functions/api/weekly-weather.js";

const cloudflareApiTarget = process.env.METEOSCOPE_API_TARGET || "https://meteoscope.pages.dev";

export default defineConfig({
  plugins: [localWeeklyWeatherApi()],
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
    chunkSizeWarningLimit: 700,
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

function localWeeklyWeatherApi() {
  return {
    name: "meteoscope-local-weekly-weather-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== "/api/weekly-weather") {
          next();
          return;
        }

        try {
          const result = await handleWeeklyWeatherRequest({
            request: new Request(requestUrl, {
              method: request.method,
              headers: request.headers
            })
          });
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[weekly-weather] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/xml; charset=utf-8");
          response.end('<?xml version="1.0" encoding="UTF-8"?><error>weekly_forecast_unavailable</error>');
        }
      });
    }
  };
}
