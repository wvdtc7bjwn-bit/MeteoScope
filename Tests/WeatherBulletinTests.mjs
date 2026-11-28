import assert from "node:assert/strict";
import { test } from "node:test";
import { JMA_ENDPOINTS } from "../src/config.js";
import { createWeatherBulletinReader, getWeatherBulletinOffice, parseWeatherBulletinFeed, parseWeatherBulletinReport } from "../src/jma/weatherBulletins.js";
import { installXmlDom } from "./helpers/installXmlDom.mjs";

installXmlDom();

const base = "https://www.data.jma.go.jp/developer/xml/data/";
const time = "2026-11-28T04:20:00Z";
const later = "2026-11-28T04:25:00Z";
const area = {
  offices: { "130000": { parent: "010300" }, "120000": { parent: "010300" }, "471000": { parent: "011100" } },
  class10s: { "120010": { parent: "120000" } },
  class15s: { "120011": { parent: "120010" } },
  class20s: { "1210000": { parent: "120011" } }
};

function entry(code, office, { id = "20261128042000", updated = time, content = "【気象解説情報】見出し" } = {}) {
  const url = `${base}${id}_0_${code}_${office}.xml`;
  return { url, xml: `<entry><link href="${url}"/><updated>${updated}</updated><content>${content}</content></entry>` };
}

function feed(...entries) {
  return `<feed xmlns="http://www.w3.org/2005/Atom">${entries.map(({ xml }) => xml).join("")}</feed>`;
}

function report({
  eventId = "EVENT", infoType = "発表", status = "通常", title = "気象解説情報", body = "",
  issuedAt = "2026-11-28T13:20:00+09:00", validUntil = "2026-11-28T14:30:00+09:00"
} = {}) {
  return `<Report xmlns="http://xml.kishou.go.jp/jmaxml1/">
    <Control><DateTime>${time}</DateTime><Status>${status}</Status><PublishingOffice>気象庁</PublishingOffice></Control>
    <Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
      <Title>${title}</Title><ReportDateTime>${issuedAt}</ReportDateTime>
      ${validUntil ? `<ValidDateTime>${validUntil}</ValidDateTime>` : ""}<EventID>${eventId}</EventID>
      <InfoType>${infoType}</InfoType><Headline><Text>見出し</Text></Headline>
    </Head><Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/">${body}</Body>
  </Report>`;
}

function readerFor(short, long, documents, now = () => Date.parse(time)) {
  const requested = [];
  const reader = createWeatherBulletinReader({
    now,
    async text(url) {
      requested.push(url);
      if (url === JMA_ENDPOINTS.riverFloodXmlFeed && short) return short;
      if (url === JMA_ENDPOINTS.riverFloodXmlLongFeed && long) return long;
      if (documents.has(url)) return documents.get(url);
      throw new Error("unavailable");
    }
  });
  return { requested, reader };
}

test("groups legacy flash reports separately and accepts only official report links", () => {
  const forecast = entry("VPFJ51", "471000");
  const oldFlash = entry("VPFJ50", "471000", { content: "【沖縄本島地方気象防災速報（線状降水帯発生）】見出し" });
  const tornado = entry("VPHW51", "430000");
  const other = entry("VXSE51", "010000");
  const foreign = { xml: forecast.xml.replace("www.data.jma.go.jp", "example.com") };
  const parsed = parseWeatherBulletinFeed(feed(forecast, oldFlash, tornado, other, foreign));
  assert.deepEqual(parsed.map(({ scope, family }) => [scope, family]), [
    ["prefectural", "weather-prefectural"], ["flash", "weather-flash"], ["flash", "tornado"]
  ]);
});

test("reads structured commentary, old-format text, and timed observations", () => {
  const body = `<Item><Kind><Property><Type>気象概況</Type><Text type="本文">解説</Text></Property>
    <Property><EventPart><Event><EventName>線状降水帯発生</EventName><Time>${time}</Time></Event></EventPart></Property>
    </Kind><Area><Name>本島北部</Name></Area></Item><Comment><Text type="本文">旧形式本文</Text></Comment>`;
  const parsed = parseWeatherBulletinReport(report({ body }), {});
  assert.deepEqual(parsed.paragraphs, [{ title: "気象概況", text: "解説" }, { title: "", text: "旧形式本文" }]);
  assert.deepEqual(parsed.events, [{ name: "線状降水帯発生", areaName: "本島北部", time }]);
  assert.equal(parsed.issuedAt, "2026-11-28T13:20:00+09:00");
  assert.equal(parsed.validUntil, "2026-11-28T14:30:00+09:00");
  assert.equal(parseWeatherBulletinReport(report({ status: "訓練" }), {}), null);
});

