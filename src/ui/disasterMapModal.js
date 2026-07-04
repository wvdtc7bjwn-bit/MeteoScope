import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const TRIPLE_CLICK_WINDOW_MS = 1600;
const PAGE_GAP_PX = 12;
const MAX_RENDER_OUTPUT_SCALE = 2;
const MAX_CANVAS_PIXELS = 7_000_000;
const VISIBLE_PAGE_MARGIN_PX = 900;
const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
const FIT_ZOOM = 1;

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
  const zoomControls = document.getElementById("disaster-map-zoom");
  const zoomOutButton = document.getElementById("disaster-map-zoom-out");
  const zoomFitButton = document.getElementById("disaster-map-zoom-fit");
  const zoomInButton = document.getElementById("disaster-map-zoom-in");

  if (
    !earthquakeButton ||
    !modal ||
    !fileInput ||
    !pages ||
    !placeholder ||
    !status ||
    !openLink ||
    !zoomControls ||
    !zoomOutButton ||
    !zoomFitButton ||
    !zoomInButton
  ) {
    return;
  }

  let clickCount = 0;
  let lastClickAt = 0;
  let resetTimer = 0;
  let resizeTimer = 0;
  let scrollFrame = 0;
  let loadGeneration = 0;
  let renderGeneration = 0;
  let pdfDocument = null;
  let pageObserver = null;
  let pageStates = [];
  let currentZoom = FIT_ZOOM;

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

  zoomOutButton.addEventListener("click", () => changeZoom(-1));
  zoomFitButton.addEventListener("click", () => setZoom(FIT_ZOOM));
  zoomInButton.addEventListener("click", () => changeZoom(1));

  pages.addEventListener(
    "scroll",
    () => {
      if (!pdfDocument || modal.hidden || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        renderVisiblePages();
      });
    },
    { passive: true }
  );

  window.addEventListener("resize", () => {
    if (!pdfDocument || modal.hidden) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => refreshPageShells(), 180);
  });

  updateZoomControls();

  function openDisasterMapModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => {
      if (pdfDocument) renderVisiblePages();
      if (!pages.childElementCount) fileInput.focus();
    });
  }

  function closeDisasterMapModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function showLocalPdf(file) {
    if (!isPdfFile(file)) {
      setStatus("PDFファイルを選択してください。", "error");
      return;
    }

    cleanupPdfDocument();
    releaseLocalPdfUrl();
    localPdfUrl = URL.createObjectURL(file);
    openLink.href = localPdfUrl;
    openLink.hidden = false;
    currentZoom = FIT_ZOOM;
    updateZoomControls();
    setStatus(`${file.name} を読み込み中...`, "ok");
    modal.classList.add("disaster-map-modal--pdf-open");
    void loadPdfDocument(file);
  }

  async function loadPdfDocument(file) {
    const currentLoad = ++loadGeneration;
    renderGeneration += 1;
    pages.replaceChildren();
    pages.scrollTop = 0;
    pages.scrollLeft = 0;
    placeholder.hidden = true;
    pages.setAttribute("aria-busy", "true");

    try {
      const bytes = await file.arrayBuffer();
      const pdfjsLib = await loadPdfJs();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      if (currentLoad !== loadGeneration) {
        void pdf.destroy();
        return;
      }

      pdfDocument = pdf;
      await createPageShells(currentLoad);
      if (currentLoad !== loadGeneration) return;

      setupPageObserver();
      updateZoomControls();
      renderVisiblePages();
      setStatus(`${file.name} を表示しています。`, "ok");
    } catch (error) {
      console.error("[DisasterMap] PDF render failed", error);
      cleanupPdfDocument();
      pages.replaceChildren();
      placeholder.hidden = false;
      modal.classList.remove("disaster-map-modal--pdf-open");
      setStatus("PDFを表示できませんでした。", "error");
    } finally {
      pages.removeAttribute("aria-busy");
    }
  }

  async function createPageShells(currentLoad) {
    if (!pdfDocument) return;

    const fragment = document.createDocumentFragment();
    pageStates = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      if (currentLoad !== loadGeneration) return;
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      page.cleanup();

      const shell = document.createElement("div");
      shell.className = "disaster-map-page-shell is-loading";
      shell.dataset.page = String(pageNumber);
      shell.setAttribute("aria-label", `${pageNumber}ページ`);

      const state = {
        pageNumber,
        shell,
        baseWidth: baseViewport.width,
        baseHeight: baseViewport.height,
        renderTask: null,
        renderKey: "",
        rendered: false
      };
      applyShellSize(state);
      pageStates.push(state);
      fragment.appendChild(shell);
    }

    pages.appendChild(fragment);
  }

  function setupPageObserver() {
    disconnectPageObserver();
    if (!("IntersectionObserver" in window)) return;

    pageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const state = pageStates.find((item) => item.shell === entry.target);
            if (state) void renderPage(state);
          }
        }
      },
      {
        root: pages,
        rootMargin: `${VISIBLE_PAGE_MARGIN_PX}px 0px`,
        threshold: 0
      }
    );

    for (const state of pageStates) pageObserver.observe(state.shell);
  }

  function refreshPageShells() {
    if (!pdfDocument) return;
    renderGeneration += 1;
    for (const state of pageStates) {
      cancelPageRender(state);
      state.rendered = false;
      state.renderKey = "";
      state.shell.replaceChildren();
      state.shell.classList.add("is-loading");
      applyShellSize(state);
    }
    updateZoomControls();
    renderVisiblePages();
  }

  function renderVisiblePages() {
    if (!pdfDocument) return;

    const rootRect = pages.getBoundingClientRect();
    const topLimit = rootRect.top - VISIBLE_PAGE_MARGIN_PX;
    const bottomLimit = rootRect.bottom + VISIBLE_PAGE_MARGIN_PX;

    for (const state of pageStates) {
      const rect = state.shell.getBoundingClientRect();
      if (rect.bottom >= topLimit && rect.top <= bottomLimit) {
        void renderPage(state);
      }
    }
  }

  async function renderPage(state) {
    if (!pdfDocument || modal.hidden) return;
    const generation = renderGeneration;
    const layout = getPageLayout(state);
    const renderKey = `${generation}:${layout.cssWidth}:${layout.cssHeight}:${currentZoom}`;
    if (state.rendered && state.renderKey === renderKey) return;

    cancelPageRender(state);
    state.renderKey = renderKey;
    state.rendered = false;
    state.shell.classList.add("is-loading");

    const page = await pdfDocument.getPage(state.pageNumber);
    if (generation !== renderGeneration) {
      page.cleanup();
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "disaster-map-page";
    canvas.dataset.page = String(state.pageNumber);
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;

    const outputScale = getOutputScale(layout.cssWidth, layout.cssHeight);
    canvas.width = Math.max(1, Math.floor(layout.cssWidth * outputScale));
    canvas.height = Math.max(1, Math.floor(layout.cssHeight * outputScale));

    const context = canvas.getContext("2d", { alpha: false });
    const viewport = page.getViewport({ scale: layout.cssScale });
    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    });
    state.renderTask = renderTask;

    try {
      await renderTask.promise;
      if (generation !== renderGeneration) return;
      state.shell.replaceChildren(canvas);
      state.shell.classList.remove("is-loading");
      state.rendered = true;
    } catch (error) {
      if (error?.name !== "RenderingCancelledException") {
        console.error("[DisasterMap] PDF page render failed", error);
        state.shell.classList.remove("is-loading");
        state.shell.classList.add("is-error");
      }
    } finally {
      if (state.renderTask === renderTask) state.renderTask = null;
      page.cleanup();
    }
  }

  function applyShellSize(state) {
    const layout = getPageLayout(state);
    state.shell.style.width = `${layout.cssWidth}px`;
    state.shell.style.height = `${layout.cssHeight}px`;
  }

  function getPageLayout(state) {
    const availableWidth = getAvailableWidth();
    const fitScale = availableWidth / state.baseWidth;
    const cssScale = fitScale * currentZoom;
    return {
      cssScale,
      cssWidth: Math.max(1, Math.floor(state.baseWidth * cssScale)),
      cssHeight: Math.max(1, Math.floor(state.baseHeight * cssScale))
    };
  }

  function getAvailableWidth() {
    return Math.max(260, pages.clientWidth - PAGE_GAP_PX * 2);
  }

  function getOutputScale(cssWidth, cssHeight) {
    const deviceScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_OUTPUT_SCALE);
    const pixelCount = cssWidth * cssHeight * deviceScale * deviceScale;
    if (pixelCount <= MAX_CANVAS_PIXELS) return deviceScale;
    return Math.max(0.7, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, cssWidth * cssHeight)));
  }

  function changeZoom(direction) {
    const currentIndex = findNearestZoomIndex(currentZoom);
    const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, currentIndex + direction));
    setZoom(ZOOM_LEVELS[nextIndex]);
  }

  function setZoom(nextZoom) {
    if (!pdfDocument || nextZoom === currentZoom) return;
    currentZoom = nextZoom;
    refreshPageShells();
  }

  function findNearestZoomIndex(zoom) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    ZOOM_LEVELS.forEach((level, index) => {
      const distance = Math.abs(level - zoom);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  function updateZoomControls() {
    const hasPdf = Boolean(pdfDocument);
    zoomControls.hidden = !hasPdf;
    const currentIndex = findNearestZoomIndex(currentZoom);
    zoomOutButton.disabled = !hasPdf || currentIndex === 0;
    zoomFitButton.disabled = !hasPdf || currentZoom === FIT_ZOOM;
    zoomInButton.disabled = !hasPdf || currentIndex === ZOOM_LEVELS.length - 1;
    zoomFitButton.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function cleanupPdfDocument() {
    loadGeneration += 1;
    renderGeneration += 1;
    disconnectPageObserver();
    for (const state of pageStates) cancelPageRender(state);
    if (pdfDocument) void pdfDocument.destroy();
    pdfDocument = null;
    pageStates = [];
    updateZoomControls();
  }

  function disconnectPageObserver() {
    if (!pageObserver) return;
    pageObserver.disconnect();
    pageObserver = null;
  }

  function cancelPageRender(state) {
    if (!state.renderTask) return;
    try {
      state.renderTask.cancel();
    } catch {
      // PDF.js may throw if the task has already completed.
    }
    state.renderTask = null;
  }

  function clearPdfViewer() {
    cleanupPdfDocument();
    releaseLocalPdfUrl();
    pages.replaceChildren();
    openLink.removeAttribute("href");
    openLink.hidden = true;
    placeholder.hidden = false;
    modal.classList.remove("disaster-map-modal--pdf-open");
    currentZoom = FIT_ZOOM;
    updateZoomControls();
    setStatus("PDFファイルを選択してください。", "");
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.dataset.status = type;
  }
}

function isPdfFile(file) {
  const nameLooksPdf = file.name.toLowerCase().endsWith(".pdf");
  return file.type === "application/pdf" || (!file.type && nameLooksPdf) || nameLooksPdf;
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
