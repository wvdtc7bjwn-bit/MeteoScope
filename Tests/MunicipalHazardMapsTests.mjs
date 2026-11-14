import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { HAZARD_CATEGORIES, parseHazardCsv, safeHazardUrl, buildHazardDirectory, getMunicipalHazardLinks } from "../src/domain/municipalHazardMaps.js";
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

test("client loads only requested prefecture and deduplicates concurrent fetches", async () => {
  const requests = [];
  const client = createHazardDirectoryClient({ fetchImpl: async (url) => {
    requests.push(url);
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
    pref.value = "";
    await pref.listeners.change();
    assert.equal(cities.disabled, true);
    assert.equal(elements.get("hazard-directory-results").children.length, 0);
  } finally { globalThis.document = savedDocument; }
});
