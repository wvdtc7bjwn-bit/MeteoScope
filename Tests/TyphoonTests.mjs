import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatTyphoonSummaryName,
  formatTyphoonTransitionStatus,
  getTyphoonSystemType,
  getTyphoonTransitionStatus,
  normalizeTyphoon
} from "../src/jma/typhoon.js";
import {
  buildEnsembleMeanSystem,
  buildWorldTyphoonTimeline,
  formatWorldTyphoonSystemLabel,
  getWorldTyphoonModel,
  isWorldTyphoonControlMember,
  selectWorldTyphoonForecastPosition,
  selectWorldTyphoonForecastPositions,
  selectWorldTyphoonGenesisSystems,
  selectWorldTyphoonSystem
} from "../src/worldTyphoon.js";
import { splitLineAtAntimeridian } from "../src/map/geoLine.js";
import {
  parseTyphoonRadarTime,
  selectTyphoonRadarFrame
} from "../src/typhoonRadarOverlay.js";
import {
  buildStormWarningAreaLineSegments,
  destinationPoint
} from "../src/typhoonGeometry.js";

assert.equal(formatTyphoonSummaryName("台風第15号 (チャンホン)"), "台風第15号");
assert.equal(formatTyphoonSummaryName("台風第15号（チャンホン）"), "台風第15号");
assert.equal(formatTyphoonSummaryName("熱帯低気圧b"), "熱帯低気圧b");

const warningAreaSegments = buildStormWarningAreaLineSegments({
  arc: [{ center: [130, 20], radius: 100, start: 350, end: 10 }],
  line: [[[130, 20], [131, 21]]]
});
assert.equal(warningAreaSegments.length, 2);
assert.ok(warningAreaSegments[0].length >= 9);
assert.deepEqual(warningAreaSegments[1], [[130, 20], [131, 21]]);
assert.ok(warningAreaSegments[0].every((point) => (
  point.length === 2 && point.every(Number.isFinite)
)));
const eastOfCenter = destinationPoint([130, 20], 100, 90);
assert.ok(eastOfCenter[0] > 130);
assert.ok(Math.abs(eastOfCenter[1] - 20) < 0.1);

assert.equal(
  parseTyphoonRadarTime("2026/08/07 09:00"),
  Date.parse("2026-08-07T00:00:00.000Z")
);
const bulletinRadarSelection = selectTyphoonRadarFrame([
  {
    validtime: "20260807000000",
    label: "2026/08/07 09:00",
    radarTileUrl: "https://example.test/observation.png",
    isForecast: false
  },
  {
    validtime: "20260807000000",
    label: "2026/08/07 09:00",
    radarTileUrl: "https://example.test/forecast.png",
    isForecast: true
  }
], "2026/08/07 09:00");
assert.equal(bulletinRadarSelection?.frame?.radarTileUrl, "https://example.test/observation.png");
assert.equal(
  selectTyphoonRadarFrame([
    {
      validtime: "20260806230000",
      radarTileUrl: "https://example.test/old.png",
      isForecast: false
    }
  ], "2026/08/07 09:00"),
  null
);

const worldTyphoonModelColors = [
  "ecmwf",
  "ifs-hres",
  "aifs-ens",
  "aifs-single",
  "gefs",
  "gefs-mean"
].map((modelId) => getWorldTyphoonModel(modelId).color);
assert.equal(new Set(worldTyphoonModelColors).size, worldTyphoonModelColors.length);

assert.equal(
  formatTyphoonTransitionStatus(getTyphoonTransitionStatus({ jp: "温帯低気圧" }), "2609"),
  "台風9号は温帯低気圧に変わりました"
);

assert.equal(
  formatTyphoonTransitionStatus(getTyphoonTransitionStatus("TD"), "2612"),
  "台風12号は熱帯低気圧に変わりました"
);

assert.equal(getTyphoonSystemType({ jp: "温帯低気圧" }), "温帯低気圧");
assert.equal(getTyphoonSystemType("TD"), "熱帯低気圧");
assert.equal(getTyphoonSystemType("台風"), null);

assert.equal(
  formatTyphoonTransitionStatus(getTyphoonTransitionStatus("TD"), "b"),
  null
);

const newTropicalDepression = normalizeTyphoon({
  id: "TD-b",
  typhoonNumber: "b",
  category: "TD",
  center: [130, 20]
});

