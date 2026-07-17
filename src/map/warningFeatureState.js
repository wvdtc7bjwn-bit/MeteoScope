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
