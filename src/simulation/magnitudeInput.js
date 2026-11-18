import { isReferenceMj, referenceMwFromMj } from "./magnitudeDisplay.js";

export class PointMagnitudeInputError extends RangeError {
  constructor(reason) {
    super(`Invalid custom Mj input: ${reason}`);
    this.reason = reason;
  }
}

// Input metadata is separate from magnitudeBasis, which remains calculation Mw.
// Retaining the original input makes normalization idempotent on reopen/retry.
export function normalizeSimulationMagnitudeInput(options) {
  const scale = options.magnitudeInputScale ?? "Mw";
  if (scale === "Mw") return {};
  if (scale !== "Mj") throw new PointMagnitudeInputError("scale");
  if (options.model !== "point") throw new PointMagnitudeInputError("model");
  if ((options.earthquakeType ?? "crustal") !== "crustal") throw new PointMagnitudeInputError("type");
  if (options.depthKm == null || String(options.depthKm).trim() === ""
      || !Number.isFinite(Number(options.depthKm)) || Number(options.depthKm) < 0 || Number(options.depthKm) > 20)
    throw new PointMagnitudeInputError("depth");
  const raw = Object.hasOwn(options, "magnitudeInputValue") ? options.magnitudeInputValue : options.magnitude;
  const mj = raw == null || String(raw).trim() === "" ? NaN : Number(raw);
  if (!isReferenceMj(mj)) throw new PointMagnitudeInputError("range");
  return { magnitude: referenceMwFromMj(mj), magnitudeInputScale: "Mj", magnitudeInputValue: mj };
}
