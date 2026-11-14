// Orthographic variants used by JMA and the GSI Gazetteer. These aliases affect
// lookup keys only; the original Japanese label is retained for Japanese mode.
export function normalizePlaceNameKey(value) {
  return String(value ?? "").trim()
    .normalize("NFKC")
    .replaceAll("驒", "騨")
    .replaceAll("六ケ所", "六ヶ所")
    .replaceAll("青ケ島", "青ヶ島")
    .replaceAll("保土ケ谷", "保土ヶ谷")
    .replaceAll("梼", "檮");
}

// Municipalities missing from the extracted Gazetteer table. Readings verified
// against municipal/prefectural publications; keep the GSI administrative suffix
// convention so locale.js remains the single place that formats city names.
export const SUPPLEMENTAL_MUNICIPALITY_ROMAJI = Object.freeze({
  // https://www.city.ashiya.lg.jp/kokusai/kokusai/documents/living-guide-en.pdf
  "芦屋市": "Ashiya Shi",
  // https://www.town.ashiya.lg.jp/site/ashiyagama/
  "芦屋町": "Ashiya Machi",
  // https://www.city.katsuragi.nara.jp/language.html
  "葛城市": "Katsuragi Shi",
  // https://www.pref.nara.lg.jp/site/okuyamato/area/mitsue.html
  "御杖村": "Mitsue Mura",
  // Also used by the existing observation-station translations in locale.js.
  "薩摩川内市": "Satsumasendai Shi"
});
