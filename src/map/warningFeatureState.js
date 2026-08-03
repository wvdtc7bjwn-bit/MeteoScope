export function buildWarningLevelMap(activeAreas = []) {
  const levels = new Map();
  activeAreas.forEach((area) => {
    const areaCode = String(area?.areaCode ?? "");
    const level = String(area?.level ?? "");
    if (areaCode && level) levels.set(areaCode, level);
  });
  return levels;
}

export function planWarningFeatureStateChanges(currentLevels = new Map(), activeAreas = []) {
  const desiredLevels = buildWarningLevelMap(activeAreas);
  const operations = [];

  currentLevels.forEach((level, areaCode) => {
    if (!desiredLevels.has(areaCode)) {
      operations.push({ type: "remove", areaCode });
    }
  });

  desiredLevels.forEach((level, areaCode) => {
    if (currentLevels.get(areaCode) !== level) {
      operations.push({ type: "set", areaCode, level });
    }
  });

  return { desiredLevels, operations };
}

export async function runWarningFeatureStateOperations(operations = [], options = {}) {
  const safeOperations = Array.isArray(operations) ? operations : [];
  const apply = typeof options.apply === "function" ? options.apply : () => {};
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : () => true;
  const yieldFrame = typeof options.yieldFrame === "function"
    ? options.yieldFrame
    : () => Promise.resolve();
  const now = typeof options.now === "function"
    ? options.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  const budgetMs = Number.isFinite(options.budgetMs) ? Math.max(1, options.budgetMs) : 7;
  const maxPerFrame = Number.isInteger(options.maxPerFrame)
    ? Math.max(1, options.maxPerFrame)
    : 48;
  let offset = 0;
  let frameCount = 0;
  let maxFrameDurationMs = 0;

  while (offset < safeOperations.length) {
    await yieldFrame();
    if (!isCurrent()) {
      return { applied: false, processed: offset, frameCount, maxFrameDurationMs };
    }

    const frameStartedAt = now();
    let processedInFrame = 0;
    while (offset < safeOperations.length && processedInFrame < maxPerFrame) {
      if (processedInFrame > 0 && now() - frameStartedAt >= budgetMs) break;
      apply(safeOperations[offset]);
      offset += 1;
      processedInFrame += 1;
    }
    frameCount += 1;
    maxFrameDurationMs = Math.max(maxFrameDurationMs, now() - frameStartedAt);
  }

  return { applied: isCurrent(), processed: offset, frameCount, maxFrameDurationMs };
}
