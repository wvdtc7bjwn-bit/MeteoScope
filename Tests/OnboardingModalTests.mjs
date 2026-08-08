import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildOnboardingPhraseMarkup } from "../src/ui/onboardingModal.js";

const markup = buildOnboardingPhraseMarkup(["防災・気象情報を", "ひとつの地図で"]);
assert.equal(
  markup,
  '<span class="onboarding-phrase">防災・気象情報を</span><span class="onboarding-phrase">ひとつの地図で</span>'
);
assert.equal(
  buildOnboardingPhraseMarkup(['<strong class="unsafe">', "& test"]),
  '<span class="onboarding-phrase">&lt;strong class=&quot;unsafe&quot;&gt;</span><span class="onboarding-phrase">&amp; test</span>'
);

const style = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
assert.match(style, /\.onboarding-phrase\s*\{[^}]*white-space:\s*nowrap;/s);
assert.match(style, /\.onboarding-copy h3\s*\{[^}]*flex-wrap:\s*wrap;/s);
assert.match(style, /\.onboarding-copy p\s*\{[^}]*flex-wrap:\s*wrap;/s);
assert.match(style, /\.onboarding-footer button\s*\{[^}]*white-space:\s*nowrap;/s);
assert.match(style, /\.onboarding-footer button\s*\{[^}]*word-break:\s*keep-all;/s);
assert.match(style, /\.onboarding-footer button\s*\{[^}]*overflow-wrap:\s*normal;/s);
assert.match(style, /\.onboarding-skip\s*\{[^}]*min-width:\s*max-content;/s);

console.log("OnboardingModalTests: OK");
