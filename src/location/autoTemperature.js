import { TEMPERATURE_ESTIMATION as policy } from "./temperatureEstimationPolicy.js";

// This selects a display source; it never changes either product's calculation
// or timestamp. Reliability categories are operational checks, not error bounds.
export function getAutoTemperatureFallbackReason(local, now = Date.now()) {
  if (!local) return "estimate-unavailable";
  if (local.loading && local.kind !== "estimated") return "calculating";
  if (local.kind === "unavailable") return "estimate-unavailable";
  const age = now - Date.parse(local.observationTime);
  if (!Number.isFinite(age) || age > policy.maxAgeMs || age < -policy.futureToleranceMs) return "stale-observations";
  if (local.confidence === "low" || local.flags?.includes("coarse-location")) return "low-confidence";
  if (!Number.isFinite(local.value)) return local.loading ? "calculating" : "estimate-unavailable";
  if (local.kind === "estimated" && ["high", "medium"].includes(local.confidence)) return "";
  if (local.kind === "observed" && !local.loading && local.confidence === "high"
    && Number.isFinite(local.nearest?.distanceKm) && local.nearest.distanceKm <= policy.coincidentKm) return "";
  return local.loading ? "calculating" : "estimate-unavailable";
}

export function selectAutoTemperature(local, jma, now = Date.now()) {
  const reason = getAutoTemperatureFallbackReason(local, now);
  const selected = reason ? jma : local;
  if (!selected) return null; // No location: preserve the existing location prompt.
  return { ...selected, autoSelection: {
    selectedSource: reason ? "jma" : "meteoscope", reason,
    localConfidence: local?.confidence ?? "unavailable",
    localObservationTime: local?.observationTime ?? null
  } };
}
