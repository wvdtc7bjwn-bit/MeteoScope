import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, consentModule, styles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/legalConsentModal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

assert.match(html, /id="legal-consent-modal"[^>]*hidden/);
assert.match(html, /data-legal-consent-document="terms"/);
assert.match(html, /data-legal-consent-document="privacy"/);
assert.match(html, /data-legal-consent-document-view hidden/);
assert.match(html, /data-legal-consent-document-back hidden/);
assert.doesNotMatch(html, /legal-consent-modal[\s\S]{0,2200}target="_blank"/);
assert.match(html, /id="legal-consent-terms" type="checkbox"/);
assert.match(html, /id="legal-consent-privacy" type="checkbox"/);
assert.match(html, /data-legal-consent-accept disabled/);
assert.doesNotMatch(html, /legal-consent-modal[\s\S]{0,500}data-legal-consent-close/);

assert.match(consentModule, /LEGAL_CONSENT_VERSION = "2026-07-16"/);
assert.match(consentModule, /termsConsent\.checked && privacyConsent\.checked/);
assert.match(consentModule, /localStorage\.setItem\(STORAGE_KEY, LEGAL_CONSENT_VERSION\)/);
assert.match(consentModule, /#app > :not\(#legal-consent-modal\)/);
assert.match(consentModule, /fetch\(new URL\(documentDefinition\.path, window\.location\.href\)\)/);
assert.match(consentModule, /new DOMParser\(\)\.parseFromString/);
assert.match(consentModule, /function openDocument\(kind, trigger\)/);
assert.match(consentModule, /function closeDocument/);
assert.match(consentModule, /content\.replaceChildren\(\);/);
assert.match(styles, /\.legal-consent-document-view\[hidden\],[\s\S]*display: none !important;/);
assert.match(styles, /\.legal-consent-document-content\s*\{[\s\S]*scrollbar-width: none;/);
assert.match(app, /setupLegalConsentModal\(\{ onAccepted: startUserServices \}\)/);
assert.match(app, /if \(!legalConsent\.showIfRequired\(\)\) startUserServices\(\)/);
assert.match(app, /startAutoRefresh\(\);[\s\S]+void startLocationWatchOnLaunch\(\);[\s\S]+onboarding\.showFirstRun\(\);/);
assert.doesNotMatch(app, /startDmdataEarthquakeUpdates/u);

console.log("Legal consent gates: OK");
