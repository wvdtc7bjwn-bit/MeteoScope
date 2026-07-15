import assert from "node:assert/strict";
import { getEarthquakeTsunamiStatus } from "../workers/earthquake-realtime/src/earthquakeTsunamiStatus.js";

assert.equal(getEarthquakeTsunamiStatus({
  comments: {
    forecast: {
      text: "この地震による津波の心配はありません。",
      codes: ["0215"]
    }
  }
}), "心配なし");

assert.equal(getEarthquakeTsunamiStatus({
  comments: { forecast: { text: "若干の海面変動が予想されます。" } }
}), "若干の海面変動");

assert.equal(getEarthquakeTsunamiStatus({ tsunamiStatus: "津波注意報" }), "津波注意報");
assert.equal(
  getEarthquakeTsunamiStatus({ comments: { forecast: { codes: ["0215"] } } }),
  "心配なし"
);

console.log("Earthquake tsunami status tests passed");
