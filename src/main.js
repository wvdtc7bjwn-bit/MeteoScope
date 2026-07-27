import { createWeatherApp } from "./app.js";
import { setupRuntimeDiagnostics } from "./runtimeDiagnostics.js";

setupRuntimeDiagnostics();
registerAppServiceWorker();
setupConnectionStatus();
const app = createWeatherApp();
app.start();

function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[MeteoScope] service worker registration failed", error);
    });
  }, { once: true });
}

function setupConnectionStatus() {
  const element = document.getElementById("connection-status");
  if (!element) return;
  let staleSource = "";
  const update = () => {
    const offline = navigator.onLine === false;
    element.hidden = !offline && !staleSource;
    if (offline) {
      element.textContent = "オフラインです。表示中の情報は最新ではない可能性があります。";
    } else if (staleSource) {
      element.textContent = `データ更新が遅延しています（${staleSource}）。直前の取得結果を表示中です。`;
    } else {
      element.textContent = "";
    }
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  window.addEventListener("meteoscope-data-stale", (event) => {
    staleSource = String(event.detail?.source || "配信元");
    update();
  });
  window.addEventListener("meteoscope-data-recovered", (event) => {
    if (!staleSource || staleSource === String(event.detail?.source || "")) staleSource = "";
    update();
  });
  update();
}
