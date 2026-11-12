// JMA 96-byte CMT catalogue records. Offsets are 0-based.
// https://www.data.jma.go.jp/eqev/data/bulletin/data/format/fmtcmt_j.html
export function parseCmtArchive(text) {
  const records = [];
  let origin = null;
  const numeric = (line, start, end, decimals = 0) => {
    const raw = line.slice(start, end);
    if (!raw.trim() || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(raw)) return null;
    // F-format omits the decimal point, including fixed-depth trailing blanks.
    return raw.includes(".") || decimals === 0 ? Number(raw) : Number(raw.trimStart().replaceAll(" ", "0")) / 10 ** decimals;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("E")) { origin = null; continue; }
    if (/^[JUI]/.test(line)) {
      if (origin) continue; // first hypocentre is the adopted solution
      const seconds = numeric(line, 13, 17, 2);
      const lat = numeric(line, 21, 24), latMin = numeric(line, 24, 28, 2);
      const lon = numeric(line, 32, 36), lonMin = numeric(line, 36, 40, 2);
      const stamp = line.slice(1, 13);
      if (!/^\d{12}$/.test(stamp) || [seconds, lat, latMin, lon, lonMin].some(value => value === null) || seconds >= 60 || latMin >= 60 || lonMin >= 60) continue;
      const raw = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:00+09:00`;
      const time = Date.parse(raw) + seconds * 1000;
      if (!Number.isFinite(time)) continue;
      origin = { time, originTime: new Date(time).toISOString(), coordinates: [lon + lonMin / 60, lat + latMin / 60], magnitude: numeric(line, 52, 54, 1), place: line.slice(68, 92).trim(), mw: null };
    } else if (line.startsWith("T") && origin) {
      origin.mw = numeric(line, 52, 54, 1);
    } else if (line.startsWith("MC") && origin) {
      const planes = [[40,44,47,52], [52,56,59,64]].map(([a,b,c,d]) => [numeric(line,a,b),numeric(line,b,c),numeric(line,c,d)]);
      if (planes.some(p => p.some(v => v === null) || p[0] < 0 || p[0] > 360 || p[1] < 0 || p[1] > 90 || Math.abs(p[2]) > 180)) continue;
      records.push({ ...origin, id: `archive-${origin.time}`, type: "cmt", archive: true, planes });
    }
  }
  return records;
}

// Lower-hemisphere equal-area double-couple diagram, derived from nodal plane 1.
// NED coordinates; positive P radiation (compression) is black. This is not the full tensor.
export function doubleCoupleAmplitude(plane, x, y) {
  if (x * x + y * y > 1) return null;
  const [strike, dip, rake] = plane.map(degrees => degrees * Math.PI / 180);
  const s = Math.sin, c = Math.cos;
  const normal = [-s(dip)*s(strike), s(dip)*c(strike), -c(dip)];
  const slip = [c(rake)*c(strike)+c(dip)*s(rake)*s(strike), c(rake)*s(strike)-c(dip)*s(rake)*c(strike), -s(rake)*s(dip)];
  const r = Math.hypot(x, y), takeoff = 2 * Math.asin(r / Math.SQRT2);
  const ray = r ? [-y/r*s(takeoff), x/r*s(takeoff), c(takeoff)] : [0,0,1];
  const dot = vector => vector.reduce((sum, value, index) => sum + value * ray[index], 0);
  return 2 * dot(normal) * dot(slip);
}
