import { getCurrentLanguage } from "./locale.js";
import { canUseTemperatureEstimation } from "../preferences/temperatureSource.js";

export function buildLocalTemperatureTerms({ english = getCurrentLanguage() === "en", review = false } = {}) {
  const t = (ja,en) => english ? en : ja;
  return `<section class="warning-modal-panel settings-modal-panel temperature-estimation-terms-panel" role="dialog" aria-modal="true" aria-labelledby="temperature-estimation-terms-title" aria-describedby="temperature-estimation-terms-intro">
    <header class="settings-modal-header"><h2 id="temperature-estimation-terms-title">${t("推定気温の利用規約", "Estimated temperature terms")}</h2><button type="button" class="warning-modal-close" data-temperature-terms-close aria-label="${t("閉じる", "Close")}">×</button></header>
    <div class="temperature-estimation-terms-body" tabindex="0">
      <p id="temperature-estimation-terms-intro">${t("現在地の推定気温をご利用になる前に、次の内容をご確認ください。", "Please review the following before enabling estimated local temperature.")}</p>
      <section><h3>${t("推定値と精度について", "Estimates and accuracy")}</h3>
        <p>${t("小数第1位は表示の桁数であり、精度を保証しません。信頼性の分類は統計的な信頼区間ではありません。夜間の逆転層、盆地、山岳、沿岸、都市部、前線付近では誤差が大きくなる場合があります。", "One decimal place does not guarantee precision. Reliability categories are not statistical confidence intervals. Inversions, basins, mountains, coasts, cities and fronts can increase errors.")}</p>
        <p>${t("補間が難しい場合は、現在地の推定値に代えて最寄り観測点の実測値を表示します。画面の「推定」「実測」の表示をご確認ください。", "When interpolation is not feasible, the nearest station observation is shown instead. Check whether the value is labelled estimated or observed.")}</p></section>
      <section><h3>AUTO</h3><p>${t("AUTOでは、独自推定の信頼度が低い場合や推定できない場合に、気象庁の推計気象分布の気温へ自動で切り替えます。気象庁データも取得できない場合は「—」を表示します。表示元・対象時刻・切り替え理由は詳細情報で確認できます。気象庁の気温は公開表示用データの1℃区分であり、独自推定の計算には使用しません。", "AUTO switches to JMA estimated weather distribution when local estimate reliability is low or estimation is unavailable. If JMA data is also unavailable, the display shows —. Details show the source, analysis time and switching reason. JMA temperature uses public display categories of 1°C and is not an input to the local estimator.")}</p></section>
      <section><h3>${t("データの出典と独自加工", "Sources and processing")}</h3>
        <p>${t("気象庁のアメダス観測データおよび国土地理院の標高データを用いて、MeteoScopeが独自に推定しています。実際の気温とは異なる場合があります。", "MeteoScope independently estimates temperature using JMA AMeDAS observations and GSI elevation data. Actual temperatures may differ.")}</p>
        <p>${t("標高が取得できない場合は標高補正を行いません。周辺環境の考慮には、国土交通省の国土数値情報を加工した地形・土地利用データを用います。", "No elevation correction is made when elevation is unavailable. Terrain and land-use context uses processed MLIT National Land Numerical Information.")}</p>
        <p><a href="https://www.jma.go.jp/bosai/amedas/" target="_blank" rel="noopener noreferrer">${t("気象庁 AMeDAS", "JMA AMeDAS")}</a> · <a href="https://maps.gsi.go.jp/development/demtile.html" target="_blank" rel="noopener noreferrer">${t("国土地理院 標高タイル", "GSI DEM tiles")}</a> · <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noopener noreferrer">${t("国土数値情報", "MLIT land data")}</a></p></section>
      <section><h3>${t("位置情報の利用", "Location use")}</h3><p>${t("位置情報の利用が必要です。計算は端末内で行います。標高の確認時は国土地理院に周辺タイルの番号を、環境データの確認時は配信元に約80km四方の地域番号を送信します。緯度・経度そのものはこれらの取得先へ送信しません。", "Location access is required. Calculation runs on your device. Elevation lookup sends surrounding tile numbers to GSI; environment lookup sends roughly 80 km regional identifiers to the app host, rather than the latitude and longitude themselves.")}</p></section>
    </div>
    <footer class="temperature-estimation-terms-actions">${review ? "" : `<button type="button" data-temperature-terms-close>${t("キャンセル", "Cancel")}</button>`}<button type="button" ${review ? "data-temperature-terms-close" : "data-temperature-terms-accept"}>${review ? t("閉じる", "Close") : t("同意してオン", "Agree and enable")}</button></footer>
  </section>`;
}

let active;
export function openLocalTemperatureTerms({ review = false } = {}) {
  if (active) return active;
  const trigger = document.activeElement, wasLocked = document.body.classList.contains("modal-open");
  const modal = document.createElement("div");
  modal.className = "warning-modal temperature-estimation-terms-modal";
  modal.innerHTML = `<div class="warning-modal-backdrop" data-temperature-terms-close aria-hidden="true"></div>${buildLocalTemperatureTerms({review})}`;
  const background = [...document.body.children].map(element=>[element,element.inert]);
  background.forEach(([element])=>{element.inert=true;});
  document.body.append(modal);document.body.classList.add("modal-open");
  active = new Promise(resolve=>{
    const finish = accepted => {
      document.removeEventListener("keydown",keyHandler,true);
      modal.remove();background.forEach(([element,inert])=>{element.inert=inert;});
      if (!wasLocked) document.body.classList.remove("modal-open");
      active = null;
      if (trigger?.isConnected) trigger.focus({preventScroll:true});
      resolve(accepted);
    };
    const keyHandler = event => {
      if(event.key === "Escape") {event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
      if(event.key !== "Tab")return;
      const focusable=[...modal.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')];
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",keyHandler,true);
    modal.addEventListener("click",event=>{
      if(event.target.closest("[data-temperature-terms-accept]"))finish(true);
      else if(event.target.closest("[data-temperature-terms-close]"))finish(false);
    });
    modal.querySelector(".temperature-estimation-terms-body")?.focus({preventScroll:true});
  });
  return active;
}

// The setting remains OFF while the terms are open, including on cancel or access expiry.
export function createLocalTemperatureToggle({ getState, onChange, confirm = openLocalTemperatureTerms }) {
  let pending = false;
  return async () => {
    if(pending)return false;
    const state=getState();
    if(state.temperatureEstimationEnabled) {onChange(false);return true;}
    if(!canUseTemperatureEstimation(state))return false;
    pending=true;
    try {
      if(!await confirm()||!canUseTemperatureEstimation(getState()))return false;
      onChange(true);return true;
    } finally {pending=false;}
  };
}
