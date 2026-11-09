import { CommunityReportClient } from "../domain/communityReportClient.js";
import { QuizRankingClient } from "../domain/quizRankingClient.js";
import { getCurrentLanguage, localizeText } from "./locale.js";

let contextProvider = () => ({});
let submittedHandler = () => {};
let openAccountHandler = () => {};
let initialized = false;
const REPORT_TOPIC_FIELDS = Object.freeze({ weather: "weather", cherry: "cherry", autumn: "autumn", "snow-cover": "snowCover" });
const REPORT_TOPIC_EXAMPLES = Object.freeze({
  weather: "例：風が強く、傘が差しにくいです",
  cherry: "例：公園の桜が咲き始めました",
  autumn: "例：山の斜面が赤く色づいています",
  "snow-cover": "例：屋根にうっすら雪が積もりました"
});

export function setupCommunityReportModal({ getContext, onSubmitted, onOpenAccount } = {}) {
  contextProvider = typeof getContext === "function" ? getContext : contextProvider;
  submittedHandler = typeof onSubmitted === "function" ? onSubmitted : submittedHandler;
  openAccountHandler = typeof onOpenAccount === "function" ? onOpenAccount : openAccountHandler;
  if (initialized) return;
  initialized = true;
  document.querySelectorAll("[data-community-report-close]").forEach((element) => {
    element.addEventListener("click", closeCommunityReportModal);
  });
  document.getElementById("community-report-form")?.addEventListener("submit", submitReport);
  document.getElementById("community-report-form")?.addEventListener("change", (event) => {
    if (event.target?.name === "topic") {
      updateReportTopic(event.target.value);
      return;
    }
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
  updateReportTopic("weather");
}

export async function openCommunityReportModal() {
  const modal = document.getElementById("community-report-modal");
  if (!modal) return;
  applyCommunityReportLocale();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setStatus("利用条件を確認しています…", "checking");
  setSubmitEnabled(false);
  const location = contextProvider()?.currentLocation;
  renderLocation(location);
  let account = null;
  try {
    account = (await QuizRankingClient.account())?.account ?? null;
  } catch {
    account = null;
  }
  document.getElementById("community-report-account-required")?.toggleAttribute("hidden", Boolean(account));
  if (!account) {
    setStatus("投稿にはMeteoScopeアカウントへのログインが必要です。", "error");
    return;
  }
  if (location?.status !== "found" || !Array.isArray(location.coordinates)) {
    setStatus("投稿するには現在地を取得してください。位置情報はサーバーで約2km単位に丸めます。", "error");
    return;
  }
  setSubmitEnabled(true);
  setStatus(
    getCurrentLanguage() === "en"
      ? `${account.displayName} can post. Reports disappear after 5 hours. Up to 12 reports per day.`
      : `${account.displayName} で投稿できます。投稿は5時間後に自動で消え、1日12回までです。`,
    "ready"
  );
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
  const topic = data.get("topic");
  const observation = data.get(REPORT_TOPIC_FIELDS[topic] || "weather");
  submit.disabled = true;
  setStatus("投稿しています…", "checking");
  try {
    await CommunityReportClient.create({
      weather: observation,
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
    updateReportTopic("weather");
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
  const isEnglish = getCurrentLanguage() === "en";
  if (location?.status === "found") {
    const areaName = localizeText(location.areaName || "現在地周辺");
    element.textContent = isEnglish
      ? `Reporting area: ${areaName} (shown in approx. 2 km units)`
      : `投稿地点：${areaName}（約2km単位で表示）`;
    return;
  }
  element.textContent = isEnglish
    ? "Reporting area: Get your current location"
    : "投稿地点：現在地を取得してください";
}

function applyCommunityReportLocale() {
  updateReportTopic(document.querySelector("#community-report-form input[name='topic']:checked")?.value || "weather");
}

function updateReportTopic(topic) {
  const form = document.getElementById("community-report-form");
  if (!form) return;
  form.querySelectorAll("[data-community-topic]").forEach((field) => {
    const active = field.dataset.communityTopic === topic;
    field.hidden = !active;
    const select = field.querySelector("select");
    if (select) {
      select.disabled = !active;
      select.required = active;
    }
  });
  const comment = form.querySelector("textarea[name='comment']");
  if (comment) comment.placeholder = localizeText(REPORT_TOPIC_EXAMPLES[topic] || REPORT_TOPIC_EXAMPLES.weather);
}

function setSubmitEnabled(enabled) {
  const form = document.getElementById("community-report-form");
  if (!form) return;
  const submit = form.querySelector("button[type='submit']");
  if (submit) submit.disabled = !enabled;
}

function setStatus(message, state) {
  const element = document.getElementById("community-report-status");
  if (!element) return;
  element.textContent = localizeText(message);
  element.dataset.state = state;
}
