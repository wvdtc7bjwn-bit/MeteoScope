const TSUNAMI_LEVEL_RANK = Object.freeze({
  "major-warning": 4,
  warning: 3,
  advisory: 2,
  forecast: 1,
  none: 0
});

export function getMobileTsunamiLevelRank(level) {
  return TSUNAMI_LEVEL_RANK[level] ?? -1;
}

export function groupMobileTsunamiAreas(areas) {
  return [...(Array.isArray(areas) ? areas : [])]
    .filter((area) => area?.level !== "none" && typeof area?.name === "string" && area.name.trim())
    .sort((left, right) => getMobileTsunamiLevelRank(right.level) - getMobileTsunamiLevelRank(left.level))
    .reduce((groups, area) => {
      const current = groups.at(-1);
      if (current?.level === area.level) {
        current.areas.push(area);
      } else {
        groups.push({ level: area.level, areas: [area] });
      }
      return groups;
    }, []);
}
