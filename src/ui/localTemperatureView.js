import { escapeHtmlString as escapeHtml } from "../utils/html.js";
import { getCurrentLanguage } from "./locale.js";
import { getDistanceKm } from "../location/distance.js";
import { TEMPERATURE_ESTIMATION } from "../location/temperatureEstimationPolicy.js";
import { openLocalTemperatureTerms } from "./localTemperatureTerms.js";

const text = (ja, en) => getCurrentLanguage() === "en" ? en : ja;
const number = (value, digits = 1) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const labels = {
  "too-few-stations": ["利用できる周辺観測点が不足しています。", "Too few nearby stations."],
  "no-valid-observations": ["新しい有効な観測値がありません。", "No fresh valid observations."],
  "height-extrapolation": ["標高差が大きいため推定を控えています。", "Elevation extrapolation is too large."],
  "unsupported-extrapolation": ["観測点が一方向に偏り、推定が困難です。", "Stations lie in one direction; extrapolation is unsafe."],
  "no-height-correction": ["標高補正なしの推定です。", "Estimate without elevation correction."],
  "outside-station-hull": ["観測点が現在地を囲んでいません。", "The location is outside the station hull."],
  "directional-imbalance": ["観測点の方位に偏りがあります。", "Station directions are uneven."],
  "temperature-spread": ["周辺の気温差が大きくなっています。", "Nearby temperatures vary substantially."],
  "excessive-temperature-spread": ["周辺の気温差が大きすぎるため推定を控えています。", "Temperature differences are too large for an estimate."],
  "distant-stations": ["補間に採用した観測点が離れています。", "The stations used for interpolation are distant."],
  "aging-observations": ["観測から15分以上経過しています。", "Observations are over 15 minutes old."],
  "large-height-correction": ["大きな標高補正を含む参考値です。", "The estimate includes a large elevation correction."],
  "coarse-location": ["GPSの水平位置精度が粗い状態です。気温の誤差幅を示すものではありません。", "GPS horizontal accuracy is coarse. This is not a temperature error range."],
  "land-screen-unavailable": ["海を挟む経路を十分に確認できませんでした。", "Water crossings could not be fully checked."]
};

export function buildLocalTemperatureButton(result) {
  const estimated = result.kind === "estimated";
  const label = estimated ? text("推定", "Est.") : result.nearest ? `${result.nearest.name} ${text("実測", "obs.")}` : text("取得不可", "Unavailable");
  const reference=estimated&&result.confidence==="low"?text(" · 参考"," · Reference"):"";
  const status=reference+(result.loading?text(estimated?" · 更新中":" · 推定計算中",estimated?" · Updating":" · Calculating"):"");
  const display=`${label} ${number(result.value)}${result.value==null?"":"℃"}${status}`;
  const value=`${number(result.value)}${result.value==null?"":"℃"}`;
  return `<button type="button" class="local-temperature-button" data-local-temperature-details data-mobile-dock-control aria-haspopup="dialog" aria-expanded="false" aria-label="${escapeHtml(`${text("現在地の気象情報・推定の詳細", "Local weather and estimation details")}：${display}`)}"><span class="amedas-observation-value">${escapeHtml(value)}</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg></button>`;
}

