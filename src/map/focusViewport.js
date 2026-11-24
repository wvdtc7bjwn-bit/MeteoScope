// Keep a useful map area even when a sheet occupies most of a short screen.
export function calculateFocusPadding({ width, height, top = 0, bottom = 0, obstructions = [], coordinates = [] }) {
  if (width > height && obstructions.length) {
    const free = findFocusRectangle(width, height, obstructions, coordinates);
    if (free) return { top: Math.ceil(free.top), right: Math.ceil(width - free.right),
      bottom: Math.ceil(height - free.bottom), left: Math.ceil(free.left) };
  }
  const side = Math.min(width * .1, width <= 800 ? 26 : 48);
  const maximumCovered = Math.max(0, height - Math.min(180, height * .5));
  const requestedTop = Math.max(16, top + 16);
  const requestedBottom = Math.max(16, bottom + 18);
  const scale = Math.min(1, maximumCovered / (requestedTop + requestedBottom));
  return { top: Math.round(requestedTop * scale), right: Math.round(side),
    bottom: Math.round(requestedBottom * scale), left: Math.round(side) };
}

// Enumerate empty rectangles bounded by visible controls. A tall distribution
// can use the space beside the dock; a wide one can use the strip above it.
function findFocusRectangle(width, height, obstructions, coordinates) {
  const inset = 16, gap = 12;
  const blocks = obstructions.filter(r => [r.left, r.right, r.top, r.bottom].every(Number.isFinite))
    .map(r => ({ left: Math.max(0, r.left - gap), right: Math.min(width, r.right + gap),
      top: Math.max(0, r.top - gap), bottom: Math.min(height, r.bottom + gap) }))
    .filter(r => r.left < r.right && r.top < r.bottom);
  const edges = (values, limit) => [...new Set([inset, limit - inset,
    ...values.filter(value => value > inset && value < limit - inset)])].sort((a, b) => a - b);
  const xs = edges(blocks.flatMap(r => [r.left, r.right]), width);
  const ys = edges(blocks.flatMap(r => [r.top, r.bottom]), height);
  const points = coordinates.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  const mercatorY = latitude => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, latitude)) * Math.PI / 360));
  const longitudeSpan = points.length ? (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) * Math.PI / 180 : 0;
  const latitudes = points.map(p => mercatorY(p[1]));
  const latitudeSpan = latitudes.length ? Math.max(...latitudes) - Math.min(...latitudes) : 0;
  let best = null, bestScale = -1, bestArea = -1;
  for (let l = 0; l < xs.length - 1; l++) for (let r = l + 1; r < xs.length; r++) {
    // A sliver beside the clock can be taller but leaves little context or
    // space for intensity labels. Keep at least a quarter-screen in width.
    if (xs[r] - xs[l] < Math.min(280, width / 4)) continue;
    for (let t = 0; t < ys.length - 1; t++) for (let b = t + 1; b < ys.length; b++) {
      const rect = { left: xs[l], right: xs[r], top: ys[t], bottom: ys[b] };
      const w = rect.right - rect.left, h = rect.bottom - rect.top;
      if (h < Math.min(100, height / 3) || blocks.some(block => rect.left < block.right && rect.right > block.left
        && rect.top < block.bottom && rect.bottom > block.top)) continue;
      const area = w * h;
      const scale = longitudeSpan > 0 || latitudeSpan > 0
        ? Math.min(longitudeSpan > 0 ? w / longitudeSpan : Infinity, latitudeSpan > 0 ? h / latitudeSpan : Infinity)
        : Math.sqrt(area);
      if (scale > bestScale + 1e-6 || (Math.abs(scale - bestScale) <= 1e-6 && area > bestArea)) {
        best = rect; bestScale = scale; bestArea = area;
      }
    }
  }
  return best;
}

// Only retain a view explicitly focused by the app. User camera input cancels it.
export function createViewportFocus({ padding, refocus }) {
  let target = null;
  return {
    remember(coordinates, options) {
      target = { coordinates, options, key: JSON.stringify(padding(options)) };
    },
    clear() { target = null; },
    refresh() {
      if (!target) return false;
      const key = JSON.stringify(padding(target.options));
      if (key === target.key) return false;
      target.key = key;
      refocus(target.coordinates, target.options);
      return true;
    }
  };
}
