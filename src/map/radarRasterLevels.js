// Keep JMA's z6 rainfall tiles through the nationwide view and switch to
// detailed tiles before enlargement makes their pixels coarse. tileSize controls LOD;
// the original 256px PNGs, palette and opacity are not resampled or rewritten.
// At each band's lower edge, mapZoom + log2(512 / tileSize) reaches the
// fixed URL zoom. This also keeps x/y in that URL's coordinate system.
export const RAIN_RADAR_ZOOM_LEVELS = Object.freeze([
  { id: "z2", z: 4, minzoom: 1, maxzoom: 3, tileSize: 64 },
  { id: "z4", z: 6, minzoom: 3, maxzoom: 6, tileSize: 64 },
  { id: "z6", z: 8, minzoom: 6, maxzoom: 8, tileSize: 128 },
  { id: "z10", z: 10, minzoom: 8, maxzoom: 22, tileSize: 128 }
]);
