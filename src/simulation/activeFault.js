import {getDistanceKm} from "../location/distance.js";
import {simulationEarthquakeType} from "./earthquakeType.js";

// Numerical/source attributes and optional complete API corners are retained;
// tile-clipped polygons are never used as a complete fault plane.
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
  if (properties.CORNERS != null) {
    const points=properties.CORNERS;
    if (!Array.isArray(points)||points.length!==4||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)
      ||p[0]<120||p[0]>155||p[1]<20||p[1]>50||p[2]<0||p[2]>400)
      ||Math.abs(points[0][0]-result.LON)>1e-5||Math.abs(points[0][1]-result.LAT)>1e-5
      ||points.slice(0,2).some(p=>Math.abs(p[2]-result.DEP)>.001)
      ||points.slice(2).some(p=>Math.abs(p[2]-result.DEP-result.WID*Math.sin(result.DIP*Math.PI/180))>.001)) throw new RangeError("Invalid official fault corners");
    result.CORNERS=points.map(p=>[...p]);
  }
  return result;
}

export const activeFaultCaseId = fault => String(fault.FLT_ID).split("_")[0];

export function groupActiveFaultModels(planes) {
  return [...new Map(planes.map(plane => [activeFaultCaseId(plane), plane])).entries()]
    .map(([id, plane]) => ({id, name: plane.LTENAME, plane}));
}

export function normalizeActiveFaultSelection(input) {
  const primary = normalizeActiveFault(input);
  if (!input.planes) return primary; // Compatibility for single-plane callers.
  if (!Array.isArray(input.planes) || !input.planes.length || input.planes.length > 64) throw new RangeError("Invalid fault-plane collection");
  const planes = input.planes.map(normalizeActiveFault).sort((a,b) => a.FLT_ID.localeCompare(b.FLT_ID));
  const id = activeFaultCaseId(primary);
  if (planes.some(plane => activeFaultCaseId(plane) !== id || plane.MAG !== primary.MAG)
      || new Set(planes.map(plane => plane.FLT_ID)).size !== planes.length
      || !planes.some(plane => plane.FLT_ID === primary.FLT_ID)) throw new RangeError("Mixed or duplicate activity cases");
  return {...primary, planes, modelVersion: input.modelVersion === "Y2024" ? "Y2024" : "unverified"};
}

function destination([longitude, latitude], bearing, distance) {
  const radians = Math.PI / 180, angle = distance / 6371, direction = bearing * radians, lat = latitude * radians, lon = longitude * radians;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(direction));
  const nextLon = lon + Math.atan2(Math.sin(direction) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
  return [nextLon / radians, nextLat / radians];
}

export function buildActiveFaultPreset(properties) {
  const fault = normalizeActiveFaultSelection(properties);
  if (fault.planes?.length > 1) {
    const parts = fault.planes.map(buildActiveFaultPreset);
    const area = parts.reduce((sum, part) => sum + part.fault.LEN * part.fault.WID, 0);
    const mean = key => parts.reduce((sum, part) => sum + part[key] * part.fault.LEN * part.fault.WID, 0) / area;
    return {...parts[0], name: fault.LTENAME, fault, parts, depthKm: Math.round(mean("depthKm")),
      longitude: mean("longitude"), latitude: mean("latitude"), lengthKm: parts.reduce((sum, part) => sum + part.lengthKm, 0)};
  }
  const dip = fault.DIP * Math.PI / 180;
  if (fault.CORNERS) {
    const [a,b,c,d]=fault.CORNERS.map(p=>p.slice(0,2));
    const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2);
    const path=[midpoint(a,d),midpoint(b,c)],middle=midpoint(...path);
    return {name:fault.LTENAME,faultId:fault.FLT_ID,path,areaSides:{left:[a,b],right:[d,c]},
      longitude:middle[0],latitude:middle[1],depthKm:Math.round(fault.DEP+fault.WID*Math.sin(dip)/2+1e-9),
      magnitudeValue:fault.MAG<0?-fault.MAG:null,fault,lengthKm:getDistanceKm(a,b)};
  }
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

export const isInterplateSimulation = options => simulationEarthquakeType(options)==="interplate";
