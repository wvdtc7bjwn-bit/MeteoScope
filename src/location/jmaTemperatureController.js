import { createJmaTemperatureReader, jmaTemperatureTilePosition, JMA_TEMPERATURE_MAX_AGE_MS } from "../jma/estimatedTemperature.js";
import { normalizeLocationFix } from "./locationFix.js";

export function createJmaTemperatureController({ read = createJmaTemperatureReader(), onChange = () => {}, now = Date.now } = {}) {
  let generation = 0, last, result, abort;
  const unavailable = (location, reason, loading = false) => ({ source: "jma", kind: "unavailable", value: null,
    range: null, reason, loading, location: { coordinates: [...location.coordinates], ...normalizeLocationFix(location) } });
  return { update({ enabled, location }) {
    const coordinates = location?.coordinates;
    if (!enabled || location?.status !== "found" || !Array.isArray(coordinates) || coordinates.length < 2
      || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0])>180 || Math.abs(coordinates[1])>90) {
      generation++; abort?.abort(); last = result = null; return null;
    }
    const position = jmaTemperatureTilePosition(coordinates);
    if (!position) { generation++; abort?.abort(); last = null; return result = unavailable(location,"outside-coverage"); }
    const sameMesh = last?.key === position.key;
    const fresh = result?.range && now()-Date.parse(result.observationTime)<=JMA_TEMPERATURE_MAX_AGE_MS;
    if (sameMesh && (last.loading || now()-last.at < 60000)) {
      if (result.range && !fresh) result = unavailable(location,"no-fresh-frame",last.loading);
      else result = { ...result, location: { coordinates: [...coordinates], ...normalizeLocationFix(location) } };
      return result;
    }
    const token = ++generation;
    abort?.abort(); abort = new AbortController();
    const signal = abort.signal, fixedCoordinates = [...coordinates];
    last = { key: position.key, at: now(), loading: true };
    result = sameMesh && fresh ? { ...result, loading: true, location: { coordinates: fixedCoordinates, ...normalizeLocationFix(location) } } : unavailable(location,null,true);
    Promise.resolve().then(() => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      return read(fixedCoordinates,{signal});
    }).then(value => {
      if (token !== generation) return;
      last.loading = false;
      // Never turn a missing/newer tile into a nearby station or a previous frame.
      result = { ...unavailable({ ...location, coordinates: fixedCoordinates },value.reason), ...value, source: "jma", value: null,
        kind: value.range ? "jma-estimated" : "unavailable", loading: false };
      onChange(result);
    }).catch(() => {
      if (token !== generation) return;
      last.loading = false; result = unavailable(location,"request-failed"); onChange(result);
    });
    return result;
  } };
}
