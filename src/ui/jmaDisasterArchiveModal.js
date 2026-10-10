import { parseJmaDisasterArchive } from "../jma/disasterArchive.js";

let initialized = false;
let archivePromise = null;
let archiveCases = null;
let previouslyFocused = null;

export function setupJmaDisasterArchiveModal() {
  if (initialized) return;
  initialized = true;

  const button = document.getElementById("jma-disaster-archive-button");
  const modal = document.getElementById("jma-disaster-archive-modal");
  if (!button || !modal) return;

  button.addEventListener("click", openJmaDisasterArchiveModal);
  modal.addEventListener("click", handleModalClick);
  modal.addEventListener("input", (event) => {
    if (event.target?.matches?.("#jma-disaster-archive-search")) renderArchiveCases();
  });
  modal.addEventListener("change", (event) => {
    const select = event.target?.closest?.("[data-jma-archive-case]");
    if (!select) return;
    const item = archiveCases?.[Number(select.dataset.jmaArchiveCase)];
    const link = item?.links?.[Number(select.value)];
    const anchor = select.closest(".jma-disaster-archive-card")?.querySelector("[data-jma-archive-open]");
    if (anchor && link) anchor.href = link.url;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeJmaDisasterArchiveModal();
  });
}

export function openJmaDisasterArchiveModal() {
  const modal = document.getElementById("jma-disaster-archive-modal");
  if (!modal) return;
  previouslyFocused = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("jma-disaster-archive-button")?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => modal.querySelector("[data-jma-disaster-archive-close]")?.focus());
  if (!archiveCases) void loadJmaDisasterArchiveCases();
}

export function closeJmaDisasterArchiveModal() {
  const modal = document.getElementById("jma-disaster-archive-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("jma-disaster-archive-button")?.setAttribute("aria-expanded", "false");
  if (![...document.querySelectorAll(".warning-modal:not([hidden])")].length) {
    document.body.classList.remove("modal-open");
  }
  const focusFallback = document.getElementById("map-utility-menu-toggle");
  const focusTarget = previouslyFocused?.closest?.("#map-utility-actions")
    ? focusFallback
    : previouslyFocused;
  if (focusTarget instanceof HTMLElement) focusTarget.focus();
  previouslyFocused = null;
}

async function loadJmaDisasterArchiveCases() {
  const status = document.getElementById("jma-disaster-archive-status");
  if (archivePromise) return archivePromise;
  setStatus(status, "loading", "気象庁の事例一覧を読み込んでいます…");
  archivePromise = fetch("/api/jma-disaster-cases", { headers: { Accept: "text/plain" } })
    .then((response) => {
      if (!response.ok) throw new Error(`JMA archive request failed: ${response.status}`);
      return response.text();
    })
    .then((markup) => {
      archiveCases = parseJmaDisasterArchive(markup);
      if (!archiveCases.length) throw new Error("JMA archive list was empty");
      renderArchiveCases();
    })
    .catch((error) => {
      console.warn("[MeteoScope] failed to load JMA disaster archive", error);
      setStatus(status, "error", `事例一覧を読み込めませんでした。気象庁の公式ページで確認してください。`);
    })
    .finally(() => {
      archivePromise = null;
    });
  return archivePromise;
}

function handleModalClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-jma-disaster-archive-close]")) {
    closeJmaDisasterArchiveModal();
    return;
  }
  if (event.target.closest("[data-jma-disaster-archive-retry]")) {
    void loadJmaDisasterArchiveCases();
  }
}

function renderArchiveCases() {
  const modal = document.getElementById("jma-disaster-archive-modal");
  const results = document.getElementById("jma-disaster-archive-results");
  const count = document.getElementById("jma-disaster-archive-count");
  const status = document.getElementById("jma-disaster-archive-status");
  if (!modal || !results || !archiveCases) return;
  const query = modal.querySelector("#jma-disaster-archive-search")?.value?.trim().toLocaleLowerCase("ja") ?? "";
  const filteredCases = archiveCases
    .map((item, index) => ({ ...item, index }))
    .filter((item) => !query || item.title.toLocaleLowerCase("ja").includes(query));

  results.innerHTML = buildJmaDisasterArchiveMarkup(filteredCases);
  if (count) count.textContent = `${filteredCases.length} / ${archiveCases.length}件`;
  setStatus(status, "ready", "気象庁が公開する選定事例です。各事例の時刻を選ぶと、当時の情報ページが別タブで開きます。");
}

export function buildJmaDisasterArchiveMarkup(items) {
  if (!items.length) {
    return '<p class="jma-disaster-archive-empty" role="status">一致する事例がありません。</p>';
  }
  return `
    <ol class="jma-disaster-archive-list">
      ${items.map((item) => {
        const firstLink = item.links[0];
        return `
          <li class="jma-disaster-archive-item">
            <details class="jma-disaster-archive-card">
              <summary>
                <span>${escapeHtml(item.title)}</span>
                <small>${item.links.length}時点</small>
              </summary>
              <div class="jma-disaster-archive-controls">
                <label>
                  <span>再現する時刻</span>
                  <select data-jma-archive-case="${item.index}" aria-label="${escapeHtml(item.title)}の再現時刻">
                    ${item.links.map((link, index) => `<option value="${index}"${index === 0 ? " selected" : ""}>${escapeHtml(link.label)}</option>`).join("")}
                  </select>
                </label>
                <a class="jma-disaster-archive-open" href="${escapeHtml(firstLink.url)}" target="_blank" rel="noopener noreferrer" data-jma-archive-open>
                  この時刻の情報を見る<span aria-hidden="true">↗</span>
                </a>
              </div>
            </details>
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function setStatus(status, state, message) {
  if (!status) return;
  status.dataset.state = state;
  status.textContent = message;
  status.hidden = false;
  const retry = document.getElementById("jma-disaster-archive-retry");
  if (retry) retry.hidden = state !== "error";
  const externalLink = document.getElementById("jma-disaster-archive-official-link");
  if (externalLink) externalLink.hidden = state !== "error";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
