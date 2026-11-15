// The existing USGS map traces are a geometric proxy for the Kuril/Japan/
// Izu-Bonin trench axes; this is not a 3-D plate or Q-structure calculation.
export function createDeepTrenchLookup(data) {
  const lines = (data?.features ?? []).filter(feature => feature.properties?.LABEL === "Convergent Boundary"
    && feature.properties?.NAME?.includes("Pacific") && feature.geometry?.type === "LineString")
    .map(feature => feature.geometry.coordinates.filter(point => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)))
    .filter(line => line.length > 1);
  if (!lines.length) return null;
  return point => {
    if (point[0] < 120 || point[0] > 170 || point[1] < 20 || point[1] > 60) return null;
    const scaleY = 111.195;
    const scaleX = scaleY * Math.cos(point[1] * Math.PI / 180);
    let nearest = Infinity;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const x = (line[i - 1][0] - point[0]) * scaleX;
      const y = (line[i - 1][1] - point[1]) * scaleY;
      const dx = (line[i][0] - line[i - 1][0]) * scaleX;
      const dy = (line[i][1] - line[i - 1][1]) * scaleY;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 0 ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
      nearest = Math.min(nearest, Math.hypot(x + t * dx, y + t * dy));
    }
    return Number.isFinite(nearest) ? nearest : null;
  };
}
