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
