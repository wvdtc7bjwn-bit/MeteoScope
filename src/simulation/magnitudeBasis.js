// Calculation accepts Mw only. Old public-M settings/metadata must not be
// relabelled as Mw just because the numbers happen to match.
export function usesCalculationMw(options) {
  return options != null && (options.magnitudeBasis ?? "Mw") === "Mw"
    && options.assessmentCase == null && options.magnitudeSource == null;
}

export function normalizeMagnitudeBasis(options) {
  if (!usesCalculationMw(options))
    throw new RangeError("Only calculation Mw is supported; published-M settings must be reconfigured");
  return {magnitudeBasis: "Mw", assessmentCase: null, magnitudeSource: null};
}
