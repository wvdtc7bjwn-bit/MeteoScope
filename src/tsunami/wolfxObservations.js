import { isWolfxTsunamiPayload } from "./sourceStore.js";

export const WOLFX_TSUNAMI_URL="https://api.wolfx.jp/jma_tsunami.json";
// Observation-only HTTP client: no extra Wolfx WebSocket or server/D1 traffic.
export function createWolfxTsunamiObservationClient({onUpdate=()=>{},onStatus=()=>{},fetchImpl=globalThis.fetch?.bind(globalThis),setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now()}={}) {
  let running=false,active=false,generation=0,timer=null,request=null,controller=null,freshnessTimer=null,freshnessVersion=0;
  const schedule=()=>{clearTimer(timer);timer=null;if(running)timer=setTimer(()=>{timer=null;void refresh();},active?30000:300000);};
  function trackFreshness(payload,token){
    // A malformed response must not discard the prior response's expiry check.
    if(!isWolfxTsunamiPayload(payload))return;
    const version=++freshnessVersion;
    clearTimer(freshnessTimer);freshnessTimer=null;
    const deadline=Date.parse(payload?.validUntil);
    if(payload?.trusted!==true||!Number.isFinite(deadline)||deadline<=now())return;
    freshnessTimer=setTimer(()=>{
      if(!running||generation!==token||freshnessVersion!==version)return;
      freshnessTimer=null;
      if(deadline>now()){trackFreshness(payload,token);return;}
      // Re-evaluate the stored response at its own deadline, even when the next
      // poll is pending or failing. This does not invent a new official report.
      onUpdate(payload);onStatus("expired");
    },Math.min(2147483647,Math.max(1,deadline-now()+1)));
  }
  async function refresh(){
    if(!running||!fetchImpl)return;
    if(request)return request;
    const token=generation,abort=new AbortController();controller=abort;
    const timeout=setTimer(()=>abort.abort(),15000);
    request=(async()=>{
      try {
        const response=await fetchImpl(WOLFX_TSUNAMI_URL,{signal:abort.signal,cache:"no-store"});
        if(!response.ok)throw new Error(`Wolfx tsunami HTTP ${response.status}`);
        const payload=await response.json();
        if(!running||generation!==token||abort.signal.aborted)return;
        onUpdate(payload);onStatus("connected");
        if(running&&generation===token)trackFreshness(payload,token);
      } catch(error){if(running&&generation===token)onStatus("error");}
      finally {clearTimer(timeout);if(generation===token){request=null;controller=null;schedule();}}
    })();
    return request;
  }
  return {
    start(){if(running)return;running=true;generation++;void refresh();},
    stop(){running=false;generation++;freshnessVersion++;clearTimer(timer);clearTimer(freshnessTimer);timer=null;freshnessTimer=null;controller?.abort();controller=null;request=null;},
    refresh,
    setActive(value){if(active===Boolean(value))return;active=Boolean(value);if(running){schedule();if(active)void refresh();}}
  };
}
