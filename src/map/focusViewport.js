// Keep a useful map area even when a sheet occupies most of a short screen.
export function calculateFocusPadding({ width, height, top = 0, bottom = 0 }) {
  const side = Math.min(width * .1, width <= 800 ? 26 : 48);
  const maximumCovered = Math.max(0, height - Math.min(180, height * .5));
  const requestedTop = Math.max(16, top + 16);
  const requestedBottom = Math.max(16, bottom + 18);
  const scale = Math.min(1, maximumCovered / (requestedTop + requestedBottom));
  return { top: Math.round(requestedTop * scale), right: Math.round(side),
    bottom: Math.round(requestedBottom * scale), left: Math.round(side) };
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
