import {readFile, writeFile} from "node:fs/promises";

const sourceUrl = "https://www.jishin.go.jp/regional_seismicity/rs_katsudanso/";
// Preserve the source's M notation and activity sections. Never convert M to Mw.
export function parseFaultAssessmentIndex(html) {
  html = html.replace(/<!--[\s\S]*?-->/gu, "");
  const text = html => html.replace(/<[^>]*>/gu, " ").replace(/&nbsp;/gu, " ").replace(/\s+/gu, " ").trim().normalize("NFKC");
  const records = [];
  let parent = null;
  for (const row of html.match(/<tr\b[\s\S]*?<\/tr>/giu) ?? []) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map(match => ({html: match[1], text: text(match[1])}));
    const parentIndex = cells.findIndex(cell => /href=["'][^"']*\/rs_katsudanso\/[^"']+/iu.test(cell.html));
    if (parentIndex >= 0) {
      const cell = cells[parentIndex], href = cell.html.match(/href=["']([^"']+)/iu)[1];
      const url = new URL(href, sourceUrl);
      if (url.origin !== "https://www.jishin.go.jp") throw new Error("Unexpected assessment origin");
      parent = {name: cell.text, url: url.href};
    } else if (cells.length < 3 || cells.some(cell => /href=/iu.test(cell.html))) parent = null;
    if (!parent) continue;
    const magnitudeIndex = cells.findIndex(cell => /^[6789](?:\.[0-9])?(?:[~～-][6789](?:\.[0-9])?)?(?:程度|以上|以下|前後)/u.test(cell.text));
    if (magnitudeIndex < 0) continue;
    records.push({...parent, caseName: cells.slice(Math.max(0, parentIndex + 1), magnitudeIndex).map(cell => cell.text).join(" "), magnitude: cells[magnitudeIndex].text});
  }
  const unique = [...new Map(records.map(row => [`${row.name}|${row.caseName}`, row])).values()];
  if (unique.length < 100 || !unique.some(row => row.name === "上町断層帯")) throw new Error(`Incomplete official assessment index (${unique.length}; ${unique.slice(0, 3).map(row => row.name)})`);
  return unique;
}

if (process.argv[1]?.endsWith("update-simulation-fault-assessments.mjs")) {
  const html = process.argv[2] ? await readFile(process.argv[2], "utf8") : await (await fetch(sourceUrl)).text();
  const records = parseFaultAssessmentIndex(html);
  await writeFile(new URL("../src/simulation/faultAssessments.json", import.meta.url), JSON.stringify({
    sourceUrl, checkedAt: process.argv[3] ?? new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10), magnitudeScale: "M (as published; not converted to Mw)", records
  }, null, 2) + "\n");
  console.log(`Verified ${records.length} published activity-section records`);
}
