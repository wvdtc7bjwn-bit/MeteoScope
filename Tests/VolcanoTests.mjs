import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildVolcanoBaselineReports,
  buildVolcanoLatestActivityReports,
  consolidateVolcanoReports,
  fetchVolcanoLatestActivityReports,
  getAvailableVolcanoAshForecasts,
  getHighestPriorityVolcanoReport,
  getLatestVolcanoReportsByType,
  getVolcanoWarningDetailReport,
  groupVolcanoPolygonRings,
  normalizeVolcanoAscii,
  parseVolcanoSeismicCountTable,
  parseVolcanoCoordinate,
  parseVolcanoPolygon,
  selectVolcanoFeedEntries,
  volcanoAlertLevel
} from "../src/jma/volcanoXml.js";
import {
  fetchLatestVolcanoActivities,
  normalizeVolcanoCodes,
  parseLatestVolcanoActivityHtml,
  parseVolcanoBulletinHtml
} from "../functions/_shared/volcanoLatest.js";
import { getVolcanoLevelColor, getVolcanoLevelTextColor } from "../src/volcanoLevels.js";
import {
  getVolcanoAshfallLegendItems,
  getVolcanoAshfallLevel,
  VOLCANO_SMALL_CINDERS_STYLE
} from "../src/volcanoAshfall.js";

assert.deepEqual(
  [1, 2, 3, 4, 5].map(getVolcanoLevelColor),
  ["#f0f0f8", "#faf700", "#ffad00", "#ff2900", "#ca01f9"]
);
assert.equal(getVolcanoLevelTextColor(3), "#13233a");
assert.equal(getVolcanoLevelTextColor(4), "#ffffff");
const ashfallArea = { category: "ashfall", amount: "heavy" };
assert.deepEqual(
  getVolcanoAshfallLegendItems({ bulletinCode: "VFVO53", areas: [ashfallArea] }),
  [["降灰予報範囲", "", "#969da6"]],
  "降灰予報（定時）は従来の簡潔な凡例を維持する"
);
for (const bulletinCode of ["VFVO54", "VFVO55"]) {
  assert.deepEqual(
    getVolcanoAshfallLegendItems({ bulletinCode, areas: [ashfallArea] }).map(([label]) => label),
    ["降灰 多量", "降灰 やや多量", "降灰 少量"],
    `${bulletinCode} は降灰量3階級の専用凡例を表示する`
  );
}
assert.deepEqual(
  getVolcanoAshfallLegendItems({
    bulletinCode: "VFVO54",
    areas: [{ category: "small-cinders" }]
  }),
  [],
  "降灰域がない場合は降灰量凡例を表示しない"
);
assert.equal(getVolcanoAshfallLevel("heavy").color, "#747b84");
assert.equal(getVolcanoAshfallLevel("moderate").opacity, 0.3);
assert.equal(getVolcanoAshfallLevel("light").color, "#b8bec5");
assert.equal(VOLCANO_SMALL_CINDERS_STYLE.color, "#65329a");

const feedSelection = selectVolcanoFeedEntries([
  ...Array.from({ length: 40 }, (_, index) => ({
    id: `ash-${index}`,
    url: `https://example.test/ash-${index}`,
    code: "VFVO53",
    updated: new Date(Date.UTC(2026, 6, 23, 12, 0, index)).toISOString()
  })),
  { id: "warning", url: "https://example.test/warning", code: "VFVO50", updated: "2026-07-17T06:30:27Z" },
  { id: "commentary", url: "https://example.test/commentary", code: "VFVO51", updated: "2026-07-17T07:04:09Z" }
], 32);
assert.deepEqual(feedSelection.slice(0, 2).map((entry) => entry.code), ["VFVO51", "VFVO50"]);
assert.equal(feedSelection.filter((entry) => entry.code === "VFVO53").length, 10);

