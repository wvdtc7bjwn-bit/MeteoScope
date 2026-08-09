import assert from "node:assert/strict";
import { getPressureCenterDescriptor } from "../src/jma/weatherChart.js";
import { getWeatherChartLegendItems } from "../src/ui/leftPanel.js";

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

assert.deepEqual(
  getWeatherChartLegendItems().map(([label]) => label),
  [
    "等圧線",
    "高気圧",
    "低気圧・熱帯低気圧・温帯低気圧",
    "台風",
    "寒冷前線",
    "温暖前線",
    "停滞前線",
    "閉塞前線"
  ]
);

console.log("Weather chart pressure-center and legend labels: OK");
