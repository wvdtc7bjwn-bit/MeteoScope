import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

globalThis.DOMParser = DOMParser;

const { mergeTsunamiReports, parseEarthquakeReport, parseTsunamiReport } = await import("../src/jma/earthquakeXml.js");

const earthquakeWithForecastComment = parseEarthquakeReport(`
  <Report>
    <Control><Title>震源・震度に関する情報</Title><DateTime>2026-07-15T08:42:12Z</DateTime></Control>
    <Head><Title>震源・震度情報</Title><ReportDateTime>2026-07-15T17:42:00+09:00</ReportDateTime><EventID>20260715173924</EventID><Headline><Text>１５日１７時３９分ころ、地震がありました。</Text></Headline></Head>
    <Body><Earthquake><OriginTime>2026-07-15T17:39:00+09:00</OriginTime><Hypocenter><Area><Name>宮城県沖</Name><Coordinate>+38.5+142.0-30000/</Coordinate></Area></Hypocenter><Magnitude>3.9</Magnitude></Earthquake><Intensity><Observation><MaxInt>1</MaxInt></Observation></Intensity><Comments><ForecastComment><Text>この地震による津波の心配はありません。</Text><Code>0215</Code></ForecastComment></Comments></Body>
  </Report>
`, {
  code: "VXSE53",
  id: "earthquake",
  updated: "2026-07-15T17:42:00+09:00",
  title: "震源・震度情報",
  url: "https://example.test/VXSE53.xml"
});

assert.equal(earthquakeWithForecastComment.headline, "１５日１７時３９分ころ、地震がありました。");
assert.equal(earthquakeWithForecastComment.tsunamiComment, "この地震による津波の心配はありません。");

function report(body, { code, id, updated = "2026-07-15T10:05:00+09:00" }) {
  return parseTsunamiReport(`<?xml version="1.0" encoding="UTF-8"?>
    <Report xmlns="http://xml.kishou.go.jp/jmaxml1/">
      <Control><Title>津波情報</Title><DateTime>${updated}</DateTime></Control>
      <Head>
        <Title>津波警報・注意報・予報</Title>
        <ReportDateTime>${updated}</ReportDateTime>
        <EventID>20260715100000</EventID>
        <Headline><Text>海の中や海岸付近は危険です。</Text></Headline>
      </Head>
      <Body><Tsunami>${body}</Tsunami></Body>
    </Report>`, {
    code,
    id,
    updated,
    title: "津波情報",
    url: `https://example.test/${code}/${id}.xml`
  });
}

const warning = report(`
  <Forecast>
    <Item>
      <Area><Name>北海道太平洋沿岸東部</Name><Code>100</Code></Area>
      <Category><Kind><Name>津波注意報</Name><Code>62</Code></Kind></Category>
      <FirstHeight><ArrivalTime>2026-07-15T10:30:00+09:00</ArrivalTime></FirstHeight>
      <MaxHeight><TsunamiHeight description="１ｍ">1.0</TsunamiHeight></MaxHeight>
    </Item>
    <Item>
      <Area><Name>青森県太平洋沿岸</Name><Code>210</Code></Area>
      <Category><Kind><Name>津波警報</Name><Code>52</Code></Kind></Category>
      <FirstHeight><Condition>津波到達中と推測</Condition></FirstHeight>
      <MaxHeight><Condition>巨大</Condition></MaxHeight>
    </Item>
  </Forecast>
`, { code: "VTSE41", id: "warning" });

assert.equal(warning.areas.length, 2);
assert.equal(warning.areas[0].level, "advisory");
assert.equal(warning.areas[0].height, "１ｍ");
assert.equal(warning.areas[1].level, "warning");
assert.equal(warning.areas[1].arrivalCondition, "津波到達中と推測");

const observation = report(`
  <Observation>
    <Item>
      <Area><Name>北海道太平洋沿岸東部</Name><Code>100</Code></Area>
      <Station>
        <Name>釧路</Name><Code>87110</Code>
        <FirstHeight><ArrivalTime>2026-07-15T10:22:00+09:00</ArrivalTime></FirstHeight>
        <MaxHeight><DateTime>2026-07-15T10:37:00+09:00</DateTime><TsunamiHeight description="０．４ｍ">0.4</TsunamiHeight></MaxHeight>
      </Station>
    </Item>
  </Observation>
`, { code: "VTSE51", id: "observation", updated: "2026-07-15T10:45:00+09:00" });

assert.equal(observation.observations.length, 1);
assert.equal(observation.observations[0].stationName, "釧路");
assert.equal(observation.observations[0].maxHeight, "０．４ｍ");

const offshore = report(`
  <Observation>
    <Item>
      <Area><Name>釧路沖</Name><Code>901</Code></Area>
      <Station><Name>釧路沖GPS波浪計</Name><Code>GPS01</Code><MaxHeight><Condition>観測中</Condition></MaxHeight></Station>
    </Item>
  </Observation>
`, { code: "VTSE52", id: "offshore", updated: "2026-07-15T10:50:00+09:00" });

const merged = mergeTsunamiReports([warning, observation, offshore]);
assert.equal(merged.highestLevel, "warning");
assert.equal(merged.isActive, true);
assert.equal(merged.observations.length, 1);
assert.equal(merged.offshoreObservations.length, 1);
assert.equal(merged.reportTimeRaw, "2026-07-15T10:50:00+09:00");

const cancelled = report(`
  <Forecast>
    <Item>
      <Area><Name>青森県太平洋沿岸</Name><Code>210</Code></Area>
      <Category><Kind><Name>津波警報解除</Name><Code>00</Code></Kind><LastKind><Name>津波警報</Name></LastKind></Category>
    </Item>
  </Forecast>
`, { code: "VTSE41", id: "cancelled", updated: "2026-07-15T11:00:00+09:00" });

const ended = mergeTsunamiReports([warning, cancelled]);
assert.equal(ended.highestLevel, "none");
assert.equal(ended.isActive, false);

assert.throws(() => parseTsunamiReport("<Report><Body /></Report>", {
  code: "VTSE41",
  id: "invalid",
  updated: "",
  title: "",
  url: ""
}), /Tsunami body/);

console.log("Tsunami XML tests passed");
