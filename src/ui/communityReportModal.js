import { CommunityReportClient } from "../domain/communityReportClient.js";
import { QuizRankingClient } from "../domain/quizRankingClient.js";
import { validateEarlyAccess } from "./earlyAccess.js";

let contextProvider = () => ({});
let submittedHandler = () => {};
let openAccountHandler = () => {};
let openSettingsHandler = () => {};
let initialized = false;

export function setupCommunityReportModal({ getContext, onSubmitted, onOpenAccount, onOpenSettings } = {}) {
  contextProvider = typeof getContext === "function" ? getContext : contextProvider;
  submittedHandler = typeof onSubmitted === "function" ? onSubmitted : submittedHandler;
  openAccountHandler = typeof onOpenAccount === "function" ? onOpenAccount : openAccountHandler;
  openSettingsHandler = typeof onOpenSettings === "function" ? onOpenSettings : openSettingsHandler;
  if (initialized) return;
  initialized = true;
  document.querySelectorAll("[data-community-report-close]").forEach((element) => {
    element.addEventListener("click", closeCommunityReportModal);
  });
  document.getElementById("community-report-form")?.addEventListener("submit", submitReport);
  document.getElementById("community-report-form")?.addEventListener("change", (event) => {
    if (event.target?.name !== "hazards") return;
    const selected = document.querySelectorAll("#community-report-form input[name='hazards']:checked");
    if (selected.length <= 3) return;
    event.target.checked = false;
    setStatus("周辺の危険は3つまで選択できます。", "error");
  });
  document.querySelector("#community-report-form textarea[name='comment']")?.addEventListener("input", (event) => {
    const count = document.getElementById("community-report-comment-count");
    if (count) count.textContent = String([...event.target.value].length);
  });
  document.getElementById("community-report-open-account")?.addEventListener("click", () => {
    closeCommunityReportModal();
    openAccountHandler();
  });
  document.getElementById("community-report-open-settings")?.addEventListener("click", () => {
    closeCommunityReportModal();
    openSettingsHandler();
  });
}

export async function openCommunityReportModal() {
  const modal = document.getElementById("community-report-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setStatus("利用条件を確認しています…", "checking");
  setFormEnabled(false);
  const location = contextProvider()?.currentLocation;
  renderLocation(location);
  const [accountResult, accessResult] = await Promise.allSettled([
    QuizRankingClient.account(),
    validateEarlyAccess()
  ]);
  const account = accountResult.status === "fulfilled" ? accountResult.value?.account : null;
  const access = accessResult.status === "fulfilled" ? accessResult.value : { active: false };
  document.getElementById("community-report-account-required")?.toggleAttribute("hidden", Boolean(account));
  document.getElementById("community-report-access-required")?.toggleAttribute("hidden", Boolean(access.active));
  if (!account) {
    setStatus("投稿にはMeteoScopeアカウントへのログインが必要です。", "error");
    return;
  }
  if (!access.active) {
    setStatus("投稿はアーリーアクセス認証済みのアカウントで利用できます。", "error");
    return;
  }
  if (location?.status !== "found" || !Array.isArray(location.coordinates)) {
    setStatus("投稿するには現在地を取得してください。位置情報はサーバーで約2km単位に丸めます。", "error");
    return;
  }
  setFormEnabled(true);
  setStatus(`${account.displayName} で投稿できます。投稿は5時間後に自動で消えます。`, "ready");
}

export function closeCommunityReportModal() {
  const modal = document.getElementById("community-report-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function submitReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type='submit']");
  const location = contextProvider()?.currentLocation;
  if (location?.status !== "found" || !Array.isArray(location.coordinates)) {
    setStatus("現在地を確認できません。地図の現在地ボタンを押してから再試行してください。", "error");
    return;
  }
  const data = new FormData(form);
  submit.disabled = true;
  setStatus("投稿しています…", "checking");
  try {
    await CommunityReportClient.create({
      weather: data.get("weather"),
      comment: data.get("comment") || null,
      sensation: data.get("sensation") || null,
      temperature: data.get("temperature") || null,
      hazards: data.getAll("hazards"),
      longitude: roundReportCoordinate(location.coordinates[0]),
      latitude: roundReportCoordinate(location.coordinates[1]),
      areaCode: location.areaCode || "",
      areaName: location.areaName || "現在地周辺"
    });
    form.reset();
    const count = document.getElementById("community-report-comment-count");
    if (count) count.textContent = "0";
    setStatus("投稿しました。雨雲レーダー上に反映しました。", "success");
    await submittedHandler();
    window.setTimeout(closeCommunityReportModal, 850);
  } catch (error) {
    setStatus(error.message || "投稿できませんでした。", "error");
  } finally {
    submit.disabled = false;
  }
}

function roundReportCoordinate(value) {
  return Number((Math.round(Number(value) / 0.02) * 0.02).toFixed(4));
}

function renderLocation(location) {
  const element = document.getElementById("community-report-location");
  if (!element) return;
  element.textContent = location?.status === "found"
    ? `投稿地点：${location.areaName || "現在地周辺"}（約2km単位で表示）`
    : "投稿地点：現在地を取得してください";
}

function setFormEnabled(enabled) {
  const form = document.getElementById("community-report-form");
  if (!form) return;
  form.querySelectorAll("input, select, textarea, button").forEach((element) => { element.disabled = !enabled; });
}

function setStatus(message, state) {
  const element = document.getElementById("community-report-status");
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}
