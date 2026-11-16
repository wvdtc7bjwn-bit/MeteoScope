// Deterministic teaching cadence, not JMA's issuance algorithm. Earlier reviews
// are denser; batches of new station arrivals shorten nearby review intervals.
// Keep the first and final times fixed and never use wall-clock randomness.
export function buildSimulationReviewTimes(start, end, count, observationTimes = []) {
  if (!(end > start)) return [start];
  const intervals = Math.max(1, Math.min(count - 1, Math.floor((end - start) / .1)));
  const arrivals = observationTimes.filter(time => Number.isFinite(time) && time > start && time <= end).sort((a, b) => a - b);
  const batchSize = Math.max(1, arrivals.length / intervals);
  let cursor = 0;
  const weights = Array.from({ length: intervals }, (_, index) => {
    const limit = start + (end - start) * (index + 1) / intervals;
    const before = cursor;
    while (cursor < arrivals.length && arrivals[cursor] <= limit) cursor++;
    const evidence = Math.min(2, (cursor - before) / batchSize);
    return (.65 + .7 * index / Math.max(1, intervals - 1)) / (1 + evidence * .2);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cumulative = 0;
  return [start, ...weights.map((weight, index) => {
    cumulative += weight;
    return index === intervals - 1 ? end : Number((start + (end - start) * cumulative / total).toFixed(2));
  })];
}
