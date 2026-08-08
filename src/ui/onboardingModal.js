const STORAGE_KEY = "meteoscope-onboarding-v1";

const PAGES = [
  {
    eyebrow: "全体像",
    title: ["防災・気象情報を", "ひとつの地図で"],
    body: ["雨雲・観測・警報・台風・地震を、", "下部の表示切替から確認できます。"],
    visual: `<div class="onboarding-demo onboarding-overview-demo" aria-hidden="true">
      <header class="onboarding-demo-heading">
        <img src="/icons/icon-192.png" alt="" width="62" height="62">
        <span><small>WEATHER &amp; DISASTER</small><strong>MeteoScope</strong></span>
      </header>
      <div class="onboarding-overview-groups">
        <span><small>観測</small><strong>雨雲・アメダス</strong></span>
        <span><small>防災</small><strong>警報・台風</strong></span>
        <span><small>地震・火山</small><strong>最新情報</strong></span>
      </div>
    </div>`
  },
  {
    eyebrow: "表示切替",
    title: ["表示したい情報へ", "すばやく切り替える"],
    body: ["下部ボタンをタップするか、", "ボタン上を横へスライドします。"],
    visual: `<div class="onboarding-demo onboarding-navigation-demo" aria-hidden="true">
      <header class="onboarding-demo-heading"><span><small>表示切替</small><strong>タップ / スライド</strong></span></header>
      <div class="onboarding-tab-visual">
        <span class="is-active" data-tab="radar">雨雲</span>
        <span data-tab="amedas">アメダス</span>
        <span data-tab="warnings">警報</span>
        <span data-tab="typhoon">台風</span>
        <span data-tab="earthquake">地震</span>
      </div>
      <div class="onboarding-swipe-cue"><i></i><span>左右へスライド</span><b>↔</b></div>
    </div>`
  },
  {
    eyebrow: "詳細パネル",
    title: ["要約から", "詳しい情報へ"],
    body: ["要約バーを上へ引き出すと、", "詳しい情報が開きます。", "要約バー内の切替も", "そのまま操作できます。"],
    visual: `<div class="onboarding-demo onboarding-detail-demo" aria-hidden="true">
      <header class="onboarding-demo-heading"><span><small>詳細パネル</small><strong>要約から詳しい情報へ</strong></span></header>
      <div class="onboarding-sheet-visual">
        <div class="onboarding-summary-preview"><i></i><strong>雨雲レーダー</strong><small>12:00</small></div>
        <div class="onboarding-detail-preview"><span>詳細情報</span><b>降水ナウキャスト</b><i>↑</i></div>
      </div>
    </div>`
  },
  {
    eyebrow: "地図操作",
    title: ["現在地と凡例を", "地図で使う"],
    body: ["現在地ボタンで", "周辺へ移動できます。", "地図の色や記号は", "凡例から確認できます。"],
    visual: `<div class="onboarding-demo onboarding-map-demo" aria-hidden="true">
      <header class="onboarding-demo-heading"><span><small>地図ツール</small><strong>位置と表示内容を確認</strong></span></header>
      <div class="onboarding-map-tools">
        <div><span class="onboarding-locate-preview"></span><strong>現在地</strong><small>周辺へ移動</small></div>
        <div><span class="onboarding-legend-preview"></span><strong>凡例</strong><small>色と記号を確認</small></div>
      </div>
    </div>`
  },
  {
    eyebrow: "設定",
    title: ["必要な情報を", "自分向けに整える"],
    body: ["設定では、お知らせ・", "マイエリア・外観を", "まとめて変更できます。", "災害時は公式情報も", "あわせて確認してください。"],
    visual: `<div class="onboarding-demo onboarding-settings-demo">
      <header class="onboarding-demo-heading"><span><small>設定</small><strong>表示と通知</strong></span></header>
      <div class="onboarding-safety-visual">
        <div><span><small>通知</small><strong>お知らせ通知</strong></span><i aria-hidden="true"></i></div>
        <div><span><small>地域</small><strong>マイエリア</strong></span><b aria-label="2件">2</b></div>
      </div>
      <button type="button" class="onboarding-settings-button" data-onboarding-open-settings>設定を開く</button>
    </div>`
  }
];

export function buildOnboardingPhraseMarkup(phrases) {
  const values = Array.isArray(phrases) ? phrases : [phrases];
  return values
    .filter((value) => value != null && String(value).trim())
    .map((value) => `<span class="onboarding-phrase">${escapeMarkup(value)}</span>`)
    .join("");
}

function escapeMarkup(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
      <div class="onboarding-copy">
        <div class="onboarding-copy-meta">
          <span class="onboarding-section">${page.eyebrow}</span>
          <span class="onboarding-step">${String(index + 1).padStart(2, "0")} / ${String(PAGES.length).padStart(2, "0")}</span>
        </div>
        <h3>${buildOnboardingPhraseMarkup(page.title)}</h3>
        <p>${buildOnboardingPhraseMarkup(page.body)}</p>
      </div>
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