test("uses the selected region and prefers the new format without requesting its duplicate", async () => {
  const fresh = entry("VPCJ51", "130000");
  const legacy = entry("VPCJ50", "130000");
  const outside = entry("VPCJ51", "471000");
  const prefectural = entry("VPFJ51", "120000");
  const { requested, reader } = readerFor(feed(legacy, fresh, outside), feed(fresh, prefectural), new Map([[fresh.url, report()]]));
  assert.equal(getWeatherBulletinOffice(area, "1210000"), "120000");
  assert.equal(getWeatherBulletinOffice(area, "0000000"), "");
  const { reports, partial } = await reader.loadReports({ scope: "regional", region: "010300", area });
  assert.equal(partial, false);
  assert.deepEqual(reports.map(({ url }) => url), [fresh.url]);
  assert.deepEqual(requested.filter((url) => url.startsWith(base)), [fresh.url]);
});

test("current-location reports combine the local prefectural office and its parent region", async () => {
  const regional = entry("VPCJ51", "130000");
  const prefectural = entry("VPFJ51", "120000");
  const otherOffice = entry("VPFJ51", "130000");
  const otherRegion = entry("VPCJ51", "471000");
  const national = entry("VPZJ51", "010000");
  const flash = entry("VPBS50", "120000");
  const { requested, reader } = readerFor(
    feed(regional, otherRegion, national),
    feed(prefectural, otherOffice, flash),
    new Map([[regional.url, report()], [prefectural.url, report()]])
  );
  const localOffice = getWeatherBulletinOffice(area, "1210000");
  const result = await reader.loadReports({ scope: "local", region: localOffice, area });
  assert.equal(result.partial, false);
  assert.deepEqual(result.reports.map(({ url }) => url).sort(), [regional.url, prefectural.url].sort());
  assert.deepEqual(requested.filter((url) => url.startsWith(base)).sort(), [regional.url, prefectural.url].sort());
  assert.deepEqual((await reader.loadReports({ scope: "local", region: "", area })).reports, []);
});

test("keeps the latest revision, suppresses canceled events, and reports partial source failure", async () => {
  const original = entry("VPZJ51", "010000");
  const revised = entry("VPZJ50", "010000", { id: "20261128042500", updated: later });
  const another = entry("VPZJ51", "010000", { id: "20261128042100", content: "別の情報" });
  const canceled = entry("VPZJ51", "010000", { id: "20261128042600", updated: later, content: "取消" });
  const documents = new Map([
    [original.url, report()], [revised.url, report({ infoType: "訂正" })],
    [another.url, report({ eventId: "CANCEL", title: "別の情報" })], [canceled.url, report({ eventId: "CANCEL", title: "別の情報", infoType: "取消" })]
  ]);
  const { reader } = readerFor(feed(original, revised, another, canceled), "", documents);
  const { reports, partial } = await reader.loadReports({ scope: "national" });
  assert.equal(partial, true);
  assert.deepEqual(reports.map(({ url, infoType }) => [url, infoType]), [[revised.url, "訂正"]]);
  const empty = readerFor("", "", documents).reader;
  await assert.rejects(empty.loadReports({ scope: "national" }), /unavailable/);
});

test("tries the parallel legacy XML if the new XML is unavailable", async () => {
  const primary = entry("VPHW51", "130000");
  const fallback = entry("VPHW50", "130000");
  const { reader } = readerFor(feed(primary), feed(fallback), new Map([[fallback.url, report({ eventId: "" })]]));
  const { reports, partial } = await reader.loadReports({ scope: "flash" });
  assert.equal(partial, false);
  assert.deepEqual(reports.map(({ url }) => url), [fallback.url]);
});

test("hides flash bulletins at their official expiry or the app display cutoff", async () => {
  const tornado = entry("VPHW51", "130000");
  const lineRain = entry("VPBS50", "471000");
  const oldCommentary = entry("VPFJ51", "471000");
  const documents = new Map([
    [tornado.url, report({ eventId: "" })],
    [lineRain.url, report({ validUntil: "" })],
    [oldCommentary.url, report()]
  ]);
  let asOf = Date.parse("2026-11-28T14:29:59+09:00");
  const { reader } = readerFor(feed(tornado, lineRain), feed(oldCommentary), documents, () => asOf);
  const readFlash = async () => (await reader.loadReports({ scope: "flash" })).reports.map(({ url }) => url);
  assert.deepEqual(await readFlash(), [tornado.url, lineRain.url]);
  asOf = Date.parse("2026-11-28T14:30:00+09:00");
  assert.deepEqual(await readFlash(), [lineRain.url]);
  asOf = Date.parse("2026-11-28T16:20:00+09:00");
  assert.deepEqual(await readFlash(), []);
  assert.equal((await reader.loadReports({ scope: "prefectural" })).reports.length, 1);
});
