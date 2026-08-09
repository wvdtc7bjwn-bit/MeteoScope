export const LEGAL_CONSENT_VERSION = "2026-07-16";

const STORAGE_KEY = "meteoscope-legal-consent-version";
const DOCUMENTS = Object.freeze({
  terms: { title: "利用規約", path: "terms.html" },
  privacy: { title: "プライバシーポリシー", path: "privacy.html" }
});
let sessionAccepted = false;
let initialized = false;
let options = {};
let backgroundElements = [];
let lastDocumentTrigger = null;
let documentRequestId = 0;
const documentCache = new Map();

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
  const documentBack = document.querySelector("[data-legal-consent-document-back]");
  const documentView = document.querySelector("[data-legal-consent-document-view]");
  if (!modal || !termsConsent || !privacyConsent || !acceptButton || !documentBack || !documentView) return;

  const updateAcceptButton = () => {
    acceptButton.disabled = !(termsConsent.checked && privacyConsent.checked);
  };

  termsConsent.addEventListener("change", updateAcceptButton);
  privacyConsent.addEventListener("change", updateAcceptButton);
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-legal-consent-document]");
    if (!trigger || !modal.contains(trigger)) return;
    event.preventDefault();
    void openDocument(trigger.dataset.legalConsentDocument, trigger);
  });
  documentBack.addEventListener("click", closeDocument);
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
  closeDocument({ restoreFocus: false });

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
  closeDocument({ restoreFocus: false });
  setBackgroundInert(false);
  if (!document.querySelector(".warning-modal:not([hidden])")) {
    document.body.classList.remove("modal-open");
  }
}

async function openDocument(kind, trigger) {
  const documentDefinition = DOCUMENTS[kind];
  const modal = document.getElementById("legal-consent-modal");
  const panel = modal?.querySelector(".legal-consent-panel");
  const title = document.getElementById("legal-consent-title");
  const consentView = document.querySelector("[data-legal-consent-consent-view]");
  const documentView = document.querySelector("[data-legal-consent-document-view]");
  const documentBack = document.querySelector("[data-legal-consent-document-back]");
  const content = document.getElementById("legal-consent-document-content");
  if (!documentDefinition || !modal || !panel || !title || !consentView || !documentView || !documentBack || !content) return;

  lastDocumentTrigger = trigger;
  const requestId = ++documentRequestId;
  panel.dataset.legalConsentView = "document";
  panel.dataset.legalConsentDocument = kind;
  title.textContent = documentDefinition.title;
  modal.setAttribute("aria-describedby", "legal-consent-document-content");
  consentView.hidden = true;
  documentView.hidden = false;
  documentBack.hidden = false;
  content.replaceChildren(createDocumentMessage("読み込み中…", true));
  content.scrollTop = 0;
  documentBack.focus({ preventScroll: true });

  try {
    const markup = await loadDocumentMarkup(kind);
    if (requestId !== documentRequestId || panel.dataset.legalConsentDocument !== kind) return;
    content.innerHTML = markup;
  } catch {
    if (requestId !== documentRequestId || panel.dataset.legalConsentDocument !== kind) return;
    content.replaceChildren(createDocumentMessage("文書を読み込めませんでした。接続を確認して、もう一度お試しください。"));
  }
}

function closeDocument({ restoreFocus = true } = {}) {
  const modal = document.getElementById("legal-consent-modal");
  const panel = modal?.querySelector(".legal-consent-panel");
  const title = document.getElementById("legal-consent-title");
  const consentView = document.querySelector("[data-legal-consent-consent-view]");
  const documentView = document.querySelector("[data-legal-consent-document-view]");
  const documentBack = document.querySelector("[data-legal-consent-document-back]");
  const content = document.getElementById("legal-consent-document-content");
  if (!panel || !title || !consentView || !documentView || !documentBack) return;

  documentRequestId += 1;
  delete panel.dataset.legalConsentView;
  delete panel.dataset.legalConsentDocument;
  title.textContent = "利用規約とプライバシー";
  modal?.setAttribute("aria-describedby", "legal-consent-description");
  consentView.hidden = false;
  documentView.hidden = true;
  documentBack.hidden = true;
  if (content) {
    content.scrollTop = 0;
    content.replaceChildren();
  }
  if (restoreFocus) lastDocumentTrigger?.focus({ preventScroll: true });
  lastDocumentTrigger = null;
}

async function loadDocumentMarkup(kind) {
  if (documentCache.has(kind)) return documentCache.get(kind);
  const documentDefinition = DOCUMENTS[kind];
  if (!documentDefinition) throw new Error("Unknown legal document");

  const response = await fetch(new URL(documentDefinition.path, window.location.href));
  if (!response.ok) throw new Error(`Unable to load ${kind}`);
  const source = new DOMParser().parseFromString(await response.text(), "text/html");
  const main = source.querySelector("main");
  if (!main) throw new Error("Legal document content is unavailable");
  main.querySelector("nav")?.remove();
  main.querySelector("h1")?.remove();
  main.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const linkedDocument = href.endsWith("terms.html") ? "terms" : href.endsWith("privacy.html") ? "privacy" : null;
    if (linkedDocument) {
      link.dataset.legalConsentDocument = linkedDocument;
      link.setAttribute("href", "#legal-consent-document");
      return;
    }
    if (/^https?:/i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
  const markup = main.innerHTML;
  documentCache.set(kind, markup);
  return markup;
}

function createDocumentMessage(message, isLoading = false) {
  const paragraph = document.createElement("p");
  paragraph.className = "legal-consent-document-message";
  if (isLoading) paragraph.classList.add("is-loading");
  paragraph.textContent = message;
  return paragraph;
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
