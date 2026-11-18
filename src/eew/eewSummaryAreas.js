import { normalizeEewAreaName } from "./eewForecastAreas.js";
import { EEW_SUMMARY_AREA_GROUPS } from "./eewSummaryAreaGroups.js";

const areaByCode = new Map();
const areaByName = new Map();
for (const group of EEW_SUMMARY_AREA_GROUPS) {
  for (const [code, name] of group.areas) {
    const area = { code, name, group };
    areaByCode.set(code, area);
    areaByName.set(normalizeEewAreaName(name), area);
  }
}

// Used by both live EEW and simulation. Only complete districts are collapsed:
// a single targeted subdivision in every prefecture does not mean full coverage.
export function summarizeEewAreaNames(warnAreas = []) {
  const entries = new Map();
  for (const input of Array.isArray(warnAreas) ? warnAreas : []) {
    const name = String(input?.name ?? "").trim();
    const normalizedName = normalizeEewAreaName(name);
    const code = String(input?.code ?? "").trim();
    const knownCode = areaByCode.get(code);
    const namedArea = areaByName.get(normalizedName);
    const area = knownCode && namedArea && knownCode.code !== namedArea.code ? null : namedArea
      ?? (knownCode && !name ? knownCode : null);
    // An unknown or conflicting name is retained, never used to imply coverage.
    if (area) entries.set(area.code, { name: name || area.name, group: area.group });
    else if (name) entries.set(`name:${normalizedName}`, { name });
  }
  const completeGroups = EEW_SUMMARY_AREA_GROUPS.filter(group =>
    group.areas.every(([code]) => entries.has(code)));
  const complete = new Set(completeGroups);
  return [
    ...completeGroups.map(group => group.name),
    ...Array.from(entries.values()).filter(area => !complete.has(area.group)).map(area => area.name)
  ];
}
