import { warningChatFactIntent } from "./warningChatFactIntent.js";
import { recentQuestionPeriod } from "./warningChatRecentPeriod.js";
import { formatWarningChatHeight } from "../../src/ai/warningChatFormatting.js";

const isEnglish = input => input.language === "en";
const intensityText = value => String(value).replace("-", "−");
function timeText(value, english) {
  if (!value || !Number.isFinite(Date.parse(value))) return english ? "time unavailable" : "時刻調査中";
  return new Date(value).toLocaleString(english ? "en-GB" : "ja-JP", {timeZone: "Asia/Tokyo", hour12: false}) + (english ? " JST" : "（日本時間）");
}
function depthText(value, english) {
  return value == null ? (english ? "depth unavailable" : "深さ調査中") : value === 0 ? (english ? "very shallow" : "ごく浅い") : `${english ? "depth " : "深さ"}${value}km`;
}

// Facts already present in JMA data must not be overturned by model prose.
// These small templates are an extraction of observations, not a forecast.
export function usesOfficialChatFacts(input, selection) {
  return warningChatFactIntent(input, selection) !== null;
}
export function buildOfficialChatFacts(input, context) {
  if (!context.recentEarthquakes) return buildCurrentFacts(input, context);
  const recent = context.recentEarthquakes;
  if (!recent) throw new Error("missing_recent_earthquake_evidence");
  const english = isEnglish(input);
  const details = /いつ|時刻|何時|規模|深さ|マグニチュード|when|time|magnitude|depth/iu.test(input.question);
  const period = recentQuestionPeriod(input, Date.parse(context.fetchedAt));
  const inPeriod = quake => !period || (Date.parse(quake.eventTime) >= period.start && Date.parse(quake.eventTime) < period.end);
  const periodMatches = recent.matches.filter(inPeriod);
  let matches = periodMatches;
  const strongest = /一番(?:強|大き)|最も(?:強|大き)|最大(?:の|だった)|strongest|largest/iu.test(input.question);
  if (strongest && matches.length) {
    // JMA intensity categories are ordinal; do not compare their strings or
    // treat 5+ as the number 5. Preserve ties and all their original values.
    const order = ["1", "2", "3", "4", "5-", "5", "5+", "6-", "6", "6+", "7"];
    const rank = quake => order.indexOf(quake.observedIntensity);
    const maximum = Math.max(...matches.map(rank));
    matches = matches.filter(quake => rank(quake) === maximum);
  }
  const count = /何件|何回|how many/iu.test(input.question);
  const lines = matches.length
    ? [english ? `Yes. In ${context.areaName}, an observed intensity is reported for the following earthquakes:` : `はい。${context.areaName}では、次の地震で震度を観測しています。`,
      ...matches.map(quake => `${timeText(quake.eventTime, english)} · ${quake.location || (english ? "epicenter unavailable" : "震源調査中")} · ${english ? "local intensity" : "当地の震度"} ${intensityText(quake.observedIntensity)}${details ? ` · M${quake.magnitude ?? (english ? "unavailable" : "調査中")} · ${depthText(quake.depthKm, english)}` : ""}`)]
    : [english ? `No reported intensity in ${context.areaName} was confirmed within the checked recent earthquakes.` : `確認した最近の地震では、${context.areaName}の観測震度が掲載された地震を確認できませんでした。`];
  if (matches.length && strongest) lines[0] = english ? `The highest reported local intensity within the checked events in ${context.areaName} was ${intensityText(matches[0].observedIntensity)}:` : `確認範囲内で、${context.areaName}の観測震度が最も大きかった地震は次のとおりです（震度${intensityText(matches[0].observedIntensity)}）。`;
  if (count) lines[0] = strongest && matches.length
    ? (english ? `${matches.length} earthquakes tied for the highest reported local intensity (${intensityText(matches[0].observedIntensity)}) in ${context.areaName} within the checked records.` : `確認範囲内で、${context.areaName}の最大の観測震度（${intensityText(matches[0].observedIntensity)}）を記録した地震は${matches.length}件です。`)
    : (english ? `${periodMatches.length} earthquakes with a reported local intensity in ${context.areaName} were confirmed within the checked records.` : `確認範囲内で、${context.areaName}の観測震度が掲載された地震は${periodMatches.length}件です。`);
  if (period) lines.unshift(`${english ? "Requested day: " : "対象日："}${timeText(new Date(period.start).toISOString(), english).split(english ? "," : " ")[0]}${english ? " (JST day)." : "（日本時間の1日）"}`);
  lines.push(english ? `Checked ${recent.searchedCount} recent earthquakes in JMA's retrieved list; this is not an all-time history search.` : `気象庁の一覧の新しい${recent.searchedCount}地震を確認した結果です。全期間の検索ではありません。`);
  if (recent.unavailableCount) lines.push(english ? `${recent.unavailableCount} reports could not be retrieved.` : `${recent.unavailableCount}件の電文は取得できていません。`);
  if (!matches.length) lines.push(english ? "Unlisted or unavailable observations do not mean intensity zero or no earthquake." : "未掲載・未取得は、震度0や地震がなかったことを意味しません。");
  if (period) lines.push(english ? "The day filter applies only to the checked recent records, not a complete search of that day." : "日付の絞り込みは確認した最近の地震だけが対象です。その日の全地震を網羅する検索ではありません。");
  return {answer: lines.join("\n"), evidenceIds: ["recent-earthquakes"], answerKind: "official"};
}

