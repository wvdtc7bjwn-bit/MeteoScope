// Official GSI Wagamachi link directory. Category IDs refer to its CSV files.
export const HAZARD_DIRECTORY_SOURCE = "https://disaportaldata.gsi.go.jp/hazardmap/copyright/opendata.html#wagamachi";
export const HAZARD_CATEGORIES = Object.freeze([
  { id: "flood", label: "洪水", csv: "hminfo/1.csv" },
  { id: "inland", label: "内水", csv: "hminfo/2.csv" },
  { id: "landslide", label: "土砂災害", csv: "hminfo/5.csv" },
  { id: "tsunami", label: "津波", csv: "hminfo/4.csv" },
  { id: "surge", label: "高潮", csv: "hminfo/3.csv" },
  { id: "reservoir", label: "ため池", csv: "hminfo/7.csv" },
  { id: "volcano", label: "火山", csv: "hminfo/6.csv" },
  { id: "intensity", label: "地震の揺れ", csv: "bsinfo/1.csv" },
  { id: "ground", label: "地盤", csv: "bsinfo/2.csv" },
  { id: "liquefaction", label: "液状化", csv: "bsinfo/3.csv" },
  { id: "building", label: "建物被害", csv: "bsinfo/4.csv" },
  { id: "fire", label: "火災", csv: "bsinfo/5.csv" },
  { id: "evacuation", label: "避難", csv: "bsinfo/6.csv" },
  { id: "other", label: "その他", csv: "bsinfo/7.csv" },
  { id: "combined", label: "総合防災", csv: "bsinfo/8.csv" }
]);

export function safeHazardUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if (!url.hostname.includes(".") || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}

// Quoted commas, escaped quotes and CRLF are part of the official CSV format.
export function parseHazardCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const input = String(text).replace(/^\uFEFF/u, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (!field || quoted) quoted = !quoted;
      else throw new Error("Invalid hazard CSV quote");
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(field); field = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && input[i + 1] === "\n") i += 1;
      }
    } else field += char;
  }
  if (quoted) throw new Error("Unclosed hazard CSV quote");
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows[0]?.join(",") !== "市町村コード,都道府県,市町村,掲載するURL") throw new Error("Unexpected hazard CSV columns");
  return rows.slice(1).map((fields) => {
    const [code, prefecture, name, rawUrl] = fields.map((value) => value.trim());
    const url = safeHazardUrl(rawUrl);
    if (fields.length !== 4 || !/^\d{5}$/u.test(code) || Number(code.slice(0, 2)) < 1 || Number(code.slice(0, 2)) > 47 || !prefecture || !name || !url) throw new Error("Invalid hazard CSV municipality/link");
    return { code, prefecture, name, url };
  });
}

export function buildHazardDirectory(sources) {
  const prefectures = new Map();
  for (const category of HAZARD_CATEGORIES) {
    const rows = sources[category.id];
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Missing category: ${category.id}`);
    for (const row of rows) {
      const code = row.code.slice(0, 2);
      let prefecture = prefectures.get(code);
      if (!prefecture) { prefecture = { code, name: row.prefecture, municipalities: new Map() }; prefectures.set(code, prefecture); }
      if (prefecture.name !== row.prefecture) throw new Error(`Conflicting prefecture: ${code}`);
      let city = prefecture.municipalities.get(row.code);
      if (!city) { city = { code: row.code, name: row.name, links: [] }; prefecture.municipalities.set(row.code, city); }
      if (city.name !== row.name) throw new Error(`Conflicting municipality: ${row.code}`);
      if (!city.links.some((link) => link.category === category.id && link.url === row.url)) city.links.push({ category: category.id, url: row.url });
    }
  }
  return [...prefectures.values()].sort((a, b) => a.code.localeCompare(b.code)).map((prefecture) => ({
    ...prefecture,
    municipalities: [...prefecture.municipalities.values()].sort((a, b) => a.code.localeCompare(b.code))
  }));
}

// A single municipal page often covers several hazards. Show it once while
// keeping every category visible and preserving separate links where supplied.
export function getMunicipalHazardLinks(city, category = "") {
  const grouped = new Map();
  for (const link of city?.links ?? []) {
    const url = safeHazardUrl(link.url);
    if (!url || !HAZARD_CATEGORIES.some((item) => item.id === link.category) || (category && link.category !== category)) continue;
    if (!grouped.has(url)) grouped.set(url, { url, categories: [] });
    const target = grouped.get(url);
    if (!target.categories.includes(link.category)) target.categories.push(link.category);
  }
  return [...grouped.values()];
}
