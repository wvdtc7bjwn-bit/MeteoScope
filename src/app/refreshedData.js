import { findLatestRadarObservationIndex } from "../jma/radar.js";

function mergeRefreshedData(tabId, currentData, nextData) {
  if (tabId === "warnings") return mergeWarningTabData(currentData, nextData);
  if (tabId === "amedas") return mergeAmedasData(currentData, nextData);
  if (tabId !== "radar" || !currentData?.frames?.length || !nextData?.frames?.length) return nextData;

  const currentIndex = clampIndex(currentData.activeFrameIndex, currentData.frames);
  const currentFrame = currentData.frames[currentIndex] ?? null;
  const currentLatestObservationIndex = findLatestRadarObservationIndex(currentData.frames);
  const nextLatestObservationIndex = findLatestRadarObservationIndex(nextData.frames);

  if (currentIndex === currentLatestObservationIndex && nextLatestObservationIndex >= 0) {
    return { ...nextData, activeFrameIndex: nextLatestObservationIndex };
  }

  const sameFrameIndex = nextData.frames.findIndex((frame) =>
    frame.validtime === currentFrame?.validtime &&
    frame.isForecast === currentFrame?.isForecast
  );

  return {
    ...nextData,
    activeFrameIndex: sameFrameIndex >= 0
      ? sameFrameIndex
      : clampIndex(currentIndex, nextData.frames)
  };
}

function mergeAmedasData(currentData, nextData) {
  if (!currentData || !nextData) return nextData;
  return {
    ...nextData,
    temperatureRankings: nextData.temperatureRankings?.status === "ok"
      ? nextData.temperatureRankings
      : currentData.temperatureRankings,
    windRankings: nextData.windRankings?.status === "ok"
      ? nextData.windRankings
      : currentData.windRankings,
    pressureRankings: nextData.pressureRankings?.status === "ok"
      ? nextData.pressureRankings
      : currentData.pressureRankings
  };
}

function mergeWarningTabData(currentData, nextData = {}) {
  if (!currentData) return nextData;
  if (nextData.detailsLoaded) {
    const activeAreas = mergeWarningAreaDetails(currentData.activeAreas, nextData.activeAreas);
    const outlookAreas = mergeWarningOutlookAreas(currentData.outlookAreas, nextData.outlookAreas);
    const groups = mergeWarningGroupDetails(nextData.groups, activeAreas);
    const statusDetailAreaCodes = [...new Set([
      ...(currentData.statusDetailAreaCodes ?? []),
      ...(nextData.statusDetailAreaCodes ?? [])
    ].map(String))];
    const preserveEarlyDetails = !nextData.earlyDetailsLoaded && currentData.earlyDetailsLoaded;
    return {
      ...currentData,
      ...nextData,
      activeAreas,
      outlookAreas,
      groups,
      earlyWarnings: preserveEarlyDetails ? currentData.earlyWarnings : nextData.earlyWarnings,
      earlyAreas: preserveEarlyDetails ? currentData.earlyAreas : nextData.earlyAreas,
      earlyMunicipalityAreas: preserveEarlyDetails
        ? currentData.earlyMunicipalityAreas
        : nextData.earlyMunicipalityAreas,
      statusDetailsLoaded: Boolean(currentData.statusDetailsLoaded || nextData.statusDetailsLoaded),
      statusDetailAreaCodes,
      earlyDetailsLoaded: Boolean(currentData.earlyDetailsLoaded || nextData.earlyDetailsLoaded),
      detailsLoaded: true,
      kikikuru: nextData.kikikuru ?? currentData.kikikuru,
      riverFlood: nextData.riverFlood ?? currentData.riverFlood
    };
  }

  return {
    ...currentData,
    ...nextData,
    earlyWarnings: currentData.earlyWarnings ?? nextData.earlyWarnings,
    earlyAreas: currentData.earlyAreas ?? nextData.earlyAreas,
    earlyMunicipalityAreas: currentData.earlyMunicipalityAreas ?? nextData.earlyMunicipalityAreas,
    kikikuru: currentData.kikikuru ?? nextData.kikikuru,
    riverFlood: currentData.riverFlood ?? nextData.riverFlood,
    statusDetailsLoaded: Boolean(currentData.statusDetailsLoaded),
    statusDetailAreaCodes: currentData.statusDetailAreaCodes ?? [],
    earlyDetailsLoaded: Boolean(currentData.earlyDetailsLoaded),
    detailsLoaded: Boolean(currentData.detailsLoaded)
  };
}

function mergeWarningAreaDetails(currentAreas = [], nextAreas = []) {
  const currentByCode = new Map((currentAreas ?? []).map((area) => [String(area.areaCode), area]));
  return (nextAreas ?? []).map((area) => {
    const current = currentByCode.get(String(area.areaCode));
    if (!current || area.outlook?.length) return area;
    return { ...area, outlook: current.outlook ?? [] };
  });
}

function mergeWarningOutlookAreas(currentAreas = [], nextAreas = []) {
  const merged = new Map((currentAreas ?? []).map((area) => [String(area.areaCode), area]));
  (nextAreas ?? []).forEach((area) => merged.set(String(area.areaCode), area));
  return [...merged.values()];
}

function mergeWarningGroupDetails(nextGroups = [], activeAreas = []) {
  const detailByCode = new Map((activeAreas ?? []).map((area) => [String(area.areaCode), area]));
  return (nextGroups ?? []).map((group) => ({
    ...group,
    areas: (group.areas ?? []).map((area) => detailByCode.get(String(area.areaCode)) ?? area)
  }));
}

function clampIndex(index, items = []) {
  if (!items.length) return 0;
  return Math.max(0, Math.min(items.length - 1, Number(index) || 0));
}

export {
  mergeRefreshedData,
  mergeWarningTabData
};
