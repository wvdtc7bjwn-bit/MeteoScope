import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { localizeText } from "../src/ui/locale.js";
import { EPICENTER_NAMES_EN, MUNICIPALITY_ROMAJI } from "../src/ui/placeNamesEn.generated.js";
import { createPlaceNameIndex, loadPlaceNameData } from "../src/ui/placeNameData.js";
import { normalizePlaceNameKey } from "../src/ui/placeNameAliases.js";
import { outputUrl, renderPlaceNameTranslations } from "../scripts/build-place-name-translations.mjs";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));
const [regions, gazetteer, stations] = await Promise.all([
  readJson("jma-earthquake-epicenter-regions.geojson"),
  readJson("gsi-place-names-romaji.json"),
  readJson("jma-intensity-stations.json")
]);
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

test("bundled names reproduce the source data without extra geometry or duplicate keys", async () => {
  assert.equal((await readFile(outputUrl, "utf8")).replaceAll("\r\n", "\n"), renderPlaceNameTranslations(regions, gazetteer));
  assert.ok(Object.keys(MUNICIPALITY_ROMAJI).length > 1700);
  assert.throws(() => renderPlaceNameTranslations({ features: [{ properties: { name: "テスト" } }] }, gazetteer));
  const conflict = structuredClone(regions.features[0]);
  conflict.properties.name_en = "Conflicting name";
  assert.throws(() => renderPlaceNameTranslations({ features: [...regions.features, conflict] }, gazetteer), /Conflicting/);
});

test("all current epicenter names and bundled municipality names work before network requests", () => {
  assert.equal(regions.features.length, 332);
  for (const { properties: { name } } of regions.features) {
    assert.ok(EPICENTER_NAMES_EN[name], name);
    const english = localizeText(name, "en");
    assert.ok(!japanese.test(english), `${name}: ${english}`);
    assert.equal(localizeText(name, "ja"), name);
    assert.equal(localizeText(english, "en"), english);
  }
  for (const name of Object.keys(MUNICIPALITY_ROMAJI)) {
    assert.ok(!japanese.test(localizeText(name, "en")), name);
  }
});

test("reported names, variant glyphs, and qualified observation station labels", () => {
  const cases = new Map([
    ["関東東方沖", "Off the east Coast of Kanto"],
    ["渡島地方東部", "Eastern Oshima Region, Hokkaido"],
    ["瀬戸内海中部", "Central Setonaikai Sea"],
    ["飛騨市", "Hida City"], ["飛驒市", "Hida City"],
    ["貝塚市", "Kaizuka City"], ["宝塚市", "Takarazuka City"],
    ["六ヶ所村", "Rokkasho"], ["青ヶ島村", "Aogashima"],
    ["檮原町", "Yusuhara"],
    ["渡島森町御幸町", "Oshima / Mori station"],
    ["京都右京区太秦", "Kyoto Ukyo-ku station"],
    ["飛騨市神岡町東町＊", "Hida City station"],
    ["新千歳空港", "New Chitose Airport"]
  ]);
  for (const [name, english] of cases) {
    assert.equal(localizeText(name, "en"), english, name);
    assert.equal(localizeText(name, "ja"), name, name);
  }
  // Current station names must not turn into mixed labels such as 飛騨 City.
  // Localities without verified readings retain the existing "City station"
  // fallback; this check does not claim full locality-level translations.
  for (const station of stations) assert.ok(!japanese.test(localizeText(station.name, "en")), station.name);
  assert.equal(normalizePlaceNameKey("ケニア"), "ケニア");
  assert.equal(localizeText("11/13 19:42発生 · 関東東方沖", "en"),
    "Occurred 11/13 19:42 JST · Off the east Coast of Kanto");
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferredRequests() {
  const pending = [];
  const fetchImpl = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    pending.push({ url, options, resolve: (data) => resolve({ ok: true, json: async () => data }) });
  });
  return { pending, fetchImpl };
}

test("local names update while remote AMeDAS is stalled, and response order cannot change precedence", async () => {
  const results = [];
  for (const order of [[0, 1], [1, 0]]) {
    const { pending, fetchImpl } = deferredRequests();
    const updates = [];
    const done = loadPlaceNameData((index) => updates.push(index), { fetchImpl });
    const responses = [{ names: { "テスト湾": "Gazetteer Bay" } }, { x: { kjName: "テスト湾", enName: "Station Bay" } }];
    pending[order[0]].resolve(responses[order[0]]);
    await flush();
    assert.equal(updates.length, 1, "the other pending request must not block the first update");
    assert.equal(updates[0].get("飛騨市"), "Hida Shi");
    pending[order[1]].resolve(responses[order[1]]);
    await done;
    assert.equal(updates.length, 2);
    results.push([...updates.at(-1)]);
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal(new Map(results[0]).get("テスト湾"), "Station Bay");
});

test("timeouts abort supplemental requests and offline mode retains bundled names", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pending, fetchImpl } = deferredRequests();
  let count = 0;
  const done = loadPlaceNameData(() => { count += 1; }, { fetchImpl, timeoutMs: 10_000 });
  t.mock.timers.tick(10_000);
  await done;
  assert.ok(pending.every(({ options }) => options.signal.aborted));
  assert.equal(count, 0);
  assert.equal(createPlaceNameIndex().get("飛騨市"), "Hida Shi");
  await loadPlaceNameData(() => { throw new Error("must not update"); }, { fetchImpl: async () => ({ ok: false, status: 503 }) });
});
