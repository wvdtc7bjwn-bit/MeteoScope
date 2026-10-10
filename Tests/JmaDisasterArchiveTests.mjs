import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseJmaDisasterArchive } from "../src/jma/disasterArchive.js";
import { onRequest } from "../functions/api/jma-disaster-cases.js";

const [indexHtml, appSource, modalSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/jmaDisasterArchiveModal.js", import.meta.url), "utf8")
]);
assert.match(indexHtml, /id="jma-disaster-archive-button"[^>]*aria-controls="jma-disaster-archive-modal"/u);
assert.match(indexHtml, /id="jma-disaster-archive-modal"[\s\S]*?id="jma-disaster-archive-results"/u);
assert.match(appSource, /setupJmaDisasterArchiveModal\(\)/u);
assert.match(modalSource, /fetch\("\/api\/jma-disaster-cases"/u);
assert.match(modalSource, /data-jma-archive-case/gu);

const fixture = `
<div class="simu-item">
  <div class='simu-item-name'>令和8年&nbsp;8月豪雨<span class='simu-tri'> ▽ </span></div>
  <a target='_blank' href='page.html#target=20260813&current=2026081215&range=2026081215-2026081415'>8/13 0時</a>
  <a target='_blank' href='page.html#target=20260813&current=2026081216&range=2026081215-2026081415'>1時</a>
  <a target='_blank' href='https://example.com/page.html#target=20260813&current=2026081216&range=2026081215-2026081415'>不正ドメイン</a>
  <a target='_blank' href='page.html#script=20260813'>不正フラグメント</a>
</div><!-- simu-item -->
<div class="simu-item">
  <div class='simu-item-name'>台風第XX号<span class='simu-tri'> ▽ </span></div>
  <a target='_blank' href='page.html#target=20250811&current=2025081106&range=2025081106-2025081206'>8/11 15時</a>
</div><!-- simu-item -->`;

const cases = parseJmaDisasterArchive(fixture);
assert.equal(cases.length, 2);
assert.equal(cases[0].title, "令和8年 8月豪雨");
assert.deepEqual(cases[0].links.map(({ label }) => label), ["8/13 0時", "1時"]);
assert.equal(cases[0].links[0].url, "https://www.data.jma.go.jp/review/page.html#target=20260813&current=2026081215&range=2026081215-2026081415");
assert.equal(cases[1].title, "台風第XX号");
assert.deepEqual(parseJmaDisasterArchive("<html>メンテナンス中</html>"), []);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://www.data.jma.go.jp/review/case.txt");
    assert.equal(init.cf.cacheTtl, 1800);
    return new Response(fixture, { status: 200 });
  };
  const response = await onRequest({
    request: new Request("https://meteoscope.example/api/jma-disaster-cases")
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /s-maxage=1800/u);
  assert.equal(await response.text(), fixture);

  const denied = await onRequest({
    request: new Request("https://meteoscope.example/api/jma-disaster-cases", { method: "POST" })
  });
  assert.equal(denied.status, 405);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("JMA disaster archive tests passed");
