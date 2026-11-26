import { createGroundElevationReader } from "./groundElevation.js";
import { buildLandConnectionChecker, loadMunicipalityLookup } from "./currentLocation.js";
import { estimateLocalTemperature, selectTemperatureStations } from "./temperatureEstimation.js";
import { getDistanceKm } from "./distance.js";
import { TEMPERATURE_ESTIMATION as policy } from "./temperatureEstimationPolicy.js";
import { createEnvironmentReader } from "./environmentData.js";

export function createLocalTemperatureController({ readElevation = createGroundElevationReader(),
  loadLand = () => loadMunicipalityLookup().then(buildLandConnectionChecker), readEnvironment = createEnvironmentReader(),
  onChange = () => {}, now = Date.now } = {}) {
  let lastInput, result = null, generation = 0, landPromise, elevationController;
  return {
    update({ enabled, data, location }) {
      const coordinates = location?.coordinates;
      if (!enabled || location?.status !== "found" || !data?.points?.length
        || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(Number.isFinite)
        || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) {
        elevationController?.abort();
        generation++; lastInput = null; result = null; return null;
      }
      const observationTime = data.mapTime ?? data.latestRawTime;
      const minute = Math.floor(now() / 60000);
      if (lastInput?.points === data.points && lastInput.time === observationTime && lastInput.minute === minute
        && getDistanceKm(lastInput.coordinates, coordinates) < policy.elevationMoveKm) return result;
      const previous = lastInput;
      lastInput = { points: data.points, time: observationTime, coordinates: [...coordinates], minute };
      const token = ++generation;
      elevationController?.abort();
      // Age is checked even if a refresh fails. Never keep a stale estimate looking current.
      const valid = selectTemperatureStations({ points: data.points, coordinates, observationTime, now: now() });
      const fallback = estimateLocalTemperature({ points: data.points, coordinates, observationTime, now: now(), method: "nearest" });
      if (!valid.length) { result = fallback; return result; }
      if (valid[0].distanceKm <= policy.coincidentKm || valid.filter(p=>p.distanceKm<=policy.radiusKm).length < policy.minStations) {
        result = estimateLocalTemperature({ points: valid, coordinates, observationTime, now: now() });
        return result; // No optional context requests when interpolation is unnecessary/impossible.
      }
      const samePlaceAndData = previous?.points === data.points && previous.time === observationTime
        && getDistanceKm(previous.coordinates, coordinates) < policy.elevationMoveKm;
      if (samePlaceAndData && result && !result.loading) {
        // Keep the calculation anchor, not the most recent GPS fix: small moves must accumulate.
        lastInput.coordinates = previous.coordinates;
        if (result.kind === "estimated" && now() - Date.parse(result.observationTime) > policy.maxAgeMs / 2
          && !result.flags.includes("aging-observations")) {
          result = { ...result, confidence: "low", flags: [...result.flags, "aging-observations"] };
        }
        return result;
      }
      // Keep a still-valid estimate at the same place while the next observation is processed.
      const retain = result?.kind === "estimated" && previous && getDistanceKm(previous.coordinates,coordinates)<policy.elevationMoveKm
        && now()-Date.parse(result.observationTime)<=policy.maxAgeMs;
      result = { ...(retain ? result : fallback), loading: true, updating: Boolean(retain) };
      elevationController = new AbortController();
      const contextPoints = valid.filter(p=>p.distanceKm<=policy.radiusKm);
      Promise.allSettled([readElevation(coordinates, { signal: elevationController.signal }), landPromise ??= loadLand(),
        policy.environmentStrength > 0 ? readEnvironment([coordinates,...contextPoints.map(p=>p.coordinates)],{signal:elevationController.signal}) : Promise.resolve([])
      ]).then(([height, land, context]) => {
        if (token !== generation) return;
        const check = land.status === "fulfilled" ? land.value : null;
        const profiles = context.status === "fulfilled" ? context.value : [];
        const profilesById = new Map(contextPoints.map((p,i)=>[p.id,profiles[i+1]??null]));
        const nearby = valid.map(point => ({ ...point,
          environment: profilesById.get(point.id) ?? null,
          landConnected: point.distanceKm <= policy.radiusKm && check ? check(coordinates, point.coordinates) : null }));
        const value = height.status === "fulfilled" ? height.value?.elevation : null;
        result = estimateLocalTemperature({ points: nearby, coordinates, elevation: value, observationTime, now: now(), environment: profiles[0]??null });
        result.elevationZoom = height.status === "fulfilled" ? height.value?.zoom ?? null : null;
        if (!check || result.stations?.some(station => nearby.find(p => p.id === station.id)?.landConnected === null)) {
          result = { ...result, confidence: result.kind === "estimated" ? "low" : result.confidence,
            flags: [...result.flags, "land-screen-unavailable"] };
        }
        result.loading = false;
        onChange(result);
      }).catch(() => {
        if (token !== generation) return;
        result = { ...fallback, loading: false }; onChange(result);
      });
      return result;
    }
  };
}
