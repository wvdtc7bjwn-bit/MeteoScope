import { decodeRawPng } from "./rawPng.js";

// At most two decoded numeric rasters; do not retain an unbounded pixel cache.
const decoded = new Map();
export async function readPngPixel(data, x, y, size) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) throw new Error("Invalid PNG pixel coordinate");
  let entry = decoded.get(data);
  if (!entry || entry.size !== size) {
    entry = { size, promise: decodeRawPng(data, size) };
    decoded.set(data, entry);
    while (decoded.size > 2) decoded.delete(decoded.keys().next().value);
    entry.promise.catch(() => { if (decoded.get(data) === entry) decoded.delete(data); });
  }
  const raster = await entry.promise;
  if (raster) return raster.pixel(x, y);
  // Older browsers/other PNG encodings retain the previous native image path.
  const bitmap = await createImageBitmap(new Blob([data], { type: "image/png" }), {
    colorSpaceConversion: "none", premultiplyAlpha: "none"
  });
  try {
    if (bitmap.width !== size || bitmap.height !== size) throw new Error("Invalid PNG dimensions");
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  } finally { bitmap.close(); }
}
