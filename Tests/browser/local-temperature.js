import {updateLocalTemperatureView} from "../../src/ui/localTemperatureView.js";
import {setupLocale} from "../../src/ui/locale.js";
const base={kind:"estimated",method:"fixed-idw",value:12.6,confidence:"low",flags:["distant-stations"],observationTime:"2026-11-26T06:00:00.000Z",
  location:{coordinates:[135,35],accuracy:1500,positionTimestamp:1795672800000},nearest:{name:"Reference",value:13,elevation:100,distanceKm:1},
  nearestUsed:{name:"Used",distanceKm:32},targetElevation:100,stationCount:8,diagnostics:{maximumContribution:.4,effectiveStationCount:3.5},
  stations:Array.from({length:8},(_,i)=>({name:`Station ${i}`,value:12+i/10,distanceKm:30+i,elevation:100}))};
const weather={...base,weatherAdjusted:true,diagnostics:{...base.diagnostics,
  weather:{previousTime:Date.parse("2026-11-26T05:30:00.000Z"),meanWindSpeed:3.2,windAdjusted:true}}};
const button=()=>document.querySelector("[data-local-temperature-details]"),popup=()=>document.querySelector(".local-temperature-popover");
const assert=(value,message)=>{if(!value)throw new Error(message);};
updateLocalTemperatureView(base);
document.querySelector("#theme").onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==="light"?"dark":"light";};
document.querySelector("#language").onclick=()=>{setupLocale().setPreference("en");updateLocalTemperatureView(base);};
document.querySelector("#japanese").onclick=()=>{setupLocale().setPreference("ja");updateLocalTemperatureView(base);};
document.querySelector("#weather").onclick=event=>{event.stopPropagation();updateLocalTemperatureView(weather);button().click();};
document.querySelector("#run").onclick=()=>{
  let checks=0;
  const check=(value,message)=>{assert(value,message);checks++;};
  try {
    updateLocalTemperatureView(base);button().click();const panel=popup();
    const details=panel.querySelector('[data-local-temperature-section="stations"]');details.open=true;
    details.querySelector("summary").focus();panel.scrollTop=100;const scroll=panel.scrollTop;
    updateLocalTemperatureView({...base,value:13.1,loading:true});
    check(popup()===panel,"same location update must retain dialog");
    check(panel.querySelector('[data-local-temperature-section="stations"]').open,"expanded stations lost");
    check(Math.abs(panel.scrollTop-scroll)<1,"scroll position lost");
    check(document.activeElement.matches("summary"),"keyboard focus lost");
    updateLocalTemperatureView(weather);
    check(panel.textContent.includes("3.2 m/s"),"wind diagnostics missing");
    check(popup()===panel&&document.activeElement.matches("summary"),"wind update lost dialog or focus");
    check(panel.scrollWidth<=panel.clientWidth+1,"wind details overflow horizontally");
    check(button().querySelector("span").textContent==="12.6℃","summary must contain only temperature");
    const valueStyle=getComputedStyle(button().querySelector("span")),referenceStyle=getComputedStyle(document.querySelector("#font-reference"));
    check(["fontFamily","fontSize","fontWeight","fontVariantNumeric"].every(key=>valueStyle[key]===referenceStyle[key]),"summary typography differs from AMeDAS observations");
    panel.querySelector("[data-local-temperature-terms]").focus();
    updateLocalTemperatureView({...base,stations:[],diagnostics:null});
    check(document.activeElement.hasAttribute("data-local-temperature-terms"),"conditional content moved focus to a different control");
    updateLocalTemperatureView(base);
    const replacement=button().cloneNode(true);button().replaceWith(replacement);
    updateLocalTemperatureView({...base,value:13.1});
    check(replacement.getAttribute("aria-expanded")==="true","new anchor not synchronized");
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
    check(!popup()&&document.activeElement===replacement,"Escape must close and restore current anchor");
    button().click();updateLocalTemperatureView({...base,location:{...base.location,coordinates:[135.02,35]}});
    check(!popup(),"changed location retained old dialog");
    button().click();updateLocalTemperatureView(null);
    check(!popup()&&document.querySelector("#local-temperature-summary").hidden,"disabled/tab removal retained dialog");
    document.querySelector("#checks").textContent=`PASS ${checks} browser regression checks`;
  } catch(error) {document.querySelector("#checks").textContent=`FAIL: ${error.message}`;throw error;}
  finally {updateLocalTemperatureView(base);}
};