export function buildLocalTemperatureDetails(result) {
  const nearest = result.nearest, estimated = result.kind === "estimated";
  const method = result.kind==="unavailable"?text("気温を取得できません。","Temperature is unavailable."):result.weatherAdjusted ? text("推定値・標高・周辺環境と風を考慮", "Estimate · elevation, environment and wind")
    : result.environmentAdjusted ? text("推定値・標高と周辺環境を考慮", "Estimate · elevation and local environment")
    : result.method === "dynamic-idw" ? text("推定値・動的標高補正", "Estimate · validated local lapse rate")
    : result.method === "fixed-idw" ? text("推定値・標高補正済み", "Estimate · elevation corrected")
    : result.method === "idw" ? text("推定値・標高補正なし", "Estimate · no elevation correction") : text("観測点の実測値", "Station observation");
  const row = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const formatTime=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(getCurrentLanguage()==="en"?"en-GB":"ja-JP",{timeZone:"Asia/Tokyo",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value)):"—";
  const locationTime=result.location?.positionTimestamp?formatTime(new Date(result.location.positionTimestamp).toISOString()):"—";
  const stamp = formatTime(result.observationTime);
  const warnings = (result.flags??[]).filter(flag => labels[flag]).map(flag => `<li>${escapeHtml(text(...labels[flag]))}</li>`).join("");
  return `<header><h2>${text("現在地の気象情報", "Local weather")}</h2><button type="button" data-local-temperature-close aria-label="${text("閉じる", "Close")}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <p class="local-temperature-value">${estimated ? text("推定気温", "Estimated temperature") : result.kind==="unavailable"?text("気温","Temperature"):text("実測気温", "Observed temperature")} <strong>${number(result.value)}${result.value == null ? "" : "℃"}</strong></p>
    <p>${method}${result.loading ? text(estimated?" · 推定を更新中":" · 推定を計算中",estimated?" · Updating estimate":" · Calculating estimate") : ""}</p>
    ${result.kind === "observed" && !result.loading && !result.flags.includes("station-observation") ? `<p class="local-temperature-caution">${text("現在地の推定気温は表示できません。近隣観測点の実測値です。", "A local estimate is unavailable. This is a nearby station observation.")}</p>` : ""}
    ${result.confidence === "low" && estimated ? `<p class="local-temperature-caution">${text("参考値：推定の確かさが低い条件です。", "Reference only: conditions reduce estimate reliability.")}</p>` : ""}
    <dl>${row(text("最寄り観測点", "Nearest station"), nearest?.name ?? "—")}
      ${row(text("観測点の実測気温", "Station temperature"), nearest ? `${number(nearest.value)}℃` : "—")}
      ${row(text("観測点までの距離", "Station distance"), nearest ? `${number(nearest.distanceKm)} km` : "—")}
      ${row(text("観測点の標高", "Station elevation"), nearest?.elevation == null ? "—" : `${number(nearest.elevation,0)} m`)}
      ${row(text("現在地の地表標高", "Ground elevation"), result.targetElevation == null ? text("取得不可", "Unavailable") : `${number(result.targetElevation, 0)} m`)}
      ${row(text("使用観測点数", "Stations used"), String(result.stationCount))}
      ${row(text("観測時刻（日本時間）", "Observation (JST)"), stamp)}
      ${row(text("GPS水平位置精度", "GPS horizontal accuracy"),result.location?.accuracy==null?text("不明","Unknown"):`${number(result.location.accuracy,0)} m`)}
      ${row(text("位置の取得時刻（日本時間）", "Position fix (JST)"),locationTime)}</dl>
    ${estimated && result.heightWeighted ? `<p class="local-temperature-note">${text("距離に加え、標高の近い観測点を重視して計算しています。", "The estimate gives more weight to nearby stations at similar elevations.")}</p>` : ""}
    ${warnings ? `<ul>${warnings}</ul>` : ""}
    ${result.stations?.length ? `<details data-local-temperature-section="stations"><summary>${text("使用した観測点", "Contributing stations")}</summary><ul>${result.stations.map(station => `<li>${escapeHtml(station.name)} · ${number(station.value)}℃ · ${number(station.distanceKm)} km · ${number(station.elevation, 0)} m</li>`).join("")}</ul></details>` : ""}
    ${result.diagnostics?`<details data-local-temperature-section="diagnostics"><summary>${text("推定の診断情報","Estimation diagnostics")}</summary><dl>
      ${row(text("採用した最寄り観測点","Nearest station used"),result.nearestUsed?`${result.nearestUsed.name} · ${number(result.nearestUsed.distanceKm)} km`:"—")}
      ${row(text("最大寄与率","Maximum contribution"),result.diagnostics.maximumContribution==null?"—":`${number(result.diagnostics.maximumContribution*100)}%`)}
      ${row(text("重みから求めた有効観測点数","Effective station count from weights"),number(result.diagnostics.effectiveStationCount))}
      ${result.diagnostics.weather ? row(text("周辺観測点から求めた風速","Wind speed from surrounding stations"),`${number(result.diagnostics.weather.meanWindSpeed)} m/s`)
        +row(text("比較した過去の観測（日本時間）","Earlier observations compared (JST)"),formatTime(new Date(result.diagnostics.weather.previousTime).toISOString())) : ""}</dl>
      ${result.weatherAdjusted ? `<p class="local-temperature-note">${text("周辺の風向の持続と環境の違いに応じ、観測点の寄与率を調整しています。現在地の風を実測したものではありません。","Station contributions account for persistent surrounding winds and environmental differences. Wind is not measured at your location.")}</p>` : ""}
      <p class="local-temperature-note">${text("寄与率と有効観測点数は重みの偏りを示します。観測点の独立性や推定精度を保証する指標ではありません。GPS精度は気温の誤差幅に換算していません。","Contributions and effective count describe weight concentration, not station independence or guaranteed accuracy. GPS accuracy is not converted into a temperature error range.")}</p></details>`:""}
    ${result.environmentAdjusted ? buildEnvironmentDetails(result.environment, row) : ""}
    <button type="button" class="local-temperature-terms-link" data-local-temperature-terms>${text("利用規約・出典", "Terms and sources")}</button>`;
}

