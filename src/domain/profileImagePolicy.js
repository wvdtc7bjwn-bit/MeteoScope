export const PROFILE_IMAGE_SIDE = 256;
export const MAX_PROFILE_IMAGE_BYTES = 64 * 1024;

// Only the small JPEG produced by the editor is stored. Never accept remote
// image URLs, SVG documents or arbitrary data URLs as an account image.
export function validateProfileAvatar(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3) * 4 + 24
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new TypeError("アイコン画像の形式またはサイズが正しくありません。");
  }
  let bytes;
  try { bytes = Uint8Array.from(atob(value.slice(23)), char => char.charCodeAt(0)); }
  catch { throw new TypeError("アイコン画像を読み込めません。"); }
  if (bytes.length > MAX_PROFILE_IMAGE_BYTES || bytes[0] !== 255 || bytes[1] !== 216
    || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new TypeError("アイコン画像が正しくありません。");
  let sizeValid = false;
  for (let offset = 2; offset < bytes.length - 1;) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset += 1;
    const marker = bytes[offset++];
    if (marker === 218) { if (sizeValid) return value; break; }
    if (marker === 217 || offset + 1 >= bytes.length) break;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 192 || marker === 194) {
      if (length < 8) break;
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      sizeValid = width > 0 && height > 0 && width <= PROFILE_IMAGE_SIDE && height <= PROFILE_IMAGE_SIDE;
      if (!sizeValid) break;
    }
    offset += length;
  }
  throw new TypeError("アイコン画像は256px以内のJPEGで保存してください。");
}
