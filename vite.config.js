import { onRequest as handleFocalMechanismRequest } from "./functions/api/jma-focal-mechanism.js";
import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { onRequest as handleWeeklyWeatherRequest } from "./functions/api/weekly-weather.js";
import { onRequestGet as handleEarthquakeHistoryRequest } from "./functions/api/earthquake-history.js";
import { onRequestGet as handleEarthquakeHistoryEventRequest } from "./functions/api/earthquake-history-event.js";
import { onRequest as handleJmaDisasterCasesRequest } from "./functions/api/jma-disaster-cases.js";
import { onRequest as handleJmaUpperAirArchiveRequest } from "./functions/api/jma-upper-air-archive.js";
import { findLatestUpperAirObservation } from "./functions/api/upper-air.js";
import { buildGfsSubsetUrl, getLatestGfsCycle, parseGfsPointProfile, normalizeGfsCoordinates } from "./functions/api/gfs-profile.js";

const cloudflareApiTarget = process.env.METEOSCOPE_API_TARGET || "https://meteoscope.pages.dev";

function isLoopbackRequest(request) {
  const host = String(request.headers.host ?? "").toLowerCase().replace(/:\d+$/u, "");
  const address = String(request.socket?.remoteAddress ?? "");
  return ["localhost", "127.0.0.1", "[::1]"].includes(host)
    && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

export default defineConfig({
  plugins: [localReadOnlyPagesApi("jma-focal-mechanism", "/api/jma-focal-mechanism", handleFocalMechanismRequest), localActiveFaultApi(), localWeeklyWeatherApi(), localEarthquakeHistoryApi(), localEarthquakeHistoryEventApi(), localJmaDisasterCasesApi(), localJmaUpperAirArchiveApi(), localUpperAirApi(), localGfsProfileApi()],
  base: process.env.GITHUB_PAGES === "true" ? "/MeteoScope/" : "/",
  server: {
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.cache/early-access/**"] },
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
        admin: "admin.html",
        discordEarthquakeCard: "discord-earthquake-card.html"
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

function localActiveFaultApi() {
  return {
    name: "meteoscope-local-active-fault-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/local-active-fault") return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        if (!isLoopbackRequest(request)) {
          response.statusCode = 403;
          return response.end(JSON.stringify({ error: "localhost からのみ利用できます。" }));
        }
        if (request.method !== "GET") {
          response.statusCode = 405;
          return response.end(JSON.stringify({ error: "Method not allowed" }));
        }
        try {
          const path = process.env.METEOSCOPE_LOCAL_GSJ_PATH || ".cache/early-access/active-fault.geojson";
          const text = await readFile(resolve(path), "utf8");
          const data = JSON.parse(text);
          if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid GeoJSON");
          return response.end(text);
        } catch {
          response.statusCode = 503;
          return response.end(JSON.stringify({ error: "ローカルの産総研活断層データを読み込めません。METEOSCOPE_LOCAL_GSJ_PATH を設定してください。" }));
        }
      });
    }
  };
}

function localJmaDisasterCasesApi() {
  return localReadOnlyPagesApi("jma-disaster-cases", "/api/jma-disaster-cases", handleJmaDisasterCasesRequest);
}

function localJmaUpperAirArchiveApi() {
  return localReadOnlyPagesApi("jma-upper-air-archive", "/api/jma-upper-air-archive", handleJmaUpperAirArchiveRequest);
}

function localReadOnlyPagesApi(name, pathname, handler) {
  return {
    name: `meteoscope-local-${name}-api`,
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== pathname) {
          next();
          return;
        }

        try {
          const result = await handler({
            request: new Request(requestUrl, { method: request.method, headers: request.headers })
          });
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[${name}] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: `${name.replaceAll("-", "_")}_unavailable` }));
        }
      });
    }
  };
}

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

function localEarthquakeHistoryApi() {
  return {
    name: "meteoscope-local-earthquake-history-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== "/api/earthquake-history") {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const result = await handleEarthquakeHistoryRequest({
            request: new Request(requestUrl, { method: request.method, headers: request.headers }),
            waitUntil: () => {}
          });
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[earthquake-history] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "jma_query_failed" }));
        }
      });
    }
  };
}

function localEarthquakeHistoryEventApi() {
  return {
    name: "meteoscope-local-earthquake-history-event-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== "/api/earthquake-history-event") {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const result = await handleEarthquakeHistoryEventRequest({
            request: new Request(requestUrl, { method: request.method, headers: request.headers }),
            waitUntil: () => {}
          });
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[earthquake-history-event] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "jma_event_query_failed" }));
        }
      });
    }
  };
}

function localUpperAirApi() {
  return {
    name: "meteoscope-local-upper-air-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== "/api/upper-air") {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        if (!isLoopbackRequest(request)) {
          response.statusCode = 403;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "early_access_required" }));
          return;
        }
        try {
          const station = requestUrl.searchParams.get("station")?.trim() || "47646";
          const observation = await findLatestUpperAirObservation(station);
          if (!observation) {
            response.statusCode = 404;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "upper_air_observation_not_found" }));
            return;
          }
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : JSON.stringify(observation));
        } catch (error) {
          server.config.logger.error(`[upper-air] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "jma_upper_air_unavailable" }));
        }
      });
    }
  };
}

function localGfsProfileApi() {
  return {
    name: "meteoscope-local-gfs-profile-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== "/api/gfs-profile") {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        if (!isLoopbackRequest(request)) {
          response.statusCode = 403;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "early_access_required" }));
          return;
        }
        const coordinates = normalizeGfsCoordinates(requestUrl.searchParams.get("lat"), requestUrl.searchParams.get("lon"));
        if (!coordinates) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "coordinates_required" }));
          return;
        }
        try {
          const sourceUrl = buildGfsSubsetUrl(coordinates);
          const result = await fetch(sourceUrl, { headers: { Accept: "application/octet-stream", "User-Agent": "MeteoScope/1.0 (+http://localhost)" } });
          if (!result.ok) throw new Error(`GFS request failed: ${result.status}`);
          const rows = parseGfsPointProfile(await result.arrayBuffer());
          if (rows.length < 8) throw new Error("GFS profile has insufficient pressure levels");
          const cycle = getLatestGfsCycle();
          const payload = {
            source: "NOAA GFS 0.25°",
            forecastHour: 0,
            coordinates,
            cycle: { date: cycle.date, hour: cycle.hour },
            rows,
            sourceUrl
          };
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
        } catch (error) {
          server.config.logger.error(`[gfs-profile] local API failed: ${error?.message ?? error}`);
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "noaa_gfs_unavailable" }));
        }
      });
    }
  };
}
