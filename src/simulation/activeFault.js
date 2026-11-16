import {getDistanceKm} from "../location/distance.js";

// Only numerical/source identifiers are retained, never tile-clipped geometry.
export function normalizeActiveFault(properties) {
  if (!properties || !/^F[0-9A-Z]{6}_\d{5}$/u.test(String(properties.FLT_ID))) throw new RangeError("Invalid active fault ID");
  const result = {FLT_ID: String(properties.FLT_ID), LTENAME: String(properties.LTENAME || "").trim().slice(0, 160)};
  if (!result.LTENAME) throw new RangeError("Missing active fault name");
  for (const [key, min, max] of [["LON",120,155],["LAT",20,50],["DEP",0,100],["LEN",.01,1000],["WID",.01,300],["STR",0,360],["DIP",0,180]]) {
    const raw = properties[key], value = Number(raw);
    if (raw == null || String(raw).trim() === "" || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid active fault ${key}`);
    result[key] = value;
  }
  const magnitude = Number(properties.MAG);
  result.MAG = properties.MAG != null && String(properties.MAG).trim() !== "" && Number.isFinite(magnitude) && Math.abs(magnitude) >= 1 && Math.abs(magnitude) <= 9.5 ? magnitude : null;
  return result;
}

function destination([longitude, latitude], bearing, distance) {
  const radians = Math.PI / 180, angle = distance / 6371, direction = bearing * radians, lat = latitude * radians, lon = longitude * radians;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(direction));
  const nextLon = lon + Math.atan2(Math.sin(direction) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
  return [nextLon / radians, nextLat / radians];
}

export function buildActiveFaultPreset(properties) {
  const fault = normalizeActiveFault(properties), dip = fault.DIP * Math.PI / 180;
  const top = [fault.LON, fault.LAT], end = destination(top, fault.STR, fault.LEN);
  const downDip = point => destination(point, fault.STR + 90, fault.WID * Math.cos(dip));
  const centerLine = [top, end].map(point => destination(point, fault.STR + 90, fault.WID * Math.cos(dip) / 2));
  const middle = destination(centerLine[0], fault.STR, fault.LEN / 2);
  return {name: fault.LTENAME, faultId: fault.FLT_ID, path: centerLine,
    areaSides: {left: [top, end], right: [downDip(top), downDip(end)]},
    longitude: middle[0], latitude: middle[1],
    depthKm: Math.round(fault.DEP + fault.WID * Math.sin(dip) / 2 + 1e-9),
    // J-SHIS: a negative MAG denotes Mw; a positive MAG is Mj, not Mw.
    magnitudeValue: fault.MAG < 0 ? -fault.MAG : null,
    fault, lengthKm: getDistanceKm(top, end)};
}

export const isInterplateSimulation = options => options.model !== "point" && options.model !== "active-fault";
