import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, consentModule] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/legalConsentModal.js", import.meta.url), "utf8")
]);

assert.match(html, /id="legal-consent-modal"[^>]*hidden/);
assert.match(html, /href="%BASE_URL%terms\.html"/);
assert.match(html, /href="%BASE_URL%privacy\.html"/);
assert.match(html, /id="legal-consent-terms" type="checkbox"/);
assert.match(html, /id="legal-consent-privacy" type="checkbox"/);
assert.match(html, /data-legal-consent-accept disabled/);
assert.doesNotMatch(html, /legal-consent-modal[\s\S]{0,500}data-legal-consent-close/);

assert.match(consentModule, /LEGAL_CONSENT_VERSION = "2026-07-16"/);
assert.match(consentModule, /termsConsent\.checked && privacyConsent\.checked/);
assert.match(consentModule, /localStorage\.setItem\(STORAGE_KEY, LEGAL_CONSENT_VERSION\)/);
assert.match(consentModule, /#app > :not\(#legal-consent-modal\)/);
assert.match(app, /setupLegalConsentModal\(\{ onAccepted: startUserServices \}\)/);
assert.match(app, /if \(!legalConsent\.showIfRequired\(\)\) startUserServices\(\)/);
assert.match(app, /startAutoRefresh\(\);[\s\S]+void startLocationWatchOnLaunch\(\);[\s\S]+onboarding\.showFirstRun\(\);/);
assert.doesNotMatch(app, /startDmdataEarthquakeUpdates/u);

console.log("Legal consent gates: OK");
