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
