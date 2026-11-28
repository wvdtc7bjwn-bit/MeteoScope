const LAYER_ID = "gsi-tsunami-inundation";
const TILES = "https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png";

export const TSUNAMI_INUNDATION_SOURCE_URL = "https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html";
export const TSUNAMI_INUNDATION_MAP_URL = "https://disaportal.gsi.go.jp/maps/?layerset=tsunami";

// The official legend provides additional depth bands for some prefectures.
export const TSUNAMI_INUNDATION_DEPTHS = [
  ["20m以上", "20 m or more", "#dc7adc"],
  ["10m以上〜20m未満", "10 m to under 20 m", "#f285c9"],
  ["5m以上〜10m未満", "5 m to under 10 m", "#ff9191"],
  ["3m以上〜5m未満", "3 m to under 5 m", "#ffb7b7"],
  ["0.5m以上〜3m未満", "0.5 m to under 3 m", "#ffd8c0"],
  ["0.5m以上〜1m未満", "0.5 m to under 1 m", "#f8e1a6"],
  ["0.5m未満", "Under 0.5 m", "#f7f5a9"],
  ["0.3m未満", "Under 0.3 m", "#ffffb3"]
];

export function syncTsunamiInundationLayer(map, visible, beforeLayerId) {
  if (!map?.getLayer(beforeLayerId)) return;
  const visibility = visible ? "visible" : "none";
  if (map.getLayer(LAYER_ID)) {
    if (map.getLayoutProperty(LAYER_ID, "visibility") !== visibility) {
      map.setLayoutProperty(LAYER_ID, "visibility", visibility);
    }
    return;
  }
  if (!visible) return;

  map.addSource(LAYER_ID, {
    type: "raster",
    tiles: [TILES],
    tileSize: 256,
    // The zoom-2 overview contains an offshore pixel that can be enlarged into missing child tiles.
    minzoom: 3,
    maxzoom: 17,
    attribution: "ハザードマップポータルサイト（国土地理院・都道府県）"
  });
  map.addLayer({
    id: LAYER_ID,
    type: "raster",
    source: LAYER_ID,
    layout: { visibility },
    paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 }
  }, beforeLayerId);
}
