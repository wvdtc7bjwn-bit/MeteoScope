const STORAGE_KEY = "meteoscope-onboarding-v1";

const PAGES = [
  {
    eyebrow: "Welcome",
    title: "防災・気象情報をひとつの地図で",
    body: "雨雲、観測、警報、台風、地震を下部の表示切替から確認できます。",
    visual: `<div class="onboarding-brand-visual">
      <img src="/icons/icon-192.png" alt="" width="118" height="118">
      <div class="onboarding-brand-copy">
        <small>WEATHER &amp; DISASTER</small>
        <strong>MeteoScope</strong>
        <div><span>雨雲</span><span>アメダス</span><span>警報</span><span>台風</span><span>地震</span></div>
      </div>
    </div>`
  },
  {
    eyebrow: "Navigation",
    title: "表示したい情報を切り替える",
    body: "下部ボタンをタップするか、ボタン上を横にスライドして表示を切り替えます。",
    visual: `<div class="onboarding-tab-visual" aria-hidden="true">
      <span class="is-active" data-tab="radar">雨雲</span>
      <span data-tab="amedas">アメダス</span>
      <span data-tab="warnings">警報</span>
      <span data-tab="typhoon">台風</span>
      <span data-tab="earthquake">地震</span>
    </div>`
  },
  {
    eyebrow: "Detail",
    title: "要約から詳しい情報へ",
    body: "地図下の要約バーはそのまま操作できます。上へ引き出すと詳細パネルが開きます。",
    visual: `<div class="onboarding-sheet-visual"><i></i><small>雨雲レーダー</small><strong>2026/07/12 12:00</strong><span></span></div>`
  },
  {
    eyebrow: "Map",
    title: "現在地と凡例を活用する",
    body: "現在地ボタンで周辺へ移動し、凡例で地図の色や記号の意味を確認できます。",
    visual: `<div class="onboarding-map-tools" aria-hidden="true">
      <div><span class="onboarding-locate-preview"></span><small>現在地</small></div>
      <div><span class="onboarding-legend-preview"></span><small>凡例</small></div>
    </div>`
  },
  {
    eyebrow: "Safety",
    title: "自分に合った情報を受け取る",
    body: "設定から現在地の警報通知、マイエリア、外観を変更できます。安全に関わる判断では公式情報も確認してください。",
    visual: `<div class="onboarding-safety-visual"><span>現在地の警報通知</span><i></i><span>マイエリア</span><b>2</b><button type="button" data-onboarding-open-settings>設定を開く</button></div>`
  }
];

let initialized = false;
let currentPage = 0;
let pointerStartX = null;
let onboardingOptions = {};

export function setupOnboardingModal(options = {}) {
  onboardingOptions = options;
  if (!initialized) initialize();
  return { open: () => openOnboarding(false), showFirstRun };
}

function initialize() {
  initialized = true;
  const modal = document.getElementById("onboarding-modal");
  const track = document.getElementById("onboarding-track");
  const dots = document.getElementById("onboarding-dots");
  const viewport = document.getElementById("onboarding-viewport");
  if (!modal || !track || !dots || !viewport) return;

  track.innerHTML = PAGES.map((page, index) => `
    <article class="onboarding-page" aria-hidden="${index === 0 ? "false" : "true"}">
      <div class="onboarding-visual">${page.visual}</div>
      <div class="onboarding-copy"><span>${page.eyebrow}</span><h3>${page.title}</h3><p>${page.body}</p></div>
    </article>
  `).join("");
  dots.innerHTML = PAGES.map((_, index) => `<button type="button" data-onboarding-page="${index}" aria-label="${index + 1}ページ目"></button>`).join("");

  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-onboarding-open-settings]")) {
      closeOnboarding(true);
      window.requestAnimationFrame(() => onboardingOptions.onOpenSettings?.());
      return;
    }
    if (event.target.closest("[data-onboarding-close], [data-onboarding-skip]")) return closeOnboarding(true);
    if (event.target.closest("[data-onboarding-prev]")) return setPage(currentPage - 1);
    if (event.target.closest("[data-onboarding-next]")) {
      if (currentPage === PAGES.length - 1) return closeOnboarding(true);
      return setPage(currentPage + 1);
    }
    const dot = event.target.closest("[data-onboarding-page]");
    if (dot) setPage(Number(dot.dataset.onboardingPage));
  });

  viewport.addEventListener("pointerdown", (event) => { pointerStartX = event.clientX; });
  viewport.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;
    const distance = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(distance) < 44) return;
    setPage(currentPage + (distance < 0 ? 1 : -1));
  });
  viewport.addEventListener("pointercancel", () => { pointerStartX = null; });

  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (event.key === "Escape") closeOnboarding(true);
    if (event.key === "ArrowRight") setPage(currentPage + 1);
    if (event.key === "ArrowLeft") setPage(currentPage - 1);
  });
  setPage(0);
}

function showFirstRun() {
  if (hasSeenOnboarding()) return;
  window.setTimeout(() => openOnboarding(true), 450);
}

function openOnboarding(firstRun) {
  const modal = document.getElementById("onboarding-modal");
  if (!modal) return;
  currentPage = 0;
  setPage(0);
  modal.hidden = false;
  modal.dataset.firstRun = firstRun ? "true" : "false";
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => document.getElementById("onboarding-viewport")?.focus({ preventScroll: true }));
}

function closeOnboarding(markSeen) {
  const modal = document.getElementById("onboarding-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (markSeen) rememberOnboarding();
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
}

function setPage(page) {
  currentPage = Math.max(0, Math.min(PAGES.length - 1, Number(page) || 0));
  document.querySelectorAll("#onboarding-track .onboarding-page").forEach((element, index) => {
    element.setAttribute("aria-hidden", index === currentPage ? "false" : "true");
  });
  const track = document.getElementById("onboarding-track");
  if (track) track.style.transform = `translate3d(${-currentPage * 100}%, 0, 0)`;
  document.querySelectorAll("#onboarding-dots button").forEach((button, index) => {
    button.classList.toggle("is-active", index === currentPage);
    button.setAttribute("aria-current", index === currentPage ? "step" : "false");
  });
  const previous = document.querySelector("[data-onboarding-prev]");
  const next = document.querySelector("[data-onboarding-next]");
  if (previous) previous.disabled = currentPage === 0;
  if (next) next.textContent = currentPage === PAGES.length - 1 ? "使い始める" : "次へ";
}

function hasSeenOnboarding() {
  try { return localStorage.getItem(STORAGE_KEY) === "seen"; } catch { return true; }
}

function rememberOnboarding() {
  try { localStorage.setItem(STORAGE_KEY, "seen"); } catch { /* Ignore unavailable storage. */ }
}
