// A render event is emitted after MapLibre paints. Only the required basemap
// sources gate startup; optional imagery and world geometry must not gate it.
export function waitForInitialMapGeometry(map, {
  sourceIds,
  layerIds,
  timeoutMs = 8000,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  onState = () => {}
}) {
  return new Promise((resolve) => {
    const required = new Set(sourceIds);
    let settled = false;
    let sourcesReady = false;
    let timer;
    const finish = (ready, reason) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      for (const [event, handler] of listeners) map.off(event, handler);
      onState(ready ? "paint-ready" : reason);
      resolve(ready);
    };
    const ready = () => {
      try {
        return sourceIds.every(id => map.getSource(id) && map.isSourceLoaded(id))
          && layerIds.every(id => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
      } catch {
        // Style/source metadata may not yet have been installed.
        return false;
      }
    };
    const requestPaint = () => {
      if (settled || !ready()) return;
      if (!sourcesReady) {
        sourcesReady = true;
        onState("sources-ready");
      }
      map.triggerRepaint();
    };
    const onRender = () => {
      if (!ready()) return;
      if (!sourcesReady) { sourcesReady = true; onState("sources-ready"); }
      finish(true);
    };
    const onError = (event) => {
      // MapLibre regards errored tiles as settled too. A source-loaded check
      // alone must therefore never turn a failed required tile into success.
      if (required.has(event.sourceId)) finish(false, "source-error");
    };
    const onRemove = () => finish(false, "removed");
    const onContextLost = () => finish(false, "context-lost");
    const listeners = [
      ["sourcedata", requestPaint], ["styledata", requestPaint],
      ["load", requestPaint], ["render", onRender], ["error", onError],
      ["remove", onRemove], ["webglcontextlost", onContextLost]
    ];
    for (const [event, handler] of listeners) map.on(event, handler);
    timer = setTimer(() => finish(false, "timeout"), timeoutMs);
    onState("waiting");
    requestPaint();
  });
}
