import {formatWarningChatHeight as height} from "../ai/warningChatFormatting.js";

export function renderSeismicChatEvidence(panel, context) {
  const paragraph = (value) => {
    const node = document.createElement("p");
    node.textContent = value;
    panel.append(node);
  };
  const at = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }) : "調査中";
  if (context.recentEarthquakes) {
    const recent = context.recentEarthquakes;
    paragraph(`${context.areaName} · 最近${recent.searchedCount}件の地震を確認`);
    for (const quake of recent.matches) paragraph(`${at(quake.eventTime)} · ${quake.location || "震源調査中"} · ${context.areaName}の観測震度 ${quake.observedIntensity}`);
    if (!recent.matches.length) paragraph("確認した範囲では、この市区町村の観測震度が掲載された地震を確認できませんでした。");
    if (recent.unavailableCount) paragraph(`${recent.unavailableCount}件の電文を取得できませんでした。`);
    paragraph(recent.scope);
  } else if (context.availability === "empty") paragraph("取得した気象庁の一覧に対象の電文がありません。地震や津波がないことを意味しません。");
  else if (context.topic === "earthquake") {
    const earthquake = context.earthquake;
    paragraph(`${earthquake.kind} · ${earthquake.reportState}`);
    if (earthquake.reportState === "取消") paragraph("この情報は取り消されています。");
    else {
      paragraph(`${earthquake.location || "震源調査中"} · 発生 ${at(earthquake.eventTime)}`);
      paragraph(`M${earthquake.magnitude ?? "調査中"} · ${earthquake.depthKm === 0 ? "ごく浅い" : earthquake.depthKm == null ? "深さ調査中" : `深さ${earthquake.depthKm}km`} · 最大観測震度 ${earthquake.maxObservedIntensity ?? "調査中"}`);
      paragraph(`${context.areaName}の観測震度：${earthquake.selectedMunicipalityIntensity ?? "この電文では確認できません"}`);
      paragraph(earthquake.tsunamiComment || "この地震の津波に関するコメントは、この電文では確認できません。");
      if (earthquake.isHistorical) paragraph("発表から時間が経った地震情報です。");
    }
  } else if (context.tsunami) {
    const tsunami = context.tsunami;
    paragraph(`${tsunami.kind} · ${({ expired: "有効期限を過ぎた過去の資料", cancelled: "解除・取消の資料", reported: "取得した発表資料", "forecast-unavailable": "警報・予報の電文は確認できません" })[tsunami.state]}`);
    paragraph(tsunami.scope);
    if (tsunami.validUntil) paragraph(`この電文の有効期限：${at(tsunami.validUntil)}（日本時間）`);
    for (const area of tsunami.areas) paragraph(`${area.name}：${area.grade}${area.expectedHeight ? ` · 予想高さ ${height(area.expectedHeight)}` : ""}${area.arrivalTime ? ` · 到達予想 ${at(area.arrivalTime)}` : area.arrivalCondition ? ` · ${area.arrivalCondition}` : ""}`);
    if (tsunami.omittedAreaCount) paragraph(`ほか${tsunami.omittedAreaCount}予報区。対象予報区は地域・言語のメニューから選択できます。`);
    for (const station of tsunami.observations) paragraph(`${station.offshore ? "沖合" : "沿岸"}観測 ${station.station}：${station.maxHeight == null ? station.maxHeightCondition || "観測高さ未確認" : `観測高さ ${height(station.maxHeight)}`}${station.maxHeightTime ? `（${at(station.maxHeightTime)}）` : ""}`);
    paragraph(tsunami.observationStatus);
    paragraph(tsunami.ageNotice || "最新の継続・解除状況は気象庁の画面でも確認してください。");
  }
  paragraph(`発表 ${at(context.issuedAt)} · 取得 ${at(context.fetchedAt)}（日本時間）`);
  for (const source of context.sources) {
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.title;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    panel.append(link);
  }
}
