import assert from "node:assert/strict";
import { CLOCK_SHORTCUT_STORAGE_KEY, DEFAULT_CLOCK_SHORTCUT, normalizeClockShortcut,
  resolveClockShortcut, loadClockShortcut, saveClockShortcut } from "../src/ui/clockShortcut.js";

const choices = [{ value: "support", available: true }, { value: "settings-button", available: true },
  { value: "warning-chat-button", available: false }];
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
assert.equal(DEFAULT_CLOCK_SHORTCUT, "support");
for (const value of [null, undefined, "", "removed-feature", '{"bad":true}']) {
  assert.equal(normalizeClockShortcut(value, choices), "support");
}
assert.equal(loadClockShortcut(storage, choices), "support");
assert.equal(saveClockShortcut(storage, "settings-button", choices), true);
assert.equal(values.get(CLOCK_SHORTCUT_STORAGE_KEY), "settings-button");
assert.equal(loadClockShortcut(storage, choices), "settings-button", "saved choice survives setup/reload");
assert.equal(resolveClockShortcut("settings-button", choices).value, "settings-button");
assert.equal(saveClockShortcut(storage, "warning-chat-button", choices), true);
const selected = loadClockShortcut(storage, choices);
assert.equal(selected, "warning-chat-button", "inactive features retain the user's preference");
assert.equal(resolveClockShortcut(selected, choices).value, "support", "unavailable features fall back safely");
assert.equal(resolveClockShortcut(selected, choices.map(choice => ({ ...choice, available: true }))).value,
  "warning-chat-button", "enabling the feature restores the preference");
assert.equal(saveClockShortcut(storage, "removed-feature", choices), true);
assert.equal(loadClockShortcut(storage, choices), "support");
const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
assert.equal(loadClockShortcut(blocked, choices), "support");
assert.equal(saveClockShortcut(blocked, "settings-button", choices), false);
console.log("Clock shortcut preference, fallback and persistence tests passed");
