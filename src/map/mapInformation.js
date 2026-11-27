import { AMEDAS_DOT_RADIUS } from "./amedasValueMarker.js";

// Preserve zoom expressions at the top level, as required by MapLibre styles.
export function scaleStyleValue(value, scale) {
  if (scale === 1) return value;
  if (typeof value === "number") return value * scale;
  if (Array.isArray(value) && value[0] === "interpolate") {
    return value.map((item, index) => index >= 4 && index % 2 === 0 ? scaleStyleValue(item, scale) : item);
  }
  if (Array.isArray(value) && value[0] === "step") {
    return value.map((item, index) => index >= 2 && index % 2 === 0 ? scaleStyleValue(item, scale) : item);
  }
  return ["*", value, scale];
}
export function createMapInformationController() {
  const baseOpacity = new Map();
  return { apply(map, information, mode, prefectureOpacity) {
    if (!map?.getLayer) return;
    for (const id of ["world-country-line", "jma-municipality-line", "jma-municipality-fix-line", "japan-prefecture-line"]) {
      if (!map.getLayer(id)) continue;
      if (!baseOpacity.has(id)) baseOpacity.set(id, map.getPaintProperty(id, "line-opacity") ?? 1);
      const base = id === "japan-prefecture-line" && prefectureOpacity !== undefined ? prefectureOpacity : baseOpacity.get(id);
      map.setLayoutProperty(id, "visibility", information.boundaries ? "visible" : "none");
      map.setPaintProperty(id, "line-opacity", scaleStyleValue(base, information.boundaryOpacity));
    }
    if (map.getLayer("sample-label")) {
      map.setLayoutProperty("sample-label", "text-size", ["interpolate", ["linear"], ["zoom"],
        7, 10 * (mode === "amedas" ? information.markerScale : 1), 10, 13 * (mode === "amedas" ? information.markerScale : 1)]);
    }
    for (const id of ["sample-amedas-morph", "sample-amedas-value"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "icon-size", information.markerScale);
    }
    if (map.getLayer("sample-amedas-dot")) {
      map.setPaintProperty("sample-amedas-dot", "circle-radius", scaleStyleValue(AMEDAS_DOT_RADIUS, information.markerScale));
    }
  } };
}
