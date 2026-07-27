import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchLatestVolcanoActivities } from "../functions/_shared/volcanoLatest.js";

const JMA_VOLCANO_WARNING_URL = "https://www.jma.go.jp/bosai/volcano/data/warning.json";
const JMA_VOLCANO_CATALOG_URL = "https://www.jma.go.jp/bosai/volcano/const/volcano_list.json";
const outputUrl = new URL("../public/data/jma-volcano-latest-info.json", import.meta.url);
const [warnings, catalog] = await Promise.all([
  fetchJson(JMA_VOLCANO_WARNING_URL),
  fetchJson(JMA_VOLCANO_CATALOG_URL)
]);
const volcanoNameByCode = new Map(catalog.map((volcano) => [
  String(volcano.code),
  volcano.name_jp
]));
const activeCodes = [...new Set(warnings.flatMap((warning) =>
  (warning.volcanoInfos ?? [])
    .filter((info) => String(info.type ?? "").includes("対象火山"))
    .flatMap((info) => (info.items ?? [])
      .flatMap((item) => (item.areas ?? []).map((area) => String(area.code ?? ""))))
).filter(Boolean))];
const reports = (await fetchLatestVolcanoActivities(activeCodes))
  .map((report) => ({
    ...report,
    volcanoName: volcanoNameByCode.get(String(report.volcanoCode)) ?? report.volcanoName ?? ""
  }))
  .sort((left, right) => String(left.volcanoCode).localeCompare(String(right.volcanoCode)));

await writeFile(outputUrl, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  reports
}, null, 2)}\n`, "utf8");

console.log(`Updated ${reports.length} volcano activity reports: ${fileURLToPath(outputUrl)}`);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "MeteoScope/1.0 (volcano static data update)"
    }
  });
  if (!response.ok) throw new Error(`JMA request failed (${response.status}): ${url}`);
  return response.json();
}
