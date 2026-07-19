import { writeFile } from "node:fs/promises";
import AdmZip from "adm-zip";

const SOURCE_URL = "https://www.sciencebase.gov/catalog/file/get/5aa1b00ee4b0b1c392e86467?f=__disk__64%2F49%2Fc1%2F6449c188b9af0381e3722fc6809e343f75a809de";
const OUTPUT_URL = new URL("../public/data/usgs-slab2-depth-contours-japan.geojson", import.meta.url);
const TARGET_REGIONS = new Map([
  ["Kuril", "太平洋プレート（日本・千島）"],
  ["Izu-Bonin", "太平洋プレート（伊豆・小笠原）"],
  ["Ryukyu", "フィリピン海プレート（琉球）"]
]);
const BOUNDS = { west: 118, south: 15, east: 160, north: 55 };
const SIMPLIFY_TOLERANCE = 0.012;
const REGIONAL_SEAM_SNAPS = [{
  fixedRegion: "Kuril",
  adjustedRegion: "Izu-Bonin",
  latitude: 35,
  latitudeTolerance: 0.02,
  maxGapKm: 12
}];

const response = await fetch(SOURCE_URL, {
  headers: { "User-Agent": "MeteoScope Slab2 data preparation" }
});
if (!response.ok) throw new Error(`USGS Slab2 download failed: ${response.status}`);

const archive = new AdmZip(Buffer.from(await response.arrayBuffer()));
const kmlEntry = archive.getEntry("doc.kml");
if (!kmlEntry) throw new Error("USGS Slab2 KMZ did not contain doc.kml");
const kml = kmlEntry.getData().toString("utf8");

const features = [];
for (const match of kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gu)) {
  const block = match[0];
  const region = readMatch(block, /<name>([^<]+)<\/name>/u);
  const plate = TARGET_REGIONS.get(region);
  if (!plate) continue;

  const depthKm = Number(readMatch(block, /<td>DEPTH<\/td>\s*<td>(\d+)<\/td>/u));
  if (!Number.isFinite(depthKm) || depthKm < 0 || depthKm > 700) continue;

  for (const lineMatch of block.matchAll(/<LineString\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gu)) {
    const coordinates = lineMatch[1]
      .trim()
      .split(/\s+/u)
      .map((entry) => entry.split(",").slice(0, 2).map(Number))
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));

    for (const segment of splitWithinBounds(coordinates)) {
      const simplified = simplifyLine(segment, SIMPLIFY_TOLERANCE).map(([longitude, latitude]) => [
        round(longitude, 4),
        round(latitude, 4)
      ]);
      if (simplified.length < 2) continue;
      features.push({
        type: "Feature",
        properties: {
          region,
          plate,
          depthKm,
          label: `${depthKm}km`
        },
        geometry: { type: "LineString", coordinates: simplified }
      });
    }
  }
}

const seamAdjustments = snapRegionalSeams(features);

features.sort((left, right) => (
  left.properties.region.localeCompare(right.properties.region)
  || left.properties.depthKm - right.properties.depthKm
));

if (!features.length) throw new Error("No Japan-area Slab2 contour features were generated");

const collection = {
  type: "FeatureCollection",
  features
};
await writeFile(OUTPUT_URL, `${JSON.stringify(collection)}\n`, "utf8");

const depths = [...new Set(features.map((feature) => feature.properties.depthKm))].sort((a, b) => a - b);
console.log(
  `Generated ${features.length} Slab2 contour lines (${depths[0]}-${depths.at(-1)} km, ${seamAdjustments.length} regional seam endpoints snapped)`
);

function snapRegionalSeams(sourceFeatures) {
  const adjustments = [];
  const depths = [...new Set(sourceFeatures.map((feature) => feature.properties.depthKm))];
  for (const seam of REGIONAL_SEAM_SNAPS) {
    for (const depthKm of depths) {
      const fixedFeatures = sourceFeatures.filter((feature) => (
        feature.properties.region === seam.fixedRegion && feature.properties.depthKm === depthKm
      ));
      const adjustedFeatures = sourceFeatures.filter((feature) => (
        feature.properties.region === seam.adjustedRegion && feature.properties.depthKm === depthKm
      ));
      const closest = findClosestSeamEndpoints(fixedFeatures, adjustedFeatures, seam);
      if (!closest) continue;
      closest.adjusted.feature.geometry.coordinates[closest.adjusted.coordinateIndex] = [
        ...closest.fixed.point
      ];
      Object.assign(closest.adjusted.feature.properties, {
        seamAdjusted: true,
        seamAdjustedTo: seam.fixedRegion,
        seamAdjustedEndpoint: closest.adjusted.endpointName,
        seamAdjustmentKm: round(closest.distanceKm, 2)
      });
      adjustments.push({ depthKm, distanceKm: closest.distanceKm });
    }
  }
  return adjustments;
}

function findClosestSeamEndpoints(fixedFeatures, adjustedFeatures, seam) {
  let closest = null;
  for (const fixedFeature of fixedFeatures) {
    for (const adjustedFeature of adjustedFeatures) {
      for (const fixed of lineEndpoints(fixedFeature)) {
        if (Math.abs(fixed.point[1] - seam.latitude) > seam.latitudeTolerance) continue;
        for (const adjusted of lineEndpoints(adjustedFeature)) {
          if (Math.abs(adjusted.point[1] - seam.latitude) > seam.latitudeTolerance) continue;
          const distanceKm = coordinateDistanceKm(fixed.point, adjusted.point);
          if (distanceKm > seam.maxGapKm || (closest && distanceKm >= closest.distanceKm)) continue;
          closest = { fixed, adjusted, distanceKm };
        }
      }
    }
  }
  return closest;
}

function lineEndpoints(feature) {
  const coordinates = feature.geometry.coordinates;
  return [
    { feature, point: coordinates[0], coordinateIndex: 0, endpointName: "start" },
    {
      feature,
      point: coordinates.at(-1),
      coordinateIndex: coordinates.length - 1,
      endpointName: "end"
    }
  ];
}

function coordinateDistanceKm(first, second) {
  const latitudeScale = Math.cos(((first[1] + second[1]) / 2) * Math.PI / 180);
  const longitudeDistance = (first[0] - second[0]) * latitudeScale;
  const latitudeDistance = first[1] - second[1];
  return Math.hypot(longitudeDistance, latitudeDistance) * 111.2;
}

function readMatch(value, pattern) {
  return value.match(pattern)?.[1]?.trim() ?? "";
}

function splitWithinBounds(coordinates) {
  const result = [];
  let current = [];
  for (const coordinate of coordinates) {
    if (isWithinBounds(coordinate)) {
      current.push(coordinate);
      continue;
    }
    if (current.length >= 2) result.push(current);
    current = [];
  }
  if (current.length >= 2) result.push(current);
  return result;
}

function isWithinBounds([longitude, latitude]) {
  return longitude >= BOUNDS.west
    && longitude <= BOUNDS.east
    && latitude >= BOUNDS.south
    && latitude <= BOUNDS.north;
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const squaredTolerance = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maximumDistance = 0;
    let maximumIndex = 0;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredSegmentDistance(points[index], points[first], points[last]);
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumDistance <= squaredTolerance) continue;
    keep[maximumIndex] = 1;
    stack.push([first, maximumIndex], [maximumIndex, last]);
  }

  return points.filter((_, index) => keep[index]);
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const progress = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (progress > 1) {
      x = end[0];
      y = end[1];
    } else if (progress > 0) {
      x += dx * progress;
      y += dy * progress;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
