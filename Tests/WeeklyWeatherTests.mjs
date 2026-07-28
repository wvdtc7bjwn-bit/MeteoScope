import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import {
  findLatestWeeklyForecastUrl
} from "../functions/api/weekly-weather.js";
import {
  extractVpFw50Urls,
  findLatestVpFw50DetailUrl,
  isVpFw50Xml
} from "../src/jma/vpfw50Feed.js";

globalThis.DOMParser = DOMParser;
const {
  buildWeeklyForecastRegionCatalog,
  parseWeeklyForecastXml,
  resolveJmaAreaPath,
  resolveWeeklyForecastTarget
} = await import("../src/jma/weeklyForecastXml.js");
const {
  JMA_WEEKLY_WEATHER_LABELS,
  classifyWeeklyWeatherGlyph,
  getJmaWeeklyWeatherLabel,
  isSupportedJmaWeeklyWeatherCode,
  renderWeeklyWeatherGlyph
} = await import("../src/ui/weeklyWeatherGlyph.js");

const areaData = {
  offices: {
    "050000": { name: "秋田地方気象台", parent: "010100" }
  },
  class10s: {
    "050010": { name: "沿岸", parent: "050000" }
  },
  class15s: {},
  class20s: {
    "0520100": { name: "秋田市", parent: "050010" }
  },
  centers: {
    "010100": { name: "東北地方" }
  }
};
assert.deepEqual(resolveJmaAreaPath(areaData, "0520100"), ["0520100", "050010", "050000", "010100"]);

const multiRegionAreaData = {
  offices: {
    "130000": { name: "東京都", parent: "010100" }
  },
  class10s: {
    "130010": { name: "東京地方", parent: "130000" },
    "130100": { name: "伊豆諸島", parent: "130000" },
    "130040": { name: "小笠原諸島", parent: "130000" }
  },
  class15s: {},
  class20s: {
    "1340100": { name: "八丈町", parent: "130100" }
  },
  centers: {
    "010100": { name: "関東甲信地方" }
  }
};
const multiRegionWeekAreaData = {
  "130000": [
    { srf: "130010", week: "130010", amedas: "44132" },
    { srf: "130100", week: "130100", amedas: "44263" },
    { srf: "130040", week: "130040", amedas: "44301" }
  ]
};
assert.deepEqual(resolveWeeklyForecastTarget(
  multiRegionAreaData,
  multiRegionWeekAreaData,
  "1340100"
), {
  officeCode: "130000",
  officeName: "東京都",
  areaCode: "130100",
  forecastAreaCode: "130100",
  areaName: "伊豆諸島",
  areaPath: ["130100", "1340100", "130000", "010100"],
  stationCode: "44263"
});
assert.deepEqual(buildWeeklyForecastRegionCatalog(
  multiRegionAreaData,
  multiRegionWeekAreaData
), [{
  officeCode: "130000",
  officeName: "東京都",
  centerCode: "010100",
  centerName: "関東甲信地方",
  regions: [
    {
      areaCode: "130010",
      forecastAreaCode: "130010",
      areaName: "東京地方",
      stationCode: "44132"
    },
    {
      areaCode: "130100",
      forecastAreaCode: "130100",
      areaName: "伊豆諸島",
      stationCode: "44263"
    },
    {
      areaCode: "130040",
      forecastAreaCode: "130040",
      areaName: "小笠原諸島",
      stationCode: "44301"
    }
  ]
}]);

