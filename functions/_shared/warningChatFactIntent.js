import {isWarningChatEvacuationQuestion} from "../../src/ai/warningChatPolicy.js";

// Deliberately narrow: only requests answered by extracting official fields.
// Explanations and risk judgements must not be replaced with a list of values.
export function warningChatFactIntent(input, selection) {
  if (!["ja", "easy", "en"].includes(input.language)) return null;
  if (isWarningChatEvacuationQuestion(input.question)) return null;
  const q = input.question.normalize("NFKC");
  if (/なぜ|どうして|理由|仕組み|違い|意味|とは|どういう|説明|安全|大丈夫|警戒|気をつけ|今後|これから|予測|why|explain|mean|difference|safe|danger|precaution|future|predict/iu.test(q)) return null;
  if (selection.earthquakeScope === "recent-local" && !/津波|tsunami/iu.test(q)) {
    // These queries require a separate history search or additional filters.
    // Do not silently answer them with an unfiltered ten-event list.
    if (/今週|今月|年間|\d+\s*(?:日間|時間|週間|か月|ヶ月|年|以上|以下|より)|\d{4}[/年-]|last\s+\d+|week|month|year|above|below|at least/iu.test(q)) return null;
    if (/(?:震度|intensity)\s*\d|\d+\s*(?:件|回)/iu.test(q)) return null;
    if (/一番|最も|最大|largest|strongest/iu.test(q) && !/震度|強|strong/iu.test(q)) return null;
    const recent = /最近|直近|過去|今日|本日|昨日|recent|previous|past|today|yesterday|その地震|その揺れ|those earthquakes|that earthquake/iu.test(q);
    const followup = /^(?:いつ|何時|どこ|震度|規模|深さ|マグニチュード|何件|何回|一番(?:強|大き)[^？?]*|最も(?:強|大き)[^？?]*|when|where|how many|which was (?:strongest|largest)|what (?:time|intensity|magnitude|depth))(?:は|です|だった|でした|なの|か|\s|[?？。!！])*$/iu.test(q);
    if (recent || followup) return "recent-observations";
  }
  if (selection.topic === "weather" && /警報|注意報|warning|advisor/iu.test(q)
    && /現在|今|発表|出て|current|in effect|active|issued/iu.test(q)
    && !/いつ|時間|まで|when|until|end|何に|対処|行動/iu.test(q)) return "weather-warnings";
  if (selection.topic === "earthquake" && /地震|earthquake/iu.test(q)
    && /最新|選択|その|この|latest|selected|that|this/iu.test(q)
    && /震源|規模|マグニチュード|深さ|時刻|いつ|何時|観測震度|最大震度|magnitude|depth|where|when|intensity|epicenter/iu.test(q)
    && !/津波|tsunami/iu.test(q)) return "earthquake-fields";
  if (selection.topic === "tsunami" && /津波|tsunami/iu.test(q)
    && /予想高さ|到達時刻|発表内容|現在も有効|まだ有効|expected height|arrival time|bulletin say|still (?:valid|in effect)/iu.test(q)) return "tsunami-fields";
  return null;
}
