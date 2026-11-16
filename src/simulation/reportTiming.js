// Educational observation stream: first nearby P/S detections and the earliest
// received P signal from each configured source. No waveform/noise inversion.
export const SIMULATION_OBSERVATION_LIMIT = 32;
export const SIMULATION_ANALYSIS_MIN_INTERVAL_SEC = .6;
const roundTime = time => Number(time.toFixed(2));

export function createSimulationObservationStream(detectors, sources = [], processingDelaySec = .6) {
  const unique = new Map();
  for(const station of detectors) if(Number.isFinite(station.pArrivalSec) && station.pArrivalSec >= 0) {
    const key=station.id ?? station.code ?? station;
    if(!unique.has(key) || station.pArrivalSec < unique.get(key).pArrivalSec)unique.set(key,station);
  }
  const usable = [...unique.values()];
  const nearby = usable.toSorted((a,b) => a.pArrivalSec-b.pArrivalSec).slice(0,SIMULATION_OBSERVATION_LIMIT);
  const sourceCount = Math.max(1,sources.length);
  const sourceTimes = Array.from({length:sourceCount},(_,index) => {
    let arrival = Infinity;
    for(const station of usable) {
      const time = station.sourcePArrivalSecs?.[index] ?? (sourceCount === 1 ? station.pArrivalSec : Infinity);
      if(Number.isFinite(time) && time >= 0) arrival = Math.min(arrival,time);
    }
    return Number.isFinite(arrival) ? roundTime(arrival+processingDelaySec) : Infinity;
  });
  const events = nearby.flatMap(station => [
    {time:roundTime(station.pArrivalSec+processingDelaySec),kind:'p'},
    ...(Number.isFinite(station.sArrivalSec) && station.sArrivalSec >= station.pArrivalSec ? [{time:roundTime(station.sArrivalSec+processingDelaySec),kind:'s'}] : []),
  ]).concat(sourceTimes.filter(Number.isFinite).map(time=>({time,kind:'source'}))).sort((a,b)=>a.time-b.time);
  let cursor=0,pCount=0,sCount=0,sourceSeen=0;
  return {
    sourceCount,sourceTimes,
    advance(elapsed) {
      while(cursor<events.length && events[cursor].time<=elapsed) {
        const {kind}=events[cursor++];
        if(kind==='p')pCount++;else if(kind==='s')sCount++;else sourceSeen++;
      }
      return {pCount,sCount,sourceSeen};
    },
    nextTime:()=>events[cursor]?.time ?? Infinity,
  };
}
