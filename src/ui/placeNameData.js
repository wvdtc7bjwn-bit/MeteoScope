import { MUNICIPALITY_ROMAJI } from "./placeNamesEn.generated.js";
import { normalizePlaceNameKey, SUPPLEMENTAL_MUNICIPALITY_ROMAJI } from "./placeNameAliases.js";

const PLACE_NAME_DATA_URL = "/data/gsi-place-names-romaji.json";
const AMEDAS_STATION_DATA_URL = "https://www.jma.go.jp/bosai/amedas/const/amedastable.json";

export function createPlaceNameIndex(gazetteer = {}, stations = {}) {
  const merged = new Map();
  const add = (japanese, romaji, addStem = true) => {
    if (!japanese || typeof romaji !== "string" || !romaji.trim()) return;
    const key = normalizePlaceNameKey(japanese);
    merged.set(key, romaji.trim());
    const stem = key.replace(/(?:都|道|府|県|市|区|町|村|島|山)$/u, "");
    if (addStem && stem.length >= 2 && stem !== key && !merged.has(stem)) {
      merged.set(stem, romaji.replace(/\s+(?:To|Do|Fu|Ken|Shi|Ku|Cho|Machi|Mura|Son|Jima|Shima|San|Yama)$/u, "").trim());
    }
  };
  Object.entries(MUNICIPALITY_ROMAJI).forEach(([name, romaji]) => add(name, romaji, false));
  Object.entries(gazetteer).forEach(([name, romaji]) => add(name, romaji));
  Object.values(stations).forEach((station) => add(station?.kjName, station?.enName, false));
  Object.entries(SUPPLEMENTAL_MUNICIPALITY_ROMAJI).forEach(([name, romaji]) => add(name, romaji, false));
  merged.set("さいたま", "Saitama");
  return merged;
}

// Each source updates independently: a stalled remote station request must not
// hold back the local gazetteer. Rebuilding in a fixed order preserves precedence
// regardless of response order. Missing sources retain the bundled names.
export async function loadPlaceNameData(onUpdate, { fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (typeof fetchImpl !== "function") return;
  let gazetteer = {};
  let stations = {};
  const request = async (url, apply) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { cache: "force-cache", signal: controller.signal });
      if (!response.ok) throw new Error(`Place-name data request failed: ${response.status}`);
      apply(await response.json());
      onUpdate(createPlaceNameIndex(gazetteer, stations));
    } catch {
      // These dictionaries supplement bundled names; never block app startup.
    } finally {
      clearTimeout(timer);
    }
  };
  await Promise.all([
    request(PLACE_NAME_DATA_URL, (data) => { gazetteer = data?.names ?? {}; }),
    request(AMEDAS_STATION_DATA_URL, (data) => { stations = data ?? {}; })
  ]);
}
