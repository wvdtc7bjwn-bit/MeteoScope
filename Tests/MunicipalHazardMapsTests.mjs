import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { HAZARD_CATEGORIES, parseHazardCsv, safeHazardUrl, buildHazardDirectory, getMunicipalHazardLinks, getMunicipalHazardLookupUrls } from "../src/domain/municipalHazardMaps.js";
import { MUNICIPAL_HAZARD_LINK_CORRECTIONS } from "../src/domain/municipalHazardLinkCorrections.js";
import { createHazardDirectoryClient, setupMunicipalHazardMaps } from "../src/ui/municipalHazardMaps.js";

const header = '"市町村コード","都道府県","市町村","掲載するURL"\r\n';
const sample = { code: "01100", prefecture: "北海道", name: "札幌市", url: "https://www.city.sapporo.jp/hazard?a=1&b=2" };
const index = JSON.parse(await readFile(new URL("../public/data/municipal-hazard-maps/index.json", import.meta.url), "utf8"));

test("CSV preserves leading zero codes, quoted commas and escaped quotes", () => {
  const [row] = parseHazardCsv(`${header}"01100","北海道","札幌,市""名","https://www.city.sapporo.jp/hazard?a=1&b=2"\r\n`);
  assert.equal(row.code, "01100");
  assert.equal(row.name, '札幌,市"名');
  assert.equal(row.url, sample.url);
  assert.throws(() => parseHazardCsv(`${header}"01100`), /Unclosed/);
  assert.throws(() => parseHazardCsv(header.replace("市町村", "別の列")), /columns/);
});

test("invalid codes, executable and credential-bearing links fail closed", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///a.pdf", "https://user:secret@example.com/", "https://127.0.0.1/a", "https://192.168.1.1/a"]) assert.equal(safeHazardUrl(url), "");
  assert.equal(safeHazardUrl("http://www.city.example.jp/hazard.pdf"), "http://www.city.example.jp/hazard.pdf");
  assert.throws(() => parseHazardCsv(`${header}"1100","北海道","札幌市","https://example.jp"`));
});

test("directory merges codes and removes exact duplicates without dropping hazard types", () => {
  const rows = Object.fromEntries(HAZARD_CATEGORIES.map((kind) => [kind.id, [sample, sample]]));
  const [prefecture] = buildHazardDirectory(rows);
  assert.equal(prefecture.code, "01");
  assert.equal(prefecture.municipalities.length, 1);
  assert.equal(prefecture.municipalities[0].links.length, HAZARD_CATEGORIES.length);
  assert.equal(getMunicipalHazardLinks(prefecture.municipalities[0]).length, 1);
  assert.equal(getMunicipalHazardLinks(prefecture.municipalities[0])[0].categories.length, HAZARD_CATEGORIES.length);
  assert.deepEqual(getMunicipalHazardLinks(prefecture.municipalities[0], "tsunami")[0].categories, ["tsunami"]);
  assert.equal(getMunicipalHazardLinks(prefecture.municipalities[0], "missing").length, 0);
  assert.throws(() => buildHazardDirectory({}), /Missing category/);
});

test("bundled official directory covers all prefectures with safe municipality links", async () => {
  assert.equal(index.prefectures.length, 47);
  assert.equal(new Set(index.prefectures.map((pref) => pref.code)).size, 47);
  assert.equal(index.categories.length, 15);
  let count = 0;
  for (const pref of index.prefectures) {
    const data = JSON.parse(await readFile(new URL(`../public/data/municipal-hazard-maps/${index.version}/${pref.code}.json`, import.meta.url), "utf8"));
    assert.equal(data.code, pref.code);
    assert.equal(data.name, pref.name);
    assert.equal(new Set(data.municipalities.map((city) => city.code)).size, data.municipalities.length);
    for (const city of data.municipalities) {
      assert.match(city.code, new RegExp(`^${pref.code}\\d{3}$`));
      assert.ok(city.name && city.links.length);
      for (const link of city.links) {
        assert.ok(HAZARD_CATEGORIES.some((kind) => kind.id === link.category));
        assert.equal(safeHazardUrl(link.url), link.url);
      }
    }
    count += data.municipalities.length;
  }
  assert.ok(count >= 1700);
});

