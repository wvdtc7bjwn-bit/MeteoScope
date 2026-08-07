import assert from "node:assert/strict";
import { getPressureCenterDescriptor } from "../src/jma/weatherChart.js";

assert.deepEqual(
  getPressureCenterDescriptor("熱帯低気圧"),
  { kind: "low", centerType: "tropical-depression", label: "熱低" }
);
assert.deepEqual(
  getPressureCenterDescriptor("温帯低気圧"),
  { kind: "low", centerType: "extratropical-low", label: "温低" }
);
assert.deepEqual(
  getPressureCenterDescriptor("低気圧"),
  { kind: "low", centerType: "low", label: "低" }
);
assert.deepEqual(
  getPressureCenterDescriptor("高気圧"),
  { kind: "high", centerType: "high", label: "高" }
);
assert.deepEqual(
  getPressureCenterDescriptor("台風"),
  { kind: "typhoon", centerType: "typhoon", label: "台" }
);

console.log("Weather chart pressure-center labels: OK");
