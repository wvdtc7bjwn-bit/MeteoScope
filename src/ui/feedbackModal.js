import { getCurrentLanguage } from "./locale.js";

const FEEDBACK_ENDPOINT = "/api/public/feedback";
const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_RECENT_TICKETS = 8;
const RECENT_TICKETS_STORAGE_KEY = "meteoscope-support-tickets-v1";
const FEATURE_BY_TAB = {
  radar: "radar",
  amedas: "amedas",
  warnings: "warnings",
  typhoon: "typhoon",
  earthquake: "earthquake"
};
const STATUS_LABELS = {
  received: "受付済み",
  reviewing: "確認中",
  planned: "対応予定",
  resolved: "対応済み",
  closed: "対応を終了"
};
const STATUS_LABELS_EN = {
  received: "Received",
  reviewing: "Under review",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed"
};
const FEEDBACK_COPY = {
  ja: {
    moreDetail: "内容をもう少し入力してください。",
    sending: "送信しています…",
    sent: "送信しました。受付状況はこの端末で確認できます。",
    failed: "送信できませんでした。時間をおいてもう一度お試しください。"
  },
  en: {
    moreDetail: "Please enter more detail.",
    sending: "Sending…",
    sent: "Sent. You can check the ticket status on this device.",
    failed: "Could not send your report. Please try again shortly."
  }
};

let feedbackModalInitialized = false;

export function setupFeedbackModal() {
  if (feedbackModalInitialized) return;
  feedbackModalInitialized = true;

  const openButton = document.getElementById("feedback-open");
  const modal = document.getElementById("feedback-modal");
  const form = document.getElementById("feedback-form");
  if (!openButton || !modal || !form) return;

  openButton.addEventListener("click", openFeedbackModal);
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-feedback-modal-close]")) closeFeedbackModal();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitFeedback();
  });
  document.getElementById("feedback-recent-refresh")?.addEventListener("click", () => {
    void refreshRecentFeedback();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFeedbackModal();
  });

  const query = new URLSearchParams(location.search);
  if (query.get("support") === "1") {
    query.delete("support");
    history.replaceState(
      history.state,
      "",
      location.pathname + (query.size ? "?" + query.toString() : "") + location.hash
    );
    openFeedbackModal();
  }
}

function openFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  const status = document.getElementById("feedback-status");
  const receipt = document.getElementById("feedback-ticket");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  if (status) {
    status.textContent = "";
    delete status.dataset.status;
  }
  if (receipt) receipt.hidden = true;
  syncFeedbackTopic();
  void refreshRecentFeedback();
  window.requestAnimationFrame(() => {
    document.getElementById("feedback-message")?.focus();
  });
}

function closeFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const settingsModal = document.getElementById("settings-modal");
  if (!settingsModal || settingsModal.hidden) document.body.classList.remove("modal-open");
}

async function submitFeedback() {
  const form = document.getElementById("feedback-form");
  const category = document.getElementById("feedback-category");
  const topic = document.getElementById("feedback-topic");
  const message = document.getElementById("feedback-message");
  const expected = document.getElementById("feedback-expected");
  const email = document.getElementById("feedback-email");
  const submit = document.getElementById("feedback-submit");
  const status = document.getElementById("feedback-status");
  if (!(form instanceof HTMLFormElement) || !(message instanceof HTMLTextAreaElement)) return;

  const trimmedMessage = message.value.trim();
  if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
    setFeedbackStatus(feedbackCopy("moreDetail"), "error");
    message.focus();
    return;
  }

  const payload = {
    category: category instanceof HTMLSelectElement ? category.value : "other",
    topic: topic instanceof HTMLSelectElement ? topic.value : "general",
    message: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH),
    expected: expected instanceof HTMLTextAreaElement ? expected.value.trim().slice(0, 500) : "",
    email: email instanceof HTMLInputElement ? email.value.trim().slice(0, 254) : "",
    page: location.pathname,
    context: buildFeedbackContext()
  };

  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  if (status) status.textContent = feedbackCopy("sending");

  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !result?.id) {
      throw new Error(result?.error || "送信できませんでした。");
    }
    storeRecentTicket({
      id: result.id,
      category: payload.category,
      topic: payload.topic,
      status: result.status || "received",
      createdAt: result.createdAt || new Date().toISOString(),
      updatedAt: result.createdAt || new Date().toISOString(),
      response: ""
    });
    form.reset();
    syncFeedbackTopic(true);
    showTicketReceipt(result.id);
    setFeedbackStatus(feedbackCopy("sent"), "success");
    await refreshRecentFeedback();
  } catch (error) {
    console.warn("[MeteoScope] feedback submit failed", error);
    setFeedbackStatus(feedbackCopy("failed"), "error");
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
}

