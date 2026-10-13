import assert from "node:assert/strict";
import {
  onRequest,
  parseJmaUpperAirArchiveMonths,
  parseJmaUpperAirArchiveCharts
} from "../functions/api/jma-upper-air-archive.js";
import { getUpperAirArchiveApiUrl } from "../src/ui/upperAirArchivePicker.js";

const indexHtml = `
<a href="/yoho/data/wxchart/archive/2026_06/index.html">2026年06月</a>
<a href="/yoho/data/wxchart/archive/2025_01/index.html">2025年01月</a>`;
const monthHtml = `
<a href="PDFDATA/AUMAP/Au850_2026060100.pdf">2026年06月01日00時(UTC)</a>
<a href="PDFDATA/AUMAP/Au850_2026060112.pdf">2026年06月01日12時(UTC)</a>
<a href="PDFDATA/AUMAP/Au700_2026060200.pdf">2026年06月02日00時(UTC)</a>
<a href="PDFDATA/AUMAP/Au500_2026050100.pdf">別の月</a>
<a href="PDFDATA/AUMAP/Au300_2026063100.pdf">存在しない日付</a>`;

assert.deepEqual(parseJmaUpperAirArchiveMonths(indexHtml).map(({ value }) => value), ["2026_06", "2025_01"]);
const charts = parseJmaUpperAirArchiveCharts(monthHtml, "2026_06");
assert.equal(charts.length, 3);
assert.equal(charts[0].url, "https://www.data.jma.go.jp/yoho/data/wxchart/archive/2026_06/PDFDATA/AUMAP/Au850_2026060100.pdf");
assert.deepEqual(charts.map(({ level, hour }) => [level, hour]), [[850, "00"], [850, "12"], [700, "00"]]);
assert.equal(getUpperAirArchiveApiUrl("localhost"), "/api/jma-upper-air-archive");
assert.equal(getUpperAirArchiveApiUrl("wvdtc7bjwn-bit.github.io"), "https://meteoscope.pages.dev/api/jma-upper-air-archive");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => new Response(url.endsWith("/2026_06/index.html") ? monthHtml : indexHtml);
  const indexResponse = await onRequest({ request: new Request("https://meteoscope.example/api/jma-upper-air-archive") });
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get("access-control-allow-origin"), "*");
  assert.equal((await indexResponse.json()).months.length, 2);

  const monthResponse = await onRequest({ request: new Request("https://meteoscope.example/api/jma-upper-air-archive?month=2026_06") });
  assert.equal(monthResponse.status, 200);
  assert.equal((await monthResponse.json()).charts.length, 3);

  const invalidMonth = await onRequest({ request: new Request("https://meteoscope.example/api/jma-upper-air-archive?month=../../secret") });
  assert.equal(invalidMonth.status, 400);
  const denied = await onRequest({ request: new Request("https://meteoscope.example/api/jma-upper-air-archive", { method: "POST" }) });
  assert.equal(denied.status, 405);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("JMA upper-air archive tests passed");
