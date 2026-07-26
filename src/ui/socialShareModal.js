import {
  SOCIAL_SHARE_FORMATS,
  buildSocialShareFilename,
  renderSocialShareCard
} from "../socialShareCard.js";
import { loadMunicipalityLookup } from "../location/currentLocation.js";

let initialized = false;
let activePayload = null;
let activeFormat = "portrait";
let activeTheme = "dark";
let japanMapPromise = null;
let japanMapGeoJson = null;
let worldMapPromise = null;
let worldLandGeoJson = null;
let worldCountriesGeoJson = null;
let appIconPromise = null;
let appIconImage = null;
let warningMunicipalitiesPromise = null;
let warningMunicipalities = null;

const SHARE_COPY = Object.freeze({
  amedas: Object.freeze({
    title: "アメダスランキングを画像にする",
    description: "現在のランキング上位を、見やすいSNS投稿用PNGにまとめます。",
    shareTitle: "MeteoScope アメダスランキング"
  }),
  earthquake: Object.freeze({
    title: "地震情報を画像にする",
    description: "現在表示している地震情報からSNS投稿用PNGを作成します。",
    shareTitle: "MeteoScope 地震情報"
  }),
  typhoon: Object.freeze({
    title: "台風情報を画像にする",
    description: "現在表示している気象庁の台風情報からSNS投稿用PNGを作成します。",
    shareTitle: "MeteoScope 台風情報"
  }),
  warning: Object.freeze({
    title: "現在地付近の発表状況を画像にする",
    description: "現在地の市区町村に発表中の警報・注意報をSNS投稿用PNGにまとめます。",
    shareTitle: "MeteoScope 警報・注意報"
  })
});

export function setupSocialShareModal() {
  if (initialized) return;
  initialized = true;
  document.querySelectorAll("[data-social-share-close]").forEach((element) => {
    element.addEventListener("click", closeSocialShareModal);
  });
  document.querySelectorAll("[data-social-share-format]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFormat = button.dataset.socialShareFormat;
      refreshControls();
      void renderPreview();
    });
  });
  document.querySelectorAll("[data-social-share-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTheme = button.dataset.socialShareTheme;
      refreshControls();
      void renderPreview();
    });
  });
  document.getElementById("social-share-download")?.addEventListener("click", downloadPng);
  document.getElementById("social-share-native")?.addEventListener("click", sharePng);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSocialShareModal();
  });
}

export async function openSocialShareModal(payload) {
  const modal = document.getElementById("social-share-modal");
  if (!modal || !payload) return;
  setupSocialShareModal();
  activePayload = payload;
  activeFormat = "portrait";
  activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const title = document.getElementById("social-share-title");
  const description = document.getElementById("social-share-description");
  const copy = getShareCopy(payload);
  if (title) title.textContent = copy.title;
  if (description) description.textContent = copy.description;
  refreshControls();
  setStatus("画像を作成しています…");
  const loadingTasks = [document.fonts?.ready, loadAppIcon()];
  if (payload.type === "earthquake" || payload.type === "typhoon") loadingTasks.push(loadJapanMap());
  if (payload.type === "typhoon") loadingTasks.push(loadWorldMap());
  if (payload.type === "warning") loadingTasks.push(loadWarningMunicipalities());
  await Promise.all(loadingTasks);
  await renderPreview();
}

