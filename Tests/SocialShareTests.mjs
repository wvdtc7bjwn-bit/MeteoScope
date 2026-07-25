import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SOCIAL_SHARE_FORMATS,
  buildSocialShareFilename,
  sortEarthquakeObservationsForMap
} from "../src/socialShareCard.js";
import {
  getSocialSharePayload,
  setSocialSharePayload
} from "../src/socialShareState.js";

const [indexSource, appSource, leftPanelSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8")
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
assert.match(indexSource, /data-social-share-format="portrait"/);
assert.match(indexSource, /data-social-share-theme="light"/);
assert.doesNotMatch(indexSource, /<span>SNS投稿用PNG<\/span>/);
assert.match(appSource, /import\("\.\/ui\/socialShareModal\.js"\)/);
assert.match(leftPanelSource, /data-social-share="amedas"/);
assert.match(leftPanelSource, /data-social-share="earthquake"/);
assert.match(leftPanelSource, /items:\s*items\.map/);
assert.match(leftPanelSource, /coordinates:\s*selectedEarthquake\.coordinates/);

const modalSource = await readFile(new URL("../src/ui/socialShareModal.js", import.meta.url), "utf8");
assert.match(modalSource, /fetch\("\/data\/japan-prefectures\.geojson"\)/);
assert.match(modalSource, /new URL\("icons\/icon-192\.png", document\.baseURI\)/);
assert.match(modalSource, /appIcon:\s*appIconImage/);

const cardSource = await readFile(new URL("../src/socialShareCard.js", import.meta.url), "utf8");
assert.match(cardSource, /context\.drawImage\(appIcon,/);

console.log("Social share tests passed");
