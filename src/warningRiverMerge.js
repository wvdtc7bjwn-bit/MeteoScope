const RIVER_WARNING_LEVEL = {
  2: "advisory",
  3: "warning",
  4: "danger",
  5: "emergency"
};

const WARNING_RANK = {
  advisory: 1,
  warning: 2,
  danger: 3,
  emergency: 4
};

export function mergeRiverFloodWarningsIntoGroups(groups = [], reports = []) {
  const mergedGroups = groups.map((group) => ({
    ...group,
    areas: (group.areas ?? []).map((area) => ({
      ...area,
      warnings: [...(area.warnings ?? [])]
    }))
  }));
  const groupsByPrefecture = new Map(mergedGroups.map((group) => [String(group.prefecture ?? ""), group]));
  const areasByCode = new Map(mergedGroups.flatMap((group) =>
    group.areas.map((area) => [String(area.areaCode ?? ""), area])
  ));

  reports.forEach((report) => {
    const warning = buildRiverFloodWarning(report);
    if (!warning) return;
    const affectedAreas = uniqueAffectedAreas(report.affectedAreas);

    affectedAreas.forEach((affectedArea) => {
      const areaCode = String(affectedArea.cityCode ?? "").trim();
      if (!areaCode) return;
      let area = areasByCode.get(areaCode);
      if (!area) {
        const prefecture = String(affectedArea.prefecture ?? "").trim() || "対象地域";
        let group = groupsByPrefecture.get(prefecture);
        if (!group) {
          group = { prefecture, areas: [], count: 0 };
          groupsByPrefecture.set(prefecture, group);
          mergedGroups.push(group);
        }
        area = {
          areaCode,
          areaName: String(affectedArea.city ?? "").trim() || areaCode,
          prefecture,
          updatedAt: report.updatedAt,
          warnings: []
        };
        group.areas.push(area);
        areasByCode.set(areaCode, area);
      }

      if (!area.warnings.some((item) => item.riverFloodReportId === warning.riverFloodReportId)) {
        area.warnings.push(warning);
        area.warnings.sort((left, right) =>
          (WARNING_RANK[right.level] ?? 0) - (WARNING_RANK[left.level] ?? 0)
        );
      }
    });
  });

  mergedGroups.forEach((group) => {
    group.count = group.areas.length;
  });
  return mergedGroups;
}

function buildRiverFloodWarning(report = {}) {
  const level = Number(report.level);
  const warningLevel = RIVER_WARNING_LEVEL[level];
  if (!warningLevel) return null;
  const riverName = String(report.forecastAreaName ?? "").trim();
  const levelLabel = String(report.levelLabel ?? "").trim();
  return {
    id: `river-flood:${String(report.id ?? report.forecastAreaCode ?? riverName)}`,
    label: [riverName, levelLabel].filter(Boolean).join("・"),
    level: warningLevel,
    status: getRiverFloodWarningStatus(report),
    updatedAt: report.updatedAt,
    source: "river-flood",
    riverFloodReportId: String(report.id ?? "")
  };
}

export function getRiverFloodWarningStatus(report = {}) {
  const headline = String(report.headline ?? "");
  const marker = headline.match(/〔([^〕]+)〕/u)?.[1] ?? "";
  if (/継続/u.test(marker)) return "継続";
  if (/切替|引上げ|引下げ/u.test(marker)) return "切替";
  if (/新規/u.test(marker)) return "発表";
  return "発表";
}

function uniqueAffectedAreas(areas = []) {
  const byCode = new Map();
  (Array.isArray(areas) ? areas : []).forEach((area) => {
    const cityCode = String(area?.cityCode ?? "").trim();
    if (cityCode && !byCode.has(cityCode)) byCode.set(cityCode, area);
  });
  return [...byCode.values()];
}
