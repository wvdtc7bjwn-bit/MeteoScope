import {
  SOCIAL_SHARE_FORMATS,
  buildSocialShareFilename,
  renderSocialShareCard
} from "../socialShareCard.js";

let initialized = false;
let activePayload = null;
let activeFormat = "portrait";
let activeTheme = "dark";
let japanMapPromise = null;
let japanMapGeoJson = null;
let appIconPromise = null;
let appIconImage = null;

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
  if (title) title.textContent = payload.type === "earthquake" ? "地震情報を画像にする" : "アメダスランキングを画像にする";
  if (description) {
    description.textContent = payload.type === "earthquake"
      ? "現在表示している地震情報からSNS投稿用PNGを作成します。"
      : "現在のランキング上位を、見やすいSNS投稿用PNGにまとめます。";
  }
  refreshControls();
  setStatus("画像を作成しています…");
  const loadingTasks = [document.fonts?.ready, loadAppIcon()];
  if (payload.type === "earthquake") loadingTasks.push(loadJapanMap());
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
    if (activePayload.type === "earthquake" && !japanMapGeoJson) {
      await loadJapanMap();
    }
    renderSocialShareCard(canvas, activePayload, {
      format: activeFormat,
      theme: activeTheme,
      japanGeoJson: japanMapGeoJson,
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
      title: activePayload.type === "earthquake" ? "MeteoScope 地震情報" : "MeteoScope アメダスランキング",
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
