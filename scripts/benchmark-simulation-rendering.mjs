import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {prepareEarthquakeSimulation,getSimulationPresetOptions} from '../src/simulation/earthquakeSimulation.js';
import {createSimulationMapOverlay} from '../src/map/simulationOverlay.js';
import {getWaveDistancesByJma2001} from '../src/eew/jma2001TravelTime.js';
import {exposedWavefrontArcs} from '../src/simulation/wavefrontGeometry.js';
import {destinationPoint} from '../src/typhoonGeometry.js';
import {unwrapLineAtAntimeridian} from '../src/map/geoLine.js';

const root=new URL('../',import.meta.url);
const catalogue=JSON.parse(await readFile(new URL('public/data/jma-intensity-stations.json',root),'utf8'));
const plateBoundaries=JSON.parse(await readFile(new URL('public/data/usgs-plate-boundaries-japan.geojson',root),'utf8'));
const mapText=await readFile(new URL('src/map/weatherMap.js',root),'utf8');
const context=vm.createContext({getJma2001WaveDistances:getWaveDistancesByJma2001,exposedWavefrontArcs,unwrapLineAtAntimeridian,
 createGeodesicCircle:(center,radius)=>{const ring=Array.from({length:96},(_,i)=>destinationPoint(center,radius,i*360/96));return [...ring,ring[0]];}});
vm.runInContext(mapText.slice(mapText.indexOf('function createEewFeatureCollection('),mapText.indexOf('function getJma2001WaveDistances(')),context);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stats=values=>{const sorted=values.toSorted((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]};};
const cases=[
 ['point',{magnitude:6.5}],
 ['nankai',getSimulationPresetOptions('nankai-trough')],
 ['deep',{magnitude:8.1,depthKm:590,longitude:139,latitude:28}],
 ['active-fault',{model:'active-fault',magnitude:7,depthKm:10,activeFault:{FLT_ID:'F000001_00001',LTENAME:'Synthetic',LON:135.5,LAT:34.5,DEP:2,LEN:40,WID:16,STR:10,DIP:70,MAG:-7}}],
];
const result={environment:{node:process.version,stations:Object.keys(catalogue).length,frames:150,repeats:3},cases:[]};
for(const [name,input] of cases){
 const simulation=await prepareEarthquakeSimulation(input,catalogue,{plateBoundaries,yieldTask:async()=>{}});
 const sources=new Map(),layers=new Map([['eew-wave-fill',{}]]);
 const map={getLayer:id=>layers.get(id),getSource:id=>sources.get(id),getCanvas:()=>({style:{}}),on(){},off(){},setPaintProperty(){},setLayoutProperty(){},
 addLayer:layer=>layers.set(layer.id,layer),addSource(id){sources.set(id,{setData(){},updateData(){}});}};
 const overlay=createSimulationMapOverlay(()=>map,()=>{},()=>{});
 const durations={frame:[],overlay:[],waves:[],total:[]};
 for(let pass=-1;pass<3;pass++)for(let i=0;i<(pass<0?12:150);i++){
  const time=simulation.duration*i/149;
  const t0=performance.now();const frame=simulation.frame(time,{renderOnly:true});const t1=performance.now();
  overlay.render(frame);const t2=performance.now();context.createEewFeatureCollection([frame.event]);const t3=performance.now();
  if(pass>=0){durations.frame.push(t1-t0);durations.overlay.push(t2-t1);durations.waves.push(t3-t2);durations.total.push(t3-t0);}
 }
 const fingerprints=[];
 for(const mode of ['current','maximum'])for(const renderOnly of [false,true])for(const time of [0,.1,2,12,40,100,218,413,simulation.duration,0]){
  const frame=simulation.frame(time,{intensityDisplay:mode,renderOnly});
  fingerprints.push({mode,renderOnly,time,frame:hash(frame),waves:hash(context.createEewFeatureCollection([frame.event]))});
 }
 const entry={name,duration:simulation.duration,stations:simulation.stations.length,ms:Object.fromEntries(Object.entries(durations).map(([key,times])=>[key,stats(times)])),fingerprints};
 result.cases.push(entry);console.log(JSON.stringify({name,ms:entry.ms}));
}
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});
await writeFile(process.argv[2]??new URL('../.cache/simulation-render-benchmark.json',import.meta.url),JSON.stringify(result,null,2));
const compareIndex=process.argv.indexOf('--compare');
if(compareIndex>=0){
 const reference=JSON.parse(await readFile(process.argv[compareIndex+1],'utf8'));
 let mismatches=0,comparisons=0;
 for(const entry of result.cases){
  const previous=reference.cases.find(item=>item.name===entry.name);
  if(!previous){mismatches++;continue;}
  entry.fingerprints.forEach((fingerprint,index)=>{comparisons++;if(JSON.stringify(fingerprint)!==JSON.stringify(previous.fingerprints[index]))mismatches++;});
 }
 console.log(JSON.stringify({comparisons,mismatches}));
 if(mismatches)throw new Error('Simulation display data changed relative to the reference');
}
// These are Node data-generation measurements with a mock map sink, not GPU
// timings or browser FPS. Fingerprints cover the actual station/fault/P/S data.