test("verified replacements repair both generated and older cached links by exact city/category/URL", async () => {
  const keys = new Set();
  for (const correction of MUNICIPAL_HAZARD_LINK_CORRECTIONS) {
    assert.match(correction.code, /^\d{5}$/u);
    assert.equal(safeHazardUrl(correction.to), correction.to);
    assert.equal(safeHazardUrl(correction.source), correction.source);
    assert.match(correction.checkedAt, /^\d{4}-\d{2}-\d{2}$/u);
    const data = JSON.parse(await readFile(new URL(`../public/data/municipal-hazard-maps/${index.version}/${correction.code.slice(0, 2)}.json`, import.meta.url), "utf8"));
    for (const category of correction.categories) {
      const key = `${correction.code}|${category}|${correction.from}`;
      assert.equal(keys.has(key), false, "no duplicate correction silently overwrites another"); keys.add(key);
      assert.ok(HAZARD_CATEGORIES.some(item => item.id === category));
      const stale = { code: correction.code, links: [{ category, url: correction.from }] };
      const repaired = getMunicipalHazardLinks(stale, category)[0];
      assert.equal(repaired.url, correction.to);
      assert.equal(repaired.kind, correction.kind);
      assert.equal(repaired.replacements[0].url, correction.from, "the original listed URL remains available for disclosure");
      assert.equal(getMunicipalHazardLinks({ code: correction.code, links: [{ category, url: correction.to }] })[0].replacements, undefined, "a new URL already adopted by GSI must not be attributed to MeteoScope");
      assert.equal(getMunicipalHazardLinks({ code: correction.code, links: [{ category, ...repaired }] }, category)[0].url, correction.to, "a replacement is idempotent");
      const bundled = getMunicipalHazardLinks(data.municipalities.find(city => city.code === correction.code), category);
      assert.ok(bundled.some(link => link.url === correction.to), "published data also contains the repaired destination");
      assert.equal(getMunicipalHazardLinks({ ...stale, code: "01100" }, category)[0].url, correction.from, "the same source URL under a different city is not rewritten");
    }
  }
  const untouched = { code: "26100", links: [{ category: "flood", url: "https://www.bousai.city.kyoto.lg.jp/new-page.html" }] };
  assert.equal(getMunicipalHazardLinks(untouched)[0].url, untouched.links[0].url, "future GSI URLs are not overridden by an old host-wide rule");
  const naha = getMunicipalHazardLinks({ code: "47201", links: [
    { category: "flood", url: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001608.html" },
    { category: "inland", url: "https://www.city.naha.okinawa.jp/water/pax/gesui_kouhou.html" }
  ] });
  assert.equal(naha.length, 1);
  assert.equal(naha[0].checkedAt, "2026-11-16", "a corrected link merged after an unchanged link still has a check date");
  assert.deepEqual(naha[0].replacements[0].categories, ["inland"], "disclose only the categories actually replaced");
});

test("national lookup preserves city codes, disambiguates same-name cities and includes the selected hazard", () => {
  const lookup = getMunicipalHazardLookupUrls("北海道", { code: "01100", name: "札幌市" }, "flood");
  assert.equal(lookup.directory, "https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=01100");
  assert.equal(new URL(lookup.search).searchParams.get("q"), "北海道 札幌市 洪水 ハザードマップ 公式");
  const tokyo = getMunicipalHazardLookupUrls("東京都", { code: "13206", name: "府中市" });
  const hiroshima = getMunicipalHazardLookupUrls("広島県", { code: "34208", name: "府中市" });
  assert.notEqual(tokyo.search, hiroshima.search);
  for (const code of ["1100", "00000", "48100", "../x"]) assert.equal(getMunicipalHazardLookupUrls("北海道", { code, name: "札幌市" }), null);
});

test("client loads only requested prefecture and deduplicates concurrent fetches", async () => {
  const requests = [];
  const client = createHazardDirectoryClient({ fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.cache, url.endsWith("index.json") ? "no-cache" : "default");
    return { ok: true, json: async () => url.endsWith("index.json") ? index : { code: "01", municipalities: [] } };
  } });
  await Promise.all([client.getIndex(), client.getIndex()]);
  await Promise.all([client.getPrefecture(index.version, "01"), client.getPrefecture(index.version, "01")]);
  assert.equal(requests.length, 2);
  assert.ok(requests[1].endsWith(`/${index.version}/01.json`));
  await assert.rejects(client.getPrefecture("../secret", "01"));
  assert.equal(requests.length, 2);
});

test("failed requests can retry and mismatched municipality data is never cached", async () => {
  let calls = 0;
  const client = createHazardDirectoryClient({ fetchImpl: async () => {
    calls += 1;
    return { ok: true, json: async () => calls === 1 ? { code: "13", municipalities: [] } : { code: "01", municipalities: [] } };
  } });
  await assert.rejects(client.getPrefecture(index.version, "01"), /Invalid/);
  assert.equal((await client.getPrefecture(index.version, "01")).code, "01");
  assert.equal(calls, 2);
});

test("timeouts abort pending requests and do not poison the cache", async () => {
  let aborted = 0;
  const client = createHazardDirectoryClient({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { aborted += 1; reject(new Error("aborted")); }, { once: true });
  }) });
  await assert.rejects(client.getIndex(), /aborted/);
  await assert.rejects(client.getIndex(), /aborted/);
  assert.equal(aborted, 2);
});