const warningDetail = { bulletinCode: "VFVO51", prevention: "火口周辺では大きな噴石に警戒してください。" };
const ashForecastDetail = { bulletinCode: "VFVO53", prevention: "降灰予報の説明" };
assert.equal(getVolcanoWarningDetailReport({ relatedReports: [ashForecastDetail, warningDetail] }), warningDetail);
assert.equal(getVolcanoWarningDetailReport({ relatedReports: [ashForecastDetail] }), null);
const latestReports = getLatestVolcanoReportsByType([
  { id: "commentary-old", bulletinCode: "VFVO51", reportTimeRaw: "2026-07-17T07:00:00+09:00" },
  { id: "ash-old", bulletinCode: "VFVO53", reportTimeRaw: "2026-07-23T08:00:00+09:00" },
  { id: "commentary-new", bulletinCode: "VFVO51", reportTimeRaw: "2026-07-20T16:00:00+09:00" },
  { id: "ash-new", bulletinCode: "VFVO53", reportTimeRaw: "2026-07-23T11:00:00+09:00" }
]);
assert.deepEqual(latestReports.map((report) => report.id), ["ash-new", "commentary-new"]);

const coordinate = parseVolcanoCoordinate("+3026.60+13013.03+657/");
assert.ok(Math.abs(coordinate[0] - 130.2171667) < 0.0001);
assert.ok(Math.abs(coordinate[1] - 30.4433333) < 0.0001);
assert.equal(volcanoAlertLevel("レベル３（入山規制）", "13"), 3);
assert.equal(volcanoAlertLevel("噴火警戒レベル４（避難準備）", ""), 4);

const currentVolcanoReports = buildVolcanoBaselineReports(
  {
    reportDatetime: "2026-07-08T16:00:00+09:00",
    volcanoInfos: [{
      items: [
        {
          name: "レベル１（活火山であることに留意）",
          code: "11",
          areas: [{ name: "口永良部島", code: "509" }]
        },
        {
          name: "レベル２（火口周辺規制）",
          code: "12",
          areas: [{ name: "十勝岳", code: "108" }]
        },
        {
          name: "活火山であることに留意",
          code: "21",
          areas: [{ name: "硫黄島", code: "329" }]
        }
      ]
    }]
  },
  [
    { code: "509", name_jp: "口永良部島", latlon: ["30.443", "130.217"], levelOperation: true },
    { code: "108", name_jp: "十勝岳", latlon: ["43.418", "142.686"], levelOperation: true },
    { code: "329", name_jp: "硫黄島", latlon: ["24.751", "141.289"] }
  ],
  [
    {
      reportDatetime: "2026-07-27T19:00:00+09:00",
      eventId: "509",
      volcanoInfos: [{
        type: "噴火警報・予報（対象火山）",
        items: [{
          name: "レベル２（火口周辺規制）",
          code: "12",
          lastCode: "11",
          condition: "引上げ",
          areas: [{ name: "口永良部島", code: "509" }]
        }]
      }]
    },
    {
      reportDatetime: "2007-12-01T10:01:00+09:00",
      eventId: "329",
      volcanoInfos: [{
        type: "噴火警報・予報（対象火山）",
        items: [{
          name: "火口周辺危険",
          code: "22",
          condition: "継続",
          areas: [{ name: "硫黄島", code: "329" }]
        }]
      }]
    }
  ]
);
const kuchinoerabujima = currentVolcanoReports.find((report) => report.volcanoCode === "509");
assert.equal(kuchinoerabujima?.level, 2, "warning.json の最新発表で月間概況の古いレベルを上書きする");
assert.equal(kuchinoerabujima?.kindName, "レベル2（火口周辺規制）");
assert.equal(kuchinoerabujima?.reportTimeRaw, "2026-07-27T19:00:00+09:00");
assert.equal(kuchinoerabujima?.condition, "引上げ");
assert.equal(
  currentVolcanoReports.find((report) => report.volcanoCode === "108")?.level,
  1,
  "warning.json にない過去の高レベルは通常状態へ戻す"
);
const marineWarningReport = buildVolcanoBaselineReports(
  { reportDatetime: "2026-07-27T20:00:00+09:00", volcanoInfos: [] },
  [{ code: "501", name_jp: "Marine volcano", latlon: ["24.3", "141.5"] }],
  [{
    reportDatetime: "2026-07-27T20:00:00+09:00",
    eventId: "501",
    volcanoInfos: [{
      type: "対象火山",
      items: [{
        name: "周辺海域警戒",
        code: "36",
        condition: "継続",
        areas: [{ name: "Marine volcano", code: "501" }]
      }]
    }]
  }]
)[0];
assert.equal(marineWarningReport?.level, 0);
assert.equal(marineWarningReport?.alertPriority, 3, "周辺海域警戒は入山危険と同じ橙色区分にする");
const ioto = currentVolcanoReports.find((report) => report.volcanoCode === "329");
assert.equal(ioto?.level, 0, "レベルを運用しない火山は警戒レベルを表示しない");
assert.equal(ioto?.alertPriority, 2, "レベルを運用しない火山も火口周辺危険の表示優先度を保つ");
assert.equal(
  buildVolcanoBaselineReports(
    {
      reportDatetime: "2026-07-08T16:00:00+09:00",
      volcanoInfos: [{
        items: [{
          name: "レベル２（火口周辺規制）",
          code: "12",
          areas: [{ name: "十勝岳", code: "108" }]
        }]
      }]
    },
    [{ code: "108", name_jp: "十勝岳", latlon: ["43.418", "142.686"], levelOperation: true }],
    null
  )[0]?.level,
  2,
  "warning.json の取得失敗時は月間概況をフォールバックとして保持する"
);
assert.equal(normalizeVolcanoAscii("２０２６年７月・概ね２ｋｍ"), "2026年7月・概ね2km");
assert.equal(normalizeVolcanoAscii("半径２ＫＭ・噴石"), "半径2KM・噴石");
assert.deepEqual(
  parseVolcanoSeismicCountTable(`火山性地震　爆発
7月 17日 5回 0回
18日 10回 0回
19日 9回 0回
20日15時まで 7回 0回`),
  {
    before: [],
    rows: [
      { period: "7月17日", earthquakeCount: "5", explosionCount: "0" },
      { period: "18日", earthquakeCount: "10", explosionCount: "0" },
      { period: "19日", earthquakeCount: "9", explosionCount: "0" },
      { period: "20日15時まで", earthquakeCount: "7", explosionCount: "0" }
    ],
    after: []
  }
);

