import {
  DISASTER_TIMELINE_CATEGORIES,
  DISASTER_TIMELINE_EVENTS,
  filterDisasterTimelineEvents,
  formatDisasterTimelineDate
} from "../domain/disasterTimeline.js";

let initialized = false;
let previouslyFocused = null;

const CATEGORY_LABELS = Object.fromEntries(
  DISASTER_TIMELINE_CATEGORIES.map((category) => [category.id, category.label])
);

export function setupDisasterTimelineModal() {
  if (initialized) return;
  initialized = true;

  const button = document.getElementById("disaster-timeline-button");
  const modal = document.getElementById("disaster-timeline-modal");
  if (!button || !modal) return;

  button.addEventListener("click", openDisasterTimelineModal);
  modal.addEventListener("click", handleModalClick);
  modal.addEventListener("input", renderDisasterTimeline);
  modal.addEventListener("change", renderDisasterTimeline);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeDisasterTimelineModal();
  });

  renderDisasterTimeline();
}

export function openDisasterTimelineModal() {
  const modal = document.getElementById("disaster-timeline-modal");
  if (!modal) return;
  previouslyFocused = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("disaster-timeline-button")?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => modal.querySelector("[data-disaster-timeline-close]")?.focus());
}

export function closeDisasterTimelineModal() {
  const modal = document.getElementById("disaster-timeline-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("disaster-timeline-button")?.setAttribute("aria-expanded", "false");
  if (![...document.querySelectorAll(".warning-modal:not([hidden])")].length) {
    document.body.classList.remove("modal-open");
  }
  const fallbackFocus = document.getElementById("map-utility-menu-toggle");
  const focusTarget = previouslyFocused?.closest?.("#map-utility-actions")
    ? fallbackFocus
    : previouslyFocused;
  if (focusTarget instanceof HTMLElement) focusTarget.focus();
  previouslyFocused = null;
}

function handleModalClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-disaster-timeline-close]")) {
    closeDisasterTimelineModal();
    return;
  }

  const categoryButton = event.target.closest("[data-disaster-timeline-category]");
  if (!categoryButton) return;
  document.querySelectorAll("[data-disaster-timeline-category]").forEach((button) => {
    const selected = button === categoryButton;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderDisasterTimeline();
}

export function buildDisasterTimelineMarkup(events) {
  if (!events.length) {
    return `
      <div class="disaster-timeline-empty" role="status">
        <strong>該当する災害がありません</strong>
        <p>分類、年代、検索語を変更してください。</p>
      </div>
    `;
  }

  return `
    <ol class="disaster-timeline-list">
      ${events.map((item) => `
        <li class="disaster-timeline-item is-${escapeHtml(item.category)}">
          <div class="disaster-timeline-marker" aria-hidden="true"></div>
          <article class="disaster-timeline-card">
            <div class="disaster-timeline-card-meta">
              <time datetime="${escapeHtml(item.occurredOn)}">${escapeHtml(formatDisasterTimelineDate(item))}</time>
              <span class="disaster-timeline-category">${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}</span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="disaster-timeline-region">${escapeHtml(item.region)}</p>
            <p class="disaster-timeline-summary">${escapeHtml(item.summary)}</p>
            <a class="disaster-timeline-source" href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(item.source.label)}<span aria-hidden="true">↗</span>
            </a>
          </article>
        </li>
      `).join("")}
    </ol>
  `;
}

export function renderDisasterTimeline() {
  const modal = document.getElementById("disaster-timeline-modal");
  const results = document.getElementById("disaster-timeline-results");
  const count = document.getElementById("disaster-timeline-count");
  if (!modal || !results) return;

  const activeCategory = modal.querySelector("[data-disaster-timeline-category].is-active")?.getAttribute("data-disaster-timeline-category") || "all";
  const era = modal.querySelector("#disaster-timeline-era")?.value || "all";
  const direction = modal.querySelector("#disaster-timeline-order")?.value || "desc";
  const query = modal.querySelector("#disaster-timeline-search")?.value || "";
  const events = filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, {
    category: activeCategory,
    era,
    direction,
    query
  });

  if (count) count.textContent = `${events.length}件`;
  results.innerHTML = buildDisasterTimelineMarkup(events);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
