import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSettingsNavigationState, SETTINGS_CATEGORIES } from "../src/ui/settingsNavigation.js";

const navigation = createSettingsNavigationState();
assert.equal(navigation.back(), null);
navigation.open({ kind: "category", categoryId: "general" }, { scrollTop: 180, focusKey: "category:general" });
navigation.open({ kind: "detail", categoryId: "general", itemId: "theme" }, { scrollTop: 75, focusKey: "item:theme" });
assert.deepEqual(navigation.back(), { kind: "category", categoryId: "general", scrollTop: 75, focusKey: "item:theme" });
assert.deepEqual(navigation.back(), { kind: "root", query: "", scrollTop: 180, focusKey: "category:general" });

navigation.search("地形");
navigation.open({ kind: "detail", categoryId: "map", itemId: "terrain", query: "地形" }, { scrollTop: 22, focusKey: "item:terrain" });
assert.deepEqual(navigation.back(), { kind: "root", query: "地形", scrollTop: 22, focusKey: "item:terrain" });
navigation.reset();
navigation.open({ kind: "detail", categoryId: "earthquake", itemId: "earthquake" }, { focusKey: "category:earthquake" });
assert.equal(navigation.back().focusKey, "category:earthquake", "a single-settings category returns directly to the root");
navigation.open({ kind: "detail", categoryId: "account", itemId: "account" });
assert.equal(navigation.reset().kind, "root");
assert.equal(navigation.current().query, "");
const snapshot = navigation.current();
snapshot.query = "external mutation";
assert.equal(navigation.current().query, "");

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const groups = [...page.matchAll(/<section\s+class="(settings-group(?: [^"]+)?)"([^>]*)>/g)];
assert.equal(groups.length, 18, "all existing settings and the color preferences remain available");
for (const [, classes, attributes] of groups) {
  const matches = SETTINGS_CATEGORIES.filter(category => category.selector.split(", ").some(selector =>
    selector.startsWith(".") ? classes.split(" ").includes(selector.slice(1)) : attributes.includes('data-settings-section="support"')));
  assert.equal(matches.length, 1, `${classes} belongs to exactly one category`);
}
console.log("Settings navigation state and category coverage tests passed");