assert.equal(newTropicalDepression.transitionStatus, null);

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

const jmaNamedTyphoon = normalizeTyphoon({
  tropicalCyclone: "TC2609",
  typhoonNumber: "2609",
  forecast: [
    {
      part: "title",
      typhoonNumber: "2609",
      name: { jp: "ドルフィン", en: "DOLPHIN" },
      issue: { JST: "2026-07-31T06:00:00+09:00" }
    },
    {
      advancedHours: 0,
      center: { lat: 25, lon: 135 },
      validtime: { JST: "2026-07-31T06:00:00+09:00" }
    }
  ],
  specifications: [
    {
      advancedHours: 0,
      location: "日本のはるか東"
    }
  ]
});
assert.equal(jmaNamedTyphoon.name, "台風第9号 (ドルフィン)");
assert.equal(jmaNamedTyphoon.nameEn, "Typhoon No. 9 (DOLPHIN)");
assert.equal(jmaNamedTyphoon.details.nameEn, "Typhoon No. 9 (DOLPHIN)");
assert.equal(jmaNamedTyphoon.details.position, "日本のはるか東");

const jmaLowPressureForecast = normalizeTyphoon({
  tropicalCyclone: "TD-b",
  typhoonNumber: "b",
  forecast: [
    { part: "title", category: "TD" },
    {
      advancedHours: 0,
      center: { lat: 20, lon: 130 },
      validtime: { JST: "2026-08-09T00:00:00+09:00" }
    },
    {
      advancedHours: 24,
      category: { jp: "熱帯低気圧" },
      center: { lat: 22, lon: 132 },
      probabilityCircle: { radius: 150 },
      validtime: { JST: "2026-08-10T00:00:00+09:00" }
    }
  ],
  specifications: []
});
assert.equal(jmaLowPressureForecast.forecastCircles[0].details.maxWind, "-");
assert.equal(jmaLowPressureForecast.forecastCircles[0].details.maxGust, "-");
assert.equal(jmaLowPressureForecast.forecastCircles[0].details.systemType, "熱帯低気圧");

const selectedWorldSystem = selectWorldTyphoonSystem({
  systems: [
    { id: "far", name: "FAR", kind: "named", memberCount: 51, observedCenter: [-60, 20] },
    { id: "near", name: "NEAR", kind: "named", memberCount: 51, observedCenter: [141, 34] }
  ]
}, { center: [140, 35] });
assert.equal(selectedWorldSystem?.id, "near");

