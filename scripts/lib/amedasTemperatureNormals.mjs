const ELEMENTS = { "0600": "maximum", "0700": "minimum" };

// JMA's numeric zero is meaningful only with RMK 8. RMK 0 means no statistic.
export function buildAmedasTemperatureNormalData(entries) {
  const stations = {};
  for (const { text } of entries) {
    for (const row of text.split(/\r?\n/)) {
      const fields = row.split(","), kind = ELEMENTS[fields[2]?.trim()];
      const id = fields[1]?.trim(), month = Number(fields[6]);
      if (!kind || !/^\d{5}$/.test(id ?? "") || !Number.isInteger(month) || month < 1 || month > 12) continue;
      const values = stations[id] ??= { maximum: Array(372).fill(null), minimum: Array(372).fill(null) };
      const days = new Date(Date.UTC(2000, month, 0)).getUTCDate();
      for (let day = 0; day < days; day++) {
        const raw = fields[7 + day * 2]?.trim(), quality = fields[8 + day * 2]?.trim();
        const value = raw ? Number(raw) : NaN;
        if (quality === "8" && Number.isFinite(value) && Math.abs(value) < 9000) values[kind][(month - 1) * 31 + day] = value;
      }
    }
  }
  for (const [id, values] of Object.entries(stations)) {
    if (!Object.values(values).some(series => series.some(Number.isFinite))) delete stations[id];
  }
  return { schema: 2, period: "1991-2020", source: "気象庁 アメダス（地域気象観測）日別平年値", unit: "0.1C", quality: "RMK=8", stations };
}
