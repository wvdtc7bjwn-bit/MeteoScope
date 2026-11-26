// Read source bytes without display colour correction or image smoothing.
export async function readPngPixel(data, x, y, size) {
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
