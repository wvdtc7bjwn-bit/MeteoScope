import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildLightningFrames,
  buildLightningObservationUrl,
  buildLightningTileUrl,
  findLatestLightningObservationIndex
} from "../src/jma/lightning.js";

const frames = buildLightningFrames([
  {
    basetime: "20260726080000",
    validtime: "20260726080000",
    elements: ["thns"]
  },
  {
    basetime: "20260726081000",
    validtime: "20260726081000",
    elements: ["thns", "thns_nd"]
  },
  {
    basetime: "20260726081000",
    validtime: "20260726081000",
    elements: ["liden"]
  },
  {
    basetime: "20260726081000",
    validtime: "20260726082000",
    elements: ["thns"]
  },
  {
    basetime: "20260726080000",
    validtime: "20260726082000",
    elements: ["thns"]
  },
  {
    basetime: "20260726082000",
    validtime: "20260726082000",
    elements: ["liden"]
  }
]);

assert.deepEqual(
  frames.map((frame) => [frame.validtime, frame.isForecast]),
  [
    ["20260726080000", false],
    ["20260726081000", false],
    ["20260726082000", true]
  ]
);
assert.equal(findLatestLightningObservationIndex(frames), 1);
assert.equal(
  frames[1].lightningObservationUrl,
  "https://www.jma.go.jp/bosai/jmatile/data/nowc/20260726081000/none/20260726081000/surf/liden/data.geojson"
);
assert.equal(frames[2].lightningObservationUrl, null);
assert.equal(
  buildLightningTileUrl(frames[2]),
  "https://www.jma.go.jp/bosai/jmatile/data/nowc/20260726081000/none/20260726082000/surf/thns/{z}/{x}/{y}.png"
);
assert.equal(buildLightningObservationUrl(null), null);

const staleObservationFrames = buildLightningFrames([
  {
    basetime: "20260726080000",
    validtime: "20260726080000",
    elements: ["liden"]
  },
  {
    basetime: "20260726081000",
    validtime: "20260726081000",
    elements: ["thns"]
  }
]);
assert.equal(staleObservationFrames[0].lightningObservationUrl, null);

const [appSource, panelSource, mapSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8")
]);

assert.match(appSource, /fetchLightningTimes/);
assert.match(panelSource, /data-radar-overlay="lightning"/);
assert.match(panelSource, /data-mobile-lightning-slider/);
assert.match(panelSource, /isLightning && frame\?\.isCurrent[\s\S]*\? "現在"/);
assert.match(panelSource, /timeLabel: frameIndex === currentLightningIndex/);
assert.match(mapSource, /updateLightningLayer/);
assert.match(mapSource, /jma-nowcast-lightning-z/);
assert.match(mapSource, /lightning-observation-ground/);
assert.match(mapSource, /"text-field": "×"/);
assert.match(mapSource, /filter: \["!=", \["get", "type"\], 4\]/);
assert.match(mapSource, /moveLightningObservationLayersToFront\(map\)/);

console.log("Lightning tests passed.");
