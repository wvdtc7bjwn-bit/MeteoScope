import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, consentModule, preferences, shell, consentView] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/legalConsentModal.js", import.meta.url), "utf8"),
  readFile(new URL("../ios/MeteoScope/State/AppPreferences.swift", import.meta.url), "utf8"),
  readFile(new URL("../ios/MeteoScope/App/AppShellView.swift", import.meta.url), "utf8"),
  readFile(new URL("../ios/MeteoScope/Views/LegalConsentView.swift", import.meta.url), "utf8")
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
assert.match(app, /startDmdataEarthquakeUpdates\([\s\S]+void startLocationWatchOnLaunch\(\);[\s\S]+onboarding\.showFirstRun\(\);/);

assert.match(preferences, /currentLegalConsentVersion = "2026-07-16"/);
assert.match(preferences, /var hasAcceptedLegalDocuments: Bool/);
assert.match(preferences, /func acceptLegalDocuments\(\)/);
assert.match(shell, /if preferences\.hasAcceptedLegalDocuments/);
assert.match(shell, /LegalConsentView\(onAccept: preferences\.acceptLegalDocuments\)/);
assert.match(consentView, /legalLink\("利用規約"/);
assert.match(consentView, /legalLink\("プライバシーポリシー"/);
assert.match(consentView, /\.disabled\(!\(acceptsTerms && acceptsPrivacy\)\)/);

console.log("Legal consent gates: OK");
