import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { normalizeLakeCollection } from "../scripts/build-lake-geometry.mjs";
import { createWorldSource } from "../src/map/worldTiles.js";

const exterior = [[135,35],[136,35],[136,36],[135,36],[135,35]];
const hole = [[135.2,35.2],[135.2,35.4],[135.4,35.4],[135.4,35.2],[135.2,35.2]];
const geometry = {type:"MultiPolygon",coordinates:[[exterior,hole],[exterior]]};
const input = {type:"FeatureCollection",features:[{type:"Feature",properties:{W09_001:"湖の試験"},geometry}]};
assert.deepEqual(normalizeLakeCollection(input).features[0].geometry, geometry, "Keep every polygon and hole exactly");
assert.deepEqual(normalizeLakeCollection(input).features[0].properties, {code:"lake-1",name:"湖の試験"});
assert.throws(()=>normalizeLakeCollection({type:"FeatureCollection",features:[]}), /Empty/);
assert.throws(()=>normalizeLakeCollection({...input,features:[{...input.features[0],geometry:{type:"Polygon",coordinates:[[[35,135],[36,135],[36,136],[35,135]]]}}]}), /coordinates/);
// Git may check text files out with CRLF on Windows. Metadata hashes the
// generator's canonical LF output, matching the base-map version calculation.
const text = (await readFile(new URL("../public/data/japan-lakes.geojson",import.meta.url),"utf8")).replaceAll("\r\n","\n");
const lakes = JSON.parse(text);
const metadata = JSON.parse(await readFile(new URL("../public/data/japan-lakes.metadata.json",import.meta.url),"utf8"));
assert.equal(lakes.features.length,556);
assert.equal(metadata.featureCount,lakes.features.length);
assert.equal(metadata.sha256,createHash("sha256").update(text).digest("hex"));
assert.equal(new Set(lakes.features.map(f=>f.properties.code)).size,556);
for(const name of ["琵琶湖","洞爺湖","霞ヶ浦","宍道湖"]) {
  const lake=lakes.features.find(f=>f.properties.name===name);
  assert(lake,`${name} is present`);
  assert(lake.geometry.coordinates.length>1,`${name} retains its islands`);
}
// Execute the production style factory in both supported geometry modes.
const mapSource=await readFile(new URL("../src/map/weatherMap.js",import.meta.url),"utf8");
const ids=Object.fromEntries([...mapSource.matchAll(/const ([A-Z_]+_ID) = "([^"]+)";/g)].map(m=>[m[1],m[2]]));
const factory=mapSource.slice(mapSource.indexOf('function createBaseStyle('),mapSource.indexOf('function buildGsjActiveFaultPopup('));
for(const vector of [true,false]) {
 const context=vm.createContext({...ids,createWorldSource,VECTOR_BASE_MAP_ENABLED:vector,APP_BASE_URL:"/MeteoScope/",MAP_THEME_COLORS:{dark:{background:"dark-water"},light:{background:"light-water"}},JMA_ENDPOINTS:{},EMPTY_GEOJSON:{type:"FeatureCollection",features:[]},WARNING_GEOMETRY_FIX_CODES:[],WARNING_FEATURE_STATE_KEYS:{status:"status",early:"early"},INITIAL_GEOMETRY_LAYER_IDS:[],WARNING_CLICK_LAYER_IDS:[],createMunicipalitySource:()=>({type:vector?"vector":"geojson"}),baseMapSourceLayer:name=>vector?{"source-layer":name}:{},getWarningOverlayColorExpression:()=>"red",getWarningOverlayOpacityExpression:()=>1});
 vm.runInContext(factory,context);
 for(const theme of ["dark","light"]) {
  const style=context.createBaseStyle(theme),lake=style.layers.find(l=>l.id==="japan-lake-fill");
  const order=id=>style.layers.findIndex(l=>l.id===id);
  assert(order("jma-municipality-fill")<order(lake.id));
  assert(order(lake.id)<order("jma-warning-overlay"),"Warnings must cover lake areas");
  assert.equal(lake.paint["fill-color"],`${theme}-water`);
  assert.equal(lake["source-layer"],vector?"lakes":undefined);
  if(vector) assert.equal(style.sources["japan-lakes"],undefined,"No additional source or request in vector mode");
  else assert.equal(style.sources["japan-lakes"].data,"/MeteoScope/data/japan-lakes.geojson");
 }
}
console.log("Lake source geometry, islands and metadata: OK");
