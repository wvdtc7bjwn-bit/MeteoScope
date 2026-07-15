import assert from "node:assert/strict";
import {
  formatTyphoonTransitionStatus,
  getTyphoonTransitionStatus,
  normalizeTyphoon
} from "../src/jma/typhoon.js";

assert.equal(
  formatTyphoonTransitionStatus(getTyphoonTransitionStatus({ jp: "温帯低気圧" }), "2609"),
  "台風9号は温帯低気圧に変わりました"
);

assert.equal(
  formatTyphoonTransitionStatus(getTyphoonTransitionStatus("TD"), "2612"),
  "台風12号は熱帯低気圧に変わりました"
);

const typhoon = normalizeTyphoon({
  id: "TC2609",
  typhoonNumber: "2609",
  name: "バービー",
  category: { jp: "温帯低気圧" },
  center: [35, 140]
});

assert.equal(typhoon.transitionStatus, "台風9号は温帯低気圧に変わりました");
assert.equal(typhoon.details.size, "-");
assert.equal(typhoon.details.strength, "-");
assert.equal(typhoon.details.pressure, "-");
assert.equal(typhoon.details.maxWind, "-");
assert.equal(typhoon.details.maxGust, "-");
assert.equal(typhoon.details.direction, "-");
assert.equal(typhoon.details.speed, "-");
assert.equal(typhoon.updatedAt, "-");

console.log("Typhoon transition and missing-value tests passed.");
