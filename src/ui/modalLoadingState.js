export function buildModalLoadingState({
  title,
  detail = "",
  compact = false,
  inline = false
} = {}) {
  const classes = [
    "modal-loading-state",
    compact ? "is-compact" : "",
    inline ? "is-inline" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}" role="status" aria-live="polite" aria-busy="true">
      <span class="modal-loading-indicator" aria-hidden="true"></span>
      <span class="modal-loading-copy">
        <strong>${escapeHtml(title ?? "")}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
