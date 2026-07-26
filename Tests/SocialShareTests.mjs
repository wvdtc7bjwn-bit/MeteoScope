import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SOCIAL_SHARE_FORMATS,
  buildSocialShareFilename,
  calculateTyphoonCircleTangents,
  sortEarthquakeObservationsForMap
} from "../src/socialShareCard.js";
import {
  getSocialSharePayload,
  setSocialSharePayload
} from "../src/socialShareState.js";

const [indexSource, appSource, leftPanelSource, styleSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

assert.deepEqual(SOCIAL_SHARE_FORMATS.portrait, {
  width: 1080,
  height: 1350,
  label: "縦長"
});
assert.equal(SOCIAL_SHARE_FORMATS.square.width, 1080);
assert.equal(SOCIAL_SHARE_FORMATS.square.height, 1080);
assert.equal(SOCIAL_SHARE_FORMATS.landscape.width, 1200);
assert.equal(SOCIAL_SHARE_FORMATS.landscape.height, 675);

const payload = {
  type: "earthquake",
  hypocenter: "テスト震央"
};
setSocialSharePayload("earthquake", payload);
const stored = getSocialSharePayload("earthquake");
assert.deepEqual(stored, payload);
stored.hypocenter = "変更";
assert.equal(getSocialSharePayload("earthquake").hypocenter, "テスト震央");
setSocialSharePayload("earthquake", null);
assert.equal(getSocialSharePayload("earthquake"), null);

assert.match(buildSocialShareFilename({ type: "amedas" }, "square"), /^meteoscope-amedas-square-.+\.png$/);
assert.match(buildSocialShareFilename({ type: "earthquake" }, "portrait"), /^meteoscope-earthquake-portrait-.+\.png$/);
assert.match(buildSocialShareFilename({ type: "typhoon" }, "landscape"), /^meteoscope-typhoon-landscape-.+\.png$/);
assert.match(buildSocialShareFilename({ type: "warning" }, "portrait"), /^meteoscope-warning-portrait-.+\.png$/);

const tangentCircles = [
  { x: 0, y: 0, radius: 10 },
  { x: 100, y: 0, radius: 20 }
];
const forecastTangents = calculateTyphoonCircleTangents(...tangentCircles);
assert.equal(forecastTangents.length, 2);
forecastTangents.forEach(([start, end]) => {
  assert.ok(Math.abs(Math.hypot(start.x, start.y) - tangentCircles[0].radius) < 0.0001);
  assert.ok(Math.abs(Math.hypot(end.x - 100, end.y) - tangentCircles[1].radius) < 0.0001);
});
assert.deepEqual(
  calculateTyphoonCircleTangents(
    { x: 0, y: 0, radius: 30 },
    { x: 10, y: 0, radius: 5 }
  ),
  []
);

assert.deepEqual(
  sortEarthquakeObservationsForMap([
    { intensity: "6強", name: "震度6強" },
    { intensity: "2", name: "震度2" },
    { intensity: "5弱", name: "震度5弱" },
    { intensity: "7", name: "震度7" }
  ]).map((item) => item.name),
  ["震度2", "震度5弱", "震度6強", "震度7"]
);

assert.match(indexSource, /id="social-share-modal"/);
assert.match(indexSource, /id="social-share-preview"/);
assert.match(indexSource, /id="social-share-map-button"/);
assert.match(indexSource, /data-social-share-format="portrait"/);
assert.match(indexSource, /data-social-share-theme="light"/);
assert.doesNotMatch(indexSource, /<span>SNS投稿用PNG<\/span>/);
assert.match(appSource, /import\("\.\/ui\/socialShareModal\.js"\)/);
assert.match(appSource, /function syncSocialShareMapButton\(/);
assert.match(appSource, /const payloadType = tabId === "warnings" \? "warning" : tabId/);
assert.match(appSource, /button\.dataset\.socialShare = label \? payloadType : ""/);
assert.match(appSource, /function renderLeftPanelState\(/);
assert.match(leftPanelSource, /function setWarningSocialSharePayload\(/);
assert.match(leftPanelSource, /setSocialSharePayload\("warning"/);
assert.match(leftPanelSource, /coordinates:\s*info\.coordinates \?\? info\.center/);
assert.match(leftPanelSource, /areaWarnings:\s*\(state\.data\?\.activeAreas \?\? \[\]\)\.map/);
assert.match(leftPanelSource, /data-social-share="amedas"/);
assert.match(leftPanelSource, /data-social-share="earthquake"/);
assert.match(leftPanelSource, /data-social-share="typhoon"/);
assert.match(styleSource, /\.social-share-map-button\s*\{[\s\S]*?left:\s*calc\(var\(--sidebar-width\) \+ 128px\)/);
assert.match(styleSource, /@media \(max-width: 800px\)[\s\S]*?\.social-share-map-button\s*\{[\s\S]*?left:\s*116px/);
assert.match(leftPanelSource, /items:\s*items\.map/);
assert.match(leftPanelSource, /coordinates:\s*selectedEarthquake\.coordinates/);
assert.match(leftPanelSource, /forecastTrack:\s*selectedTyphoon\.forecastTrack/);
assert.match(leftPanelSource, /strongWindRadius:\s*selectedTyphoon\.strongWindRadius/);
assert.match(leftPanelSource, /stormRadius:\s*selectedTyphoon\.stormRadius/);

const modalSource = await readFile(new URL("../src/ui/socialShareModal.js", import.meta.url), "utf8");
assert.match(modalSource, /fetch\("\/data\/japan-prefectures\.geojson"\)/);
assert.match(modalSource, /import\("\.\.\/map\/data\/worldLandGeoJson\.js"\)/);
assert.match(modalSource, /import\("\.\.\/map\/data\/worldCountriesGeoJson\.js"\)/);
assert.match(modalSource, /new URL\("icons\/icon-192\.png", document\.baseURI\)/);
assert.match(modalSource, /appIcon:\s*appIconImage/);
assert.match(modalSource, /title:\s*"台風情報を画像にする"/);
assert.match(modalSource, /title:\s*"現在地付近の発表状況を画像にする"/);
assert.match(modalSource, /loadMunicipalityLookup\(\)/);
assert.match(modalSource, /warningMunicipalities,/);

const cardSource = await readFile(new URL("../src/socialShareCard.js", import.meta.url), "utf8");
assert.match(cardSource, /context\.drawImage\(appIcon,/);
assert.match(cardSource, /function drawTyphoonCard\(/);
assert.match(cardSource, /function drawWarningCard\(/);
assert.match(cardSource, /function drawWarningLocalMap\(/);
assert.match(cardSource, /function drawWarningMunicipalityGeometry\(/);
assert.match(cardSource, /function drawWarningMapLegend\(/);
assert.match(cardSource, /payload\?\.type === "warning"/);
assert.match(cardSource, /function drawTyphoonMap\(/);
assert.doesNotMatch(cardSource, /drawTyphoonPositionRow/);
assert.match(cardSource, /function drawTyphoonRadiusArea\(/);
assert.match(cardSource, /function buildTyphoonForecastLine\(/);
assert.match(cardSource, /function drawTyphoonForecastEnvelope\(/);
assert.match(cardSource, /function calculateTyphoonCircleTangents\(/);
assert.match(cardSource, /function destinationPointForTyphoonCard\(/);
assert.match(cardSource, /forecast\?\.radius/);
assert.doesNotMatch(cardSource, /strokeStyle:\s*"rgba\(255,\s*255,\s*255,\s*0\.9\)"/);
assert.match(cardSource, /context\.fillStyle = theme\.text;\s*context\.beginPath\(\);\s*context\.arc\(pointX, pointY, radius/);
assert.match(cardSource, /typhoonCenter:\s*"#ffffff"/);
assert.match(cardSource, /typhoonCenter:\s*"#000000"/);
assert.match(cardSource, /context\.strokeStyle = "rgba\(8, 24, 43, 0\.82\)";[\s\S]*?context\.strokeStyle = theme\.typhoonCenter/);
assert.doesNotMatch(cardSource, /context\.arc\(pointX, pointY, radius, 0, Math\.PI \* 2\);\s*context\.fill\(\);\s*context\.stroke\(\)/);
assert.match(cardSource, /進路・風域/);
assert.doesNotMatch(cardSource, /radius \* 0\.46, Math\.PI \* 0\.2/);

console.log("Social share tests passed");
