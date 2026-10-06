import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [changelog, settingsModal, index, styles] = await Promise.all([
  readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/settingsModal.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

const dateHeadings = [...changelog.matchAll(/^## (\d{4}-\d{2}-\d{2})$/gm)].map((match) => match[1]);
assert.ok(dateHeadings.length >= 20, "主要な過去更新を日付単位で収録する");
assert.equal(new Set(dateHeadings).size, dateHeadings.length, "日付見出しを重複させない");
assert.deepEqual(dateHeadings, [...dateHeadings].sort().reverse(), "日付見出しを新しい順に並べる");
assert.match(changelog, /## 2026-10-06[\s\S]*?設定モーダルから、日付ごとの/);
assert.match(changelog, /## 2026-10-05[\s\S]*?震度5.*震度6/s);
assert.match(changelog, /## 2026-09-18[\s\S]*?約50年分の過去地震検索/);
assert.match(changelog, /## 2026-07/);
assert.match(changelog, /## 2026-06/);
assert.doesNotMatch(changelog, /GitHub Pages|Cloudflare Pages|wrangler\.toml|README|### デプロイ/);

assert.match(index, /class="settings-group settings-changelog-group"[\s\S]*?id="settings-changelog-content"/);
assert.match(settingsModal, /import changelogMarkdown from "\.\.\/\.\.\/CHANGELOG\.md\?raw"/);
assert.match(settingsModal, /function renderSettingsChangelog\(\)/);
assert.match(settingsModal, /group\.matches\("\.settings-changelog-group"\)\) renderSettingsChangelog\(\)/);
assert.match(settingsModal, /function escapeHtml\(value\)[\s\S]*?replace\(\/\[&<>'"\]\/g/);
assert.match(settingsModal, /const content = escapeHtml\(item\[1\]\.trim\(\)\)/, "表示前に既存のHTMLエスケープ関数を使う");
assert.match(styles, /html\[data-theme="light"\] \.settings-changelog-entry\s*\{[\s\S]*?background:/);
assert.match(styles, /html\[data-theme="light"\] \.settings-changelog-entry h3\s*\{[\s\S]*?color:/);

console.log(`Changelog tests passed (${dateHeadings.length} dated entries).`);