function buildEnvironmentDetails(environment, row) {
  const percent = value => typeof value === "number" && Number.isFinite(value) ? `${number(value*100,0)}%` : "—";
  return `<details data-local-temperature-section="environment"><summary>${text("周辺環境とデータの出典", "Environment and sources")}</summary><dl>
    ${row(text("建物・道路・鉄道の面積割合", "Buildings, roads and rail area"),percent(environment.urban))}
    ${row(text("森林の面積割合", "Forest area"),percent(environment.forest))}
    ${row(text("農地の面積割合", "Farmland area"),percent(environment.farm))}
    ${row(text("内水面・海の面積割合", "Inland water / sea area"),`${percent(environment.water)} / ${percent(environment.sea)}`)}
    ${row(text("メッシュ内の標高差", "Mesh elevation range"),`${number(environment.relief,0)} m`)}
    ${row(text("メッシュ内の平均傾斜", "Mesh mean slope"),`${number(environment.slope)}°`)}
    ${row(text("土地利用／地形データの年", "Land use / terrain year"),`${environment.landYear} / ${environment.terrainYear}`)}</dl>
    <p class="local-temperature-note">${text("約1kmメッシュの土地利用・標高差・傾斜などが似た観測点を重視します。建物・道路・鉄道の面積は人工被覆の近似指標であり、舗装率そのものではありません。古いデータを含み、最近の開発や局所的な地形・夜間の冷気滞留は捉えきれません。", "Stations with similar land use, relief and slope in roughly 1 km meshes receive more weight. Built and transport area is a proxy, not measured impervious cover. Older data cannot capture recent development or all local terrain and nighttime cold-air pooling.")}</p>
    <p class="local-temperature-note">${text("国土数値情報（土地利用3次メッシュ・標高・傾斜度3次メッシュ、国土交通省）をMeteoScopeが加工して使用しています。", "MeteoScope processes MLIT National Land Numerical Information land-use and elevation/slope meshes.")} <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-a-v3_1.html" target="_blank" rel="noopener noreferrer">${text("土地利用", "Land use")}</a> · <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-G04-a.html" target="_blank" rel="noopener noreferrer">${text("標高・傾斜度", "Elevation / slope")}</a> · <a href="https://nlftp.mlit.go.jp/ksj/other/agreement.html" target="_blank" rel="noopener noreferrer">${text("利用条件", "Terms")}</a></p></details>`;
}

