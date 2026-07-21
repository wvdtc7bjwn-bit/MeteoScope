import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JMA_DAILY_RETENTION_DAYS,
  parseJmaDailyHypocenterHtml
} from "../workers/earthquake-realtime/src/jmaDailyHypocenters.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [worker, wrangler, migration, pagesRoute] = await Promise.all([
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "src", "index.js"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "wrangler.toml"), "utf8"),
  fs.readFile(path.join(root, "workers", "earthquake-realtime", "migrations", "0003_remove_dmdata.sql"), "utf8"),
  fs.readFile(path.join(root, "functions", "api", "earthquakes", "[[path]].js"), "utf8")
]);

assert.equal(JMA_DAILY_RETENTION_DAYS, 731);
assert.match(worker, /pathname !== "\/distribution"/u);
assert.doesNotMatch(worker, /DMDATA|DM-D\.S\.S|EARTHQUAKE_HUB/u);
assert.doesNotMatch(wrangler, /^DMDATA_[A-Z_]+\s*=/mu);
assert.doesNotMatch(wrangler, /durable_objects/u);
assert.match(wrangler, /deleted_classes\s*=\s*\["MeteoScopeEarthquakeHub"\]/u);
assert.match(wrangler, /binding = "EQ_D1"/u);
assert.match(migration, /DROP TABLE IF EXISTS earthquake_history/u);
assert.match(migration, /DROP TABLE IF EXISTS station_intensities/u);
assert.match(migration, /DROP TABLE IF EXISTS tsunami_history/u);
assert.match(pagesRoute, /HYPOCENTER_ARCHIVE/u, "震央分布WorkerのService bindingを使用する");

const parsed = parseJmaDailyHypocenterHtml(`
  <html><body><pre>
  2026 07 20 01:02 03.4 35° 00.0'N 140° 00.0'E 10 2.5 千葉県東方沖
  </pre></body></html>
`, "2026-07-20");
assert.ok(Array.isArray(parsed));

console.log("JMA hypocenter archive worker tests passed.");