const feedUrls = [
  "https://www.data.jma.go.jp/developer/xml/data/20260728014453_0_VPFW50_050000.xml",
  "https://www.data.jma.go.jp/developer/xml/data/20260727014453_0_VPFW50_050000.xml"
];
const feed = feedUrls.map((url) => `<entry><id>${url}</id><link href="${url}"/></entry>`).join("");
assert.deepEqual(extractVpFw50Urls(feed), feedUrls);
assert.equal(findLatestVpFw50DetailUrl(feed, "050000"), feedUrls[0]);
assert.equal(
  await findLatestWeeklyForecastUrl("050000", async (url) => url.endsWith("regular.xml") ? "<feed/>" : feed),
  feedUrls[0]
);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
  <Control><PublishingOffice>秋田地方気象台</PublishingOffice></Control>
  <Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
    <ReportDateTime>2026-07-28T11:00:00+09:00</ReportDateTime>
  </Head>
  <Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/">
    <MeteorologicalInfos type="区域予報"><TimeSeriesInfo>
      <TimeDefines>
        <TimeDefine timeId="1"><DateTime>2026-07-29T00:00:00+09:00</DateTime></TimeDefine>
        <TimeDefine timeId="2"><DateTime>2026-07-30T00:00:00+09:00</DateTime></TimeDefine>
      </TimeDefines>
      <Item>
        <Kind><Property><Type>天気</Type><WeatherPart>
          <jmx_eb:Weather refID="1">くもり後雨</jmx_eb:Weather>
          <jmx_eb:Weather refID="2">晴れ時々くもり</jmx_eb:Weather>
        </WeatherPart><WeatherCodePart>
          <jmx_eb:WeatherCode refID="1">214</jmx_eb:WeatherCode>
          <jmx_eb:WeatherCode refID="2">101</jmx_eb:WeatherCode>
        </WeatherCodePart></Property></Kind>
        <Kind><Property><Type>降水確率</Type><ProbabilityOfPrecipitationPart>
          <jmx_eb:ProbabilityOfPrecipitation refID="1">60</jmx_eb:ProbabilityOfPrecipitation>
          <jmx_eb:ProbabilityOfPrecipitation refID="2">20</jmx_eb:ProbabilityOfPrecipitation>
        </ProbabilityOfPrecipitationPart></Property></Kind>
        <Kind><Property><Type>信頼度</Type><ReliabilityClassPart>
          <jmx_eb:ReliabilityClass refID="2">A</jmx_eb:ReliabilityClass>
        </ReliabilityClassPart></Property></Kind>
        <Area><Name>秋田県</Name><Code>050000</Code></Area>
      </Item>
    </TimeSeriesInfo></MeteorologicalInfos>
    <MeteorologicalInfos type="地点予報"><TimeSeriesInfo>
      <TimeDefines>
        <TimeDefine timeId="1"><DateTime>2026-07-29T00:00:00+09:00</DateTime></TimeDefine>
        <TimeDefine timeId="2"><DateTime>2026-07-30T00:00:00+09:00</DateTime></TimeDefine>
      </TimeDefines>
      <Item><Kind><Property><Type>最低気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最低気温" refID="1">23</jmx_eb:Temperature>
        <jmx_eb:Temperature type="最低気温" refID="2">24</jmx_eb:Temperature>
      </TemperaturePart></Property><Property><Type>最高気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最高気温" refID="1">29</jmx_eb:Temperature>
        <jmx_eb:Temperature type="最高気温" refID="2">32</jmx_eb:Temperature>
      </TemperaturePart></Property></Kind><Station><Name>秋田</Name><Code>32402</Code></Station></Item>
    </TimeSeriesInfo></MeteorologicalInfos>
  </Body>
</Report>`;

const forecast = parseWeeklyForecastXml(xml, {
  areaPath: ["0520100", "050010", "050000"],
  municipalityName: "秋田市",
  officeCode: "050000"
});
assert.equal(isVpFw50Xml(xml), true);
assert.equal(isVpFw50Xml("<!doctype html><html></html>"), false);
assert.equal(forecast.bulletinCode, "VPFW50");
assert.equal(forecast.areaName, "秋田県");
assert.equal(forecast.stationName, "秋田");
assert.equal(forecast.days.length, 2);
assert.deepEqual(
  forecast.days.map((day) => [day.weather, day.weatherCode, day.precipitationProbability, day.minTemperature, day.maxTemperature]),
  [
    ["くもり後雨", "214", 60, 23, 29],
    ["晴れ時々くもり", "101", 20, 24, 32]
  ]
);
assert.equal(forecast.days[1].reliability, "A");

const multiRegionXml = `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
  <Control><PublishingOffice>気象庁</PublishingOffice></Control>
  <Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
    <ReportDateTime>2026-07-28T11:00:00+09:00</ReportDateTime>
  </Head>
  <Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/">
    <MeteorologicalInfos type="区域予報"><TimeSeriesInfo>
      <TimeDefines>
        <TimeDefine timeId="1"><DateTime>2026-07-29T00:00:00+09:00</DateTime></TimeDefine>
      </TimeDefines>
      <Item><Kind><Property><Type>天気</Type><WeatherPart>
        <jmx_eb:Weather refID="1">晴れ</jmx_eb:Weather>
      </WeatherPart><WeatherCodePart>
        <jmx_eb:WeatherCode refID="1">100</jmx_eb:WeatherCode>
      </WeatherCodePart></Property></Kind><Area><Name>東京地方</Name><Code>130010</Code></Area></Item>
      <Item><Kind><Property><Type>天気</Type><WeatherPart>
        <jmx_eb:Weather refID="1">雨</jmx_eb:Weather>
      </WeatherPart><WeatherCodePart>
        <jmx_eb:WeatherCode refID="1">300</jmx_eb:WeatherCode>
      </WeatherCodePart></Property></Kind><Area><Name>伊豆諸島</Name><Code>130100</Code></Area></Item>
    </TimeSeriesInfo></MeteorologicalInfos>
    <MeteorologicalInfos type="地点予報"><TimeSeriesInfo>
      <TimeDefines>
        <TimeDefine timeId="1"><DateTime>2026-07-29T00:00:00+09:00</DateTime></TimeDefine>
      </TimeDefines>
      <Item><Kind><Property><Type>最低気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最低気温" refID="1">24</jmx_eb:Temperature>
      </TemperaturePart></Property><Property><Type>最高気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最高気温" refID="1">33</jmx_eb:Temperature>
      </TemperaturePart></Property></Kind><Station><Name>東京</Name><Code>44132</Code></Station></Item>
      <Item><Kind><Property><Type>最低気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最低気温" refID="1">26</jmx_eb:Temperature>
      </TemperaturePart></Property><Property><Type>最高気温</Type><TemperaturePart>
        <jmx_eb:Temperature type="最高気温" refID="1">30</jmx_eb:Temperature>
      </TemperaturePart></Property></Kind><Station><Name>八丈島</Name><Code>44263</Code></Station></Item>
    </TimeSeriesInfo></MeteorologicalInfos>
  </Body>
