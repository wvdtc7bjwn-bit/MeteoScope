export const FEEDBACK_CATEGORIES = ["support", "request", "bug", "design", "other"];
export const FEEDBACK_TOPICS = [
  "general",
  "radar",
  "amedas",
  "warnings",
  "typhoon",
  "earthquake",
  "settings",
  "account",
  "notification",
  "accessibility",
  "other"
];
export const FEEDBACK_STATUSES = ["received", "reviewing", "planned", "resolved", "closed"];
export const MAX_FEEDBACK_MESSAGE_LENGTH = 1000;
export const MAX_FEEDBACK_EXPECTED_LENGTH = 500;
export const MAX_FEEDBACK_RESPONSE_LENGTH = 600;
export const MAX_FEEDBACK_EMAIL_LENGTH = 254;
export const FEEDBACK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isFeedbackId(value) {
  return FEEDBACK_ID_PATTERN.test(String(value || ""));
}

export function normalizeFeedbackCategory(value) {
  return FEEDBACK_CATEGORIES.includes(value) ? value : "other";
}

export function normalizeFeedbackTopic(value) {
  return FEEDBACK_TOPICS.includes(value) ? value : "general";
}

export function normalizeFeedbackStatus(value) {
  return FEEDBACK_STATUSES.includes(value) ? value : "received";
}

export function normalizeFeedbackEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, MAX_FEEDBACK_EMAIL_LENGTH);
}

export function isFeedbackEmail(value) {
  const email = normalizeFeedbackEmail(value);
  return !email || /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu.test(email);
}

export function normalizeFeedbackPage() {
  // Do not retain paths, queries, or fragments in support records.
  return "/";
}

export function normalizeFeedbackContext(value) {
  const source = value && typeof value === "object" ? value : {};
  const theme = ["light", "dark", "system"].includes(source.theme) ? source.theme : "system";
  const language = ["ja", "en"].includes(source.language) ? source.language : "ja";
  const tab = ["radar", "amedas", "warnings", "typhoon", "earthquake"].includes(source.tab)
    ? source.tab
    : "other";
  const viewport = /^\d{2,4}x\d{2,4}$/u.test(String(source.viewport || ""))
    ? String(source.viewport)
    : "";
  return { tab, theme, language, viewport };
}

export function createFeedbackRecord(payload, { id, now }) {
  return {
    id,
    category: normalizeFeedbackCategory(payload.category),
    topic: normalizeFeedbackTopic(payload.topic),
    message: String(payload.message || "").trim().slice(0, MAX_FEEDBACK_MESSAGE_LENGTH),
    expected: String(payload.expected || "").trim().slice(0, MAX_FEEDBACK_EXPECTED_LENGTH),
    email: normalizeFeedbackEmail(payload.email),
    page: normalizeFeedbackPage(payload.page),
    context: normalizeFeedbackContext(payload.context),
    status: "received",
    response: "",
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeFeedbackRecord(value) {
  const source = value && typeof value === "object" ? value : {};
  const createdAt = String(source.createdAt || "");
  return {
    id: String(source.id || ""),
    category: normalizeFeedbackCategory(source.category),
    topic: normalizeFeedbackTopic(source.topic),
    message: String(source.message || "").slice(0, MAX_FEEDBACK_MESSAGE_LENGTH),
    expected: String(source.expected || "").slice(0, MAX_FEEDBACK_EXPECTED_LENGTH),
    email: normalizeFeedbackEmail(source.email),
    page: normalizeFeedbackPage(source.page),
    context: normalizeFeedbackContext(source.context),
    status: normalizeFeedbackStatus(source.status),
    response: String(source.response || "").slice(0, MAX_FEEDBACK_RESPONSE_LENGTH),
    createdAt,
    updatedAt: String(source.updatedAt || createdAt)
  };
}

export function updateFeedbackRecord(value, payload, now) {
  const current = normalizeFeedbackRecord(value);
  const hasResponse = Object.prototype.hasOwnProperty.call(payload || {}, "response");
  return {
    ...current,
    status: normalizeFeedbackStatus(payload?.status || current.status),
    response: hasResponse
      ? String(payload.response || "").trim().slice(0, MAX_FEEDBACK_RESPONSE_LENGTH)
      : current.response,
    updatedAt: now
  };
}

export function publicFeedbackStatus(value) {
  const feedback = normalizeFeedbackRecord(value);
  return {
    id: feedback.id,
    category: feedback.category,
    topic: feedback.topic,
    status: feedback.status,
    response: feedback.response,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt
  };
}
