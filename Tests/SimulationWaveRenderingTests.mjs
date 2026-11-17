import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {createSimulationWaveCanvas, drawSimulationWaves, SIMULATION_WAVE_CANVAS_LAYER} from "../src/map/simulationWaveCanvas.js";

const draws=[];let path=[];
const context={setTransform(){},clearRect(){draws.length=0;},beginPath(){path=[];},
  moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},
  fill(){draws.push({kind:"fill",path:[...path],color:this.fillStyle,alpha:this.globalAlpha});},
  stroke(){draws.push({kind:"line",path:[...path],color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});}};
const canvas={width:0,height:0,getContext:()=>context};
const parameters=new Map(),counts={uploads:0,draws:0,deletes:0};
const gl=Object.fromEntries(["VERTEX_SHADER","FRAGMENT_SHADER","COMPILE_STATUS","LINK_STATUS","VERTEX_ARRAY_BINDING","ARRAY_BUFFER_BINDING",
  "ARRAY_BUFFER","STATIC_DRAW","FLOAT","ACTIVE_TEXTURE","TEXTURE0","TEXTURE_BINDING_2D","TEXTURE_2D","UNPACK_PREMULTIPLY_ALPHA_WEBGL",
  "UNPACK_FLIP_Y_WEBGL","RGBA","UNSIGNED_BYTE","TEXTURE_MIN_FILTER","TEXTURE_MAG_FILTER","LINEAR","TEXTURE_WRAP_S","TEXTURE_WRAP_T",
  "CLAMP_TO_EDGE","CURRENT_PROGRAM","TRIANGLE_STRIP"].map(name=>[name,name]));
for(const method of ["createShader","createProgram","createBuffer","createTexture","createVertexArray"])gl[method]=()=>({});
for(const method of ["shaderSource","compileShader","attachShader","linkProgram","deleteShader","bufferData","enableVertexAttribArray","vertexAttribPointer","texParameteri","uniform1i"])gl[method]=()=>{};
for(const method of ["deleteProgram","deleteBuffer","deleteTexture","deleteVertexArray"])gl[method]=()=>counts.deletes++;
gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=()=>({});
gl.getParameter=name=>parameters.get(name)??null;
gl.bindVertexArray=value=>parameters.set(gl.VERTEX_ARRAY_BINDING,value);
gl.bindBuffer=(_,value)=>parameters.set(gl.ARRAY_BUFFER_BINDING,value);
gl.bindTexture=(_,value)=>parameters.set(gl.TEXTURE_BINDING_2D,value);
gl.activeTexture=value=>parameters.set(gl.ACTIVE_TEXTURE,value);
gl.useProgram=value=>parameters.set(gl.CURRENT_PROGRAM,value);
gl.pixelStorei=(key,value)=>parameters.set(key,value);
gl.texImage2D=()=>counts.uploads++;gl.drawArrays=()=>counts.draws++;
const listeners=new Map(),layers=new Map();let pitch=0,terrain=null,center={lng:140,lat:35},zoom=5,repaints=0,capabilityChanges=0;
const map={getPitch:()=>pitch,getTerrain:()=>terrain,getProjection:()=>({type:"mercator"}),getCenter:()=>center,getZoom:()=>zoom,getBearing:()=>0,
  getCanvas:()=>({width:800,height:600,clientWidth:400,clientHeight:300}),getRenderWorldCopies:()=>true,
  project:([lon,lat])=>({x:200+(lon-center.lng)*10,y:150-(lat-center.lat)*10}),
  getLayer:id=>layers.get(id),addLayer(layer,before){assert.equal(before,"eew-hypocenter-cross");layers.set(layer.id,layer);layer.onAdd(map,gl);},
  on(event,fn){listeners.set(event,fn);},off(event,fn){assert.equal(listeners.get(event),fn);listeners.delete(event);},triggerRepaint(){repaints++;}};
