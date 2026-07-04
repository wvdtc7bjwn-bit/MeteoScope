import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const TRIPLE_CLICK_WINDOW_MS = 1600;
const PAGE_GAP_PX = 12;
const MAX_RENDER_OUTPUT_SCALE = 2;
const MAX_CANVAS_PIXELS = 7_000_000;
const VISIBLE_PAGE_MARGIN_PX = 900;
const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const FIT_ZOOM = 1;
const MIN_ZOOM = ZOOM_LEVELS[0];
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
const PINCH_ZOOM_THRESHOLD = 0.025;
const STORED_PDF_DB_NAME = "weather-viewer-disaster-map";
const STORED_PDF_DB_VERSION = 1;
const STORED_PDF_STORE_NAME = "files";
const STORED_PDF_KEY = "selected-pdf";

let disasterMapInitialized = false;
let localPdfUrl = "";
let pdfjsModulePromise;
let clearActivePdfViewer = null;

export async function getStoredDisasterMapPdfInfo() {
  const record = await loadStoredPdf();
  if (!record?.blob) return null;
  return {
    name: record.name || "防災マップ.pdf",
    size: record.size || record.blob.size || 0,
    updatedAt: record.updatedAt || record.lastModified || 0
  };
}

export async function clearStoredDisasterMapPdf() {
  await deleteStoredPdf();
  clearActivePdfViewer?.();
}

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

  clearActivePdfViewer = () => {
    clearPdfViewer({ deleteStored: false });
    fileInput.value = "";
  };

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
  let pinchState = null;
  let activePinchZoom = FIT_ZOOM;
  let storedPdfRestored = false;
  let storedPdfRestorePromise = null;

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
    clearPdfViewer({ deleteStored: true });
    fileInput.value = "";
  });

  zoomOutButton.addEventListener("click", () => changeZoom(-1));
  zoomFitButton.addEventListener("click", () => setZoom(FIT_ZOOM));
  zoomInButton.addEventListener("click", () => changeZoom(1));
  pages.addEventListener("wheel", handleWheelZoom, { passive: false });
  pages.addEventListener("dblclick", handleDoubleClickZoom);
  pages.addEventListener("touchstart", handleTouchStart, { passive: true });
  pages.addEventListener("touchmove", handleTouchMove, { passive: false });
  pages.addEventListener("touchend", handleTouchEnd, { passive: true });
  pages.addEventListener("touchcancel", handleTouchEnd, { passive: true });

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
    resizeTimer = window.setTimeout(() => {
      const anchor = getDefaultZoomAnchor();
      refreshPageShells({ preserveRendered: true });
      restoreZoomAnchor(anchor);
    }, 180);
  });

  updateZoomControls();

  function openDisasterMapModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    if (!storedPdfRestored && !pdfDocument) void restoreStoredPdf();
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
    void saveStoredPdf(file).catch((error) => {
      console.warn("[DisasterMap] Failed to persist PDF", error);
    });
    void loadPdfDocument(file);
  }

  function restoreStoredPdf() {
    if (storedPdfRestorePromise) return storedPdfRestorePromise;

    storedPdfRestorePromise = (async () => {
      storedPdfRestored = true;
      const record = await loadStoredPdf();
      if (!record?.blob || pdfDocument) return;

      const file = createStoredPdfFile(record);
      setStatus(`${file.name} を復元しています...`, "ok");
      cleanupPdfDocument();
      releaseLocalPdfUrl();
      localPdfUrl = URL.createObjectURL(file);
      openLink.href = localPdfUrl;
      openLink.hidden = false;
      currentZoom = FIT_ZOOM;
      updateZoomControls();
      modal.classList.add("disaster-map-modal--pdf-open");
      await loadPdfDocument(file);
    })()
      .catch((error) => {
        console.warn("[DisasterMap] Failed to restore stored PDF", error);
      })
      .finally(() => {
        storedPdfRestorePromise = null;
      });

    return storedPdfRestorePromise;
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

  function refreshPageShells({ preserveRendered = false } = {}) {
    if (!pdfDocument) return;
    renderGeneration += 1;
    for (const state of pageStates) {
      cancelPageRender(state);
      state.rendered = false;
      state.renderKey = "";
      const layout = applyShellSize(state);
      const canvas = state.shell.querySelector(".disaster-map-page");
      if (preserveRendered && canvas) {
        canvas.style.width = `${layout.cssWidth}px`;
        canvas.style.height = `${layout.cssHeight}px`;
        state.shell.classList.remove("is-loading");
      } else {
        state.shell.replaceChildren();
        state.shell.classList.add("is-loading");
      }
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
    if (!state.shell.querySelector(".disaster-map-page")) {
      state.shell.classList.add("is-loading");
    }

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
    return layout;
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

  function handleWheelZoom(event) {
    if (!pdfDocument || !event.ctrlKey) return;
    if (event.cancelable) event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1, getZoomAnchor(event.clientX, event.clientY));
  }

  function handleDoubleClickZoom(event) {
    if (!pdfDocument) return;
    const nextZoom = currentZoom >= 1.5 ? FIT_ZOOM : 1.5;
    setZoom(nextZoom, getZoomAnchor(event.clientX, event.clientY));
  }

  function handleTouchStart(event) {
    if (!pdfDocument || event.touches.length !== 2) return;
    const midpoint = getTouchMidpoint(event.touches);
    pinchState = {
      startDistance: getTouchDistance(event.touches),
      startZoom: currentZoom,
      anchor: getZoomAnchor(midpoint.x, midpoint.y)
    };
    activePinchZoom = currentZoom;
    pages.classList.add("is-pinch-zooming");
    pages.style.setProperty("--disaster-map-preview-scale", "1");
  }

  function handleTouchMove(event) {
    if (!pdfDocument || !pinchState || event.touches.length !== 2) return;
    const distance = getTouchDistance(event.touches);
    if (!distance || !pinchState.startDistance) return;

    if (event.cancelable) event.preventDefault();
    const midpoint = getTouchMidpoint(event.touches);
    const nextZoom = clampZoom(pinchState.startZoom * (distance / pinchState.startDistance));
    pinchState.anchor = getZoomAnchor(midpoint.x, midpoint.y);
    if (Math.abs(nextZoom - activePinchZoom) < PINCH_ZOOM_THRESHOLD / 2) return;
    activePinchZoom = nextZoom;
    const previewScale = activePinchZoom / Math.max(currentZoom, 0.01);
    pages.style.setProperty("--disaster-map-preview-scale", previewScale.toFixed(3));
  }

  function handleTouchEnd(event) {
    if (event.touches.length >= 2 || !pinchState) return;
    const finalZoom = activePinchZoom;
    const anchor = pinchState.anchor;
    clearPinchPreview();
    pinchState = null;
    activePinchZoom = currentZoom;
    setZoom(finalZoom, anchor);
  }

  function getTouchDistance(touches) {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function getTouchMidpoint(touches) {
    const first = touches[0];
    const second = touches[1];
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2
    };
  }

  function changeZoom(direction, anchor = getDefaultZoomAnchor()) {
    const currentIndex = findNearestZoomIndex(currentZoom);
    const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, currentIndex + direction));
    setZoom(ZOOM_LEVELS[nextIndex], anchor);
  }

  function setZoom(nextZoom, anchor = getDefaultZoomAnchor()) {
    const normalizedZoom = Number(clampZoom(nextZoom).toFixed(2));
    if (!pdfDocument || Math.abs(normalizedZoom - currentZoom) < 0.01) return;
    currentZoom = normalizedZoom;
    refreshPageShells({ preserveRendered: true });
    restoreZoomAnchor(anchor);
  }

  function clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  }

  function getDefaultZoomAnchor() {
    const rect = pages.getBoundingClientRect();
    return getZoomAnchor(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function getZoomAnchor(clientX, clientY) {
    const rect = pages.getBoundingClientRect();
    const scrollWidth = Math.max(1, pages.scrollWidth);
    const scrollHeight = Math.max(1, pages.scrollHeight);
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;
    return {
      viewportX,
      viewportY,
      xRatio: (pages.scrollLeft + viewportX) / scrollWidth,
      yRatio: (pages.scrollTop + viewportY) / scrollHeight
    };
  }

  function restoreZoomAnchor(anchor) {
    if (!anchor) return;
    window.requestAnimationFrame(() => {
      pages.scrollLeft = Math.max(0, anchor.xRatio * pages.scrollWidth - anchor.viewportX);
      pages.scrollTop = Math.max(0, anchor.yRatio * pages.scrollHeight - anchor.viewportY);
      renderVisiblePages();
    });
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
    zoomOutButton.disabled = !hasPdf || currentZoom <= MIN_ZOOM + 0.01;
    zoomFitButton.disabled = !hasPdf || Math.abs(currentZoom - FIT_ZOOM) < 0.01;
    zoomInButton.disabled = !hasPdf || currentZoom >= MAX_ZOOM - 0.01;
    zoomFitButton.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function cleanupPdfDocument() {
    loadGeneration += 1;
    renderGeneration += 1;
    pinchState = null;
    activePinchZoom = FIT_ZOOM;
    clearPinchPreview();
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

  function clearPdfViewer({ deleteStored = true } = {}) {
    cleanupPdfDocument();
    releaseLocalPdfUrl();
    pages.replaceChildren();
    openLink.removeAttribute("href");
    openLink.hidden = true;
    placeholder.hidden = false;
    modal.classList.remove("disaster-map-modal--pdf-open");
    currentZoom = FIT_ZOOM;
    updateZoomControls();
    if (deleteStored) {
      void deleteStoredPdf().catch((error) => {
        console.warn("[DisasterMap] Failed to clear stored PDF", error);
      });
    }
    setStatus("PDFファイルを選択してください。", "");
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.dataset.status = type;
  }

  function clearPinchPreview() {
    pages.classList.remove("is-pinch-zooming");
    pages.style.removeProperty("--disaster-map-preview-scale");
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

async function saveStoredPdf(file) {
  const record = {
    blob: file,
    name: file.name || "防災マップ.pdf",
    type: file.type || "application/pdf",
    size: file.size || 0,
    lastModified: file.lastModified || Date.now(),
    updatedAt: Date.now()
  };
  await runStoredPdfRequest("readwrite", (store) => store.put(record, STORED_PDF_KEY));
  notifyStoredPdfChange();
}

async function loadStoredPdf() {
  return runStoredPdfRequest("readonly", (store) => store.get(STORED_PDF_KEY));
}

async function deleteStoredPdf() {
  await runStoredPdfRequest("readwrite", (store) => store.delete(STORED_PDF_KEY));
  notifyStoredPdfChange();
}

function createStoredPdfFile(record) {
  const type = record.type || record.blob?.type || "application/pdf";
  const name = record.name || "防災マップ.pdf";
  const lastModified = record.lastModified || record.updatedAt || Date.now();
  const blob = record.blob instanceof Blob
    ? record.blob
    : new Blob([record.blob], { type });

  try {
    return new File([blob], name, { type, lastModified });
  } catch {
    const fallback = blob.slice(0, blob.size, type);
    Object.defineProperty(fallback, "name", { value: name });
    Object.defineProperty(fallback, "lastModified", { value: lastModified });
    return fallback;
  }
}

function runStoredPdfRequest(mode, operation) {
  return openStoredPdfDb().then((db) => new Promise((resolve, reject) => {
    let request;
    let result;
    const transaction = db.transaction(STORED_PDF_STORE_NAME, mode);
    const store = transaction.objectStore(STORED_PDF_STORE_NAME);

    try {
      request = operation(store);
    } catch (error) {
      transaction.abort();
      db.close();
      reject(error);
      return;
    }

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => {
      // The transaction error handler reports the final failure.
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || request?.error || new Error("PDF保存領域へアクセスできませんでした。"));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("PDF保存処理が中断されました。"));
    };
  }));
}

function openStoredPdfDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("このブラウザではPDF保存に対応していません。"));
      return;
    }

    const request = window.indexedDB.open(STORED_PDF_DB_NAME, STORED_PDF_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORED_PDF_STORE_NAME)) {
        db.createObjectStore(STORED_PDF_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("PDF保存領域を開けませんでした。"));
    request.onblocked = () => reject(new Error("PDF保存領域が別のタブで使用中です。"));
  });
}

function notifyStoredPdfChange() {
  window.dispatchEvent(new CustomEvent("disaster-map-pdf-storage-change"));
}