function buildCurrentFacts(input, context) {
  const english = isEnglish(input);
  const missing = english ? "unavailable" : "調査中";
  const lines = [];
  let evidenceId;
  if (context.topic === "weather") {
    if (!Array.isArray(context.warnings)) throw new Error("missing_warning_evidence");
    evidenceId = "current";
    lines.push(context.warnings.length
      ? `${context.areaName}${english ? ": Active warnings/advisories in the retrieved JMA data: " : "に発表中の警報・注意報は、"}${context.warnings.map(item => item.label).join(english ? "; " : "、")}${english ? "." : "です。"}`
      : `${context.areaName}${english ? ": No weather warnings or advisories are listed in the retrieved JMA data. This does not guarantee safety." : "には、取得した気象庁の資料に発表中の気象警報・注意報は掲載されていません。安全を保証する表示ではありません。"}`);
    lines.push(english ? "River flood bulletins and municipal evacuation orders are not included." : "指定河川洪水予報・自治体の避難情報は、この照会の対象外です。");
  } else if (context.topic === "earthquake") {
    evidenceId = "earthquake";
    const quake = context.earthquake;
    if (!quake || context.availability === "empty") lines.push(english ? "No earthquake report could be found in the retrieved JMA list." : "取得した気象庁の一覧から、対象の地震電文を確認できませんでした。");
    else if (quake.reportState === "取消") lines.push(english ? "This earthquake report was cancelled. Its previous values must not be treated as valid." : "対象の地震電文は取消済みです。以前の震源・規模・震度を有効な値として表示しません。");
    else {
      lines.push(`${english ? "Occurrence: " : "発生："}${timeText(quake.eventTime, english)}`,
        `${english ? "Epicenter: " : "震源地："}${quake.location || missing} · M${quake.magnitude ?? missing} · ${depthText(quake.depthKm, english)}`,
        `${english ? "Maximum observed intensity: " : "観測最大震度："}${quake.maxObservedIntensity ? intensityText(quake.maxObservedIntensity) : missing}`,
        `${context.areaName}${english ? " observed intensity: " : "の観測震度："}${quake.selectedMunicipalityIntensity ? intensityText(quake.selectedMunicipalityIntensity) : (english ? "not confirmed in this report; not intensity zero" : "この電文では確認できません（震度0ではありません）")}`);
      if (quake.isHistorical) lines.push(english ? "This is an older earthquake report, not current shaking." : "発表から時間が経った地震の資料です。現在の揺れを示すものではありません。");
    }
  } else if (context.topic === "tsunami") {
    evidenceId = "tsunami";
    const tsunami = context.tsunami;
    if (!tsunami || context.availability === "empty") lines.push(english ? "No tsunami bulletin could be found in the retrieved JMA list; this does not establish that there is no tsunami." : "取得した気象庁の一覧から対象の津波電文を確認できません。津波がないと判断したものではありません。");
    else if (tsunami.state === "cancelled") lines.push(english ? "This tsunami bulletin is cancelled/ended. It does not establish the status of other events or all Japan." : "対象の津波電文は解除・取消の資料です。他の地震や全国の津波情報の状態を示すものではありません。");
    else {
      const status = {expired: english ? "Expired bulletin" : "期限切れの資料", "forecast-unavailable": english ? "Forecast bulletin unavailable" : "警報・予報電文は未取得", reported: english ? "Retrieved tsunami bulletin" : "取得した津波電文"};
      lines.push(status[tsunami.state] || missing);
      if (tsunami.validUntil) lines.push(`${english ? "Stated validity: " : "資料の有効期限："}${timeText(tsunami.validUntil, english)}`);
      for (const area of tsunami.areas ?? []) lines.push(`${area.name} · ${area.grade} · ${english ? "expected height " : "予想高さ "}${formatWarningChatHeight(area.expectedHeight) || area.heightCondition || missing} · ${english ? "arrival " : "到達 "}${area.arrivalTime ? timeText(area.arrivalTime, english) : area.arrivalCondition || missing}`);
      if (!(tsunami.areas?.length)) lines.push(english ? "Forecast heights and arrival times could not be confirmed in this report." : "この電文では予想高さ・到達時刻を確認できません。");
      if (tsunami.omittedAreaCount) lines.push(english ? `${tsunami.omittedAreaCount} more forecast areas are omitted; see the official source.` : `ほか${tsunami.omittedAreaCount}予報区は省略しています。公式の出典をご確認ください。`);
      lines.push(english ? "Expected heights are not observations. Arrival times are not a safe waiting period. This bulletin alone cannot establish the current status of all Japan." : "予想高さは観測値ではありません。到達予想時刻まで安全という意味ではなく、この資料だけで全国の現在の継続・解除は判断できません。");
    }
  } else throw new Error("unsupported_official_chat_topic");
  lines.push(`${english ? "Issued: " : "発表："}${timeText(context.issuedAt, english)}`);
  return {answer: lines.join("\n"), evidenceIds: [evidenceId], answerKind: "official"};
}
