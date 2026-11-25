import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AMEDAS_VALUE_ZOOM, AMEDAS_VALUE_MORPH_MS, AMEDAS_DOT_LAYER_ID, AMEDAS_MORPH_LAYER_ID,
  createAmedasValueMarkerImage, getAmedasValueMarkerGeometry, getAmedasValueMarkerId,
  setupAmedasValueMarkerImages, syncAmedasValueMarkerVisibility, isAmedasMarkerLayerActive
} from "../src/map/amedasValueMarker.js";

let zoom = 5.8, clock = 0, reads = 0, repaints = 0, nextFrame = 0;
const images = new Map(), idle = [], draws = [], frames = new Map(), handlers = new Map(), paints = new Map(), visibility = new Map();
const map = {
  getZoom: () => zoom, hasImage: id => images.has(id), getLayer: () => true,
  setLayoutProperty(id, property, value) { visibility.set(id,value); },
  setPaintProperty(id, property, value) { paints.set(id,value); },
  triggerRepaint() { repaints++; },
  addImage(id,image,options) { images.set(id,{image,options}); },
  removeImage(id) { images.delete(id); },
  once(event,callback) { assert.equal(event,"idle"); idle.push(callback); },
  on(event,callback) { handlers.set(event,callback); }
};
const context = {
  canvas: {width:256,height:64}, measureText: label => ({width:label.length*7}),
  setTransform() {}, clearRect() { draws.push("clear"); }, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, closePath() {},
  fill() { draws.push(["background",this.globalAlpha]); },
  stroke() { draws.push(["outline",this.lineWidth,this.strokeStyle]); },
  fillText(label) { draws.push(["text",label]); },
  getImageData(x,y,width,height) { reads++; return {data:new Uint8Array(width*height*4)}; }
};
const originals = {document:globalThis.document,performance:globalThis.performance,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
globalThis.document = {createElement:()=>({getContext:()=>context})};
globalThis.performance = {now:()=>clock};
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame,callback); return nextFrame; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const tick = time => { clock=time; const pending=[...frames]; frames.clear(); for(const [,fn] of pending)fn(time); };
const changeZoom = value => { zoom=value; handlers.get("zoom")?.(); };
const feature = label => ({properties:{markerType:"amedas",amedasValueLabel:label,color:"#48c46b",amedasTextColor:"#071426",amedasMarkerImage:getAmedasValueMarkerId(label,"#48c46b","#071426")}});
try {
  const one = getAmedasValueMarkerGeometry(9,7);
  assert.ok(one.halfLine>0&&one.halfLine<getAmedasValueMarkerGeometry(9,21).halfLine,"single digit stretches slightly");
  let previous = getAmedasValueMarkerGeometry(6.6,35,0);
  for(let step=1;step<=20;step++) {
    const current=getAmedasValueMarkerGeometry(6.6,35,step/20);
    assert.ok(current.halfLine>=previous.halfLine&&current.halfLine-previous.halfLine<1.2);
    assert.equal(current.textOpacity,step===20?1:0,"values only appear after the morph completes");
    previous=current;
  }
  const marker=createAmedasValueMarkerImage(map,"-12.4","#48c46b","#071426",context);
  assert.equal(marker.render,undefined,"completed numeric markers are static; zoom cannot rerasterize them");
  assert.deepEqual(draws.slice(-4),["clear",["background",1],["outline",0.75,"#41464d"],["text","-12.4"]],"number, outline and opaque background share one image");
  const temperature=Array.from({length:40},(_,i)=>feature((i/10).toFixed(1)));
  temperature.push(feature("1.0"));
  setupAmedasValueMarkerImages(map,temperature);
  const valueImages=[...images.values()].filter(({options})=>!options.sdf);
  const morphImages=[...images.values()].filter(({options})=>options.sdf);
  assert.equal(valueImages.length,40,"equal values share a sprite");
  assert.ok(morphImages.length<valueImages.length/4,"background morph sprites are shared by width, not by value/station");
  assert.ok(valueImages.every(({image})=>!image.render));
  const initialReads=reads;
  syncAmedasValueMarkerVisibility(map,true);
  assert.equal(paints.get(AMEDAS_DOT_LAYER_ID),1);
  for(const value of [5.4,5.8,6.1,6.4]) changeZoom(value);
  assert.equal(frames.size,0,"ordinary zoom below the threshold needs no animation loop");
  assert.equal(reads,initialReads,"ordinary zoom does not read canvas pixels");
  changeZoom(AMEDAS_VALUE_ZOOM+.01);
  assert.equal(frames.size,1,"one animation loop is shared by all stations");
  tick(AMEDAS_VALUE_MORPH_MS/2);
  assert.equal(paints.get(AMEDAS_MORPH_LAYER_ID),1);
  assert.equal(paints.get("sample-amedas-value"),0);
  assert.equal(isAmedasMarkerLayerActive(map,AMEDAS_DOT_LAYER_ID),false,"invisible markers cannot select duplicate stations");
  assert.equal(isAmedasMarkerLayerActive(map,AMEDAS_MORPH_LAYER_ID),true);
  for(const {image} of morphImages)assert.equal(image.render(),true);
  assert.equal(reads,initialReads,"morphing updates only small SDF backgrounds, not RGBA text canvases");
  tick(AMEDAS_VALUE_MORPH_MS);
  assert.equal(paints.get("sample-amedas-value"),1,"stopping zoom still finishes the capsule");
  assert.equal(paints.get(AMEDAS_MORPH_LAYER_ID),0);
  assert.equal(frames.size,0,"animation stops after completion");
  const steadyRepaints=repaints;
  for(const value of [7,8,9])changeZoom(value);
  assert.equal(repaints,steadyRepaints);
  assert.equal(reads,initialReads);
  changeZoom(AMEDAS_VALUE_ZOOM-.01);
  tick(AMEDAS_VALUE_MORPH_MS*1.5);
  assert.equal(paints.get(AMEDAS_MORPH_LAYER_ID),1,"reverse morph uses the shared background");
  syncAmedasValueMarkerVisibility(map,false);
  assert.equal(frames.size,0,"switching tabs cancels the animation");
  assert.ok([...visibility.values()].every(value=>value==="none"));
  changeZoom(9);
  syncAmedasValueMarkerVisibility(map,true);
  assert.equal(paints.get("sample-amedas-value"),1,"returning at high zoom shows the value immediately");
  setupAmedasValueMarkerImages(map,[feature("1014.4")]);
  idle.splice(0).forEach(fn=>fn());
  assert.equal(images.size,2,"retire old metric sprites after old source tiles leave, preserving the active value and its shared background");
  setupAmedasValueMarkerImages(map,[{properties:{markerType:"wind"}}]);
  idle.splice(0).forEach(fn=>fn());
  assert.equal(images.size,0,"wind retains no capsule sprites");
  assert.equal(isAmedasMarkerLayerActive(map,"sample-wind-arrow"),true);
  syncAmedasValueMarkerVisibility(map,true);
  changeZoom(5.8);
  assert.equal(frames.size,0,"wind has no capsule animation work");
  handlers.get("remove")();
  assert.equal(frames.size,0);
} finally {for(const [key,value] of Object.entries(originals))globalThis[key]=value;}
const source=readFileSync(new URL("../src/map/weatherMap.js",import.meta.url),"utf8");
const layer=source.slice(source.indexOf('id: "sample-amedas-value"'),source.indexOf('id: "hypocenter-distribution-count"'));
assert.doesNotMatch(layer,/"text-field"/,"no independently overlapping numeric glyph layer");
assert.match(layer,/"icon-allow-overlap": true/);
assert.match(layer,/"icon-ignore-placement": true/);
assert.match(layer,/"icon-opacity-transition": \{ duration: 0 \}/);
assert.match(source,/const valueLabel = formatAmedasValue\(value\);/);
console.log("AMeDAS markers: static numeric sprites, shared morph backgrounds, zero zoom canvas reads, finite reversible animation, click filtering and cleanup passed");
