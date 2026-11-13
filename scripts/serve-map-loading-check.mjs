// A loopback-only manual browser fixture, excluded from the production build.
// MAP_QA_GEOMETRY=geojson exercises the supported fallback with the same UI.
import { createServer } from "vite";
process.env.VITE_MAP_GEOMETRY = process.env.MAP_QA_GEOMETRY ?? "vector";
const server = await createServer({
  mode: "production",
  plugins: [{
    name: "map-loading-check-optional-delay",
    configureServer(server) {
      server.middlewares.use("/qa-optional.geojson", (_request, response) => {
        const timer = setTimeout(() => {
          response.setHeader("Content-Type", "application/json");
          response.end('{"type":"FeatureCollection","features":[]}');
        }, 20000);
        response.on("close", () => clearTimeout(timer));
      });
    }
  }],
  server: {host: "127.0.0.1", port: 5188, strictPort: true}
});
await server.listen();
console.log("http://localhost:5188/Tests/browser/initial-map-loading.html?case=slow");