const polygon=(type="wave-fill")=>({type:"Feature",properties:{featureType:type,waveType:"P"},geometry:{type:"Polygon",coordinates:[[[139,34],[141,34],[141,36],[139,36],[139,34]]]}});
const front={type:"Feature",properties:{featureType:"wave-front",waveType:"S"},geometry:{type:"MultiLineString",coordinates:[[[139,35],[140,36],[141,35]]]}};
const data={type:"FeatureCollection",features:[polygon(),polygon(),front]};
const unchanged=JSON.stringify(data);
drawSimulationWaves(context,map,data,400,300);
assert.equal(draws.length,3,"retain both overlapping fills, not a changed-opacity union");
assert.deepEqual(draws.map(d=>[d.kind,d.color,d.alpha,d.width]),[["fill","#1769c2",.008,undefined],["fill","#1769c2",.008,undefined],["line","#ff6a3d",.96,2.8]]);
assert.deepEqual(draws[2].path,[[190,150],[200,140],[210,150]],"every original vertex is projected unchanged");
drawSimulationWaves(context,map,{...data,features:[polygon("wave")]},400,300);
assert.deepEqual(draws.map(d=>[d.kind,d.alpha,d.width]),[["fill",.055,undefined],["line",.96,2.6]],"point-source style matches the existing map layers");
drawSimulationWaves(context,map,{...data,features:[polygon("wave"),front,polygon()]},400,300);
assert.deepEqual(draws.map(d=>d.kind),["fill","fill","line","line"],"all fills stay below both P/S wavefronts");
const renderer=createSimulationWaveCanvas(()=>map,{createCanvas:()=>canvas,onCapabilityChange:()=>capabilityChanges++});
assert.equal(layers.size,0,"no startup GL or canvas work");
assert.equal(renderer.setData(data),true);
const layer=layers.get(SIMULATION_WAVE_CANVAS_LAYER);
layer.render(gl);assert.equal(counts.uploads,1);assert.equal(canvas.width,800,"use the actual backing resolution, not a blurred DPR cap");
layer.render(gl);assert.equal(counts.uploads,1,"an unchanged paused frame needs no canvas redraw/texture upload");
renderer.setData(data);layer.render(gl);assert.equal(counts.uploads,1);
zoom=6;listeners.get("move")();layer.render(gl);assert.equal(counts.uploads,2,"camera changes reproject a paused wave");
renderer.setVisible(false);let drawsBefore=counts.draws;layer.render(gl);assert.equal(counts.draws,drawsBefore);
renderer.setVisible(true);layer.render(gl);assert.equal(counts.draws,drawsBefore+1,"tab visibility can return without losing paused geometry");
pitch=20;listeners.get("move")();assert.equal(renderer.setData(data),false,"tilt uses the original GeoJSON renderer");
pitch=0;listeners.get("move")();assert.equal(renderer.setData(data),true);
terrain={source:"dem"};listeners.get("terrain")();assert.equal(renderer.setData(data),false);
terrain=null;listeners.get("terrain")();assert.equal(renderer.setData(data),true);
listeners.get("webglcontextlost")();assert.equal(renderer.setData(data),false);
listeners.get("webglcontextrestored")();assert.equal(renderer.setData(data),true,"context restoration recreates bounded GL resources");
const upload=gl.texImage2D,warn=console.warn;
const beforeFailure=new Map(parameters),changesBeforeFailure=capabilityChanges;
renderer.setData({...data});gl.texImage2D=()=>{throw new Error("texture upload unavailable");};
try{console.warn=()=>{};layer.render(gl);}finally{console.warn=warn;gl.texImage2D=upload;}
for(const key of [gl.ACTIVE_TEXTURE,gl.TEXTURE_BINDING_2D,gl.CURRENT_PROGRAM,gl.VERTEX_ARRAY_BINDING,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_FLIP_Y_WEBGL])assert.equal(parameters.get(key),beforeFailure.get(key),"restore GL state even after an upload failure");
assert.equal(capabilityChanges,changesBeforeFailure+1);assert.equal(renderer.setData(data),false,"render failure returns to GeoJSON instead of silently losing waves");
listeners.get("webglcontextrestored")();assert.equal(renderer.setData(data),true);
renderer.clear();drawsBefore=counts.draws;layer.render(gl);assert.equal(counts.draws,drawsBefore);
layer.onRemove(map,gl);assert.equal(listeners.size,0);assert.ok(counts.deletes>=8);assert.ok(capabilityChanges>=4);
assert.equal(JSON.stringify(data),unchanged);
center={lng:-179,lat:35};
drawSimulationWaves(context,map,{type:"FeatureCollection",features:[{...front,geometry:{type:"MultiLineString",coordinates:[[[179,35],[181,35]]]}}]},400,300);
assert.deepEqual(draws[0].path,[[180,150],[200,150]],"date-line paths are continuous in the visible world copy");

// Exercise the actual update function: waves no longer enter the GeoJSON
// worker, but marker corrections, fallback, live events and clear still do.
const source=readFileSync(new URL("../src/map/weatherMap.js",import.meta.url),"utf8");
const update=source.slice(source.indexOf("  function setEmergencyEarthquakeWarnings("),source.indexOf("  function syncEewForecastAreas("));
let direct=true,writes=[],previous=null,visibilityCalls=0;
const geoSource={setData(collection){writes.push(structuredClone(collection));}};
const c=vm.createContext({EEW_SOURCE_ID:"eew",activeEews:[],activeMode:"earthquake",eewMarkerKey:"",eewMarkerCollection:{type:"FeatureCollection",features:[]},eewVisibilityKey:"",eewVisibilitySource:null,
  map:{getSource:()=>geoSource},simulationWaves:{setData:()=>direct,clear(){}},
  createEewFeatureCollection:events=>({type:"FeatureCollection",features:events.flatMap(e=>[
    {type:"Feature",geometry:{type:"Point",coordinates:e.coordinates},properties:{featureType:"hypocenter",uncertain:e.uncertain}},polygon(),front])}),
  setGeoJsonSourceData(source,data){if(data!==previous){previous=data;source.setData(data);}},syncEewForecastAreas(){},syncEewVisibility(){visibilityCalls++;}});
vm.runInContext(update,c);
for(let i=0;i<60;i++)c.setEmergencyEarthquakeWarnings([{isSimulation:true,coordinates:[140,35],uncertain:false}]);
assert.equal(writes.length,1,"60 wave frames send one unchanged marker update, not 60 polygon datasets");
assert.equal(writes[0].features.length,1);assert.equal(visibilityCalls,1);
c.setEmergencyEarthquakeWarnings([{isSimulation:true,coordinates:[140,35],uncertain:true}]);assert.equal(writes.length,2,"changed hypocenter state is retained");
direct=false;c.setEmergencyEarthquakeWarnings([{isSimulation:true,coordinates:[140,35]}]);assert.equal(writes.at(-1).features.length,3);
direct=true;c.setEmergencyEarthquakeWarnings([{isSimulation:false,coordinates:[140,35]}]);assert.equal(writes.at(-1).features.length,3,"real EEW never takes the simulation-only shortcut");
c.setEmergencyEarthquakeWarnings([]);assert.equal(writes.at(-1).features.length,0);
console.log("Direct wave rendering: unchanged vertices/styles, layer order, DPR, paused camera updates, dateline, fallback/context restore, live EEW and GeoJSON-write suppression passed");
