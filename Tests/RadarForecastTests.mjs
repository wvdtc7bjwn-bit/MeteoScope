import assert from "node:assert/strict";

import { buildRadarFrames, findLatestRadarObservationIndex } from "../src/jma/radar.js";

const nowcastTimes = [
  { basetime: "20260929000000", validtime: "20260929000000", elements: ["hrpns"] },
  { basetime: "20260929000500", validtime: "20260929000500", elements: ["hrpns"] }
];
const rainfallTimes = [
  {
    basetime: "20260929001000",
    validtime: "20260929010500",
    member: "immed",
    elements: ["rasrf"]
  },
  {
    basetime: "20260929001000",
    validtime: "20260929020500",
    member: "immed",
    elements: ["rasrf"]
  },
  {
    basetime: "20260929001000",
    validtime: "20260929030500",
    member: "immed",
    elements: ["other"]
  }
];

const frames = buildRadarFrames(nowcastTimes, rainfallTimes);
const latestObservationIndex = findLatestRadarObservationIndex(frames);
const nowcastForecasts = frames.filter((frame) => frame.isForecast && !frame.isShortTermRainfallForecast);
const shortTermForecasts = frames.filter((frame) => frame.isShortTermRainfallForecast);

assert.equal(latestObservationIndex, 1);
assert.equal(nowcastForecasts.length, 12);
assert.equal(shortTermForecasts.length, 1);
assert.equal(shortTermForecasts[0].validtime, "20260929020500");
assert.equal(shortTermForecasts[0].member, "immed");
assert.match(
  shortTermForecasts[0].radarTileUrl,
  /\/jmatile\/data\/rasrf\/20260929001000\/immed\/20260929020500\/surf\/rasrf\/\{z\}\/\{x\}\/\{y\}\.png$/
);
assert.equal(frames.at(-1), shortTermForecasts[0]);

console.log("Radar forecast timeline tests passed.");
