export const WORLD_TILE_PROTOCOL = "meteoscope-world";
const registered = new WeakSet();

function aborted() { return new DOMException("World tile request aborted", "AbortError"); }

export function createWorldTileLoader({
  createWorker = () => new Worker(new URL("./worldTiles.worker.js", import.meta.url), { type: "module", name: "meteoscope-world-tiles" }),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  timeoutMs = 30000
} = {}) {
  let worker = null, sequence = 0;
  const pending = new Map();
  function reset(error) {
    worker?.terminate(); worker = null;
    for (const request of [...pending.values()]) request.finish(error);
  }
  function ensureWorker() {
    if (worker) return worker;
    const current = createWorker();
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      const request = pending.get(data?.id);
      if (!request) return; // A moved-away tile may have been cancelled.
      request.finish(data.error ? new Error(data.error) : null, data.data);
    };
    current.onerror = () => { if (worker === current) reset(new Error("World tile worker failed")); };
    current.onmessageerror = () => { if (worker === current) reset(new Error("Invalid world tile worker response")); };
    worker = current;
    return current;
  }
  async function load({ url }, abortController) {
    const match = /^meteoscope-world:\/\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/u.exec(url);
    if (!match) throw new Error("Invalid world tile URL");
    const [z, x, y] = match.slice(1).map(Number);
    if (z > 18 || x >= 2 ** z || y >= 2 ** z) throw new Error("Invalid world tile coordinates");
    const signal = abortController?.signal;
    if (signal?.aborted) throw aborted();
    const current = ensureWorker(), id = ++sequence;
    return new Promise((resolve, reject) => {
      let timer;
      const cancel = () => finish(aborted());
      const finish = (error, data) => {
        if (!pending.delete(id)) return;
        clearTimer(timer); signal?.removeEventListener("abort", cancel);
        if (error) reject(error);
        else if (!(data instanceof ArrayBuffer)) reject(new Error("Invalid world tile data"));
        else resolve({ data });
      };
      pending.set(id, { finish });
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimer(() => {
        finish(new Error("World tile request timed out"));
        if (!pending.size && worker === current) { current.terminate(); worker = null; }
      }, timeoutMs);
      try { current.postMessage({ id, z, x, y }); } catch (error) { reset(error); }
    });
  }
  load.dispose = () => reset(aborted());
  return load;
}

export function registerWorldTileProtocol(maplibre) {
  if (registered.has(maplibre)) return;
  maplibre.addProtocol(WORLD_TILE_PROTOCOL, createWorldTileLoader());
  registered.add(maplibre);
}

export function createWorldSource() {
  return { type: "vector", tiles: [`${WORLD_TILE_PROTOCOL}://tiles/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 18 };
}