let current = null, popup, anchor, popupCoordinates, popupMarkup, anchorInMobile=false, initialized = false;
function close({ focus = false } = {}) {
  popup?.remove(); popup = null;
  document.querySelectorAll("[data-local-temperature-details]").forEach(button => button.setAttribute("aria-expanded", "false"));
  if (focus) (anchor?.isConnected ? anchor : document.querySelector("[data-local-temperature-details]"))?.focus({ preventScroll: true });
  anchor = null;
}
function findAnchor() {
  return document.querySelector(`${anchorInMobile?"#mobile-context-dock":"#local-temperature-summary"} [data-local-temperature-details]`)
    ??document.querySelector("[data-local-temperature-details]");
}
function refreshPopup() {
  const markup=buildLocalTemperatureDetails(current);
  if(markup===popupMarkup)return;
  const scroll=popup.scrollTop,active=document.activeElement;
  const controls=[...popup.querySelectorAll("button,summary,a")],focusIndex=controls.indexOf(active);
  const focusSection=active.matches("summary")?active.closest("details")?.dataset.localTemperatureSection:null;
  const focusAttribute=["data-local-temperature-close","data-local-temperature-terms"].find(key=>active.hasAttribute(key));
  const focusHref=active.getAttribute("href");
  const opened=[...popup.querySelectorAll("details[open]")].map(el=>el.dataset.localTemperatureSection);
  popup.innerHTML=markup;popupMarkup=markup;
  for(const detail of popup.querySelectorAll("details"))detail.open=opened.includes(detail.dataset.localTemperatureSection);
  if(focusIndex>=0) {
    const target=focusAttribute?popup.querySelector(`[${focusAttribute}]`)
      :focusSection?[...popup.querySelectorAll("details")].find(el=>el.dataset.localTemperatureSection===focusSection)?.querySelector("summary")
      :focusHref?[...popup.querySelectorAll("a")].find(el=>el.getAttribute("href")===focusHref)
      :popup.querySelectorAll("button,summary,a")[focusIndex];
    (target??popup).focus({preventScroll:true});
  }
  popup.scrollTop=scroll;
}
function open(button) {
  if (!current) return;
  close(); anchor = button;anchorInMobile=Boolean(button.closest("#mobile-context-dock"));
  popupCoordinates=current.location?.coordinates?[...current.location.coordinates]:null;
  popup = document.createElement("section");
  popup.className = "local-temperature-popover"; popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", text("現在地の気象情報", "Local weather")); popup.tabIndex = -1;
  popupMarkup=buildLocalTemperatureDetails(current);popup.innerHTML = popupMarkup;
  document.body.append(popup);
  button.setAttribute("aria-expanded", "true");
  const rect = button.getBoundingClientRect(), width = popup.offsetWidth, height = popup.offsetHeight;
  popup.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.right - width))}px`;
  popup.style.top = `${Math.max(12, rect.top > height + 20 ? rect.top - height - 8 : Math.min(innerHeight - height - 12, rect.bottom + 8))}px`;
  popup.focus({ preventScroll: true });
}
export function updateLocalTemperatureView(result) {
  current = result;
  const root = document.getElementById("local-temperature-summary");
  if (root) {
    root.hidden = !result;
    const markup=result?`<span>${text("現在地の気象情報", "Local weather")}</span>${buildLocalTemperatureButton(result)}`:"";
    const existing=root.querySelector("[data-local-temperature-details]");
    if(result&&existing) {
      const template=document.createElement("template");template.innerHTML=buildLocalTemperatureButton(result);
      const next=template.content.firstElementChild;
      root.firstElementChild.textContent=text("現在地の気象情報","Local weather");
      existing.setAttribute("aria-label",next.getAttribute("aria-label"));
      existing.querySelector("span").textContent=next.querySelector("span").textContent;
    } else if(root.innerHTML!==markup)root.innerHTML=markup;
  }
  if(popup) {
    const coordinates=result?.location?.coordinates;
    const moved=popupCoordinates&&coordinates&&getDistanceKm(popupCoordinates,coordinates)>=TEMPERATURE_ESTIMATION.elevationMoveKm;
    anchor=findAnchor();
    if(!result||moved||!anchor)close({focus:popup.contains(document.activeElement)});
    else {anchor.setAttribute("aria-expanded","true");refreshPopup();}
  }
  if (initialized) return;
  initialized = true;
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-local-temperature-details]");
    if (button) { if (anchor === button) close({ focus: true }); else open(button); return; }
    if (event.target.closest?.("[data-local-temperature-close]")) close({ focus: true });
    else if(event.target.closest?.("[data-local-temperature-terms]")) {close({focus:true});void openLocalTemperatureTerms({review:true});}
    else if (popup && !popup.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && popup) { event.preventDefault(); event.stopPropagation(); close({ focus: true }); } });
  window.addEventListener("resize", () => close());
}
