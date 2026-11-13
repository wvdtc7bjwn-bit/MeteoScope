import { getMeteoScopeAccountSessionToken } from "../domain/quizRankingClient.js";
import { WARNING_CHAT_LANGUAGES, warningChatQuestions, WARNING_CHAT_TOPICS, WARNING_CHAT_LIMITS } from "../ai/warningChatPolicy.js";
import { renderSeismicChatEvidence } from "./seismicChatEvidence.js";
import { localizeText } from "./locale.js";
import { PREFECTURE_NAMES } from "../jma/warningCore.js";
import { formatWarningOutlookTime } from "../warningOutlookTime.js";

export function setupWarningChatModal({ isEarlyAccessEnabled = () => false, getCurrentLocation = () => ({}), onOpenAccount = () => {} } = {}) {
  const button = document.getElementById("warning-chat-button");
  const modal = document.getElementById("warning-chat-modal");
  if (!button || !modal) return;
  const byId = (id) => document.getElementById(`warning-chat-${id}`);
  const form = byId("form");
  const status = byId("status");
  const areaSelect = byId("area");
  const prefecture = byId("prefecture");
  const language = byId("language");
  const topic = byId("topic");
  const eventSelect = byId("event");
  const forecastAreaSelect = byId("forecast-area");
  let areas = [];
  let history = [];
  let context = null;
  let configured = false;
  let availabilityNotice = "AI回答は準備中です。";
  let sequence = 0;
  let controller;
  let busy = false;

  for (const [value, label] of Object.entries(PREFECTURE_NAMES).sort(([a], [b]) => a.localeCompare(b))) prefecture.add(new Option(label, value));
  for (const [value, label] of Object.entries(WARNING_CHAT_LANGUAGES)) language.add(new Option(label, value));
  for (const [value, label] of Object.entries(WARNING_CHAT_TOPICS)) topic.add(new Option(label, value));
  function syncTopic() {
    byId("event-label").hidden = topic.value === "weather";
    byId("forecast-area-label").hidden = topic.value !== "tsunami";
    byId("prefecture-label").hidden = topic.value === "tsunami";
    byId("area-label").hidden = topic.value === "tsunami";
    byId("empty").textContent = ({ weather: "何に気をつければいい？", earthquake: "地震について、何を知りたいですか？", tsunami: "津波の発表について質問できます" })[topic.value];
    syncQuestions();
    syncSelection();
  }
  function syncQuestions() {
    byId("questions").replaceChildren();
    for (const question of warningChatQuestions({ topic: topic.value, eventId: eventSelect.value, areaName: areaSelect.selectedOptions[0]?.textContent || "選択した市区町村" })) {
      const quick = document.createElement("button");
      quick.type = "button";
      quick.textContent = question;
      quick.addEventListener("click", () => { byId("question").value = localizeText(question); resizeInput(); byId("question").focus(); });
      byId("questions").append(quick);
    }
  }

  function syncAccess() {
    button.hidden = !isEarlyAccessEnabled();
    if (button.hidden) close();
  }
  function setStatus(text) { status.textContent = text; }
  function showHelp() {
    byId("help").hidden = false;
    byId("help").open = true;
    byId("info").setAttribute("aria-expanded", "true");
    byId("settings").open = false;
    byId("official").open = false;
  }
  function clearConversation() { history = []; byId("messages").replaceChildren(); byId("empty").hidden = false; byId("questions").hidden = false; }
  function resizeInput() {
    const input = byId("question");
    input.style.height = "auto";
    input.style.height = `${Math.min(120, input.scrollHeight)}px`;
  }
  function syncSelection() {
    const region = topic.value === "tsunami" ? forecastAreaSelect.selectedOptions[0]?.textContent || "予報区の概要" : `${PREFECTURE_NAMES[prefecture.value] ?? ""} ${areaSelect.selectedOptions[0]?.textContent ?? ""}`;
    byId("selection").textContent = `${region} · ${WARNING_CHAT_LANGUAGES[language.value] ?? ""}`;
  }
  function setBusy(value) {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    byId("question").readOnly = value;
    byId("send").disabled = value || !configured || !context;
    for (const select of [prefecture, areaSelect, language, topic, eventSelect, forecastAreaSelect]) select.disabled = value;
  }
  async function request(query = "", payload, signal) {
    const base = location.hostname.endsWith("github.io") ? "https://meteoscope.pages.dev/api/warning-chat" : "/api/warning-chat";
    const headers = new Headers();
    const token = getMeteoScopeAccountSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (payload) headers.set("Content-Type", "application/json");
    let response;
    try {
      response = await fetch(`${base}${query}`, { method: payload ? "POST" : "GET", headers, body: payload ? JSON.stringify(payload) : undefined, signal, credentials: "include", cache: "no-store" });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("チャットに接続できません。通信状態をご確認ください。");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "チャットに接続できませんでした。");
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function fillAreas(preferred = "") {
    areaSelect.replaceChildren();
    for (const area of areas.filter((item) => item.code.startsWith(prefecture.value)).sort((a, b) => a.name.localeCompare(b.name, "ja"))) areaSelect.add(new Option(area.name, area.code));
    if (areas.some((area) => area.code === preferred && area.code.startsWith(prefecture.value))) areaSelect.value = preferred;
    syncSelection();
  }
  function renderContext(value) {
    context = value;
    const panel = byId("evidence");
    panel.replaceChildren();
    byId("subject").hidden = topic.value === "weather";
    byId("subject").disabled = !value;
    byId("subject-label").textContent = topic.value === "tsunami" ? "対象の津波情報" : "対象の地震";
    byId("subject-text").textContent = "対象を確認しています…";
    if (!value) return;
    if (value.topic && value.topic !== "weather") {
      const oldEvent = eventSelect.value;
      eventSelect.replaceChildren(new Option("最新の発表を確認", ""));
      for (const event of value.selection?.events ?? []) eventSelect.add(new Option(`${event.eventTime ? new Date(event.eventTime).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "時刻調査中"} ${event.location}`, event.id));
      eventSelect.value = [...eventSelect.options].some((option) => option.value === oldEvent) ? oldEvent : "";
      const oldArea = forecastAreaSelect.value;
      forecastAreaSelect.replaceChildren(new Option("全予報区の概要", ""));
      for (const area of value.selection?.forecastAreas ?? []) forecastAreaSelect.add(new Option(area.name, area.code));
      forecastAreaSelect.value = [...forecastAreaSelect.options].some((option) => option.value === oldArea) ? oldArea : "";
      syncSelection();
      syncQuestions();
      const quake = value.earthquake;
      const selected = value.selection.events.find((event) => event.id === value.selection.eventId);
      const stamp = value.topic === "earthquake" ? quake?.eventTime || selected?.eventTime : value.issuedAt;
      const when = stamp ? new Date(stamp).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "時刻調査中";
      const ended = value.tsunami?.state === "expired" ? "（期限切れの資料）" : (value.tsunami?.state === "cancelled" || quake?.reportState === "取消") ? "（解除・取消の資料）" : "";
      byId("subject-text").textContent = value.availability === "empty" ? "対象の電文が見つかりません" : `${when}${value.topic === "tsunami" ? "発表" : "発生"} · ${quake?.location || selected?.location || value.tsunami?.kind || "調査中"}${ended}`;
      byId("subject").disabled = !value.selection.events.length;
      renderSeismicChatEvidence(panel, value);
      return;
    }
    const facts = document.createElement("p");
    facts.textContent = value.warnings.length ? value.warnings.map((item) => item.label).join("／") : "この資料に発表中の気象警報・注意報はありません。安全を保証する表示ではありません。";
    const time = document.createElement("p");
    time.className = "warning-chat-meta";
    const formatTime = (input) => input ? new Date(input).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }) : "取得できていません";
    time.textContent = `発表 ${formatTime(value.issuedAt)} · 取得 ${formatTime(value.fetchedAt)}（日本時間）`;
    panel.append(facts);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "時間帯別の見通し・出典";
    details.append(summary, time);
    const outlook = document.createElement("p");
    outlook.textContent = value.outlookAvailable
      ? value.outlook.map((row) => `${row.type}${row.localName ? `（${row.localName}）` : ""}：${row.slots.map((slot) => `${new Date(slot.time).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })} ${formatWarningOutlookTime(slot)} ${slot.description}`).join("／")}`).join("\n") || "警報・注意報級の時間帯の掲載はありません。警報解除の確約ではありません。"
      : "時間帯別の見通しを取得できません。終了時刻は判断できません。";
    details.append(outlook);
    for (const source of value.sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      details.append(link);
    }
    panel.append(details);
  }
  async function refreshContext() {
    const id = ++sequence;
    controller?.abort();
    controller = new AbortController();
    clearConversation();
    renderContext(null);
    setBusy(true);
    setStatus("気象庁の情報を確認しています…");
    try {
      const data = await request(`?${new URLSearchParams(selectedContext())}`, undefined, controller.signal);
      if (id !== sequence || modal.hidden) return;
      renderContext(data.context);
      setStatus(configured ? "" : availabilityNotice);
    } catch (error) { if (id === sequence && error.name !== "AbortError") { setStatus(error.message); byId("subject-text").textContent = "対象の情報を確認できません"; } }
    finally { if (id === sequence) setBusy(false); }
  }
  async function open() {
    if (!isEarlyAccessEnabled()) return;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    button.setAttribute("aria-expanded", "true");
    byId("close").focus();
    const id = ++sequence;
    controller?.abort();
    controller = new AbortController();
    setBusy(true);
    setStatus("利用状態を確認しています…");
    try {
      const [availability, catalog] = await Promise.all([
        request("", undefined, controller.signal),
        areas.length ? Promise.resolve({ areas }) : fetch(`${import.meta.env?.BASE_URL ?? "/"}data/jma-weather-warning-municipality-index.json`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error("地域一覧を取得できませんでした。"); return response.json(); })
      ]);
      if (id !== sequence || modal.hidden) return;
      configured = availability.configured === true;
      availabilityNotice = availability.message || "AI回答は準備中です。";
      areas = catalog.areas ?? [];
      const code = String(getCurrentLocation()?.areaCode || areaSelect.value || "1310100");
      prefecture.value = code.slice(0, 2);
      fillAreas(code);
      language.value = document.documentElement.lang === "en" ? "en" : "ja";
      syncTopic();
      byId("settings").open = false;
      byId("official").open = false;
      byId("help").hidden = true;
      byId("info").setAttribute("aria-expanded", "false");
      await refreshContext();
    } catch (error) { if (id === sequence && error.name !== "AbortError") { configured = false; setStatus(error.message); setBusy(false); if ([401, 403].includes(error.status)) showHelp(); } }
  }
  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    ++sequence;
    controller?.abort();
    clearConversation();
    renderContext(null);
    configured = false;
    setBusy(false);
    button.setAttribute("aria-expanded", "false");
    if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
    if (!button.hidden) button.focus();
  }
  function addMessage(label, text) {
    byId("empty").hidden = true;
    byId("questions").hidden = true;
    const article = document.createElement("article");
    article.className = label === "あなた" ? "warning-chat-user-message" : "warning-chat-answer-message";
    const heading = document.createElement("strong");
    heading.textContent = label;
    const body = document.createElement("p");
    body.textContent = text;
    article.append(heading, body);
    byId("messages").append(article);
    article.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  function selectedContext() {
    return { areaCode: areaSelect.value, topic: topic.value, eventId: topic.value === "weather" ? "" : eventSelect.value,
      forecastAreaCode: topic.value === "tsunami" ? forecastAreaSelect.value : "" };
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !configured || !context || !isEarlyAccessEnabled() || !byId("consent").checked) return;
    const question = byId("question").value.trim();
    if (!question) return;
    const id = ++sequence;
    controller?.abort();
    controller = new AbortController();
    setBusy(true);
    addMessage("あなた", question);
    setStatus("気象庁の最新情報に基づいて回答を作成しています…");
    try {
      const data = await request("", { ...selectedContext(), language: language.value, question, history, revision: context.revision, consent: true }, controller.signal);
      if (id !== sequence || modal.hidden || !isEarlyAccessEnabled()) return;
      if (data.context.revision !== context.revision) clearConversation();
      renderContext(data.context);
      addMessage("AIによる説明 · Gemma 4", data.answer);
      history.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
      history = history.slice(-4);
      byId("question").value = "";
      resizeInput();
      const atLimit = data.quota.accountUsed >= WARNING_CHAT_LIMITS.perAccount || (data.quota.dailyLimit !== null && data.quota.used >= data.quota.dailyLimit);
      setStatus(`本日 ${data.quota.accountUsed}/${WARNING_CHAT_LIMITS.perAccount}回${atLimit ? " · 上限に達しました（日本時間9時再開）" : ""}`);
      if (atLimit) configured = false;
    } catch (error) {
      if (id !== sequence || error.name === "AbortError") return;
      if (error.data?.context) { clearConversation(); renderContext(error.data.context); }
      if ([401, 403, 429].includes(error.status)) { configured = false; availabilityNotice = error.message; }
      if ([401, 403].includes(error.status)) showHelp();
      setStatus(error.message);
    } finally { if (id === sequence) setBusy(false); }
  });
  button.addEventListener("click", () => void open());
  byId("close").addEventListener("click", close);
  byId("account").addEventListener("click", () => { close(); onOpenAccount(); });
  byId("refresh").addEventListener("click", () => { if (!busy) void refreshContext(); });
  byId("info").addEventListener("click", () => {
    if (byId("help").hidden) showHelp();
    else { byId("help").hidden = true; byId("info").setAttribute("aria-expanded", "false"); }
  });
  byId("privacy").addEventListener("click", () => {
    byId("consent-details").hidden = false;
    byId("consent-details").open = true;
    byId("consent").focus();
  });
  prefecture.addEventListener("change", () => { fillAreas(); void refreshContext(); });
  areaSelect.addEventListener("change", () => { syncSelection(); void refreshContext(); });
  language.addEventListener("change", () => { syncSelection(); clearConversation(); });
  topic.addEventListener("change", () => {
    byId("settings").open = false;
    byId("official").open = false;
    eventSelect.replaceChildren(new Option("最新の発表を確認", ""));
    forecastAreaSelect.replaceChildren(new Option("全予報区の概要", ""));
    syncTopic(); void refreshContext();
  });
  eventSelect.addEventListener("change", () => {
    forecastAreaSelect.replaceChildren(new Option("全予報区の概要", ""));
    void refreshContext();
  });
  forecastAreaSelect.addEventListener("change", () => { syncSelection(); void refreshContext(); });
  byId("subject").addEventListener("click", () => { byId("official").open = false; byId("help").hidden = true; byId("info").setAttribute("aria-expanded", "false"); byId("settings").open = true; eventSelect.focus(); });
  byId("consent").addEventListener("change", () => {
    byId("consent-summary").textContent = byId("consent").checked ? "送信について確認済み" : "送信前に確認してください";
    byId("consent-details").open = !byId("consent").checked;
    byId("consent-details").hidden = byId("consent").checked;
  });
  byId("consent").addEventListener("invalid", () => { byId("consent-details").hidden = false; byId("consent-details").open = true; });
  byId("question").addEventListener("input", resizeInput);
  byId("question").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!byId("send").disabled) form.requestSubmit();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
    else if (!event.target.closest(".warning-chat-toolbar, #warning-chat-info, #warning-chat-subject")) {
      byId("settings").open = false;
      byId("official").open = false;
      byId("help").open = false;
      byId("help").hidden = true;
      byId("info").setAttribute("aria-expanded", "false");
    }
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      const tool = [byId("settings"), byId("official"), byId("help")].find((element) => element.open && !element.hidden);
      if (tool) { tool.open = false; if (tool === byId("help")) { tool.hidden = true; byId("info").setAttribute("aria-expanded", "false"); } }
      else close();
    }
    if (event.key === "Tab") {
      const focusable = [...modal.querySelectorAll("button:not(:disabled),select:not(:disabled),textarea,input,a[href],summary")].filter((element) => !element.hidden && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener("meteoscope:early-access-change", syncAccess);
  window.addEventListener("meteoscope:account-change", close);
  syncAccess();
}
