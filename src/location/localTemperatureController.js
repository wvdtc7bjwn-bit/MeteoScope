import { createGroundElevationReader } from "./groundElevation.js";
import { buildLandConnectionChecker, loadMunicipalityLookup } from "./currentLocation.js";
import { estimateLocalTemperature, selectTemperatureStations, temperatureObservationTime } from "./temperatureEstimation.js";
import { getDistanceKm } from "./distance.js";
import { TEMPERATURE_ESTIMATION as policy } from "./temperatureEstimationPolicy.js";
import { createEnvironmentReader } from "./environmentData.js";
import { createRetryableResource } from "../utils/retryableResource.js";
import { normalizeLocationFix } from "./locationFix.js";
import { createTemperatureHistory } from "./temperatureWeather.js";
import { createTemperatureClimateReader } from "./temperatureClimateData.js";
import { applyTemperatureClimate, shouldUseTemperatureClimate } from "./temperatureClimate.js";

export function createLocalTemperatureController({ readElevation = createGroundElevationReader(),
  loadLand = () => loadMunicipalityLookup().then(buildLandConnectionChecker), readEnvironment = createEnvironmentReader(),
  readClimate = createTemperatureClimateReader(),
  onChange = () => {}, now = Date.now } = {}) {
  let lastInput, rawResult=null, result=null, publishedRaw, latestLocation, generation=0, elevationController;
  const readLand=createRetryableResource(loadLand,{now});
  const history=createTemperatureHistory();
  function publish() {
    if(!rawResult)return null;
    const fix=normalizeLocationFix(latestLocation),coordinates=[...latestLocation.coordinates];
    if(publishedRaw===rawResult&&result&&fix.accuracy===result.location.accuracy&&fix.positionTimestamp===result.location.positionTimestamp
      &&coordinates.every((v,i)=>v===result.location.coordinates[i]))return result;
    const coarse=fix.accuracy!=null&&fix.accuracy>policy.locationAccuracyWarningM;
    result={...rawResult,location:{coordinates,...fix},
      confidence:coarse&&rawResult.kind==="estimated"?"low":rawResult.confidence,
      flags:[...rawResult.flags,...(coarse?["coarse-location"]:[])]};
    publishedRaw=rawResult;
    return result;
  }
  return {
    update({ enabled, data, location }) {
      const coordinates = location?.coordinates;
      if (!enabled || location?.status !== "found" || !data?.points?.length
        || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(Number.isFinite)
        || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) {
        elevationController?.abort();
        history.clear();
        generation++; lastInput = null; rawResult = result = null; publishedRaw=null; return null;
      }
      latestLocation=location;
      const observationTime = data.mapTime ?? data.latestRawTime;
      const minute = Math.floor(now() / 60000);
      if (lastInput?.points === data.points && lastInput.time === observationTime && lastInput.minute === minute
        && getDistanceKm(lastInput.coordinates, coordinates) < policy.elevationMoveKm) return publish();
      const previous = lastInput;
      lastInput = { points: data.points, time: observationTime, coordinates: [...coordinates], minute };
      const token = ++generation;
      elevationController?.abort();
      // Age is checked even if a refresh fails. Never keep a stale estimate looking current.
      const valid = selectTemperatureStations({ points: data.points, coordinates, observationTime, now: now() });
      const fallback = estimateLocalTemperature({ points: data.points, coordinates, observationTime, now: now(), method: "nearest" });
      if (!valid.length) { rawResult = fallback; return publish(); }
      const observationMs=Date.parse(temperatureObservationTime(observationTime));
      if(policy.weatherEnabled)history.add(data.points,observationMs);
      const recentHistory=history.before(observationMs);
      if (valid[0].distanceKm <= policy.coincidentKm || valid.filter(p=>p.distanceKm<=policy.radiusKm).length < policy.minStations) {
        rawResult = estimateLocalTemperature({ points: valid, coordinates, observationTime, now: now() });
        return publish(); // No optional context requests when interpolation is unnecessary/impossible.
      }
      const samePlaceAndData = previous?.points === data.points && previous.time === observationTime
        && getDistanceKm(previous.coordinates, coordinates) < policy.elevationMoveKm;
      if (samePlaceAndData && rawResult && !rawResult.loading
        &&!(rawResult.flags.includes("land-screen-unavailable")&&previous.minute!==minute)) {
        // Keep the calculation anchor, not the most recent GPS fix: small moves must accumulate.
        lastInput.coordinates = previous.coordinates;
        if (rawResult.kind === "estimated" && now() - Date.parse(rawResult.observationTime) > policy.maxAgeMs / 2
          && !rawResult.flags.includes("aging-observations")) {
          rawResult = { ...rawResult, confidence: "low", flags: [...rawResult.flags, "aging-observations"] };
        }
        return publish();
      }
      // Keep a still-valid estimate at the same place while the next observation is processed.
      const retain = rawResult?.kind === "estimated" && previous && getDistanceKm(previous.coordinates,coordinates)<policy.elevationMoveKm
        && now()-Date.parse(rawResult.observationTime)<=policy.maxAgeMs;
      rawResult = { ...(retain ? rawResult : fallback), loading: true, updating: Boolean(retain) };
      elevationController = new AbortController();
      const contextPoints = valid.filter(p=>p.distanceKm<=policy.radiusKm);
      Promise.allSettled([readElevation(coordinates, { signal: elevationController.signal }), readLand(),
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
        rawResult = estimateLocalTemperature({ points: nearby, coordinates, elevation: value, observationTime, now: now(), environment: profiles[0]??null, history: recentHistory });
        rawResult.elevationZoom = height.status === "fulfilled" ? height.value?.zoom ?? null : null;
        if (!check || rawResult.stations?.some(station => nearby.find(p => p.id === station.id)?.landConnected === null)) {
          rawResult = { ...rawResult, confidence: rawResult.kind === "estimated" ? "low" : rawResult.confidence,
            flags: [...rawResult.flags, "land-screen-unavailable"] };
        }
        rawResult.loading = false;
        // Publish the existing estimate first. Optional static data must not delay it.
        const baseline = rawResult, environment = profiles[0]??null;
        onChange(publish());
        if (token === generation && policy.climateEnabled && shouldUseTemperatureClimate(baseline,environment)) {
          const signal = elevationController.signal;
          Promise.resolve().then(()=>readClimate(observationTime,{signal})).then(climate=>{
            if (token !== generation || signal.aborted || now()-Date.parse(baseline.observationTime)>policy.maxAgeMs) return;
            const adjusted = applyTemperatureClimate(baseline,{coordinates,elevation:value,environment,climate,lapseRate:policy.lapseRate});
            if (adjusted !== baseline) { rawResult = adjusted; onChange(publish()); }
          }).catch(()=>{ /* Retain the current estimate; shared resource throttles failed retries. */ });
        }
      }).catch(() => {
        if (token !== generation) return;
        rawResult = { ...fallback, loading: false }; onChange(publish());
      });
      return publish();
    }
  };
}
