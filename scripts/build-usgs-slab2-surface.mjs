import { readFile, writeFile } from "node:fs/promises";
import {
  buildPlateDepthSurface,
  coordinateDistanceKm,
  countPlateDepthSurfaceTriangles
} from "../src/map/plateDepthSurfaceGeometry.js";

const SOURCE_URL = new URL("../public/data/usgs-slab2-depth-contours-japan.geojson", import.meta.url);
const BOUNDARY_SOURCE_URL = new URL("../public/data/usgs-plate-boundaries-japan.geojson", import.meta.url);
const OUTPUT_URL = new URL("../public/data/usgs-slab2-surface-japan.geojson", import.meta.url);
const contours = JSON.parse(await readFile(SOURCE_URL, "utf8"));
const boundaries = JSON.parse(await readFile(BOUNDARY_SOURCE_URL, "utf8"));
const zeroDepthContours = buildZeroDepthContours(boundaries);
const surface = buildPlateDepthSurface({
  ...contours,
  features: [...zeroDepthContours, ...contours.features]
});
const triangleCount = countPlateDepthSurfaceTriangles(surface);

if (!surface.features.length || triangleCount < 100) {
  throw new Error("USGS Slab2 surface generation produced too little geometry");
}

await writeFile(OUTPUT_URL, `${JSON.stringify(surface)}\n`, "utf8");
console.log(`Generated ${surface.features.length} Slab2 surface bands (${triangleCount} triangles)`);

function buildZeroDepthContours(collection) {
  const definitions = [
    { region: "Kuril", plate: "Pacific Plate", boundaryName: "North American:Pacific" },
    { region: "Izu-Bonin", plate: "Pacific Plate", boundaryName: "Pacific:Philippine" },
    { region: "Ryukyu", plate: "Philippine Sea Plate", boundaryName: "Eurasian:Philippine" }
  ];
  return definitions.flatMap((definition) => {
    const lines = collection.features
      .filter((feature) => feature?.properties?.LABEL === "Convergent Boundary")
      .filter((feature) => feature?.properties?.NAME === definition.boundaryName)
      .flatMap((feature) => feature?.geometry?.type === "LineString"
        ? [feature.geometry.coordinates]
        : (feature?.geometry?.type === "MultiLineString" ? feature.geometry.coordinates : []));
    return joinConnectedLines(lines, 12).map((coordinates) => ({
      type: "Feature",
      properties: {
        region: definition.region,
        plate: definition.plate,
        depthKm: 0,
        source: "USGS Tectonic Plate Boundaries convergent boundary"
      },
      geometry: { type: "LineString", coordinates }
    }));
  });
}

function joinConnectedLines(sourceLines, maximumGapKm) {
  const remaining = sourceLines.map((line) => line.map((coordinate) => [...coordinate]));
  const joined = [];
  while (remaining.length) {
    const current = remaining.shift();
    let changed = true;
    while (changed) {
      changed = false;
      let best = null;
      remaining.forEach((candidate, index) => {
        const variants = [
          { prepend: false, reverse: false, gap: coordinateDistanceKm(current.at(-1), candidate[0]) },
          { prepend: false, reverse: true, gap: coordinateDistanceKm(current.at(-1), candidate.at(-1)) },
          { prepend: true, reverse: false, gap: coordinateDistanceKm(current[0], candidate.at(-1)) },
          { prepend: true, reverse: true, gap: coordinateDistanceKm(current[0], candidate[0]) }
        ];
        for (const variant of variants) {
          if (variant.gap <= maximumGapKm && (!best || variant.gap < best.gap)) {
            best = { ...variant, index, candidate };
          }
        }
      });
      if (!best) continue;
      const candidate = best.reverse ? [...best.candidate].reverse() : best.candidate;
      if (best.prepend) current.unshift(...candidate.slice(0, -1));
      else current.push(...candidate.slice(1));
      remaining.splice(best.index, 1);
      changed = true;
    }
    joined.push(current);
  }
  return joined;
}
