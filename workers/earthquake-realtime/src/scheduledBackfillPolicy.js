export function getJstDateString(offsetDays = 0, nowMs = Date.now()) {
  return new Date(nowMs + 9 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function buildGdBackfillDates(nowMs = Date.now(), previousSuccessAt = null) {
  const today = getJstDateString(0, nowMs);
  const previousSuccessMs = previousSuccessAt ? Date.parse(previousSuccessAt) : Number.NaN;
  const previousSuccessDate = Number.isFinite(previousSuccessMs)
    ? getJstDateString(0, previousSuccessMs)
    : null;
  return previousSuccessDate === today
    ? [today]
    : [getJstDateString(1, nowMs), today];
}
