export const HYPOCENTER_3D_MAX_ITEMS = 2500;
export const HYPOCENTER_3D_VERTICAL_EXAGGERATION = 3;

export function normalizeHypocenter3DItems(items = [], colorForDepth) {
  return items.slice(0, HYPOCENTER_3D_MAX_ITEMS).flatMap((item) => {
    const rawLongitude = item?.longitude;
    const rawLatitude = item?.latitude;
    if (rawLongitude == null || rawLongitude === "" || rawLatitude == null || rawLatitude === "") return [];
    const longitude = Number(rawLongitude);
    const latitude = Number(rawLatitude);
    const depthValue = Number(item?.depthKm);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return [];

    const depthKm = Number.isFinite(depthValue) ? Math.min(700, Math.max(0, depthValue)) : 0;
    const magnitude = Number(item?.magnitude);
    return [{
      id: String(item?.id ?? `${longitude}-${latitude}-${depthKm}`),
      longitude,
      latitude,
      depthKm,
      magnitude: Number.isFinite(magnitude) ? magnitude : null,
      pointSize: Number.isFinite(magnitude) ? Math.max(7, Math.min(20, 6 + magnitude * 1.8)) : 8,
      color: colorForDepth?.(Number.isFinite(depthValue) ? depthKm : null) ?? "#8b98a8",
      source: item
    }];
  });
}

export function projectMercatorPoint(matrix, coordinate, width, height) {
  if (!Array.isArray(matrix) && !ArrayBuffer.isView(matrix)) return null;
  if (!coordinate || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const x = Number(coordinate.x);
  const y = Number(coordinate.y);
  const z = Number(coordinate.z);
  if (![x, y, z].every(Number.isFinite)) return null;

  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!Number.isFinite(clipW) || clipW <= 0) return null;

  return {
    x: (clipX / clipW + 1) * width / 2,
    y: (1 - clipY / clipW) * height / 2
  };
}

export function parseHexColor(value, fallback = [0.55, 0.6, 0.66]) {
  const match = String(value ?? "").trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu);
  if (!match) return fallback;
  return match.slice(1).map((component) => Number.parseInt(component, 16) / 255);
}
