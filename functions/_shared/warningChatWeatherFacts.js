import {weatherChatQuestionPeriod} from "../../src/ai/warningChatWeatherQuery.js";
import {warningChatRequestedWarningKinds} from "./warningChatFocus.js";

export function usesWeatherChatFacts(input, scope) {
  if (!["ja", "easy"].includes(input.language) || !["forecast", "early"].includes(scope)) return false;
  // Named places, detailed hours, advice and explanations go through evidence-bound
  // inference. A simple extraction must not silently answer for a different place.
  const remaining = input.question.normalize("NFKC").replace(/今日|本日|明後日|あさって|明日|今週|週間|週末|早期注意情報|警報級|可能性|天気予報|天気|天候|降水確率|最高気温|最低気温|気温|何度|大雨|土砂災害|暴風雪|暴風|大雪|波浪|高潮|洪水|雨|雪|風|波|この地域|ここ|教えて|ください|どうなる|どう|ある|あります|です|ます|なる|なります|降る|降ります|出ている|何|どの|程度|高い|高|中|そう|でしょう|でしょうか|の|は|が|を|か|に|と|も|で|[\s?？。、,！!]/gu, "");
  return remaining === "";
}

export function buildWeatherChatFacts(input, context) {
  const early = Boolean(context.earlyWarning);
  const period = weatherChatQuestionPeriod(input, Date.parse(context.fetchedAt), early ? 5 : 1);
  const inPeriod = date => period && date >= period.start && date < period.end;
  const lines = [`${context.areaName}に対応する${early ? context.earlyWarning.areaName : "予報区域"}の${early ? "早期注意情報" : "天気予報"}です。`];
  if (early) {
    const types = warningChatRequestedWarningKinds(input.question);
    const rows = context.earlyWarning.rows.filter(row => !types.length || types.includes(row.type)
      || row.type === "暴風(雪)" && types.some(type => ["暴風","暴風雪","風雪"].includes(type)));
    let found = false;
    for (const row of rows) {
      const slots = row.slots.filter(slot => period && Date.parse(slot.start) < Date.parse(`${period.end}T00:00:00+09:00`) && Date.parse(slot.end) > Date.parse(`${period.start}T00:00:00+09:00`));
      if (!slots.length) continue;
      found = true;
      const positive = slots.filter(slot => slot.level !== "掲載なし");
      lines.push(positive.length ? `${row.type}：${positive.map(slot => `${range(slot.start, slot.end)}［${slot.level}］（発表 ${stamp(slot.issuedAt)}）`).join("、")}` : `${row.type}：対象期間に［高］［中］の掲載はありません。`);
    }
    if (!found) lines.push("指定した現象・期間の情報を確認できません。掲載期間外や対象外の場合もあります。");
    lines.push("警報の発表状況とは異なります。［中］にも警報級の可能性があり、掲載なしも安全の保証ではありません。");
  } else {
    const q = input.question;
    const wantsTemp = /気温|何度/u.test(q), wantsPop = /降水確率/u.test(q), wantsWind = /風/u.test(q), wantsWave = /波/u.test(q);
    const onlyFields = wantsTemp || wantsPop || wantsWind || wantsWave;
    const days = context.forecast.days.filter(row => inPeriod(row.date));
    if (!days.length) lines.push("指定した日の予報は取得した資料にありません。掲載期間の先や過去の天気は、この資料から回答できません。");
    for (const row of days) {
      const values = [];
      if (!onlyFields || /天気|天候/u.test(q)) values.push(row.weather);
      if (wantsTemp || !onlyFields) {
        const t = row.temperature;
        const min = `最低${t?.minC == null ? "未提供" : `${t.minC}℃`}`, max = `最高${t?.maxC == null ? "未提供" : `${t.maxC}℃`}`;
        const requested = /最高/u.test(q) && !/最低/u.test(q) ? max : /最低/u.test(q) && !/最高/u.test(q) ? min : `${min}・${max}`;
        values.push(t ? `${t.stationName}の予想気温：${requested}` : "気温の予報値は未提供");
        if(t && t.issuedAt !== row.issuedAt) values.push(`気温の発表：${stamp(t.issuedAt)}`);
      }
      if (wantsPop || !onlyFields) {
        const slots = context.forecast.precipitationSlots.filter(slot => slot.start.slice(0,10) === row.date);
        // Keep six-hour values as time bands; never call their maximum a daily probability.
        values.push(slots.length ? `降水確率：${slots.map(slot => `${range(slot.start, slot.end)} ${slot.percent}%`).join("、")}`
          : row.pop == null ? "降水確率は未提供" : `日降水確率${row.pop}%`);
      }
      if (wantsWind) values.push(row.wind || "風の予報は未提供");
      if (wantsWave) values.push(row.waves || "波の予報は未提供");
      lines.push(`${row.date}（${row.areaName}／発表 ${stamp(row.issuedAt)}）：${values.join("。")}`);
    }
    lines.push("区域の予報であり、現在地そのものの実況や点予報ではありません。");
  }
  lines.push(`発表：${stamp(context.issuedAt)}（日本時間）。最新の予報で変わることがあります。`);
  return {answer: lines.join("\n"), evidenceIds: [early ? "early" : "forecast"], answerKind: "official"};
}

function stamp(value) {
  return new Date(value).toLocaleString("ja-JP", {timeZone: "Asia/Tokyo", hour12: false});
}
function range(start, end) {
  return `${stamp(start)}〜${stamp(end)}（日本時間）`;
}
