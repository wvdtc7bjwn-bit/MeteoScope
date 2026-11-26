// Keep the displayed frame until the requested viewport tiles are ready.
// Three bounded buffers cover the display, a requested frame and one lookahead.
export function createRadarFrameRenderer(map, {
  levels, sourcePrefix, layerPrefix, beforeLayer = "jma-municipality-line",
  allowPrefetch = () => {
    const connection = globalThis.navigator?.connection;
    return !connection?.saveData && !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
  },
  reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  now = () => globalThis.performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = id => clearTimeout(id)
}) {
  const buffers = [];
  let current = null, pending = null, previous = null;
  let targetUrl = null, nextUrl = null, opacity = .9, visible = false, disposed = false;
  let selectedAt = -Infinity, rapidSelection = false;
  let requestTimer = null, fadeTimer = null;
  function clearTimer(name) {
    const id = name === "request" ? requestTimer : fadeTimer;
    if (id !== null) cancel(id);
    if (name === "request") requestTimer = null;
    else fadeTimer = null;
  }
  function setVisible(buffer, show) {
    if (!buffer) return;
    if (show && !buffer.visible) buffer.rendered = false;
    buffer.visible = show;
    for (const layer of buffer.layers) if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, "visibility", show ? "visible" : "none");
    }
  }
  function paint(buffer, value, duration = 0) {
    if (!buffer) return;
    for (const layer of buffer.layers) if (map.getLayer(layer)) {
      map.setPaintProperty(layer, "raster-opacity-transition", { duration, delay: 0 });
      map.setPaintProperty(layer, "raster-opacity", value);
    }
  }
  function drop(buffer) {
    for (const id of buffer.layers) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of buffer.sources) if (map.getSource(id)) map.removeSource(id);
    buffers.splice(buffers.indexOf(buffer), 1);
  }
  function getBuffer(url) {
    let buffer = buffers.find(item => item.url === url);
    if (buffer) return buffer;
    if (buffers.length === 3) {
      const unused = buffers.find(item => item !== current && item !== pending && item !== previous);
      if (!unused) return null;
      drop(unused);
    }
    const slot = [0, 1, 2].find(id => !buffers.some(item => item.slot === id));
    const suffix = slot ? `-frame-${slot}` : "";
    buffer = { slot, url, sources: [], layers: [], rendered: false, visible: true };
    for (const level of levels) {
      const source = `${sourcePrefix}${level.id}${suffix}`;
      const layer = `${layerPrefix}${level.id}${suffix}`;
      map.addSource(source, { type: "raster", tiles: [url.replace("{z}", String(level.z))],
        tileSize: level.tileSize ?? 256, minzoom: 0, maxzoom: level.z,
        bounds: [118, 20, 150, 48], attribution: "気象庁" });
      map.addLayer({ id: layer, type: "raster", source, minzoom: level.minzoom, maxzoom: level.maxzoom,
        paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0 },
          "raster-fade-duration": 0, "raster-resampling": "nearest" } }, beforeLayer);
      buffer.sources.push(source);
      buffer.layers.push(layer);
    }
    buffers.push(buffer);
    return buffer;
  }
  function ready(buffer) {
    if (!buffer?.rendered) return false;
    const zoom = map.getZoom();
    const index = levels.findIndex(level => zoom >= level.minzoom && zoom < level.maxzoom);
    return index < 0 || map.isSourceLoaded(buffer.sources[index]);
  }
  function finishFade() {
    clearTimer("fade");
    if (previous && previous !== current && previous !== pending) setVisible(previous, false);
    previous = null;
    if (current) paint(current, opacity);
  }
  function prefetch() {
    if (!visible || pending || !current || !ready(current) || !nextUrl || nextUrl === targetUrl
      || !allowPrefetch() || map.isMoving?.()) return;
    const buffer = getBuffer(nextUrl);
    if (buffer && buffer !== current && buffer !== previous) {
      paint(buffer, 0);
      setVisible(buffer, true); // Zero opacity loads tiles without showing them.
    }
  }
  function commit() {
    if (!visible || !pending || pending.url !== targetUrl || !ready(pending)) return;
    finishFade();
    previous = current;
    current = pending;
    pending = null;
    for (const layer of current.layers) map.moveLayer(layer, beforeLayer);
    const scrubbing = rapidSelection && now() - selectedAt < 180;
    const duration = previous && !reducedMotion() && !scrubbing ? 160 : 0;
    paint(previous, 0, duration);
    paint(current, opacity, duration);
    if (duration) fadeTimer = schedule(() => { fadeTimer = null; finishFade(); prefetch(); }, duration);
    else finishFade();
    prefetch();
  }
  function begin() {
    requestTimer = null;
    if (!visible || !targetUrl) return;
    if (pending?.url === targetUrl) { commit(); return; }
    finishFade();
    if (pending && pending !== current) setVisible(pending, false);
    pending = null;
    for (const buffer of buffers) if (buffer !== current && buffer.url !== targetUrl) setVisible(buffer, false);
    pending = getBuffer(targetUrl);
    if (!pending) return;
    paint(pending, 0);
    setVisible(pending, true);
    // Do not promote a newly created empty source before MapLibre renders once.
    commit();
  }
  function onRender() {
    for (const buffer of buffers) if (buffer.visible) buffer.rendered = true;
    if (pending) commit();
  }
  function onMoveEnd() { if (!pending) prefetch(); }
  function pause() {
    visible = false;
    clearTimer("request");
    finishFade();
    pending = null;
    for (const buffer of buffers) setVisible(buffer, false);
  }
  function update(options) {
    if (disposed) return;
    if (!options.visible || !options.tileUrl) { pause(); return; }
    visible = true;
    opacity = options.opacity ?? .9;
    nextUrl = options.nextTileUrl ?? null;
    if (targetUrl !== options.tileUrl) {
      const time = now();
      rapidSelection = time - selectedAt < 180;
      selectedAt = time;
    }
    targetUrl = options.tileUrl;
    if (current?.url === targetUrl) {
      clearTimer("request");
      if (pending && pending !== current) setVisible(pending, false);
      pending = null;
      finishFade();
      setVisible(current, true);
      paint(current, opacity);
      prefetch();
      return;
    }
    if (pending?.url === targetUrl) { clearTimer("request"); commit(); return; }
    if (!buffers.length || buffers.some(buffer => buffer.url === targetUrl)) {
      clearTimer("request");
      begin();
    } else if (requestTimer === null) {
      // A fixed deadline keeps loading during continuous input; it never waits
      // for the user to stop dragging. The callback reads the latest target.
      requestTimer = schedule(begin, 32);
    }
  }
  map.on("render", onRender);
  map.on("moveend", onMoveEnd);
  map.on("zoomend", onMoveEnd);
  function destroy(event) {
    if (disposed) return;
    if (event?.type === "remove") {
      // MapLibre has already destroyed its style before firing this event.
      clearTimer("request"); clearTimer("fade");
      visible = false;
    } else {
      pause();
      for (const buffer of [...buffers]) drop(buffer);
    }
    disposed = true;
    buffers.length = 0;
    map.off("render", onRender);
    map.off("moveend", onMoveEnd);
    map.off("zoomend", onMoveEnd);
    map.off("remove", destroy);
  }
  map.on("remove", destroy);
  return { update, hide: pause, destroy };
}
