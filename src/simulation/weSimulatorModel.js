// Adapted with permission from itachi-kun-itc/WE-Simulator, web/app.js.
// Upstream revision: 3b0f37d830b1994bac9a69c9686a90bcc24477c1. See docs/earthquake-simulation.md.
import { getEarthquakeIntensityColor, getEarthquakeIntensityMarkerTextColor } from "../earthquakeIntensity.js";
import { MAX_REFERENCE_INTENSITY_DEPTH_KM } from "./intensityModel.js";

export const EARTHQUAKE_MODEL = { eewProcessingDelaySec: .6, defaultSiteAmplification: 0 };

const INTENSITY_THRESHOLDS = [0, 0.5, 1.5, 2.5, 3.5, 4.5, 5, 5.5, 6, 6.5];
const INTENSITY_LABELS = ["0", "1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"];
const SHAKING_DURATION_SCALES = [[1, 1], [5, 2], [6, 4], [7, 10], [8, 60], [9, 180], [9.5, 240]];
export function classifyIntensity(value) {
  let rank = 0;
  for (let i = 1; i < INTENSITY_THRESHOLDS.length; i++) if (value >= INTENSITY_THRESHOLDS[i]) rank = i;
  const label = INTENSITY_LABELS[rank];
  return { label, shortLabel: label, rank, color: getEarthquakeIntensityColor(label), textColor: getEarthquakeIntensityMarkerTextColor(label) };
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Shared educational magnitude-duration envelope for shaking and EEW review.
// This is not a rule for real JMA bulletin counts or final-report timing.
export function getSimulationMagnitudeDurationSec(magnitude) {
  const found = SHAKING_DURATION_SCALES.findIndex(([m]) => m >= magnitude);
  const upper = found < 0 ? SHAKING_DURATION_SCALES.length - 1 : found;
  const high = SHAKING_DURATION_SCALES[upper];
  const low = SHAKING_DURATION_SCALES[Math.max(0, upper - 1)];
  const ratio = high[0] > low[0] ? clamp((magnitude - low[0]) / (high[0] - low[0]), 0, 1) : 0;
  return low[1] + (high[1] - low[1]) * ratio;
}

// The upstream station-response and bulletin-timing model, isolated from its UI.
// Site amplification is kept at the upstream default; no site-specific ground data are bundled.
export function createWeSimulatorModel({ magnitude, depthKm = 0, offshore = false, latitude = 0, longitude = 0 }) {
  const state = { magnitude, depthKm, latitude, longitude };
  const riseProfiles = new WeakMap();
  const responses = new WeakMap();
  const getOffshoreEpicenterFactor = () => offshore ? 1 : 0;
  function getStationWaveResponseProperties(key, finalIntensity, ground = {}) {
    const siteNoise = stableUnitInterval(`${key}|site`);
    const pDelayNoise = stableUnitInterval(`${key}|p-delay`);
    const sDelayNoise = stableUnitInterval(`${key}|s-delay`);
    const avs = Number(ground.groundAvs ?? 400);
    const amplification = Number(ground.groundAmplification ?? EARTHQUAKE_MODEL.defaultSiteAmplification);
    const softness = Number.isFinite(avs) ? clamp((520 - avs) / 430, 0, 1) : 0.35;
    const amplificationFactor = clamp((amplification + 0.45) / 1.45, 0, 1);
    const finalFactor = clamp((Number(finalIntensity) - 1.2) / 4.8, 0, 1);
    const pWaveSiteResponse = clamp(
      0.24 + siteNoise * 0.36 + softness * 0.18 + amplificationFactor * 0.18 + finalFactor * 0.12,
      0,
      1,
    );
    const pWaveRiseDelaySec = clamp(
      pDelayNoise * 0.22 + (1 - pWaveSiteResponse) * 0.12 - finalFactor * 0.08,
      0,
      0.34,
    );
    const sWaveRiseDelaySec = clamp(
      sDelayNoise * 0.34 + (1 - softness) * 0.12 - finalFactor * 0.18,
      -0.18,
      0.38,
    );
  
    return {
      pWaveSiteResponse: Number(pWaveSiteResponse.toFixed(3)),
      pWaveRiseDelaySec: Number(pWaveRiseDelaySec.toFixed(2)),
      sWaveRiseDelaySec: Number(sWaveRiseDelaySec.toFixed(2)),
    };
  }

  function getEarthquakeWaveformProfile() {
    const magnitudeExcess = Math.max(state.magnitude - 6.5, 0);
    const giantMagnitude = Math.max(state.magnitude - 8.0, 0);
    const offshoreFactor = getOffshoreEpicenterFactor();
  
    return {
      durationExtensionSec:
        magnitudeExcess * 2.6 +
        offshoreFactor * (1.7 + magnitudeExcess * 2.9) +
        giantMagnitude * 7.5,
      slowRise: clamp(offshoreFactor * 0.14 + giantMagnitude * 0.08, 0, 0.26),
      lateEnergy: clamp(0.07 + offshoreFactor * 0.08 + giantMagnitude * 0.08, 0.07, 0.24),
      multiPeak: clamp(offshoreFactor * 0.12 + giantMagnitude * 0.12, 0, 0.28),
    };
  }

  function getGroundRiseProfile(properties) {
    if (riseProfiles.has(properties)) return riseProfiles.get(properties);
    const avs = properties.groundAvs ?? 400;
    const amplification = properties.groundAmplification ?? EARTHQUAKE_MODEL.defaultSiteAmplification;
    const softness = clamp((520 - avs) / 420, 0, 1);
    const amplificationFactor = clamp((amplification + 0.6) / 1.8, 0, 1);
    const finalIntensityFactor = clamp((Number(properties.predictedIntensityValue ?? 0) - 3.5) / 3.0, 0, 1);
    const epicentralDistanceKm = Number(properties.epicentralDistanceKm ?? Infinity);
    const nearSourceFactor = clamp((120 - epicentralDistanceKm) / 120, 0, 1);
    const nearSourceStrongMotionFactor =
      nearSourceFactor * finalIntensityFactor;
    const waveformProfile = getEarthquakeWaveformProfile();
    const durationSec =
      1.65 +
      softness * 2.35 +
      amplificationFactor * 0.95 +
      waveformProfile.durationExtensionSec * 0.28 -
      finalIntensityFactor * 0.85 +
      nearSourceStrongMotionFactor * 0.24 -
      nearSourceFactor * 0.38;
    const curvature =
      2.25 +
      softness * 0.85 +
      amplificationFactor * 0.7 +
      finalIntensityFactor * 1.15 -
      waveformProfile.slowRise * 0.35 -
      nearSourceStrongMotionFactor * 0.08;
  
    const profile = {
      durationSec: Math.max(durationSec, 1.15),
      curvature: Math.max(curvature, 1.35),
      lateEnergy: waveformProfile.lateEnergy,
      multiPeak: waveformProfile.multiPeak,
      mainSurgeRatio: clamp(
        0.9 + finalIntensityFactor * 0.07 - waveformProfile.lateEnergy * 0.12 - nearSourceStrongMotionFactor * 0.03,
        0.84,
        0.97,
      ),
      mainMotionOnsetSec: clamp(
        0.62 +
          softness * 0.5 +
          amplificationFactor * 0.18 -
          finalIntensityFactor * 0.26 +
          nearSourceStrongMotionFactor * 0.26 -
          nearSourceFactor * 0.22,
        0.42,
        1.35,
      ),
    };
    riseProfiles.set(properties, profile);
    return profile;
  }

  function groundAwareRiseProgress(timeSinceSArrivalSec, profile) {
    if (timeSinceSArrivalSec <= 0) {
      return 0;
    }
  
    const normalizedTime = timeSinceSArrivalSec / Math.max(profile.durationSec, 0.1);
    if (normalizedTime >= 1) {
      return 1;
    }
  
    const mainMotionOnsetSec = Math.max(profile.mainMotionOnsetSec ?? 0, profile.durationSec * .7);
    const mainMotionSurge =
      smoothStep(clamp(timeSinceSArrivalSec / mainMotionOnsetSec, 0, 1)) *
      (profile.mainSurgeRatio ?? clamp(0.9 - profile.lateEnergy * 0.25, 0.82, 0.94));
    const exponentialEnvelope = (1 - Math.exp(-profile.curvature * smoothStep(normalizedTime)))
      / (1 - Math.exp(-profile.curvature));
    const lateEnergy = profile.lateEnergy * 0.58 * smoothStep(clamp((normalizedTime - 0.42) / 0.58, 0, 1));
    const multiPeakEnergy =
      profile.multiPeak * 0.72 *
      (0.45 * smoothStep(clamp((normalizedTime - 0.16) / 0.18, 0, 1)) +
        0.35 * smoothStep(clamp((normalizedTime - 0.38) / 0.2, 0, 1)) +
        0.2 * smoothStep(clamp((normalizedTime - 0.66) / 0.24, 0, 1)));
    return clamp(Math.max(mainMotionSurge, exponentialEnvelope + lateEnergy + multiPeakEnergy), 0, 1);
  }

  function getPWaveRecordedIntensityFloor(properties, observed) {
    if (!observed) {
      return 0;
    }
  
    const finalIntensity = Number(properties.predictedIntensityValue ?? 0);
    if (finalIntensity < 0.5) {
      return 0;
    }
  
    const siteResponse = properties.pWaveSiteResponse ?? 0.5;
    const stableVariation = stableUnitInterval(`${properties.displaySortStableKey ?? properties.id ?? ""}|p-record`) - 0.5;
    const floor = 0.53 + siteResponse * 0.06 + stableVariation * 0.06;
    return Math.min(finalIntensity, clamp(floor, 0.5, 0.64));
  }

  function getPWaveRiseProgress(properties, elapsedSec) {
    const timeSincePArrivalSec = elapsedSec - properties.pArrivalSec - (properties.pWaveRiseDelaySec ?? 0);
    if (timeSincePArrivalSec <= 0) {
      return 0;
    }
  
    const spGapSec = Math.max(properties.sArrivalSec - properties.pArrivalSec, 0.5);
    const siteResponse = properties.pWaveSiteResponse ?? 0.5;
    const quickOnsetSec = clamp(spGapSec * (0.14 + (1 - siteResponse) * 0.1), 0.24, 1.05);
    const quickOnset = smoothStep(clamp(timeSincePArrivalSec / quickOnsetSec, 0, 1));
    const preSwell = smoothStep(
      clamp(
        (timeSincePArrivalSec - quickOnsetSec * 0.55) /
          Math.max(spGapSec - quickOnsetSec * 0.55, 0.5),
        0,
        1,
      ),
    );
    return clamp(quickOnset * 0.72 + preSwell * 0.28, 0, 1);
  }

  function getPWaveIntensityTarget(properties) {
    const finalIntensity = Number(properties.predictedIntensityValue ?? 0);
    if (finalIntensity < 0.5) {
      return 0;
    }
  
    const magnitudeFactor = clamp((state.magnitude - 4.7) / 3.3, 0, 1);
    const distanceKm = Number(properties.epicentralDistanceKm ?? 0);
    const distanceFactor = clamp(1 - distanceKm / 820, 0.38, 1);
    const groundFactor = clamp(
      ((properties.groundAmplification ?? EARTHQUAKE_MODEL.defaultSiteAmplification) + 0.45) / 1.2,
      0,
      1,
    );
    const strongMotionFactor = clamp((finalIntensity - 2.5) / 3.6, 0, 1);
    const siteResponse = properties.pWaveSiteResponse ?? 0.5;
    const share =
      0.38 +
      magnitudeFactor * 0.12 +
      groundFactor * 0.15 +
      strongMotionFactor * 0.16 +
      siteResponse * 0.08;
    const pWaveFloor =
      finalIntensity >= 1.5
        ? (0.86 + magnitudeFactor * 0.24 + groundFactor * 0.34 + strongMotionFactor * 0.38 + siteResponse * 0.22) *
          distanceFactor
        : finalIntensity >= 0.5
          ? 0.52 + magnitudeFactor * 0.12 + groundFactor * 0.08 + siteResponse * 0.08
          : 0.25 + magnitudeFactor * 0.08;
    const pWaveCeiling =
      1.35 +
      magnitudeFactor * 0.72 +
      groundFactor * 0.72 +
      strongMotionFactor * 1.28 +
      siteResponse * 0.36;
    const target = Math.max(finalIntensity * share, pWaveFloor);
    const nearSourceFactor = clamp((220 - distanceKm) / 160, 0, 1);
    const severeShakingFactor = clamp((finalIntensity - 5.0) / 1.2, 0, 1);
    // Do not paint widespread intensity-3 areas from the first P-wave motion alone.
    // A rank-3 P-wave remains possible close to a source that will ultimately shake severely.
    const pWaveDisplayCap = 2.42 + nearSourceFactor * severeShakingFactor * 0.58;
    return clamp(target, 0, Math.min(finalIntensity * 0.72, pWaveCeiling, pWaveDisplayCap));
  }

  function stableUnitInterval(value) {
    let hash = 2166136261;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function smoothStep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function getStationShakingTiming(properties) {
    const profile = getGroundRiseProfile(properties);
    const softness = clamp((520 - (properties.groundAvs ?? 400)) / 420, 0, 1);
    // Educational duration envelope, not waveform-based real-time intensity.
    // Broad M7/M8/M9 duration scales follow JMA FAQ27; interpolate in between.
    const mainDuration = getSimulationMagnitudeDurationSec(state.magnitude) * (1 + softness * .25);
    const peakAtSec = properties.sArrivalSec + profile.durationSec + Math.max(0, properties.sWaveRiseDelaySec ?? 0);
    const decayStartSec = Math.max(peakAtSec, properties.sArrivalSec + mainDuration,
      (properties.lastStrongSArrivalSec ?? properties.sArrivalSec) + profile.durationSec);
    // Educational deep-event coda: the P/S separation proxies the longer wave
    // path. These bounded coefficients are a display approximation, not a fitted
    // duration law. Blend through 150-300 km; keep arrival, peak and EEW intact.
    const deepWeight = clamp((state.depthKm - MAX_REFERENCE_INTENSITY_DEPTH_KM) / 150, 0, 1);
    const spGapSec = properties.sArrivalSec - properties.pArrivalSec;
    const deepCodaSec = Number.isFinite(spGapSec) ? deepWeight * clamp(spGapSec * .5, 0, 90) : 0;
    // smoothStep's maximum slope is 1.5. This teaching-display bound limits
    // the fall to .2 intensity units/sec instead of collapsing at the tail end.
    const tailDuration = Math.max(12 + Math.max(0, state.magnitude - 5) * 9,
      Math.max(0, properties.predictedIntensityValue ?? 0) * 7.5) + softness * 12
      + clamp((properties.epicentralDistanceKm ?? 0) / 80, 0, 12) + deepCodaSec;
    return { shakingPeakSec: peakAtSec, shakingDecayStartSec: decayStartSec, shakingEndSec: decayStartSec + tailDuration };
  }

  function getCurrentIntensityProperties(properties, elapsedSec = Infinity) {
    const intensityEstimateAvailable = Number.isFinite(properties.predictedIntensityValue);
    const isSimulation = Number.isFinite(elapsedSec);
    const observed = !isSimulation || elapsedSec >= properties.pArrivalSec;
    const waveState = isSimulation && properties.sArrivalSec > elapsedSec ? "p" : "s";
    let response = responses.get(properties);
    if (!response) {
      response = { riseProfile: getGroundRiseProfile(properties),
        pWaveTarget: getPWaveIntensityTarget(properties), recordedFloor: getPWaveRecordedIntensityFloor(properties, true) };
      responses.set(properties, response);
    }
    const { riseProfile } = response;
    const riseProgress = isSimulation
      ? groundAwareRiseProgress(
          elapsedSec - properties.sArrivalSec - Math.max(0, properties.sWaveRiseDelaySec ?? 0),
          riseProfile,
        )
      : 1;
    const pWaveProgress = isSimulation
      ? getPWaveRiseProgress(properties, elapsedSec)
      : 1;
    const pWaveTarget = response.pWaveTarget;
    const pWaveIntensity = pWaveTarget * pWaveProgress;
    const rawCurrentIntensityValue =
      waveState === "p"
        ? pWaveIntensity
        : pWaveIntensity + (properties.predictedIntensityValue - pWaveIntensity) * riseProgress;
    const recordedIntensityFloor = observed ? response.recordedFloor * pWaveProgress : 0;
    const recordedIntensityValue = Math.min(properties.predictedIntensityValue, Math.max(rawCurrentIntensityValue, recordedIntensityFloor));
    const timing = properties.shakingEndSec != null ? properties : getStationShakingTiming(properties);
    const decayProgress = isSimulation && elapsedSec > timing.shakingDecayStartSec
      ? clamp((elapsedSec - timing.shakingDecayStartSec) / (timing.shakingEndSec - timing.shakingDecayStartSec), 0, 1) : 0;
    // A bounded-slope intensity envelope with zero slope at both ends. Apply
    // after the recorded P floor; keep the historical maximum separate.
    const currentIntensityValue = Math.max(0, recordedIntensityValue * (1 - smoothStep(decayProgress)));
    const currentClass = classifyIntensity(currentIntensityValue);
  
    return {
      observed,
      waveState,
      riseProgress: Number(riseProgress.toFixed(3)),
      currentIntensityValue: intensityEstimateAvailable ? Number(currentIntensityValue.toFixed(2)) : null,
      recordedIntensityValue: intensityEstimateAvailable ? recordedIntensityValue : null,
      settled: intensityEstimateAvailable && isSimulation && observed && elapsedSec >= timing.shakingEndSec,
      intensityValue: intensityEstimateAvailable ? Number(currentIntensityValue.toFixed(2)) : null,
      intensityLabel: currentClass.label,
      intensityShortLabel: currentClass.shortLabel,
      intensityRank: currentClass.rank,
      intensityColor: currentClass.color,
      intensityTextColor: currentClass.textColor,
    };
  }
  function buildSyntheticSimulationMagnitudeReports(finalMagnitude, stations, simulationCompleteAtSec) {
    // Felt intensity is not an instrument detection threshold. Keep the teaching
    // model's bulletin eligibility separate from the earliest available P arrival.
    if (finalMagnitude < 3.5 && !stations.some(station => classifyIntensity(station.predictedIntensityValue).rank >= 3)) return [];
    const arrivalCandidates = stations.map(station => station.pArrivalSec).filter(time => Number.isFinite(time) && time >= 0);
    if (!arrivalCandidates.length) return [];
    const detectedAtSec = Math.min(...arrivalCandidates);
    const firstReportSec = Math.max(
      detectedAtSec + EARTHQUAKE_MODEL.eewProcessingDelaySec,
      .8,
    );
    const reviewDurationSec = clamp(
      8 + Math.max(finalMagnitude - 5.0, 0) * 7 + getOffshoreEpicenterFactor() * 3,
      8,
      45,
    );
    const availableEndSec = Number.isFinite(simulationCompleteAtSec)
      ? Math.max(simulationCompleteAtSec - 8, firstReportSec)
      : firstReportSec + reviewDurationSec;
    const finalReportSec = Math.min(firstReportSec + reviewDurationSec, availableEndSec);
    // Resolve the initial growth of large events more frequently without
    // stretching the initial analysis or prescribing a fixed final report count.
    const initialReportIntervalSec = finalMagnitude >= 7.5 ? 1 : 3;
    const reportCount = Math.max(4, Math.round(4 + Math.max(finalMagnitude - 4.0, 0) * 2.1), Math.ceil((finalReportSec - firstReportSec) / initialReportIntervalSec) + 1);
    return Array.from({ length: reportCount }, (_, index) => {
      const isFinal = index === reportCount - 1;
      const progress = index / (reportCount - 1);
      return { reportNumber: index + 1, elapsedSec: Number((firstReportSec + (finalReportSec - firstReportSec) * progress).toFixed(2)), detectedAtSec, isFinal };
    });
  }
  return { getStationWaveResponseProperties, getStationShakingTiming, getCurrentIntensityProperties, buildSyntheticSimulationMagnitudeReports };
}

