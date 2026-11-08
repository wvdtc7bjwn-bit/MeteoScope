// Lossless delta/varint decoding of coordinates stored to four decimal places.
export function decodeWorldGeometry(packed) {
  const bytes = atob(packed.coordinates);
  let offset = 0;
  function readDelta() {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (offset >= bytes.length || shift > 28) throw new Error("Invalid world geometry");
      const byte = bytes.charCodeAt(offset++);
      value |= (byte & 127) << shift;
      if (!(byte & 128)) return (value >>> 1) ^ -(value & 1);
      shift += 7;
    }
  }
  const features = packed.features.map(({ iso, type, rings }) => {
    const polygons = rings.map((lengths) => lengths.map((length) => {
      let x = 0;
      let y = 0;
      return Array.from({ length }, () => {
        x += readDelta();
        y += readDelta();
        return [x / 10000, y / 10000];
      });
    }));
    return { type: "Feature", properties: { ISO_A3: iso }, geometry: {
      type, coordinates: type === "Polygon" ? polygons[0] : polygons
    } };
  });
  if (offset !== bytes.length) throw new Error("Unexpected world geometry bytes");
  return { type: "FeatureCollection", features };
}