assert.deepEqual(parseVolcanoPolygon("+31.500+130.500/+31.600+130.500/+31.600+130.600/"), [
  [130.5, 31.5], [130.5, 31.6], [130.6, 31.6], [130.5, 31.5]
]);
const outerAshRing = [[130, 31], [131, 31], [131, 32], [130, 32], [130, 31]];
const ashFreeHole = [[130.2, 31.2], [130.4, 31.2], [130.4, 31.4], [130.2, 31.4], [130.2, 31.2]];
const separateAshRing = [[132, 31], [133, 31], [133, 32], [132, 32], [132, 31]];
assert.deepEqual(groupVolcanoPolygonRings([outerAshRing, ashFreeHole]), [
  { polygon: outerAshRing, holes: [ashFreeHole] }
], "内包ポリゴンは降灰範囲の穴として扱う");
assert.deepEqual(groupVolcanoPolygonRings([outerAshRing, separateAshRing]), [
  { polygon: outerAshRing, holes: [] },
  { polygon: separateAshRing, holes: [] }
], "離れた降灰範囲は別ポリゴンとして残す");
const forecastReport = {
  ashForecasts: [
    { id: "expired", startTimeRaw: "2026-07-23T00:00:00+09:00", endTimeRaw: "2026-07-23T01:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "current", startTimeRaw: "2026-07-23T09:00:00+09:00", endTimeRaw: "2026-07-23T12:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "current-duplicate", startTimeRaw: "2026-07-23T09:00:00+09:00", endTimeRaw: "2026-07-23T12:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] },
    { id: "next", startTimeRaw: "2026-07-23T12:00:00+09:00", endTimeRaw: "2026-07-23T15:00:00+09:00", areas: [{ polygon: [[130, 31], [131, 31], [131, 32], [130, 31]] }] }
  ]
};
assert.deepEqual(
  getAvailableVolcanoAshForecasts(forecastReport, Date.parse("2026-07-23T10:00:00+09:00")).map((item) => item.id),
  ["current", "next"],
  "期限切れの降灰予報は地図へ表示しない"
);

const reports = consolidateVolcanoReports([
  { id: "a-new", volcanoCode: "506", volcanoName: "桜島", reportTimeRaw: "2026-07-23T10:00:00+09:00", kindName: "定時", level: 0, bulletinCode: "VFVO51" },
  { id: "a-status", volcanoCode: "506", volcanoName: "桜島", reportTimeRaw: "2026-07-08T16:00:00+09:00", kindName: "レベル3（入山規制）", kindCode: "13", level: 3, alertPriority: 3, bulletinCode: "CURRENT" },
  { id: "b-status", volcanoCode: "105", volcanoName: "雌阿寒岳", reportTimeRaw: "2026-07-08T16:00:00+09:00", level: 2, alertPriority: 2, bulletinCode: "CURRENT" }
]);
assert.equal(reports.length, 2, "同じ火山は1件へ統合する");
assert.equal(reports[0].volcanoName, "桜島", "警戒度の高い火山を先頭にする");
assert.equal(reports[0].level, 3, "最新の解説情報で現在の警戒レベルを失わない");
assert.equal(reports[0].kindName, "レベル3（入山規制）", "最新の解説情報の「定時」で現在の警報名を上書きしない");
assert.equal(reports[0].kindCode, "13");
assert.equal(reports[0].currentStatus, "レベル3（入山規制）");
assert.equal(reports[0].relatedReports.length, 2);

const latestActivityReports = buildVolcanoLatestActivityReports(
  [
    {
      reports: [
        {
          volcanoCode: "329",
          volcanoName: "硫黄島",
          reportTimeRaw: "2025-09-02T11:00:00+09:00",
          title: "火山の状況に関する解説情報(硫黄島第1号)",
          sourceUrl: "https://www.data.jma.go.jp/vois/data/report/volinfo/VK20250902110000_329.html"
        }
      ]
    },
    {
      reports: [
      {
        volcanoCode: "329",
        volcanoName: "硫黄島",
        reportTimeRaw: "2025-09-02T11:00:00+09:00",
        title: "火山の状況に関する解説情報(硫黄島第1号)",
        volcanoHeadline: "火口周辺警報（火口周辺危険）が継続",
        activity: "噴火が発生し、現在も継続しています。",
        prevention: "沿岸での小規模な海底噴火にも注意が必要です。",
        nextAdvisory: "変化があった場合には随時お知らせします。",
        sourceUrl: "https://www.data.jma.go.jp/vois/data/report/volinfo/VK20250902110000_329.html"
      },
      {
        volcanoCode: "108",
        volcanoName: "十勝岳",
        reportTimeRaw: "2024-01-01T00:00:00+09:00",
        title: "古い解説情報"
      },
      {
        volcanoCode: "999",
        volcanoName: "警報対象外",
        reportTimeRaw: "2026-07-27T16:00:00+09:00",
        title: "対象外"
      }
      ]
    }
  ],
  [
    {
      bulletinCode: "CURRENT",
      volcanoCode: "329",
      volcanoName: "硫黄島",
      reportTimeRaw: "2007-12-01T10:01:00+09:00",
      kindName: "火口周辺危険",
      alertPriority: 2,
      isWarningSnapshot: true,
      coordinates: [141.289, 24.751]
    },
    {
      bulletinCode: "CURRENT",
      volcanoCode: "108",
      volcanoName: "十勝岳",
      reportTimeRaw: "2026-06-18T11:00:00+09:00",
      kindName: "レベル2（火口周辺規制）",
      alertPriority: 2,
      isWarningSnapshot: true
    },
    {
      bulletinCode: "CURRENT",
      volcanoCode: "999",
      volcanoName: "警報対象外",
      reportTimeRaw: "2026-07-08T16:00:00+09:00",
      kindName: "レベル1",
      alertPriority: 1
    }
  ]
);
assert.equal(latestActivityReports.length, 1, "現在警報中かつ警報日時以降の最新解説情報だけを採用する");
assert.equal(latestActivityReports[0].volcanoCode, "329");
assert.deepEqual(latestActivityReports[0].coordinates, [141.289, 24.751]);
assert.equal(latestActivityReports[0].volcanoHeadline, "火口周辺警報（火口周辺危険）が継続");
assert.equal(latestActivityReports[0].activity, "噴火が発生し、現在も継続しています。");
assert.equal(latestActivityReports[0].prevention, "沿岸での小規模な海底噴火にも注意が必要です。");
assert.equal(latestActivityReports[0].nextAdvisory, "変化があった場合には随時お知らせします。");
const iotoConsolidated = consolidateVolcanoReports([
  latestActivityReports[0],
  {
    bulletinCode: "CURRENT",
    volcanoCode: "329",
    volcanoName: "硫黄島",
    reportTimeRaw: "2007-12-01T10:01:00+09:00",
    reportTime: "2007/12/01 10:01",
    kindName: "火口周辺危険",
    kindCode: "22",
    alertPriority: 2
  }
])[0];
assert.equal(iotoConsolidated.reportTime, "2025/09/02 11:00");
assert.equal(iotoConsolidated.currentStatus, "火口周辺危険", "最新解説日時を使っても現在の警報名を維持する");
assert.equal(iotoConsolidated.relatedReports.length, 2);

assert.deepEqual(normalizeVolcanoCodes(["329", "329", " 108 ", "bad", "1234"]), ["329", "108"]);
const parsedLatestActivity = parseLatestVolcanoActivityHtml(`
  <h2>最新の火山情報</h2>
  <ul>
    <li><a href="/vois/data/report/volinfo/VK20240203120000_329.html">古い情報</a></li>
    <li><a href="/vois/data/report/volinfo/VK20250902110000_329.html">火山の状況に関する解説情報(硫黄島第１号)&amp;確認</a></li>
  </ul>
`, "329");
assert.equal(parsedLatestActivity?.reportTimeRaw, "2025-09-02T11:00:00+09:00");
assert.equal(parsedLatestActivity?.title, "火山の状況に関する解説情報(硫黄島第１号)&確認");
assert.equal(
  parsedLatestActivity?.sourceUrl,
  "https://www.data.jma.go.jp/vois/data/report/volinfo/VK20250902110000_329.html"
);
const parsedBulletin = parseVolcanoBulletinHtml(`
  <html><body><pre>
火山名　硫黄島　火山の状況に関する解説情報　第１号

＊＊（見出し）＊＊
＜火口周辺警報（火口周辺危険）が継続＞
　硫黄島で噴火が発生し、現在も
継続しています。

＊＊（本　文）＊＊
１．火山活動の状況
　噴煙は高さ１０００ｍ以上まで
上がりました。

２．防災上の警戒事項等
　沿岸での小規模な海底噴火にも
注意が必要です。

　火山活動の状況に変化があった場合には、
随時お知らせします。
  </pre></body></html>
`);
assert.equal(
  parsedBulletin.volcanoHeadline,
  "＜火口周辺警報（火口周辺危険）が継続＞硫黄島で噴火が発生し、現在も継続しています。"
);
assert.equal(parsedBulletin.activity, "噴煙は高さ１０００ｍ以上まで上がりました。");
assert.equal(parsedBulletin.prevention, "沿岸での小規模な海底噴火にも注意が必要です。");
assert.equal(parsedBulletin.nextAdvisory, "火山活動の状況に変化があった場合には、随時お知らせします。");
const fetchedLatestActivities = await fetchLatestVolcanoActivities(["329", "108"], async (url) => ({
  ok: url.endsWith("/329.html"),
  status: url.endsWith("/329.html") ? 200 : 503,
  text: async () => '<a href="/vois/data/report/volinfo/VK20250902110000_329.html">硫黄島最新</a>'
}));
assert.deepEqual(fetchedLatestActivities.map((item) => item.volcanoCode), ["329"]);
assert.equal(typeof fetchVolcanoLatestActivityReports, "function", "選択した火山の最新解説を個別更新できる");
assert.equal(
  getHighestPriorityVolcanoReport([
    { volcanoCode: "low", alertPriority: 1, reportTimeRaw: "2026-07-23T12:00:00+09:00" },
    { volcanoCode: "high-old", alertPriority: 3, reportTimeRaw: "2026-07-22T12:00:00+09:00" },
    { volcanoCode: "high-new", alertPriority: 3, reportTimeRaw: "2026-07-23T11:00:00+09:00" }
  ])?.volcanoCode,
  "high-new",
  "要約バーの既定表示は警戒度を優先し、同じ警戒度では新しい発表を選ぶ"
);

const [config, map, app, panel, style, volcanoParser, longPressHint, viteConfig] = await Promise.all([
  readFile(new URL("../src/config.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/jma/volcanoXml.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/earthquakeLongPressHint.js", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8")
]);
assert.match(config, /volcano\/data\/info\/900\.json/);
assert.match(config, /volcano\/data\/warning\.json/);
assert.match(config, /volcano\/const\/volcano_list\.json/);
assert.equal((config.match(/volcanoLatestActivity:/gu) ?? []).length, 1, "最新火山解説APIの設定を重複させない");
assert.match(panel, /numbered\.groups\.kind[\s\S]*numbered\.groups\.number/);
assert.match(panel, /気象庁発表原文を確認/);
assert.match(panel, /Automated English summary/);
assert.match(panel, /This is not an official or complete translation/);
assert.match(panel, /function buildVolcanoOriginalSourceLink/);
assert.match(style, /\.volcano-bulletin-detail \.volcano-selected-header h2/);
assert.match(style, /\.volcano-summary-notice\s*\{/);
assert.match(app, /refreshSelectedVolcanoLatestActivity\(volcanoCode\)/);
assert.match(app, /activeOnly:\s*false/);
assert.match(app, /selectedBulletin\?\.bulletinCode === "ACTIVITY_LATEST"/);
assert.match(map, /VOLCANO_MARKER_IMAGE_ID = "volcano-filled-triangle"/);
assert.match(map, /"icon-image": VOLCANO_MARKER_IMAGE_ID/);
assert.match(map, /function buildVolcanoIconColorExpression\(theme\)/);
assert.match(map, /function buildVolcanoIconSizeExpression\(theme\)/);
assert.match(map, /function buildVolcanoLevelOneCondition\(\)/);
assert.match(
  map,
  /function buildVolcanoIconSizeExpression\(theme\)[\s\S]*?return \[\s*"interpolate",\s*\["linear"\],\s*\["zoom"\]/
);
assert.doesNotMatch(
  map,
  /function buildVolcanoIconSizeExpression\(theme\)[\s\S]*?return \[\s*"\*",\s*\["interpolate"/
);
assert.match(map, /\["to-number", \["get", "level"\], 0\], 1/);
assert.match(map, /volcanoLevel1:\s*"#8fa5b9"/);
assert.match(map, /volcanoBaseHaloWidth:\s*0/);
assert.match(map, /\["sample-volcano", "icon-halo-width", colors\.volcanoBaseHaloWidth\]/);
assert.doesNotMatch(map, /function buildVolcanoHalo(?:Color|Width)Expression/);
assert.match(map, /const levelOneScale = theme === "light" \? 1\.15 : 1/);
assert.match(map, /level:\s*priority/);
assert.match(map, /function setupVolcanoMarkerImage/);
assert.doesNotMatch(map, /"text-field": "△"/);
assert.match(map, /CustomEvent\("volcano-select"/);
assert.match(map, /CustomEvent\("volcano-select"[\s\S]*hideMapInfo\("earthquake-distribution"\);[\s\S]*return;/);
assert.doesNotMatch(map, /popup:\s*buildVolcanoPopup/);
assert.doesNotMatch(map, /function buildVolcanoPopup/);
assert.doesNotMatch(map, /popup:\s*buildAshfallPopup/);
assert.doesNotMatch(map, /function buildAshfallPopup/);
assert.match(map, /markerType:\s*"ashfall"/);
assert.match(map, /coordinates:\s*\[area\.polygon,\s*\.\.\.\(Array\.isArray\(area\.holes\)/);
assert.match(map, /getAvailableVolcanoAshForecasts/);
assert.match(map, /getHighestPriorityVolcanoReport\(reports\)/);
assert.match(map, /volcanoCode:\s*activeVolcanoCode/);
assert.match(map, /volcanoCode: String\(report\.volcanoCode/);
assert.match(map, /layerID === "sample-volcano" \|\| feature\?\.properties\?\.markerType === "ashfall"/);
assert.match(map, /mapInfoElement\.dataset\.variant = variant/);
assert.match(style, /\.map-info-popup\[data-variant="volcano"\]\s*\{\s*z-index: 410;/);
assert.match(app, /setupLongPressButton[\s\S]*data-tab="earthquake"/);
assert.match(app, /setupEarthquakeLongPressHint\(earthquakeTabButton\)/);
assert.match(app, /earthquakeLongPressHint\.showFirstRun\(\)/);
assert.match(longPressHint, /meteoscope-earthquake-long-press-hint-v4/);
assert.match(longPressHint, /document\.querySelector\("\.warning-modal:not\(\[hidden\]\)"\)/);
assert.match(longPressHint, /classList\.contains\("app-initializing"\)/);
assert.match(longPressHint, /地震ボタンを長押し/);
assert.match(style, /\.earthquake-long-press-hint\s*\{/);
assert.match(app, /classList\.toggle\("is-volcano-mode", earthquakeContentMode === "volcano"\)/);
assert.match(app, /selectedVolcanoCode = volcanoCode/);
assert.match(app, /selectedVolcanoBulletinId = String\(bulletinId/);
assert.match(panel, /data-volcano-clear-selection/);
assert.match(panel, /getHighestPriorityVolcanoReport\(reports\)/);
assert.match(panel, /data-volcano-bulletin-id/);
assert.match(panel, /data-volcano-bulletin-back/);
assert.match(
  panel,
  /const alertName = report\.currentStatus \?\? report\.kindName \?\? detailReport\.kindName \?\? statusText;[\s\S]*?extractVolcanoRestriction\(alertName, alertName\)/,
  "現在の噴火警報・予報では発表種別の「定時」ではなく全火山で現在の警報名を表示する"
);
assert.match(
  panel,
  /\^\(\?:噴火警戒\)\?レベル\\s\*\[1-5\][\s\S]*?return match\?\.\[1\] \?\? fallback/,
  "括弧内だけを表示する処理は噴火警戒レベル表記に限定し、非運用火山の正式名称を維持する"
);
assert.doesNotMatch(panel, /<a class="volcano-history-item"/);
assert.match(panel, /function buildVolcanoBulletinDetail/);
assert.match(panel, /data-volcano-ash-forecast-index/);
assert.match(panel, /data-mobile-dock-control data-volcano-ash-forecast-index/);
assert.match(panel, /class="volcano-ash-timeline"/);
assert.match(panel, /class="volcano-ash-timeline-rail"/);
assert.match(panel, /forecasts\.map\(\(\) => "<i><\/i>"\)/);
assert.match(panel, /data-volcano-ash-forecast-times="\$\{escapeHtml\(JSON\.stringify\(forecastTimes\)\)\}"/);
assert.match(panel, /aria-valuetext="\$\{escapeHtml\(forecastTime\)\}"/);
assert.doesNotMatch(panel, /mobileDock\?\.addEventListener\("input", handleFilterChange\)/, "ドラッグ中にモバイル降灰予報スライダーを再描画しない");
assert.match(panel, /function previewVolcanoAshForecast|const previewVolcanoAshForecast/);
assert.match(panel, /mobileDock\?\.addEventListener\("input", \(event\) => \{[\s\S]*?previewVolcanoAshForecast\(target\)/);
assert.match(panel, /mobileVolcanoAshSliderDragging[\s\S]*?state\.earthquakeContentMode === "volcano"/);
assert.match(panel, /const updateVolcanoAshSliderFromPointer = \(slider, clientX\) =>/);
assert.match(panel, /slider\.value = String\(nextValue\);[\s\S]*?previewVolcanoAshForecast\(slider\)/);
assert.match(panel, /mobileDock\?\.addEventListener\("pointermove", \(event\) => \{[\s\S]*?updateVolcanoAshSliderFromPointer/);
assert.match(
  app,
  /onVolcanoAshForecastChange: \(index\) => \{[\s\S]*?selectedVolcanoAshForecastIndex = index;[\s\S]*?refreshVolcanoView\(\)/
);
assert.match(app, /function refreshVolcanoView[\s\S]*?updateCurrentView/);
assert.match(app, /function updateCurrentView[\s\S]*?scheduleMapRender\(tab\.id, displayData\)/);
assert.match(style, /\.volcano-ash-timeline\s*\{[\s\S]*?height:\s*28px;/);
assert.match(style, /\.volcano-ash-timeline-rail\s*\{[\s\S]*?justify-content:\s*space-between;/);
assert.match(style, /\.volcano-ash-slider::\-webkit-slider-thumb[\s\S]*?width:\s*44px;[\s\S]*?border-radius:\s*999px;/);
assert.match(style, /\.volcano-ash-slider::\-webkit-slider-thumb[\s\S]*?background:\s*var\(--volcano-ash-thumb-background\);[\s\S]*?box-shadow:\s*none;/);
assert.match(style, /\.volcano-ash-slider::\-moz-range-thumb[\s\S]*?background:\s*var\(--volcano-ash-thumb-background\);[\s\S]*?box-shadow:\s*none;/);
assert.doesNotMatch(style, /\.volcano-ash-timeline-rail i\.active/);
assert.match(panel, /function formatVolcanoBulletinTitle/);
assert.match(panel, /replace\(\/\^火山名\[\\s\\u3000\]\*\/u/);
assert.match(panel, /volcano-bulletin-detail-nav volcano-selection-nav/);
assert.match(panel, /data-volcano-clear-selection>\$\{escapeHtml\(localizeText\("← 火山情報の見方"\)\)\}/);
assert.doesNotMatch(panel, /一覧へ戻る/);
assert.match(panel, /buildSelectedVolcanoDetail\(selectedReport, selectedBulletinId\)/);
assert.match(panel, /function buildVolcanoAlertLevelGuide/);
assert.match(panel, /buildVolcanoAlertLevelGuide\(\)/);
assert.match(panel, /活火山であることに留意/);
assert.match(panel, /level === 1 \? "活火山に留意" : keyword/);
assert.match(panel, /高齢者等避難/);
assert.doesNotMatch(panel, /visibleReports\.map\(\(report\) => buildVolcanoReportCard/);
assert.doesNotMatch(panel, /function buildVolcanoReportCard/);
assert.doesNotMatch(panel, /function buildVolcanoRelatedReport/);
assert.match(viteConfig, /return "world-geometry"/);
assert.match(panel, /噴火警報・予報の対象市町村/);
assert.match(style, /\.volcano-level-guide\s*\{/);
assert.match(style, /\.volcano-guide-scope-row\s*\{/);
assert.match(style, /\.volcano-guide-scope-row\.level-1 span\s*\{/);
assert.match(style, /\.tab-button\[data-tab="earthquake"\]\.is-volcano-mode\s*\{/);
assert.match(style, /\.volcano-guide-level\s*\{/);
assert.match(style, /\.volcano-history-item\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?border:\s*0;/);
assert.match(style, /\.volcano-history-item:last-child\s*\{\s*border-bottom:\s*0;/);
assert.match(style, /\.volcano-selection-nav\s*\{/);
assert.match(style, /\.level-5\s*\{[\s\S]*?--volcano-level-color:\s*#ca01f9;/);
assert.match(volcanoParser, /function parseVolcanoTargetAreas/);
assert.match(volcanoParser, /"VFVO53"/);
assert.match(volcanoParser, /function parseAshForecasts/);
assert.match(volcanoParser, /export function groupVolcanoPolygonRings/);
assert.match(volcanoParser, /targetAreas: entry\.code === "VFVO50" \? parseVolcanoTargetAreas\(body\) : \[\]/);

console.log("Volcano tests passed");
