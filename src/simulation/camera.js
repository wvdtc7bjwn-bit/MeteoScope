const validPoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

// Unwrap around the source, including date-line events. Give single-point
// sources a bounded initial view rather than a street-level camera zoom.
function boundsFor(points, longitude) {
  const unwrapped = points.filter(validPoint).map(([lon, lat]) => [
    longitude + ((lon - longitude + 540) % 360 + 360) % 360 - 180,
    Math.max(-85, Math.min(85, lat)),
  ]);
  if (!unwrapped.length) return null;
  const west = Math.min(...unwrapped.map(p => p[0])), east = Math.max(...unwrapped.map(p => p[0]));
  const south = Math.min(...unwrapped.map(p => p[1])), north = Math.max(...unwrapped.map(p => p[1]));
  const cx = (west + east) / 2, cy = (south + north) / 2;
  return [cx - Math.max(1.2, east - west) / 2, Math.max(-85, cy - Math.max(.8, north - south) / 2),
    cx + Math.max(1.2, east - west) / 2, Math.min(85, cy + Math.max(.8, north - south) / 2)];
}

export function createSimulationCamera({ fitToCoordinates, onFollowingChange = () => {}, now = () => performance.now() }) {
  let sources = [], overview = [], anchor = 140, maxZoom = 6.8;
  let following = false, extent = null, lastFit = -Infinity, lastElapsed = null;
  const fit = (bounds, immediate = false) => {
    if (!bounds) return;
    fitToCoordinates([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { maxZoom, duration: immediate ? 0 : 300 });
    extent = bounds; lastFit = now();
  };
  function stopFollowing() { following = false; onFollowingChange(false); }
  function update(frame, immediate = false) {
    if (!following || !frame) return;
    const rewind = lastElapsed !== null && frame.elapsed < lastElapsed - .1;
    const jumped = lastElapsed !== null && frame.elapsed - lastElapsed > 3;
    lastElapsed = frame.elapsed;
    if (rewind) extent = null;
    const ruptured = sources.filter(source => source.ruptureDelaySec <= frame.elapsed).map(source => source.coordinates);
    const shaking = frame.stations.features.filter(feature => feature.properties.active).map(feature => feature.geometry.coordinates);
    const target = boundsFor([...ruptured, ...shaking], anchor);
    if (!target) return;
    if (!extent || immediate) { fit(target, true); return; }
    if (!jumped && now() - lastFit < 2000) return;
    const marginX = (extent[2] - extent[0]) * .08, marginY = (extent[3] - extent[1]) * .08;
    if (target[0] >= extent[0] - marginX && target[1] >= extent[1] - marginY && target[2] <= extent[2] + marginX && target[3] <= extent[3] + marginY) return;
    // Forward playback only expands; fading stations never zoom back in.
    fit([Math.min(extent[0], target[0]), Math.min(extent[1], target[1]), Math.max(extent[2], target[2]), Math.max(extent[3], target[3])]);
  }
  return {
    setScene(sceneSources, stations, zoom) {
      stopFollowing(); sources = sceneSources; anchor = sources.find(source => source.ruptureDelaySec === 0)?.coordinates[0] ?? 140;
      overview = [...sources.map(source => source.coordinates), ...stations.filter(station => station.predictedIntensityValue >= .5).map(station => station.coordinates)];
      maxZoom = zoom; extent = null; lastElapsed = null; lastFit = -Infinity;
    },
    follow(frame) { following = true; extent = null; lastElapsed = null; onFollowingChange(true); update(frame, true); },
    update, stopFollowing,
    showSource() { stopFollowing(); fit(boundsFor(sources.map(source => source.coordinates), anchor), true); },
    showOverview() { stopFollowing(); fit(boundsFor(overview, anchor), true); },
    reset() { stopFollowing(); sources = []; overview = []; extent = null; lastElapsed = null; },
    get following() { return following; },
  };
}
