import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseMechanisms, onRequest } from "../functions/api/jma-focal-mechanism.js";
import { mechanismEvent, mechanismMonths, matchMechanism, mechanismLinks } from "../src/earthquake/focalMechanism.js";
import { parseCmtArchive, doubleCoupleAmplitude } from "../src/earthquake/focalMechanismArchive.js";
const fixture = name => readFile(new URL(`./fixtures/focal-mechanism/${name}`, import.meta.url), "utf8");
const cmtHtml = await fixture("cmt202611.html");
const cmt = parseMechanisms(cmtHtml, "cmt", "202611")[0];
const event = { eventTimeRaw: cmt.originTime, coordinates: cmt.coordinates };

test("official CMT and initial-motion columns, JST origin and trusted URLs", async () => {
  assert.ok(cmt); assert.equal(cmt.type, "cmt"); assert.ok(cmt.planes[0].length === 3);
  assert.equal(parseMechanisms(cmtHtml, "cmt", "202610").length, 0);
  const initial = parseMechanisms(await fixture("mc202611.html"), "initial", "202611")[0];
  assert.equal(initial.mw, null); assert.deepEqual(initial.planes[0], [34,34,162]);
  assert.equal(initial.originTime, "2026-10-31T22:15:01.500Z");
  assert.equal(mechanismLinks("cmt", "../bad"), null);
  assert.ok(mechanismLinks("cmt", cmt.id).image.startsWith("https://www.data.jma.go.jp/"));
});
test("missing coordinates/time never match; latest and history models both match", () => {
  assert.equal(matchMechanism([cmt],event).status,"matched");
  assert.equal(matchMechanism([cmt],{ originTime:cmt.originTime,coordinates:cmt.coordinates }).status,"matched");
  for(const value of [null,undefined,""]) assert.equal(mechanismEvent({...event,coordinates:[value,35]}),null);
  assert.equal(mechanismEvent({...event,eventTimeRaw:"2026-11-01 10:00"}),null);
  assert.equal(matchMechanism([cmt],{...event,coordinates:[0,0]}).status,"missing");
  assert.equal(matchMechanism([cmt],{...event,eventTimeRaw:new Date(cmt.time+91000).toISOString()}).status,"missing");
  assert.equal(matchMechanism([cmt,{...cmt,id:"another"}],event).status,"ambiguous");
});
test("JST month boundary queries both months", () => {
  assert.deepEqual(mechanismMonths(Date.parse("2024-01-01T00:00:00+09:00")),["202312","202401"]);
});
test("fixed-width catalogue uses hypocentre instead of centroid and parses angles/Mw", async () => {
  const [record] = parseCmtArchive(await fixture("cmt202401.txt"));
  assert.equal(record.originTime,"2024-01-01T07:10:22.570Z");
  assert.equal(record.mw,7.5); assert.equal(record.magnitude,7.6);
  assert.deepEqual(record.planes,[[47,37,100],[215,54,82]]);
  assert.ok(Math.abs(record.coordinates[1]-37.4961667)<1e-6);
  assert.equal(parseCmtArchive("MC invalid\nE").length,0);
});
test("double-couple projection: reverse/normal centre, strike-slip quadrants", () => {
  assert.ok(doubleCoupleAmplitude([0,45,90],0,0)>0);
  assert.ok(doubleCoupleAmplitude([0,45,-90],0,0)<0);
  assert.ok(doubleCoupleAmplitude([0,90,0],.4,-.4)>0);
  assert.ok(doubleCoupleAmplitude([0,90,0],-.4,-.4)<0);
  assert.equal(doubleCoupleAmplitude([0,45,90],2,0),null);
  for(const [x,y] of [[.3,.4],[-.7,.1],[0,0]]) assert.ok(Math.abs(doubleCoupleAmplitude([47,37,100],x,y)-doubleCoupleAmplitude([215,54,82],x,y))<.04);
});
test("stored historical records link to Noto and Tohoku earthquake", async () => {
  for(const [year,month,magnitude] of [[2024,"202401",7.6],[2011,"201103",9]]) {
    const history=JSON.parse(await readFile(new URL(`../public/data/earthquake-history/${year}.json`,import.meta.url),"utf8"));
    const quake=history.find(record => record.m===magnitude);
    assert.ok(quake);
    const data=JSON.parse(await readFile(new URL(`../public/data/focal-mechanism/${month}.json`,import.meta.url),"utf8"));
    const result=matchMechanism(data.records,{originTime:quake.t,coordinates:[quake.lo,quake.la]});
    assert.equal(result.status,"matched");
  }
});
test("API validation, unavailable month, upstream failure and parsing", async () => {
  const original = globalThis.fetch;
  const request = query => onRequest({request:new Request(`https://example.test/api?${query}`)});
  try {
    globalThis.fetch = async () => { throw new Error("must not fetch"); };
    assert.equal((await request("month=../../test")).status,400);
    globalThis.fetch = async () => new Response("",{status:404});
    assert.equal((await (await request("month=202611")).json()).unavailable,true);
    globalThis.fetch = async () => new Response("<html>error</html>");
    assert.equal((await request("month=202611")).status,502);
    globalThis.fetch = async () => new Response(cmtHtml);
    const response=await request("month=202611");
    assert.equal(response.status,200); assert.equal((await response.json()).records.length,1);
  } finally { globalThis.fetch=original; }
});
