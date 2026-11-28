const DIRECTIONS = new Map(Object.entries({
  n: "北", nne: "北北東", ne: "北東", ene: "東北東", e: "東", ese: "東南東", se: "南東", sse: "南南東",
  s: "南", ssw: "南南西", sw: "南西", wsw: "西南西", w: "西", wnw: "西北西", nw: "北西", nnw: "北北西",
  north: "北", east: "東", south: "南", west: "西", northeast: "北東", southeast: "南東", southwest: "南西", northwest: "北西"
}));

const COUNTRY_ALIASES = {
  turkey: "TR", "timor leste": "TL", "east timor": "TL", "russian federation": "RU", "viet nam": "VN",
  "republic of korea": "KR", "kyrgyz republic": "KG", "czech republic": "CZ", "the philippines": "PH",
  "u.s. virgin islands": "VI", "united states virgin islands": "VI", "federated states of micronesia": "FM"
};

const REGIONS = new Map(Object.entries({
  "balleny islands": "バレニー諸島",
  "bonin islands": "小笠原諸島",
  "fiji islands": "フィジー諸島",
  "izu islands": "伊豆諸島",
  "kermadec islands": "ケルマデック諸島",
  "macquarie island": "マッコーリー島",
  "mariana islands": "マリアナ諸島",
  "mauritius reunion": "モーリシャス・レユニオン",
  "mid atlantic ridge": "大西洋中央海嶺",
  "northern mid atlantic ridge": "大西洋中央海嶺北部",
  "revilla gigedo islands": "レビジャヒヘド諸島",
  "revillagigedo islands": "レビジャヒヘド諸島",
  "ryukyu islands": "琉球諸島",
  "south sandwich islands": "サウスサンドウィッチ諸島",
  "southeast indian ridge": "南東インド洋海嶺",
  "southwest indian ridge": "南西インド洋海嶺",
  "southern mid atlantic ridge": "大西洋中央海嶺南部"
}));

// JETRO uses エリゾボ for Yelizovo, which is absent from Natural Earth.
// https://www.jetro.go.jp/biznews/2018/08/71530dffc03d3923.html
const SUPPLEMENTAL_NAMES = new Map([["RU/yelizovo", "エリゾボ"]]);

export function normalizeWorldPlaceKey(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’‘]/gu, "'")
    .replace(/[-–—]/gu, " ").toLowerCase().trim().replace(/\s+/gu, " ");
}

let countryNames;
function getCountryNameIndex() {
  if (countryNames) return countryNames;
  const names = new Map();
  if (typeof Intl.DisplayNames === "function") {
    const english = new Intl.DisplayNames("en", { type: "region", fallback: "none" });
    const japanese = new Intl.DisplayNames("ja", { type: "region", fallback: "none" });
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const first of letters) {
      for (const second of letters) {
        const code = first + second;
        const name = english.of(code);
        const ja = japanese.of(code);
        // Ignore obsolete region codes that Intl returns as aliases of present-day regions.
        const locale = `und-${code}`;
        if (name && ja && code !== "ZZ" && Intl.getCanonicalLocales(locale)[0] === locale) {
          names.set(normalizeWorldPlaceKey(name), { code, ja });
        }
      }
    }
    for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
      const ja = japanese.of(code);
      if (ja) names.set(alias, { code, ja });
    }
  }
  countryNames = names;
  return names;
}

function formatJapaneseReference(name, gazetteer) {
  const parts = name.split(/\s*,\s*/u);
  const countries = getCountryNameIndex();
  const country = countries.get(normalizeWorldPlaceKey(parts.at(-1)));
  const localNames = country ? parts.slice(0, -1) : parts;
  const translated = localNames.map((part) => {
    const key = normalizeWorldPlaceKey(part);
    return REGIONS.get(key.replace(/^the /u, ""))
      ?? SUPPLEMENTAL_NAMES.get(`${country?.code}/${key}`)
      ?? (country && Object.hasOwn(gazetteer[country.code] ?? {}, key) ? gazetteer[country.code][key] : null)
      ?? part;
  });
  return country ? [country.ja, ...translated].join("・") : translated.join(", ");
}

export function formatJapaneseWorldEarthquakePlace(place, gazetteer = {}) {
  if (!place) return "";
  const distance = /^(\d+(?:\.\d+)?)\s*km\s+([NSEW]{1,3})\s+of\s+(.+)$/iu.exec(place);
  const bearing = distance && DIRECTIONS.get(distance[2].toLowerCase());
  if (bearing) return `${formatJapaneseReference(distance[3], gazetteer)}の${bearing}${distance[1]}km`;

  const coast = /^(off|near) the coast of (.+)$/iu.exec(place);
  if (coast) return `${formatJapaneseReference(coast[2], gazetteer)}${coast[1].toLowerCase() === "off" ? "沖" : "沿岸付近"}`;

  const relative = /^(north|east|south|west|northeast|southeast|southwest|northwest) of (.+)$/iu.exec(place);
  if (relative) return `${formatJapaneseReference(relative[2], gazetteer)}の${DIRECTIONS.get(relative[1].toLowerCase())}方`;

  const region = /^(.+) region$/iu.exec(place);
  if (region) return `${formatJapaneseReference(region[1], gazetteer)}周辺`;

  return formatJapaneseReference(place, gazetteer);
}
