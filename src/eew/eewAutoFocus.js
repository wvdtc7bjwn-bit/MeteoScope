const STORAGE_KEY = "meteoscope-eew-auto-focus";

// Keep event IDs for this session: reconnects and reports must not pull the
// camera back after the user has moved it. Only active store events are passed.
export function createEewAutoFocus(storage) {
  if (!storage) { try { storage = globalThis.localStorage; } catch {} }
  let enabled = true;
  try { enabled = storage?.getItem(STORAGE_KEY) !== "0"; } catch {}
  const focused = new Set();
  return {
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = Boolean(value);
      try { storage?.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch {}
    },
    focus(events, move) {
      if (!enabled) return false;
      const candidates = events.filter((event) => event.eventId && !focused.has(event.eventId)
        && !event.isCancel && !event.isTraining && !event.isAssumption
        && event.hypocenterMethod !== "level"
        && Array.isArray(event.coordinates) && event.coordinates.length === 2
        && event.coordinates.every(Number.isFinite)
        && Math.abs(event.coordinates[0]) <= 180 && Math.abs(event.coordinates[1]) <= 90);
      if (!candidates.length) return false;
      // Focus the most recently issued event, without queuing multiple flights.
      const event = candidates.reduce((latest, item) =>
        Date.parse(item.announcedTime) > Date.parse(latest.announcedTime) ? item : latest);
      candidates.forEach((item) => focused.add(item.eventId));
      move(event.coordinates);
      return true;
    }
  };
}
