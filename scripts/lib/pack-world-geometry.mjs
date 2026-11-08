export function packWorldGeometry(collection) {
  const bytes = [];
  function writeDelta(delta) {
    let value = ((delta << 1) ^ (delta >> 31)) >>> 0;
    while (value >= 128) {
      bytes.push((value & 127) | 128);
      value >>>= 7;
    }
    bytes.push(value);
  }
  const features = collection.features.map((feature) => {
    const { type, coordinates } = feature.geometry;
    if (!["Polygon", "MultiPolygon"].includes(type)) throw new Error("Unsupported geometry");
    const polygons = type === "Polygon" ? [coordinates] : coordinates;
    const rings = polygons.map((polygon) => polygon.map((ring) => {
      let x = 0;
      let y = 0;
      for (const [lng, lat] of ring) {
        const nextX = Math.round(lng * 10000);
        const nextY = Math.round(lat * 10000);
        writeDelta(nextX - x);
        writeDelta(nextY - y);
        x = nextX;
        y = nextY;
      }
      return ring.length;
    }));
    return { iso: feature.properties.ISO_A3, type, rings };
  });
  return { features, coordinates: Buffer.from(bytes).toString("base64") };
}

export function worldGeometryModule(collection) {
  return '// Natural Earth 1:10m Admin 0 Countries, public domain.\n' +
    'import { decodeWorldGeometry } from "../packedWorldGeometry.js";\n' +
    `export const worldCountriesGeoJson = decodeWorldGeometry(${JSON.stringify(packWorldGeometry(collection))});\n`;
}
