import { PROFILE_IMAGE_SIDE, validateProfileAvatar } from "../domain/profileImagePolicy.js";

export async function prepareProfileImage(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new TypeError("JPEG・PNG・WebPの画像を選択してください。");
  }
  if (file.size > 10 * 1024 * 1024) throw new TypeError("画像は10MB以下で選択してください。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new TypeError("画像を読み込めませんでした。別の画像を選択してください。"); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new TypeError("画像のサイズが大きすぎるか、読み込めません。");
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PROFILE_IMAGE_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("この端末では画像を処理できません。");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2,
      side, side, 0, 0, canvas.width, canvas.height);
    // Re-encoding also discards EXIF/location metadata from the original file.
    for (const quality of [0.85, 0.65, 0.45]) {
      try { return validateProfileAvatar(canvas.toDataURL("image/jpeg", quality)); } catch { /* Try a smaller image. */ }
    }
    throw new Error("画像を小さくして、もう一度選択してください。");
  } finally { URL.revokeObjectURL(url); }
}
