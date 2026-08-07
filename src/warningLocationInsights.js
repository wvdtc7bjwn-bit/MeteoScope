export function findEarlyWarningAreaForMunicipality(areaCode, warningData = {}) {
  const code = String(areaCode ?? "");
  if (!code) return null;
  const candidates = [
    ...(warningData.earlyWarnings?.municipalityAreas ?? []),
    ...(warningData.earlyMunicipalityAreas ?? [])
  ];
  return candidates.find((area) => String(area.areaCode) === code) ?? null;
}

export function buildMyAreaWarningSummaries(myAreas = [], data = {}) {
  if (!myAreas.length) return [];
  const activeAreaByCode = new Map((data?.activeAreas ?? []).map((area) => [String(area.areaCode), area]));
  return myAreas.map((area) => {
    const activeArea = activeAreaByCode.get(String(area.areaCode));
    return {
      ...area,
      warnings: activeArea?.warnings ?? [],
      updatedAt: activeArea?.updatedAt ?? data?.updatedAt ?? data?.latestTime ?? "",
      hasWarnings: Boolean(activeArea?.warnings?.length)
    };
  });
}

export function buildMyAreaEarlyWarningSummaries(myAreas = [], data = {}) {
  if (!myAreas.length) return [];
  return myAreas.map((area) => {
    const earlyArea = findEarlyWarningAreaForMunicipality(area.areaCode, data);
    const probabilities = (earlyArea?.probabilities ?? [])
      .filter((probability) => ["high", "middle"].includes(probability?.level));
    return {
      ...area,
      probabilities,
      displayAreaCode: earlyArea?.displayAreaCode ?? "",
      displayAreaName: earlyArea?.displayAreaName ?? "",
      updatedAt: earlyArea?.updatedAt ?? data?.earlyWarnings?.updatedAt ?? data?.earlyWarnings?.latestTime ?? "",
      hasEarlyWarnings: probabilities.length > 0
    };
  });
}
