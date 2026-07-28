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
  parseWeeklyForecastXml,
  resolveJmaAreaPath
} = await import("../src/jma/weeklyForecastXml.js");

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

const [index, app, styles, modal, viteConfig] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/weeklyWeatherModal.js", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.js", import.meta.url), "utf8")
]);
assert.match(index, /id="weekly-weather-button"[\s\S]*id="disaster-map-button"/u);
assert.match(index, /id="weekly-weather-modal"/u);
assert.match(app, /setupWeeklyWeatherModal\(\{/u);
assert.match(styles, /\.weekly-weather-open-button::before/u);
assert.match(styles, /\.weekly-weather-days\s*\{[\s\S]*?grid-template-columns:\s*repeat\(7,/u);
assert.match(modal, /気象庁の最新VPFW50/u);
assert.match(modal, /forecast\/img\/\$\{day\.weatherCode\}\.svg/u);
assert.match(viteConfig, /localWeeklyWeatherApi\(\)/u);
assert.match(viteConfig, /requestUrl\.pathname !== "\/api\/weekly-weather"/u);

console.log("Weekly weather VPFW50 tests passed.");