const selectedGenesisSystems = selectWorldTyphoonGenesisSystems({
  systems: [
    {
      id: "candidate-short",
      kind: "genesis",
      memberCount: 20,
      observedCenter: [132, 12],
      members: [{ points: [{ stepHours: 24 }] }]
    },
    {
      id: "candidate-strong",
      kind: "genesis",
      memberCount: 35,
      observedCenter: [140, 15],
      members: [{ points: [{ stepHours: 72 }] }]
    },
    {
      id: "below-threshold",
      kind: "genesis",
      memberCount: 19,
      observedCenter: [145, 18],
      members: [{ points: [{ stepHours: 96 }] }]
    },
    { id: "named-system", kind: "named", memberCount: 51, observedCenter: [141, 34] }
  ]
});
assert.deepEqual(
  selectedGenesisSystems.map((system) => system.id),
  ["candidate-strong", "candidate-short"]
);
assert.equal(getWorldTyphoonModel("gefs").label, "NOAA/NCEP GEFS");
assert.equal(getWorldTyphoonModel("ifs-hres").label, "ECMWF IFS HRES");
assert.equal(getWorldTyphoonModel("aifs-ens").label, "ECMWF AIFS ENS");
assert.equal(getWorldTyphoonModel("aifs-single").label, "ECMWF AIFS Single");
assert.equal(getWorldTyphoonModel("gefs-mean").label, "NOAA/NCEP GEFS Ensemble Mean");
assert.equal(
  formatWorldTyphoonSystemLabel({ id: "17W", name: "CHAN-HOM" }),
  "17W · CHAN-HOM"
);
assert.equal(
  formatWorldTyphoonSystemLabel({ id: "70W", name: "70W" }),
  "70W"
);
const meanSystem = buildEnsembleMeanSystem({
  id: "mean-test",
  memberCount: 2,
  members: [
    { points: [
      { coordinates: [179, 10], stepHours: 0, pressureHpa: 1000, windMs: 10 },
      { coordinates: [178, 12], stepHours: 6, pressureHpa: 990, windMs: 15 }
    ] },
    { points: [
      { coordinates: [-179, 12], stepHours: 0, pressureHpa: 998, windMs: 12 },
      { coordinates: [-178, 14], stepHours: 6, pressureHpa: 988, windMs: 17 }
    ] }
  ]
});
assert.equal(Math.abs(meanSystem.observedCenter[0]), 180);
assert.deepEqual(meanSystem.controlPoints.map((point) => point.coordinates[1]), [11, 13]);
assert.deepEqual(meanSystem.controlPoints.map((point) => point.pressureHpa), [999, 989]);
const timelineSystem = {
  forecastBaseTime: "2026-07-25T00:00:00.000Z",
  controlPoints: [
    { coordinates: [140, 20], stepHours: 0, pressureHpa: 1000, windMs: 12 },
    { coordinates: [142, 22], stepHours: 6, pressureHpa: 992, windMs: 18 }
  ]
};
assert.deepEqual(
  buildWorldTyphoonTimeline([{ timelineSystems: [timelineSystem] }]),
  ["2026-07-25T00:00:00.000Z", "2026-07-25T06:00:00.000Z"]
);
assert.deepEqual(
  selectWorldTyphoonForecastPosition(timelineSystem, "2026-07-25T06:00:00.000Z"),
  {
    coordinates: [142, 22],
    stepHours: 6,
    pressureHpa: 992,
    windMs: 18,
    validTime: "2026-07-25T06:00:00.000Z"
  }
);
assert.deepEqual(
  selectWorldTyphoonForecastPosition(timelineSystem, "2026-07-25T03:00:00.000Z"),
  {
    coordinates: [141, 21],
    stepHours: 3,
    pressureHpa: 996,
    windMs: 15,
    validTime: "2026-07-25T03:00:00.000Z"
  }
);
assert.deepEqual(
  selectWorldTyphoonForecastPosition({
    forecastBaseTime: "2026-07-25T00:00:00.000Z",
    controlPoints: [
      { coordinates: [179, 10], stepHours: 0 },
      { coordinates: [-179, 12], stepHours: 6 }
    ]
  }, "2026-07-25T03:00:00.000Z")?.coordinates,
  [180, 11]
);
assert.equal(
  selectWorldTyphoonForecastPosition(timelineSystem, "2026-07-25T12:00:00.000Z"),
  null
);
const ensemblePositions = selectWorldTyphoonForecastPositions({
  ...timelineSystem,
  members: [
    { id: 0, points: timelineSystem.controlPoints },
    { id: 1, points: [
      { coordinates: [140.5, 20.5], stepHours: 0 },
      { coordinates: [142.5, 22.5], stepHours: 6 }
    ] },
    { id: 2, points: [
      { coordinates: [139.5, 19.5], stepHours: 0 },
      { coordinates: [141.5, 21.5], stepHours: 6 }
    ] }
  ]
}, "2026-07-25T06:00:00.000Z");
assert.equal(ensemblePositions.length, 3);
assert.deepEqual(
  ensemblePositions.map(({ trackType, memberId }) => [trackType, memberId]),
  [["control", 0], ["member", 1], ["member", 2]]
);
assert.deepEqual(
  ensemblePositions.map(({ memberIndex }) => memberIndex),
  [null, 1, 2]
);
assert.deepEqual(
  ensemblePositions.map(({ position }) => position.coordinates),
  [[142, 22], [142.5, 22.5], [141.5, 21.5]]
);
const nonZeroControlSystem = {
  forecastBaseTime: "2026-07-25T00:00:00.000Z",
  controlPoints: timelineSystem.controlPoints,
  controlCoordinates: timelineSystem.controlPoints.map((point) => point.coordinates),
  members: [
    {
      id: 1,
      points: timelineSystem.controlPoints,
      coordinates: timelineSystem.controlPoints.map((point) => point.coordinates)
    },
    {
      id: 2,
      points: [
        { coordinates: [140.5, 20.5], stepHours: 0 },
        { coordinates: [142.5, 22.5], stepHours: 6 }
      ],
      coordinates: [[140.5, 20.5], [142.5, 22.5]]
    }
  ]
};
assert.equal(isWorldTyphoonControlMember(nonZeroControlSystem, nonZeroControlSystem.members[0]), true);
assert.equal(isWorldTyphoonControlMember(nonZeroControlSystem, nonZeroControlSystem.members[1]), false);
assert.deepEqual(
  selectWorldTyphoonForecastPositions(nonZeroControlSystem, "2026-07-25T06:00:00.000Z")
    .map(({ trackType, memberId }) => [trackType, memberId]),
  [["control", 0], ["member", 2]]
);
assert.deepEqual(
  splitLineAtAntimeridian([[170, 10], [-170, 20]]),
  [
    [[170, 10], [180, 15]],
    [[-180, 15], [-170, 20]]
  ]
);

