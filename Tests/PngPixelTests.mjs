import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { readPngPixel } from "../src/utils/pngPixel.js";
import { decodeRawPng } from "../src/utils/rawPng.js";
import { decodeElevationPixel } from "../src/location/groundElevation.js";
import { decodeJmaTemperaturePixel } from "../src/jma/estimatedTemperature.js";

function chunk(name, payload) {
  const type = Buffer.from(name), data = Buffer.concat([type, payload]);
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let i = 0; i < 8; i++) checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }
  const header = Buffer.alloc(4), trailer = Buffer.alloc(4);
  header.writeUInt32BE(payload.length); trailer.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, data, trailer]);
}
function png({ size = 256, type = 2, depth = 8, rows, palette, alpha, metadata = [] }) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = depth; header[9] = type;
  const data = deflateSync(rows);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), ...metadata,
    ...(palette ? [chunk("PLTE", palette)] : []), ...(alpha ? [chunk("tRNS", alpha)] : []),
    chunk("IDAT", data.subarray(0, data.length >> 1)), chunk("IDAT", data.subarray(data.length >> 1)), chunk("IEND", Buffer.alloc(0))]);
}
function predictor(left, above, corner) {
  const p = left + above - corner;
  return [left, above, corner].map((value, priority) => ({ value, priority, error: Math.abs(p - value) }))
    .sort((a, b) => a.error - b.error || a.priority - b.priority)[0].value;
}
function rgbRaster(size, channels = 3) {
  const stride = size * channels, pixels = Buffer.alloc(stride * size), rows = Buffer.alloc((stride + 1) * size);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + Math.floor(i / stride) * 11) % 256;
  for (let y = 0; y < size; y++) {
    const filter = y % 5, row = y * stride, output = y * (stride + 1); rows[output] = filter;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[row + i - channels] : 0, b = y ? pixels[row + i - stride] : 0, c = y && i >= channels ? pixels[row + i - stride - channels] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), predictor(a, b, c)][filter];
      rows[output + 1 + i] = (pixels[row + i] - prediction + 256) % 256;
    }
  }
  return { pixels, rows };
}

test("RGB/RGBA source channels remain exact through all five PNG row filters and split IDAT chunks", async () => {
  for (const [size, channels] of [[256, 3], [512, 4]]) {
    const { pixels, rows } = rgbRaster(size, channels);
    const gamma = Buffer.alloc(4); gamma.writeUInt32BE(100000);
    const image = png({ size, type: channels === 3 ? 2 : 6, rows, metadata: [chunk("gAMA", gamma)] });
    for (const y of [0, 1, 2, 3, 4, 5, 127, size - 1]) for (const x of [0, 1, 31, size - 1]) {
      const i = (y * size + x) * channels;
      assert.deepEqual(await readPngPixel(image, x, y, size), [...pixels.subarray(i, i + 3), channels === 4 ? pixels[i + 3] : 255]);
    }
  }
});

test("indexed 1/2/4/8-bit rasters preserve palette RGB and exact transparency without premultiplication", async () => {
  for (const depth of [1, 2, 4, 8]) {
    const size = 512, count = Math.min(4, 2 ** depth), stride = size * depth / 8, rows = Buffer.alloc((stride + 1) * size);
    const palette = Buffer.from([227,247,246, 0,9,216, 128,0,0, 0,116,255].slice(0, count * 3));
    const alpha = Buffer.from([255, 0, 128, 1].slice(0, count));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rows[y * (stride + 1) + 1 + Math.floor(x * depth / 8)] |= (x % count) << (8 - depth - (x * depth % 8));
    const image = png({ size, type: 3, depth, rows, palette, alpha });
    for (let x = 0; x < count; x++) assert.deepEqual(await readPngPixel(image, x, 42, size), [...palette.subarray(x * 3, x * 3 + 3), alpha[x]]);
    assert.deepEqual(decodeJmaTemperaturePixel(await readPngPixel(image, 0, 42, size)), { lowerC: 10, upperC: 11 });
    assert.equal(decodeJmaTemperaturePixel(await readPngPixel(image, 1, 42, size)), null);
  }
});

test("numeric elevation bytes, zero, negative elevation and RGB transparency are preserved", async () => {
  const size = 256, stride = size * 3, rows = Buffer.alloc((stride + 1) * size);
  rows.set([0, 9, 216, 255, 255, 156, 128, 0, 0], 1);
  const image = png({ rows, alpha: Buffer.from([0,128,0,0,0,0]) });
  assert.equal(decodeElevationPixel(...await readPngPixel(image, 0, 0, size)), 25.2);
  assert.equal(decodeElevationPixel(...await readPngPixel(image, 1, 0, size)), -1);
  assert.equal(decodeElevationPixel(...await readPngPixel(image, 2, 0, size)), null);
  assert.equal(decodeElevationPixel(...await readPngPixel(image, 3, 0, size)), 0);
});

test("truncation, checksum errors, invalid filters/size and out-of-bounds pixels fail closed", async () => {
  const { rows } = rgbRaster(256), good = png({ rows });
  const broken = Buffer.from(good); broken[29] ^= 1;
  await assert.rejects(readPngPixel(broken, 0, 0, 256), /checksum/);
  await assert.rejects(readPngPixel(good.subarray(0, good.length - 5), 0, 0, 256), /Truncated/);
  await assert.rejects(readPngPixel(good, 0, 0, 512), /dimensions/);
  const invalidFilter = Buffer.from(rows); invalidFilter[0] = 5;
  await assert.rejects(readPngPixel(png({ rows: invalidFilter }), 0, 0, 256), /filter/);
  await assert.rejects(readPngPixel(png({ rows: Buffer.concat([rows, Buffer.from([0])]) }), 0, 0, 256), /decompressed size/);
  for (const x of [-1, 256, .5, NaN]) await assert.rejects(readPngPixel(good, x, 0, 256), /coordinate/);
  assert.equal(await decodeRawPng(png({ rows, depth: 16 }), 256), null, "unsupported encodings use the established native fallback");
});