</Report>`;
const izuForecast = parseWeeklyForecastXml(multiRegionXml, {
  areaPath: ["130030", "130000"],
  targetAreaName: "伊豆諸島南部",
  officeCode: "130000",
  officeName: "東京都",
  stationCode: "44263"
});
assert.equal(izuForecast.areaName, "伊豆諸島");
assert.equal(izuForecast.stationName, "八丈島");
assert.deepEqual(
  izuForecast.days.map((day) => [
    day.weather,
    day.weatherCode,
    day.minTemperature,
    day.maxTemperature
  ]),
  [["雨", "300", 26, 30]]
);

assert.deepEqual(
  classifyWeeklyWeatherGlyph("101", "晴れ時々くもり").features,
  ["sun", "cloud"]
);
assert.equal(classifyWeeklyWeatherGlyph("101").primaryFeature, "sun");
assert.equal(classifyWeeklyWeatherGlyph("201").primaryFeature, "cloud");
assert.equal(classifyWeeklyWeatherGlyph("304").primaryFeature, "rain");
assert.equal(classifyWeeklyWeatherGlyph("340").primaryFeature, "snow");
assert.equal(classifyWeeklyWeatherGlyph("214", "くもり後雨").kind, "cloud-rain");
assert.equal(classifyWeeklyWeatherGlyph("308", "雨で暴風を伴う").kind, "storm-rain");
assert.equal(classifyWeeklyWeatherGlyph("407", "暴風雪").kind, "storm-snow");
assert.equal(classifyWeeklyWeatherGlyph("340", "みぞれ").kind, "sleet");
assert.equal(classifyWeeklyWeatherGlyph("340", "霙で暴風を伴う").kind, "storm-sleet");
assert.equal(classifyWeeklyWeatherGlyph("304").kind, "rain-snow");
assert.equal(classifyWeeklyWeatherGlyph("329").kind, "rain-sleet");
assert.equal(classifyWeeklyWeatherGlyph("350").kind, "rain-thunder");
assert.equal(classifyWeeklyWeatherGlyph("450").kind, "snow-thunder");
assert.equal(classifyWeeklyWeatherGlyph("306").kind, "rain");
assert.equal(classifyWeeklyWeatherGlyph("406").kind, "storm-snow");
assert.equal(classifyWeeklyWeatherGlyph("209").kind, "fog");
assert.equal(classifyWeeklyWeatherGlyph("231").kind, "cloud-fog-rain");
assert.match(renderWeeklyWeatherGlyph("101", "晴れ時々くもり"), /weekly-weather-glyph-cloud/u);
assert.match(renderWeeklyWeatherGlyph("101"), /data-weather-primary="sun"/u);
assert.match(renderWeeklyWeatherGlyph("101"), /weekly-weather-glyph-cloud-secondary/u);
assert.match(renderWeeklyWeatherGlyph("101"), /weekly-weather-glyph-sun-disc weekly-weather-glyph-foreground/u);
assert.match(renderWeeklyWeatherGlyph("201"), /data-weather-primary="cloud"/u);
assert.doesNotMatch(renderWeeklyWeatherGlyph("201"), /weekly-weather-glyph-cloud-secondary/u);
assert.match(renderWeeklyWeatherGlyph("201"), /weekly-weather-glyph-cloud weekly-weather-glyph-foreground/u);
const sunnyThenCloudyGlyph = renderWeeklyWeatherGlyph("101");
const cloudyThenSunnyGlyph = renderWeeklyWeatherGlyph("201");
assert.ok(
  sunnyThenCloudyGlyph.indexOf("weekly-weather-glyph-cloud-secondary")
    < sunnyThenCloudyGlyph.indexOf("<g class=\"weekly-weather-glyph-main\">"),
  "sun should be drawn in front when sunny is primary"
);
assert.ok(
  cloudyThenSunnyGlyph.indexOf("<g class=\"weekly-weather-glyph-main\">")
    < cloudyThenSunnyGlyph.indexOf("weekly-weather-glyph-cloud"),
  "cloud should be drawn in front when cloudy is primary"
);
assert.match(renderWeeklyWeatherGlyph("304"), /data-weather-primary="rain"/u);
assert.match(renderWeeklyWeatherGlyph("340"), /data-weather-primary="snow"/u);
assert.match(renderWeeklyWeatherGlyph("308", "暴風雨"), /weekly-weather-glyph-wind/u);
assert.match(renderWeeklyWeatherGlyph("407", "暴風雪"), /weekly-weather-glyph-snow/u);
assert.match(renderWeeklyWeatherGlyph("340", "みぞれ"), /weekly-weather-glyph-rain/u);
assert.match(renderWeeklyWeatherGlyph("340", "みぞれ"), /weekly-weather-glyph-snow/u);
assert.doesNotMatch(renderWeeklyWeatherGlyph("101", "晴れ時々くもり"), /https?:\/\//u);

const officialWeatherCodes = [
  100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 130, 131, 132, 140, 160, 170,
  181, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215,
  216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 228, 229, 230, 231, 240, 250,
  260, 270, 281, 300, 301, 302, 303, 304, 306, 308, 309, 311, 313, 314, 315, 316, 317,
  320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 340, 350, 361, 371, 400, 401, 402,
  403, 405, 406, 407, 409, 411, 413, 414, 420, 421, 422, 423, 425, 426, 427, 450
].map(String);
assert.deepEqual(Object.keys(JMA_WEEKLY_WEATHER_LABELS), officialWeatherCodes);
for (const weatherCode of officialWeatherCodes) {
  assert.equal(isSupportedJmaWeeklyWeatherCode(weatherCode), true, `unsupported JMA code ${weatherCode}`);
  assert.ok(getJmaWeeklyWeatherLabel(weatherCode), `missing JMA label ${weatherCode}`);
  const classification = classifyWeeklyWeatherGlyph(weatherCode);
  assert.equal(classification.isOfficialCode, true, `unrecognized JMA code ${weatherCode}`);
  assert.ok(classification.kind, `missing glyph kind ${weatherCode}`);
  assert.match(
    renderWeeklyWeatherGlyph(weatherCode),
    new RegExp(`data-weather-code="${weatherCode}"`, "u"),
    `missing rendered JMA code ${weatherCode}`
  );
}
assert.equal(isSupportedJmaWeeklyWeatherCode("999"), false);

const [index, app, styles, modal, glyph, viteConfig] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/weeklyWeatherModal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/weeklyWeatherGlyph.js", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8")
]);
assert.match(index, /id="weekly-weather-button"[\s\S]*id="disaster-map-button"/u);
assert.match(index, /id="weekly-weather-modal"/u);
assert.match(index, /id="weekly-weather-region-select"/u);
assert.match(app, /setupWeeklyWeatherModal\(\{/u);
assert.match(styles, /\.weekly-weather-open-button::before/u);
assert.match(styles, /\.weekly-weather-region-control select/u);
assert.match(styles, /\.weekly-weather-days\s*\{[\s\S]*?grid-template-columns:\s*repeat\(7,/u);
assert.match(styles, /\.weekly-weather-glyph-main/u);
assert.match(modal, /気象庁の最新VPFW50/u);
assert.match(modal, /fetchWeeklyForecastRegionCatalog/u);
assert.match(modal, /fetchWeeklyForecastForRegion/u);
assert.match(modal, /renderWeeklyWeatherGlyph\(day\.weatherCode, weatherLabel\)/u);
assert.match(modal, /getJmaWeeklyWeatherLabel\(day\.weatherCode\)/u);
assert.doesNotMatch(modal, /forecast\/img/u);
assert.match(glyph, /暴風雪/u);
assert.match(glyph, /JMA_WEEKLY_WEATHER_LABELS/u);
assert.doesNotMatch(glyph, /RAINSTORM_CODES|SNOWSTORM_CODES|THUNDER_CODES|SLEET_CODES/u);
assert.match(viteConfig, /localWeeklyWeatherApi\(\)/u);
assert.match(viteConfig, /requestUrl\.pathname !== "\/api\/weekly-weather"/u);

console.log("Weekly weather VPFW50 tests passed.");
