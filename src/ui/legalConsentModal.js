export const LEGAL_CONSENT_VERSION = "2026-07-16";

const STORAGE_KEY = "meteoscope-legal-consent-version";
let sessionAccepted = false;
let initialized = false;
let options = {};
let backgroundElements = [];

export function setupLegalConsentModal(nextOptions = {}) {
  options = nextOptions;
  if (!initialized) initialize();
  return { showIfRequired, hasAcceptedLegalConsent };
}

function initialize() {
  initialized = true;
  const modal = document.getElementById("legal-consent-modal");
  const termsConsent = document.getElementById("legal-consent-terms");
  const privacyConsent = document.getElementById("legal-consent-privacy");
  const acceptButton = document.querySelector("[data-legal-consent-accept]");
  if (!modal || !termsConsent || !privacyConsent || !acceptButton) return;

  const updateAcceptButton = () => {
    acceptButton.disabled = !(termsConsent.checked && privacyConsent.checked);
  };

  termsConsent.addEventListener("change", updateAcceptButton);
  privacyConsent.addEventListener("change", updateAcceptButton);
  acceptButton.addEventListener("click", () => {
    if (!termsConsent.checked || !privacyConsent.checked) return;
    rememberLegalConsent();
    closeModal();
    options.onAccepted?.();
  });
  updateAcceptButton();
}

function showIfRequired() {
  if (hasAcceptedLegalConsent()) return false;
  const modal = document.getElementById("legal-consent-modal");
  if (!modal) return false;

  const termsConsent = document.getElementById("legal-consent-terms");
  const privacyConsent = document.getElementById("legal-consent-privacy");
  const acceptButton = document.querySelector("[data-legal-consent-accept]");
  if (termsConsent) termsConsent.checked = false;
  if (privacyConsent) privacyConsent.checked = false;
  if (acceptButton) acceptButton.disabled = true;

  modal.hidden = false;
  setBackgroundInert(true);
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => termsConsent?.focus({ preventScroll: true }));
  return true;
}

function closeModal() {
  const modal = document.getElementById("legal-consent-modal");
  if (!modal) return;
  modal.hidden = true;
  setBackgroundInert(false);
  if (!document.querySelector(".warning-modal:not([hidden])")) {
    document.body.classList.remove("modal-open");
  }
}

function setBackgroundInert(inert) {
  if (inert) {
    backgroundElements = Array.from(document.querySelectorAll("#app > :not(#legal-consent-modal)"));
    backgroundElements.forEach((element) => { element.inert = true; });
    return;
  }

  backgroundElements.forEach((element) => { element.inert = false; });
  backgroundElements = [];
}

function hasAcceptedLegalConsent() {
  if (sessionAccepted) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === LEGAL_CONSENT_VERSION;
  } catch {
    return false;
  }
}

function rememberLegalConsent() {
  sessionAccepted = true;
  try {
    localStorage.setItem(STORAGE_KEY, LEGAL_CONSENT_VERSION);
  } catch {
    // The current session can continue even when persistent storage is unavailable.
  }
}
