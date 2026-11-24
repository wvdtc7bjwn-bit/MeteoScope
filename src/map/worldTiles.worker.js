import { worldLandGeoJson } from "./data/worldLandGeoJson.js";
import { createWorldTileIndex, encodeWorldTile } from "./worldTileGeometry.js";

// Decode and index the packed dataset here. Only individual transferable tile
// buffers cross the main thread; the full coordinate tree stays in this worker.
const index = createWorldTileIndex(worldLandGeoJson);
self.onmessage = ({ data: { id, z, x, y } }) => {
  try {
    const data = encodeWorldTile(index, z, x, y);
    self.postMessage({ id, data }, [data]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
