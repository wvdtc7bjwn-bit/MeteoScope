export function groupHypocenterItemsByCoordinate(items = []) {
  const groups = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    if (item?.latitude === null || item?.latitude === undefined
      || item?.longitude === null || item?.longitude === undefined
      || String(item.latitude).trim() === "" || String(item.longitude).trim() === "") continue;
    const latitude = Number(item?.latitude);
    const longitude = Number(item?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...item,
        latitude,
        longitude,
        coordinateEventCount: 1,
        maximumMagnitude: Number.isFinite(Number(item?.magnitude))
          ? Number(item.magnitude)
          : null
      });
      continue;
    }

    existing.coordinateEventCount += 1;
    const magnitude = Number(item?.magnitude);
    if (Number.isFinite(magnitude)) {
      existing.maximumMagnitude = existing.maximumMagnitude === null
        ? magnitude
        : Math.max(existing.maximumMagnitude, magnitude);
    }
  }

  return [...groups.values()];
}

export function countHypocenterCoordinates(items = []) {
  return groupHypocenterItemsByCoordinate(items).length;
}