export function closeSocialShareModal() {
  const modal = document.getElementById("social-share-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  activePayload = null;
  document.body.classList.remove("modal-open");
}

function refreshControls() {
  document.querySelectorAll("[data-social-share-format]").forEach((button) => {
    const active = button.dataset.socialShareFormat === activeFormat;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-social-share-theme]").forEach((button) => {
    const active = button.dataset.socialShareTheme === activeTheme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const nativeButton = document.getElementById("social-share-native");
  if (nativeButton) nativeButton.hidden = typeof navigator.share !== "function";
}

async function renderPreview() {
  const canvas = document.getElementById("social-share-preview");
  if (!activePayload || !(canvas instanceof HTMLCanvasElement)) return;
  try {
    if (["earthquake", "typhoon"].includes(activePayload.type) && !japanMapGeoJson) {
      await loadJapanMap();
    }
    if (activePayload.type === "typhoon" && !worldLandGeoJson) {
      await loadWorldMap();
    }
    renderSocialShareCard(canvas, activePayload, {
      format: activeFormat,
      theme: activeTheme,
      japanGeoJson: japanMapGeoJson,
      worldLandGeoJson,
      worldCountriesGeoJson,
      warningMunicipalities,
      appIcon: appIconImage
    });
    const format = SOCIAL_SHARE_FORMATS[activeFormat];
    const itemCount = activePayload.type === "amedas"
      ? `・${activePayload.items?.length ?? 0}地点掲載`
      : "";
    setStatus(`${format.label} ${format.width} × ${format.height}px${itemCount}`);
  } catch (error) {
    console.error("[MeteoScope] social share preview failed", error);
    setStatus("画像を作成できませんでした。", "error");
  }
}

function loadAppIcon() {
  if (!appIconPromise) {
    appIconPromise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", () => {
        appIconImage = image;
        resolve(image);
      }, { once: true });
      image.addEventListener("error", () => {
        console.warn("[MeteoScope] social share app icon unavailable");
        resolve(null);
      }, { once: true });
      image.src = new URL("icons/icon-192.png", document.baseURI).href;
    });
  }
  return appIconPromise;
}

function loadJapanMap() {
  if (!japanMapPromise) {
    japanMapPromise = fetch("/data/japan-prefectures.geojson")
      .then((response) => {
        if (!response.ok) throw new Error(`Japan map request failed: ${response.status}`);
        return response.json();
      })
      .then((geoJson) => {
        japanMapGeoJson = geoJson;
        return geoJson;
      })
      .catch((error) => {
        console.warn("[MeteoScope] social share Japan map unavailable", error);
        return null;
      });
  }
  return japanMapPromise;
}

function loadWorldMap() {
  if (!worldMapPromise) {
    worldMapPromise = Promise.all([
      import("../map/data/worldLandGeoJson.js"),
      import("../map/data/worldCountriesGeoJson.js")
    ])
      .then(([landModule, countriesModule]) => {
        worldLandGeoJson = landModule.worldLandGeoJson;
        worldCountriesGeoJson = countriesModule.worldCountriesGeoJson;
        return { worldLandGeoJson, worldCountriesGeoJson };
      })
      .catch((error) => {
        console.warn("[MeteoScope] social share world map unavailable", error);
        return null;
      });
  }
  return worldMapPromise;
}

function loadWarningMunicipalities() {
  if (!warningMunicipalitiesPromise) {
    warningMunicipalitiesPromise = loadMunicipalityLookup()
      .then((municipalities) => {
        warningMunicipalities = municipalities;
        return municipalities;
      })
      .catch((error) => {
        console.warn("[MeteoScope] social share municipality map unavailable", error);
        return null;
      });
  }
  return warningMunicipalitiesPromise;
}

async function downloadPng() {
  const blob = await getPngBlob();
  if (!blob || !activePayload) return;
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = buildSocialShareFilename(activePayload, activeFormat);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("PNGを保存しました。", "success");
}

async function sharePng() {
  const blob = await getPngBlob();
  if (!blob || !activePayload) return;
  const file = new File([blob], buildSocialShareFilename(activePayload, activeFormat), {
    type: "image/png"
  });
  if (!navigator.canShare?.({ files: [file] })) {
    await downloadPng();
    setStatus("共有機能に対応していないため、PNGを保存しました。", "success");
    return;
  }
  try {
    await navigator.share({
      title: getShareCopy(activePayload).shareTitle,
      text: "MeteoScopeの気象・防災情報",
      files: [file]
    });
    setStatus("共有画面を開きました。", "success");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("[MeteoScope] social share failed", error);
      setStatus("共有できませんでした。", "error");
    }
  }
}

function getPngBlob() {
  const canvas = document.getElementById("social-share-preview");
  if (!(canvas instanceof HTMLCanvasElement)) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function setStatus(message, tone = "") {
  const status = document.getElementById("social-share-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function getShareCopy(payload) {
  return SHARE_COPY[payload?.type] ?? SHARE_COPY.amedas;
}
