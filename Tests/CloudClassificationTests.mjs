import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cloudClassificationCatalog } from "../src/ui/cloudClassificationModal.js";

const { genera, terms, photos } = cloudClassificationCatalog;
const unique = (values) => new Set(values).size === values.length;

assert.equal(genera.length, 10, "WMOの基本雲形10属を収録する");
assert.ok(unique(genera.map(({ code }) => code)), "雲形コードは重複しない");
assert.ok(unique(genera.map(({ latin }) => latin)), "雲形の学名は重複しない");
assert.deepEqual(Object.keys(photos).sort(), genera.map(({ code }) => code).sort(), "全基本雲形に写真情報を用意する");
for (const [code, photo] of Object.entries(photos)) {
  assert.ok(photo.file && photo.author && photo.page && photo.license && photo.licenseUrl, `${code}の写真に作者・出典・ライセンスを記録する`);
  assert.match(photo.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.match(photo.licenseUrl, /^https:\/\/creativecommons\.org\//);
}
assert.ok(terms.length >= 40, "専門的な種・変種・付随雲などを収録する");
assert.ok(terms.some(({ latin }) => latin === "asperitas"), "専門的な波状雲を含む");
assert.ok(terms.some(({ latin }) => latin === "fluctus"), "専門的な波頭雲を含む");

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const menu = html.match(/<div id="map-utility-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
const menuButtons = [...menu.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
assert.ok(menuButtons.length >= 11, "既存メニュー項目を維持する");
assert.match(menu, /id="jma-disaster-archive-button"/u, "過去の災害事例をメニューから開ける");
assert.ok(menuButtons.every(([, content]) => /class="map-utility-label"/.test(content)), "全メニュー項目をアイコンと名称で表示する");

console.log("Cloud classification tests passed");
