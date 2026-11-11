export function yieldToMainThread(delayMs = 0) {
  if (delayMs > 0) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }
  if (typeof globalThis.scheduler?.yield === "function") {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export function chunkItems(items, size) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeSize = Math.max(1, Math.floor(Number(size) || 1));
  const chunks = [];
  for (let offset = 0; offset < safeItems.length; offset += safeSize) {
    chunks.push(safeItems.slice(offset, offset + safeSize));
  }
  return chunks;
}

// Let the selected control paint before preparing a potentially large map.
// The timeout also releases callers when rAF is suspended in a hidden page.
export function yieldAfterPaint() {
  if (typeof globalThis.requestAnimationFrame !== "function" || globalThis.document?.hidden) {
    return yieldToMainThread();
  }
  return new Promise((resolve) => {
    let frame = 0;
    let task = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      globalThis.cancelAnimationFrame?.(frame);
      globalThis.clearTimeout(task);
      globalThis.clearTimeout(fallback);
      resolve();
    };
    const fallback = globalThis.setTimeout(finish, 100);
    frame = globalThis.requestAnimationFrame(() => {
      task = globalThis.setTimeout(finish, 0);
    });
  });
}
