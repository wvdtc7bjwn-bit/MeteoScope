import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const TRIPLE_CLICK_WINDOW_MS = 1600;
const MAX_RENDER_SCALE = 2.4;
const PAGE_GAP_PX = 12;

let disasterMapInitialized = false;
let localPdfUrl = "";
let pdfjsModulePromise;

export function setupDisasterMapModal() {
  if (disasterMapInitialized) return;
  disasterMapInitialized = true;

  const earthquakeButton = document.querySelector('.tab-button[data-tab="earthquake"]');
  const modal = document.getElementById("disaster-map-modal");
  const fileInput = document.getElementById("disaster-map-file");
  const pages = document.getElementById("disaster-map-pages");
  const placeholder = document.getElementById("disaster-map-placeholder");
  const status = document.getElementById("disaster-map-status");
  const openLink = document.getElementById("disaster-map-open");
  const clearButton = document.getElementById("disaster-map-clear");

  if (!earthquakeButton || !modal || !fileInput || !pages || !placeholder || !status || !openLink) {
    return;
  }

  let clickCount = 0;
  let lastClickAt = 0;
  let resetTimer = 0;
  let renderToken = 0;
  let resizeTimer = 0;

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

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    showLocalPdf(file);
  });

  clearButton?.addEventListener("click", () => {
    clearPdfViewer();
    fileInput.value = "";
  });

  window.addEventListener("resize", () => {
    const file = fileInput.files?.[0];
    if (!file || modal.hidden) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderPdf(file), 240);
  });

  function openDisasterMapModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => {
      if (!pages.childElementCount) fileInput.focus();
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
    openLink.href = localPdfUrl;
    openLink.hidden = false;
    setStatus(`${file.name} を読み込み中...`, "ok");
    modal.classList.add("disaster-map-modal--pdf-open");
    renderPdf(file);
  }

  async function renderPdf(file) {
    const currentToken = ++renderToken;
    const bytes = await file.arrayBuffer();
    pages.replaceChildren();
    placeholder.hidden = true;
    pages.setAttribute("aria-busy", "true");

    try {
      const pdfjsLib = await loadPdfJs();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      if (currentToken !== renderToken) return;

      const pageCount = pdf.numPages;
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (currentToken !== renderToken) return;
        const page = await pdf.getPage(pageNumber);
        const canvas = document.createElement("canvas");
        canvas.className = "disaster-map-page";
        canvas.dataset.page = String(pageNumber);
        pages.appendChild(canvas);
        await renderPage(page, canvas);
      }
      setStatus(`${file.name} を表示しています。`, "ok");
    } catch (error) {
      console.error("[DisasterMap] PDF render failed", error);
      pages.replaceChildren();
      placeholder.hidden = false;
      modal.classList.remove("disaster-map-modal--pdf-open");
      setStatus("PDFを表示できませんでした。", "error");
    } finally {
      pages.removeAttribute("aria-busy");
    }
  }

  async function renderPage(page, canvas) {
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(260, pages.clientWidth - PAGE_GAP_PX * 2);
    const cssScale = availableWidth / baseViewport.width;
    const viewport = page.getViewport({ scale: cssScale });
    const outputScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    await page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;
  }

  function clearPdfViewer() {
    renderToken += 1;
    releaseLocalPdfUrl();
    pages.replaceChildren();
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

async function loadPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjsLib;
    });
  }
  return pdfjsModulePromise;
}