function setFeedbackStatus(text, type) {
  const status = document.getElementById("feedback-status");
  if (!status) return;
  status.textContent = text;
  status.dataset.status = type;
}

function buildFeedbackContext() {
  const queryTab = new URLSearchParams(location.search).get("tab");
  const tab = FEATURE_BY_TAB[queryTab] ? queryTab : "other";
  const rootTheme = document.documentElement.dataset.theme;
  const theme = rootTheme === "light" || rootTheme === "dark" ? rootTheme : "system";
  const width = Math.round(Math.min(9999, Math.max(0, window.innerWidth || 0)));
  const height = Math.round(Math.min(9999, Math.max(0, window.innerHeight || 0)));
  return {
    tab,
    theme,
    language: getCurrentLanguage(),
    viewport: width && height ? String(width) + "x" + String(height) : ""
  };
}

function syncFeedbackTopic(force = false) {
  const topic = document.getElementById("feedback-topic");
  if (!(topic instanceof HTMLSelectElement) || (!force && topic.value !== "general")) return;
  const tab = new URLSearchParams(location.search).get("tab");
  topic.value = FEATURE_BY_TAB[tab] || "general";
}

async function refreshRecentFeedback() {
  const tickets = readRecentTickets();
  renderRecentFeedback(tickets);
  if (!tickets.length) return;
  try {
    const url = new URL(FEEDBACK_ENDPOINT, location.origin);
    tickets.forEach((ticket) => url.searchParams.append("id", ticket.id));
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !Array.isArray(result.feedback)) return;
    const updates = new Map(result.feedback.map((ticket) => [ticket.id, ticket]));
    const next = tickets.map((ticket) => ({ ...ticket, ...(updates.get(ticket.id) || {}) }));
    writeRecentTickets(next);
    renderRecentFeedback(next);
  } catch (error) {
    console.warn("[MeteoScope] feedback status refresh failed", error);
  }
}

function renderRecentFeedback(tickets) {
  const section = document.getElementById("feedback-recent");
  const list = document.getElementById("feedback-recent-list");
  if (!section || !list) return;
  section.hidden = tickets.length === 0;
  list.replaceChildren();
  tickets.forEach((ticket) => {
    const item = document.createElement("li");
    item.className = "feedback-recent-item";
    const head = document.createElement("div");
    const status = document.createElement("strong");
    status.textContent = feedbackStatusLabel(ticket.status);
    const when = document.createElement("time");
    when.dateTime = ticket.updatedAt || ticket.createdAt || "";
    when.textContent = formatTicketDate(ticket.updatedAt || ticket.createdAt);
    head.append(status, when);
    item.append(head);
    if (ticket.response) {
      const response = document.createElement("p");
      response.textContent = ticket.response;
      item.append(response);
    }
    list.append(item);
  });
}

function showTicketReceipt(id) {
  const receipt = document.getElementById("feedback-ticket");
  const code = document.getElementById("feedback-ticket-id");
  if (!receipt || !code) return;
  code.textContent = "MS-" + String(id).slice(0, 8).toUpperCase();
  receipt.hidden = false;
}

function feedbackStatusLabel(status) {
  const labels = getCurrentLanguage() === "en" ? STATUS_LABELS_EN : STATUS_LABELS;
  return labels[status] || labels.received;
}

function feedbackCopy(key) {
  const language = getCurrentLanguage() === "en" ? "en" : "ja";
  return FEEDBACK_COPY[language][key];
}

function readRecentTickets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_TICKETS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((ticket) => /^[0-9a-f-]{36}$/iu.test(String(ticket?.id || "")))
      .slice(0, MAX_RECENT_TICKETS)
      .map((ticket) => ({
        id: String(ticket.id),
        category: String(ticket.category || "other"),
        topic: String(ticket.topic || "general"),
        status: String(ticket.status || "received"),
        createdAt: String(ticket.createdAt || ""),
        updatedAt: String(ticket.updatedAt || ticket.createdAt || ""),
        response: String(ticket.response || "").slice(0, 600)
      }));
  } catch {
    return [];
  }
}

function storeRecentTicket(ticket) {
  const current = readRecentTickets().filter((item) => item.id !== ticket.id);
  writeRecentTickets([ticket, ...current]);
}

function writeRecentTickets(tickets) {
  try {
    localStorage.setItem(RECENT_TICKETS_STORAGE_KEY, JSON.stringify(tickets.slice(0, MAX_RECENT_TICKETS)));
  } catch {
    // The support form remains usable when private browsing blocks local storage.
  }
}

function formatTicketDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(getCurrentLanguage() === "en" ? "en-GB" : "ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
