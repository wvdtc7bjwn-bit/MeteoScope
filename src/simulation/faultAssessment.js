import assessments from "./faultAssessments.json" with {type: "json"};

const normalized = value => value.normalize("NFKC").replace(/[\s・･−－‐―ー–—-]/gu, "");
// A parent match supplies choices only, never an automatic activity-case match.
export function getFaultAssessment(name) {
  const target = normalized(name);
  const names = [...new Set(assessments.records.map(row => row.name))].sort((a,b) => b.length - a.length);
  const parent = names.find(value => target.startsWith(normalized(value)))
    ?? names.find(value => value.split("・").some(part => target.startsWith(normalized(part))));
  if (!parent) return {checkedAt: assessments.checkedAt, rows: [], exact: false, sourceUrl: assessments.sourceUrl};
  const rows = assessments.records.filter(row => row.name === parent);
  const exact = rows.find(row => normalized(row.name + row.caseName) === target);
  return {checkedAt: assessments.checkedAt, rows, exact: Boolean(exact), matching: exact ?? null, sourceUrl: rows[0].url};
}

export const faultAssessmentCaseId = row => JSON.stringify([row.name, row.caseName]);

// Preserve the published range/bounds separately from the UI starting value.
// Unknown wording is deliberately not usable as a numeric input.
export function publishedMagnitudeBounds(value) {
  const literal = String(value).normalize("NFKC").replace(/\s/gu, "");
  const match = /^(最大)?(\d(?:\.\d)?)(?:[~〜～](\d(?:\.\d)?))?程度(以上|以下|もしくはそれ以上)?$/u.exec(literal);
  if (!match) return null;
  const low = Number(match[2]), high = match[3] ? Number(match[3]) : low;
  if (low < 1 || high > 9.5 || low > high) return null;
  const lowerBound = match[4] === "以上" || match[4] === "もしくはそれ以上";
  const upperBound = Boolean(match[1]) || match[4] === "以下";
  if (lowerBound && upperBound || (lowerBound || upperBound) && match[3]) return null;
  return {min: upperBound ? 1 : low, max: lowerBound ? 9.5 : high,
    value: !match[3] && !lowerBound && !upperBound ? low : null};
}

// A UI starting value, not an official representative or expected magnitude.
// Closed ranges use the midpoint rounded to the selectable tenth; open bounds
// use the stated boundary, not the unrelated simulation limit of 1 or 9.5.
export function publishedMagnitudeDefault(value) {
  const bounds=publishedMagnitudeBounds(value);
  if(!bounds)return null;
  if(bounds.value!=null)return bounds.value;
  const literal=String(value).normalize("NFKC");
  return /[~〜～]/u.test(literal)
    ? Math.max(bounds.min,Math.min(bounds.max,Math.round((bounds.min+bounds.max)*5)/10))
    : /最大|以下/u.test(literal)?bounds.max:bounds.min;
}

export function normalizeMagnitudeBasis(options) {
  const basis = options.magnitudeBasis ?? "Mw";
  if (basis === "Mw") return {magnitudeBasis: basis, assessmentCase: null, magnitudeSource: null};
  if (basis !== "herp-M" || options.model !== "active-fault") throw new RangeError("Invalid magnitude basis");
  const assessment = getFaultAssessment(options.activeFault.LTENAME);
  const row = assessment.rows.find(row => faultAssessmentCaseId(row) === options.assessmentCase);
  const bounds = row && publishedMagnitudeBounds(row.magnitude);
  if (!bounds || !Number.isFinite(options.magnitude) || options.magnitude < bounds.min || options.magnitude > bounds.max) throw new RangeError("Select a published activity case and a magnitude within its bounds");
  return {magnitudeBasis: basis, assessmentCase: faultAssessmentCaseId(row), magnitudeSource: {
    ...row, checkedAt: assessment.checkedAt, activityNameMatches: assessment.matching === row,
    approximation: "Published M used numerically in an Mw-based teaching model; not an M-to-Mw conversion"
  }};
}
