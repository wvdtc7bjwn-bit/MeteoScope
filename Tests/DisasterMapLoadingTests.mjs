import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../src/ui/disasterMapModal.js", import.meta.url), "utf8");
const loaders = source.slice(source.indexOf("  async function loadPdfDocument("), source.indexOf("  async function createPageShells("));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = () => ({ naturalWidth: 800, naturalHeight: 600, cloneNode: () => ({ style: {} }) });

function harness() {
  const requests = [];
  const statuses = [];
  const context = vm.createContext({
    loadGeneration: 0, renderGeneration: 0, localPdfUrl: "blob:test", pageStates: [], pdfDocument: null, pdfLoadingTask: null,
    placeholder: { hidden: false },
    pages: {
      children: [], busy: false,
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); },
      setAttribute() { this.busy = true; },
      removeAttribute() { this.busy = false; }
    },
    modal: { classList: { remove() {} } },
    document: { createElement: () => ({ dataset: {}, setAttribute() {}, appendChild() {} }) },
    loadImage: () => { const request = deferred(); requests.push(request); return request.promise; },
    loadPdfJs: async () => ({ getDocument: () => { const request = deferred(); requests.push(request); return request; } }),
    applyShellSize: () => ({ cssWidth: 800, cssHeight: 600 }),
    updateZoomControls() {}, renderVisiblePages() {}, renderMarkersForPage() {}, setupPageObserver() {},
    loadAnnotationsForActiveFile: async () => {}, createPageShells: async () => {},
    setStatus: (text, type) => statuses.push({ text, type }),
    console: { error() {} }
  });
  context.cleanupPdfDocument = () => {
    context.loadGeneration += 1;
    context.pdfDocument = null;
    context.pageStates = [];
    context.pages.busy = false;
  };
  vm.runInContext(loaders, context);
  return { context, requests, statuses };
}

test("an old image failure must not clear the replacement file or its loading state", async () => {
  const { context, requests, statuses } = harness();
  const oldLoad = context.loadImageDocument({ name: "old.png" });
  const newLoad = context.loadImageDocument({ name: "new.png" });
  requests[0].reject(new Error("old image failed"));
  await oldLoad;
  assert.equal(context.loadGeneration, 2);
  assert.equal(context.pages.busy, true);
  requests[1].resolve(image());
  await newLoad;
  assert.equal(context.pages.children.length, 1);
  assert.equal(context.placeholder.hidden, true);
  assert.equal(context.pages.busy, false);
  assert.deepEqual(statuses, [{ text: "画像を表示しています。", type: "ok" }]);
});

test("an old PDF failure must not remove a newly loaded image", async () => {
  const { context, requests, statuses } = harness();
  const oldPdf = context.loadPdfDocument({ arrayBuffer: async () => new ArrayBuffer(1) });
  await tick();
  const replacement = context.loadImageDocument({ name: "new.jpg" });
  requests[1].resolve(image());
  await replacement;
  requests[0].reject(new Error("stale PDF error"));
  await oldPdf;
  assert.equal(context.pages.children.length, 1);
  assert.equal(context.placeholder.hidden, true);
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].type, "ok");
});

test("clearing a pending file prevents its completion from repopulating the viewer", async () => {
  const { context, requests, statuses } = harness();
  const loading = context.loadImageDocument({ name: "old.png" });
  context.cleanupPdfDocument();
  context.placeholder.hidden = false;
  requests[0].resolve(image());
  await loading;
  assert.equal(context.pages.children.length, 0);
  assert.equal(context.placeholder.hidden, false);
  assert.equal(context.pages.busy, false);
  assert.equal(statuses.length, 0);
});

test("a current decode failure restores file selection and announces the error", async () => {
  const { context, requests, statuses } = harness();
  const loading = context.loadImageDocument({ name: "broken.png" });
  requests[0].reject(new Error("invalid image"));
  await loading;
  assert.equal(context.placeholder.hidden, false);
  assert.equal(context.pages.busy, false);
  assert.equal(context.pages.children.length, 0);
  assert.equal(statuses[0].type, "error");
});

test("late annotation reads must not overwrite the newer file's status", async () => {
  const { context, requests, statuses } = harness();
  const notes = deferred();
  context.loadAnnotationsForActiveFile = () => notes.promise;
  const loading = context.loadImageDocument({ name: "old.png" });
  requests[0].resolve(image());
  await tick();
  const replacement = context.loadImageDocument({ name: "new.png" });
  notes.resolve();
  await loading;
  assert.equal(statuses.length, 0);
  assert.equal(context.pages.busy, true);
  requests[1].resolve(image());
  await replacement;
  assert.equal(statuses.length, 1);
});

test("PDF.js 6 cleanup releases the loading task without calling a removed proxy method", async () => {
  const { context } = harness();
  let destroyed = 0;
  Object.assign(context, {
    FIT_ZOOM: 1, clearPinchPreview() {}, disconnectPageObserver() {},
    cancelPageRender() {}, setAnnotationMode() {}, closeAnnotationPanel() {},
    annotationToolbar: { hidden: false }, console: { warn() {} },
    pdfDocument: { numPages: 2 },
    pdfLoadingTask: { destroy() { destroyed += 1; return Promise.resolve(); } }
  });
  vm.runInContext(source.slice(source.indexOf("function disposePdfLoadingTask("), source.indexOf("function isPdfFile(")), context);
  vm.runInContext(source.slice(source.indexOf("  function cleanupPdfDocument("), source.indexOf("  function disconnectPageObserver(")), context);
  context.cleanupPdfDocument();
  await tick();
  assert.equal(destroyed, 1);
  assert.equal(context.pdfDocument, null);
  assert.equal(context.pdfLoadingTask, null);
  assert.equal(context.pages.busy, false);
  context.cleanupPdfDocument();
  await tick();
  assert.equal(destroyed, 1, "clearing twice must not release the same worker twice");
});
