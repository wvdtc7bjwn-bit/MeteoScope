// Decode numeric rasters without a canvas, display profile or alpha rounding.
// Supports non-interlaced RGB/RGBA 8-bit and indexed PNGs used by GSI/JMA.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc(bytes, start, end) {
  let value = 0xffffffff;
  for (let i = start; i < end; i++) value = crcTable[(value ^ bytes[i]) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
async function inflate(chunks, expected) {
  const reader = new Blob(chunks).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  const output = new Uint8Array(expected);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error("Invalid PNG decompressed size");
      output.set(value, offset); offset += value.length;
    }
    if (offset !== expected) throw new Error("Truncated PNG pixels");
    return output;
  } finally { await reader.cancel().catch(() => {}); }
}

export async function decodeRawPng(data, size) {
  if (typeof DecompressionStream !== "function") return null;
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
  if (![256, 512].includes(size) || bytes.length < 33 || bytes.length > 4 * 1024 * 1024
    || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) throw new Error("Invalid PNG raster");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat = [];
  let width, height, depth, type, palette, alpha, ended = false, supported = true;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk");
    const length = view.getUint32(offset), start = offset + 8, end = start + length;
    if (end + 4 > bytes.length) throw new Error("Truncated PNG chunk");
    const name = String.fromCharCode(...bytes.subarray(offset + 4, start));
    if (crc(bytes, offset + 4, end) !== view.getUint32(end)) throw new Error("Invalid PNG checksum");
    if (offset === 8 && name !== "IHDR") throw new Error("Missing PNG header");
    if (name === "IHDR") {
      if (width !== undefined || length !== 13) throw new Error("Invalid PNG header");
      width = view.getUint32(start); height = view.getUint32(start + 4);
      if (width !== size || height !== size) throw new Error("Invalid PNG dimensions");
      depth = bytes[start + 8]; type = bytes[start + 9];
      supported = bytes[start + 10] === 0 && bytes[start + 11] === 0 && bytes[start + 12] === 0
        && (([2, 6].includes(type) && depth === 8) || (type === 3 && [1, 2, 4, 8].includes(depth)));
    } else if (name === "PLTE") {
      if (!length || length % 3 || length > 768 || idat.length) throw new Error("Invalid PNG palette");
      palette = bytes.slice(start, end);
    } else if (name === "tRNS") {
      if (idat.length) throw new Error("Invalid PNG transparency");
      alpha = bytes.slice(start, end);
    } else if (name === "IDAT") {
      idat.push(bytes.subarray(start, end));
    } else if (name === "IEND") {
      if (length !== 0) throw new Error("Invalid PNG end");
      ended = true; break;
    } else if ((bytes[offset + 4] & 32) === 0) {
      throw new Error("Unsupported critical PNG chunk");
    }
    offset = end + 4;
  }
  if (!ended || !idat.length) throw new Error("Incomplete PNG raster");
  if (!supported) return null; // Preserve the native decoder for other PNG formats.
  if (type === 3 && (!palette || palette.length / 3 > 2 ** depth || (alpha && alpha.length > palette.length / 3))) throw new Error("Invalid indexed PNG");
  if (alpha && ((type === 2 && alpha.length !== 6) || type === 6)) throw new Error("Invalid PNG transparency");
  const bpp = type === 2 ? 3 : type === 6 ? 4 : 1;
  const stride = type === 3 ? Math.ceil(width * depth / 8) : width * bpp;
  const filtered = await inflate(idat, (stride + 1) * height);
  const pixels = new Uint8Array(stride * height);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = filtered[input++], row = y * stride;
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[row + x - bpp] : 0;
      const b = y ? pixels[row + x - stride] : 0;
      const c = y && x >= bpp ? pixels[row + x - stride - bpp] : 0;
      pixels[row + x] = filtered[input++] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c));
    }
  }
  return { pixel(x, y) {
    if (type === 3) {
      const bit = x * depth, index = (pixels[y * stride + (bit >>> 3)] >>> (8 - depth - (bit % 8))) & ((1 << depth) - 1);
      if (index * 3 + 2 >= palette.length) throw new Error("Invalid PNG palette index");
      return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], alpha?.[index] ?? 255];
    }
    const i = y * stride + x * bpp;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const transparent = type === 2 && alpha && r === alpha[0] * 256 + alpha[1] && g === alpha[2] * 256 + alpha[3] && b === alpha[4] * 256 + alpha[5];
    return [r, g, b, type === 6 ? pixels[i + 3] : transparent ? 0 : 255];
  } };
}