const [
  appSource,
  panelSource,
  mapSource,
  styleSource,
  targetModalSource,
  indexSource,
  worldSource,
  configSource,
  workflowSource,
  noaaScriptSource,
  ledgerSource
] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/worldTyphoonTargetModal.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/worldTyphoon.js", import.meta.url), "utf8"),
  readFile(new URL("../src/config.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/world-typhoon-data.yml", import.meta.url), "utf8"),
  readFile(new URL("../scripts/update-noaa-gefs-tropical-cyclones.py", import.meta.url), "utf8"),
  readFile(new URL("../DATA_SOURCES.md", import.meta.url), "utf8")
]);
assert.match(appSource, /setupTyphoonForecastModeControls/);
assert.match(panelSource, /data-typhoon-forecast-mode="jma"/);
assert.match(panelSource, /data-typhoon-forecast-mode="world"/);
assert.match(panelSource, />各国予想<\/button>/);
assert.match(panelSource, /data-world-typhoon-model-toggle=/);
assert.match(panelSource, /--world-model-color:/);
assert.match(panelSource, /data-world-typhoon-time-slider/);
assert.match(panelSource, /各国予想の予報時刻/);
assert.match(panelSource, /interpolateWeatherTimelineTime/);
assert.match(panelSource, /選択時刻の予想位置/);
assert.match(panelSource, /基準メンバーの進路/);
assert.match(panelSource, /各予想メンバーの進路/);
assert.match(panelSource, /線と点の色は各モデルボタンの色に対応します/);
assert.match(styleSource, /grid-template-columns:\s*repeat\(6/);
assert.match(appSource, /activeWorldTyphoonModels/);
assert.match(configSource, /WORLD_TYPHOON_DATA_REFRESH_INTERVAL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
assert.match(appSource, /WORLD_TYPHOON_DATA_REFRESH_INTERVAL_MS/);
assert.match(appSource, /function refreshActiveWorldTyphoonForecasts\(\)/);
assert.match(appSource, /if \(tab\.id === "typhoon"\) await refreshActiveWorldTyphoonForecasts\(\);/);
assert.match(appSource, /loadedAt:\s*Date\.now\(\)/);
assert.match(worldSource, /cache:\s*"no-store"/);
assert.doesNotMatch(worldSource, /import\.meta\.env\?\.DEV\s*\?\s*"\/data\/world-typhoon-forecast/);
assert.match(
  appSource,
  /function focusSelectedTyphoon\(\{ includeWorldForecast = false \} = \{\}\)[\s\S]*?if \(!includeWorldForecast\) return;[\s\S]*?buildWorldTyphoonFocusCoordinates\(displayData\)/
);
assert.match(appSource, /function buildWorldTyphoonFocusCoordinates\(displayData = \{\}\)/);
assert.match(appSource, /function buildTyphoonFocusCoordinates\(typhoon\)[\s\S]*?typhoon\.strongWindRadius[\s\S]*?typhoon\.stormRadius[\s\S]*?stormWarningGroups[\s\S]*?collectTyphoonStormWarningShapeCoordinates/);
assert.match(appSource, /function collectTyphoonFocusCircleCoordinates\(circles = \[\]\)/);
assert.match(appSource, /function collectTyphoonStormWarningShapeCoordinates\(shape\)/);
assert.match(appSource, /hasSelectedTargets[\s\S]*?primarySystemId[\s\S]*?layer\.forecastPositions/);
assert.doesNotMatch(appSource, /getWorldTyphoonFocusCoordinates/);
assert.match(appSource, /updateWorldTyphoonForecastPositions/);
assert.match(appSource, /interpolateWorldTime:\s*true/);
assert.match(appSource, /forecastPositions:/);
assert.match(appSource, /systems:\s*forecastState\.data\?\.systems\s*\?\?\s*\[\]/);
assert.match(appSource, /const worldForecastTargets = worldForecastModelStates/);
assert.match(appSource, /selectedWorldForecastTargetKeys:\s*activeWorldTyphoonTargetKeys/);
assert.match(appSource, /timelineSystems:\s*systems/);
assert.match(appSource, /selectedWorldForecastTargetKeys\.has\(`/);
assert.match(targetModalSource, /selectedKeys:\s*\[\]/);
assert.match(targetModalSource, /selectedKeys\.includes\(option\.key\)/);
assert.match(targetModalSource, /data-world-typhoon-target-key/);
assert.match(targetModalSource, /\"対象選択\"/);
assert.match(targetModalSource, /\"各国予想\"/);
assert.match(targetModalSource, /\"すべての対象を表示\"/);
assert.doesNotMatch(targetModalSource, /縺|繧|蜷|蟇|雎|譛|鬚|莠|逋|蜿/);
assert.match(indexSource, /id="world-typhoon-target-button"/);
assert.match(indexSource, /id="typhoon-radar-overlay-button"/);
assert.match(indexSource, /id="world-typhoon-target-modal"/);
assert.match(styleSource, /\.map-world-typhoon-target-button/);
assert.match(styleSource, /\.map-typhoon-radar-overlay-button/);
assert.match(appSource, /function toggleTyphoonRadarOverlay\(\)/);
assert.match(appSource, /typhoonRadarOverlayStatus/);
assert.match(mapSource, /typhoonBulletinRadarVisible/);
assert.match(mapSource, /worldForecastLayers/);
assert.match(mapSource, /WORLD_TYPHOON_MODELS/);
assert.match(mapSource, /renderWorldCopies:\s*true/);
assert.match(mapSource, /systems\.flatMap\(\(system\)\s*=>\s*createWorldTyphoonFeatures/);
assert.doesNotMatch(mapSource, /candidate\.members\s*\?\?\s*\[\]\)\.slice\(0,\s*3\)/);
assert.match(mapSource, /type:\s*"MultiLineString"/);
assert.match(mapSource, /forecastCenter:\s*formatTyphoonForecastCenter\(circle\.center\)/);
assert.match(mapSource, /function parseTyphoonForecastCenter\(value\)/);
assert.match(mapSource, /function positionMapInfoConnector\(cardRect\)/);
assert.match(styleSource, /\.map-info-connector\s*\{/);
assert.match(panelSource, /mobile-dock-horizontal-swipe/);
assert.match(panelSource, /地図に表示/);
assert.match(panelSource, /<dl class="typhoon-world-summary">/);
assert.match(panelSource, /<table class="typhoon-world-candidate-list">/);
assert.match(panelSource, /<section class="typhoon-analysis-panel" aria-label="台風の解析値">/);
assert.match(panelSource, /class="typhoon-analysis-primary"/);
assert.match(panelSource, /class="typhoon-analysis-classification" aria-label="台風の大きさと強さ"/);
assert.match(panelSource, /class="typhoon-analysis-classification-item is-\$\{kind\}\$\{toneClass\}"/);
assert.match(panelSource, /function getTyphoonClassificationItems\(details = \{\}\)/);
assert.match(panelSource, /\.filter\(\(\[, value\]\) => value && value !== "-"\)/);
assert.match(panelSource, /\$\{classificationMarkup\}\s*<dl class="typhoon-analysis-primary">/);
assert.match(panelSource, /const classificationItems = getTyphoonClassificationItems\(details\)/);
assert.match(panelSource, /const summaryClassificationItems = getTyphoonClassificationItems\(activeTyphoon\?\.details\)/);
assert.match(panelSource, /class="mobile-dock-typhoon-title-row"/);
assert.match(panelSource, /class="mobile-dock-typhoon-classification is-\$\{kind\}\$\{toneClass\}"/);
assert.match(panelSource, /sizeText\.includes\("超大型"\)/);
assert.match(panelSource, /sizeText\.includes\("大型"\)/);
assert.match(panelSource, /strengthText\.includes\("猛烈"\)/);
assert.match(panelSource, /strengthText\.includes\("非常に強"\)/);
assert.match(styleSource, /\.typhoon-analysis-classification-item\.is-size\.is-super-large/);
assert.match(styleSource, /\.typhoon-analysis-classification-item\.is-strength\.is-violent/);
assert.match(styleSource, /\.typhoon-analysis-classification-item\.is-strength\.is-strong/);
assert.match(styleSource, /\.mobile-dock-typhoon-classification\.is-size\.is-super-large/);
assert.match(styleSource, /\.mobile-dock-typhoon-classification\.is-strength\.is-strong/);
assert.match(styleSource, /\.mobile-dock-typhoon-classifications\s*\{[\s\S]*flex-direction:\s*column/);
assert.match(panelSource, /class="typhoon-analysis-movement"/);
assert.match(panelSource, /class="typhoon-select-count"/);
assert.match(panelSource, /class="typhoon-analysis-position"/);
assert.match(panelSource, /const positionMarkup = details\.position !== "-"/);
assert.match(panelSource, /\$\{positionMarkup\}\s*<dl class="typhoon-analysis-movement">/);
assert.match(styleSource, /\.typhoon-analysis-position\s*,\s*\.typhoon-analysis-movement/);
assert.match(styleSource, /\.typhoon-analysis-primary[\s\S]*grid-template-columns:\s*repeat\(3/);
assert.match(styleSource, /\.typhoon-analysis-classification\s*\{[\s\S]*display:\s*flex/);
assert.match(panelSource, /Development candidates/);
assert.match(panelSource, /Forecast range/);
assert.match(panelSource, /Development probability/);
assert.match(
  panelSource,
  /track distributions and tropical-disturbance candidates that may develop into typhoons/
);
assert.match(panelSource, /Loading \$\{modelLabel\} forecasts/);
assert.match(appSource, /function localizeTyphoonForDisplay/);
assert.doesNotMatch(panelSource, /<aside class="typhoon-world-attribution">/);
assert.match(mapSource, /typhoon-world-ensemble/);
assert.match(mapSource, /typhoon-world-control/);
assert.doesNotMatch(mapSource, /id:\s*"typhoon-world-genesis-center"/);
assert.doesNotMatch(mapSource, /id:\s*"typhoon-world-center"/);
assert.match(mapSource, /WORLD_TYPHOON_POSITION_SOURCE_ID/);
assert.match(mapSource, /typhoon-world-forecast-member-position/);
assert.match(mapSource, /typhoon-world-forecast-position-halo/);
assert.match(mapSource, /typhoon-world-forecast-position/);
assert.match(mapSource, /typhoon-world-forecast-position-anchor/);
assert.match(mapSource, /markerRadius:\s*style\.positionRadius/);
assert.match(styleSource, /var\(--world-model-color/);
assert.match(mapSource, /modelId:\s*layer\.modelInfo\?\.id/);
assert.match(mapSource, /style\.palette\[paletteIndex\]/);
assert.match(mapSource, /positionRadius:\s*11/);
assert.match(mapSource, /代表進路・加工済み/);
assert.match(mapSource, /layer\.forecastPositions/);
assert.ok(
  panelSource.indexOf('if (tabId === "typhoon" && data?.worldForecastMode)')
    < panelSource.indexOf("function renderRadarControls")
);
assert.match(panelSource, /発達候補/);
assert.match(workflowSource, /world-forecast-data/);
assert.match(workflowSource, /world-typhoon-forecast-gefs\.json/);
assert.match(workflowSource, /world-typhoon-forecast-ifs-hres\.json/);
assert.match(workflowSource, /world-typhoon-forecast-aifs-ens\.json/);
assert.match(workflowSource, /world-typhoon-forecast-aifs-single\.json/);
assert.match(noaaScriptSource, /NOAA\/NCEP Global Ensemble Forecast System/);
assert.match(ledgerSource, /Creative Commons Attribution 4\.0 International/);
assert.match(ledgerSource, /NOAA\/NCEP GEFS/);

console.log("Typhoon JMA compatibility and ECMWF/NOAA world-forecast tests passed.");
