const TSUNAMI_LEVELS = {
  "major-warning": { label: "大津波警報", color: "#b400ff", rank: 4, lineWidth: 6 },
  warning: { label: "津波警報", color: "#ff2b12", rank: 3, lineWidth: 5 },
  advisory: { label: "津波注意報", color: "#f4d000", rank: 2, lineWidth: 4 },
  forecast: { label: "津波予報", color: "#168bd2", rank: 1, lineWidth: 3 },
  none: { label: "発表終了", color: "#8594a6", rank: 0, lineWidth: 2 }
};

export function getTsunamiLevelLabel(level) {
  return TSUNAMI_LEVELS[level]?.label ?? "津波情報";
}

export function getTsunamiLevelColor(level) {
  return TSUNAMI_LEVELS[level]?.color ?? TSUNAMI_LEVELS.none.color;
}

export function getTsunamiLevelRank(level) {
  return TSUNAMI_LEVELS[level]?.rank ?? 0;
}

export function getTsunamiLevelLineWidth(level) {
  return TSUNAMI_LEVELS[level]?.lineWidth ?? TSUNAMI_LEVELS.none.lineWidth;
}