// Run the real UI controller with a minimal DOM. Delayed results must not put a
// previous prefecture's city names/links under the newly selected prefecture.
class Element {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.value = ""; this.dataset = {}; this.listeners = {}; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.value = ""; }
  setAttribute(name, value) { this[name] = value; }
}

test("UI visibly attributes independent replacements and keeps their original links", async () => {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
  try {
    const elements = new Map(["hazard-prefecture", "hazard-municipality", "hazard-category", "hazard-directory-status", "hazard-directory-retry", "hazard-directory-results"].map(id => [id, new Element()]));
    const correction = MUNICIPAL_HAZARD_LINK_CORRECTIONS.find(item => item.code === "40130" && item.categories.includes("flood"));
    const city = { code: "40130", name: "福岡市", links: [{ category: "flood", url: correction.from }] };
    const controller = setupMunicipalHazardMaps({ querySelector: id => elements.get(id.slice(1)) }, { client: {
      getIndex: async () => index, getPrefecture: async () => ({ code: "40", municipalities: [city] })
    } });
    await controller.show();
    elements.get("hazard-prefecture").value = "40";
    await elements.get("hazard-prefecture").listeners.change();
    elements.get("hazard-municipality").value = city.code;
    elements.get("hazard-municipality").listeners.change();
    const [anchor, notice] = elements.get("hazard-directory-results").children[0].children;
    assert.equal(anchor.href, correction.to);
    assert.equal(notice.children[0].textContent, "MeteoScopeがリンク先を独自に置換");
    assert.equal(notice.children[1].children[1].textContent, `: ${correction.checkedAt}`);
    const reference = notice.children.find(item => item.tagName === "a");
    assert.equal(reference.href, correction.from);
    assert.equal(reference.target, "_blank");
    assert.equal(reference.rel, "noopener noreferrer");
    city.links = [{ category: "flood", url: correction.to }];
    elements.get("hazard-municipality").listeners.change();
    assert.equal(elements.get("hazard-directory-results").children[0].children.length, 1, "unchanged GSI links do not carry a replacement notice");
  } finally { globalThis.document = savedDocument; }
});
test("UI excludes stale prefecture responses and emits normal safe external links", async () => {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const elements = new Map(["hazard-prefecture", "hazard-municipality", "hazard-category", "hazard-directory-status", "hazard-directory-retry", "hazard-directory-results"].map((id) => [id, new Element()]));
    const pending = new Map();
    const controller = setupMunicipalHazardMaps({ querySelector: (id) => elements.get(id.slice(1)) }, { client: {
      getIndex: async () => index,
      getPrefecture: (_version, code) => new Promise((resolve) => pending.set(code, resolve))
    } });
    await controller.show();
    const pref = elements.get("hazard-prefecture"), cities = elements.get("hazard-municipality");
    pref.value = "01";
    const old = pref.listeners.change();
    pref.value = "13";
    const recent = pref.listeners.change();
    pending.get("13")({ code: "13", municipalities: [{ code: "13101", name: "千代田区", links: [{ category: "flood", url: "https://www.city.chiyoda.lg.jp/hazard" }] }] });
    await recent;
    pending.get("01")({ code: "01", municipalities: [{ code: "01100", name: "札幌市", links: [] }] });
    await old;
    assert.equal(cities.children[1].textContent, "千代田区");
    cities.value = "13101";
    cities.listeners.change();
    const anchor = elements.get("hazard-directory-results").children[0].children[0];
    assert.equal(anchor.tagName, "a");
    assert.equal(anchor.target, "_blank");
    assert.equal(anchor.rel, "noopener noreferrer");
    assert.equal(anchor.href, "https://www.city.chiyoda.lg.jp/hazard");
    let anchors = elements.get("hazard-directory-results").children.flatMap(item => item.children).filter(item => item.tagName === "a");
    assert.equal(anchors.length, 3, "every selected municipality has a directory and search fallback");
    assert.equal(new URL(anchors[1].href).searchParams.get("q"), "東京都 千代田区 ハザードマップ 公式");
    assert.equal(anchors[2].href, "https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=13101");
    elements.get("hazard-category").value = "tsunami";
    elements.get("hazard-category").listeners.change();
    anchors = elements.get("hazard-directory-results").children.flatMap(item => item.children).filter(item => item.tagName === "a");
    assert.equal(anchors.length, 2, "an unlisted type still has a usable search route");
    assert.match(new URL(anchors[0].href).searchParams.get("q"), /千代田区 津波/u);
    assert.match(elements.get("hazard-directory-status").textContent, /リスクがないことを示すものではありません/u);
    pref.value = "";
    await pref.listeners.change();
    assert.equal(cities.disabled, true);
    assert.equal(elements.get("hazard-directory-results").children.length, 0);
  } finally { globalThis.document = savedDocument; }
});
