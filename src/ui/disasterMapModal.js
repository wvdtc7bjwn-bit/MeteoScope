const TRIPLE_CLICK_WINDOW_MS = 1600;

let disasterMapInitialized = false;
let localPdfUrl = "";

export function setupDisasterMapModal() {
  if (disasterMapInitialized) return;
  disasterMapInitialized = true;

  const earthquakeButton = document.querySelector('.tab-button[data-tab="earthquake"]');
  const modal = document.getElementById("disaster-map-modal");
  const fileInput = document.getElementById("disaster-map-file");
  const frame = document.getElementById("disaster-map-frame");
  const placeholder = document.getElementById("disaster-map-placeholder");
  const status = document.getElementById("disaster-map-status");
  const openLink = document.getElementById("disaster-map-open");
  const clearButton = document.getElementById("disaster-map-clear");

  if (!earthquakeButton || !modal || !fileInput || !frame || !placeholder || !status || !openLink) {
    return;
  }

  let clickCount = 0;
  let lastClickAt = 0;
  let resetTimer = 0;

  earthquakeButton.addEventListener("click", () => {
    const now = Date.now();
    clickCount = now - lastClickAt <= TRIPLE_CLICK_WINDOW_MS ? clickCount + 1 : 1;
    lastClickAt = now;
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      clickCount = 0;
    }, TRIPLE_CLICK_WINDOW_MS);

    if (clickCount < 3) return;
    clickCount = 0;
    if (resetTimer) window.clearTimeout(resetTimer);
    openDisasterMapModal();
  });

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-disaster-map-close]")) closeDisasterMapModal();
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    showLocalPdf(file);
  });

  clearButton?.addEventListener("click", () => {
    clearPdfViewer();
    fileInput.value = "";
  });

  function openDisasterMapModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => {
      if (!frame.getAttribute("src")) fileInput.focus();
    });
  }

  function closeDisasterMapModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function showLocalPdf(file) {
    if (file.type && file.type !== "application/pdf") {
      setStatus("PDFファイルを選択してください。", "error");
      return;
    }

    releaseLocalPdfUrl();
    localPdfUrl = URL.createObjectURL(file);
    setViewerSource(localPdfUrl);
    openLink.href = localPdfUrl;
    openLink.hidden = false;
    setStatus(`${file.name} を表示しています。`, "ok");
  }

  function setViewerSource(src) {
    frame.src = `${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
    placeholder.hidden = true;
    modal.classList.add("disaster-map-modal--pdf-open");
  }

  function clearPdfViewer() {
    releaseLocalPdfUrl();
    frame.removeAttribute("src");
    openLink.removeAttribute("href");
    openLink.hidden = true;
    placeholder.hidden = false;
    modal.classList.remove("disaster-map-modal--pdf-open");
    setStatus("PDFファイルを選択してください。", "");
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.dataset.status = type;
  }
}

function releaseLocalPdfUrl() {
  if (!localPdfUrl) return;
  URL.revokeObjectURL(localPdfUrl);
  localPdfUrl = "";
}
