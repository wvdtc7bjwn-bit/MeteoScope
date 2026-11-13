const ENTITIES = Object.freeze({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
});

// For HTML text and quoted attributes only, not URLs, CSS or JavaScript.
// Preserve the original serializers' null handling and apostrophe spelling.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ENTITIES[character]);
}

export function escapeHtmlString(value) {
  return escapeHtml(String(value));
}

export function escapeHtmlPadded(value) {
  return escapeHtml(value).replaceAll("&#39;", "&#039;");
}

export function escapeHtmlStringPadded(value) {
  return escapeHtmlPadded(String(value));
}
