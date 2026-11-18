// Display-only inverse of the relation adopted for shallow inland earthquakes
// in J-SHIS (Takemura 1990): Mw = 0.78 Mj + 1.08. This is an empirical
// reference, not a JMA waveform-derived magnitude or a new calculation input.
// https://www.j-map.bosai.go.jp/j-map/result/tn_246/html/html/2-4-1.html
const referenceM = mw => (mw - 1.08) / .78;
const inReferenceRange = value => Number.isFinite(value) && value > 5 && value <= 8;

export function canConvertSimulationMagnitude(options, sources, isOnLand) {
  // Conservative application limits chosen by MeteoScope. Point/active-fault
  // models use the crustal calculation; land coverage alone is not evidence
  // about the mechanism of an actual earthquake. Missing data never qualifies.
  return ["point", "active-fault"].includes(options.model)
    && (!options.earthquakeType || options.earthquakeType === "crustal")
    && options.depthKm >= 0 && options.depthKm <= 20
    && inReferenceRange(referenceM(options.magnitude))
    && sources.length > 0 && typeof isOnLand === "function"
    && sources.every(source => {
      const depth = source.depthKm ?? options.depthKm;
      return depth >= 0 && depth <= 20 && Boolean(isOnLand(source.coordinates));
    });
}

export function simulationMagnitudeDisplay(mw, convertible) {
  if (!Number.isFinite(mw)) return Object.freeze({value: null, scale: "Mw", converted: false});
  const value = referenceM(mw);
  if (convertible && inReferenceRange(value))
    return Object.freeze({value: Math.round(value * 10) / 10, scale: "M", converted: true});
  return Object.freeze({value: mw, scale: "Mw", converted: false});
}

// Choose ONE numerical scale for the entire precomputed bulletin sequence.
// If even one estimate crosses the empirical bounds, use original Mw values
// for every bulletin. Never clamp, extrapolate or switch scales mid-scene.
export function simulationMagnitudeTrajectory(reports,eligible){
  const convertible=eligible&&reports.every(r=>!Number.isFinite(r.magnitude)||inReferenceRange(referenceM(r.magnitude)));
  return new Map(reports.map(r=>[r,simulationMagnitudeDisplay(r.magnitude,convertible)]));
}
