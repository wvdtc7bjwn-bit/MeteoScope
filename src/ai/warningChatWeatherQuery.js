// Intent only: history can identify a follow-up, never supply forecast facts.
export function warningChatWeatherScope(input) {
  const q = String(input.question ?? "").normalize("NFKC");
  if (/とは|意味|違い|仕組み|what (?:is|does)|define|meaning/iu.test(q)
    && !/今日|明日|明後日|現在|今週|today|tomorrow|current/iu.test(q)) return "";
  if (/緊急地震速報|地震|震度|津波|earthquake|tsunami|\bEEW\b/iu.test(q)) return "";
  if (/早期注意情報|警報級(?:の)?(?:可能性|おそれ)|early warning information|potential for warnings/iu.test(q)) return "early";
  if (/警報|注意報|避難|warning|advisory|evacuat/iu.test(q)) return "";
  if (/天気|天候|週間予報|降水確率|最高気温|最低気温|予想気温|気温予報|weather|forecast|chance of rain/iu.test(q)) return "forecast";
  if (/現在の気温|今の気温|観測|実測|current temperature/iu.test(q)) return "";
  if (/明日|明後日|あさって|今日|本日|今週|週末|tomorrow|today|weekend/iu.test(q)
    && /雨|雪|晴|曇|くもり|気温|何度|風|波|傘|rain|snow|temperature|wind|umbrella/iu.test(q)) return "forecast";
  if (/^(?:では|じゃあ|それなら|and|what about)?[、,\s]*(?:明日|明後日|あさって|今日|今週|週末|気温|何度|降水確率|風|波|tomorrow|temperature)[^。]*[?？]?(?:$)/iu.test(q)) {
    const previous = [...(input.history ?? [])].reverse().find(item => item.role === "user");
    if (previous) return warningChatWeatherScope({question: previous.content, history: []});
  }
  return "";
}

export function weatherChatDate(value) {
  if (!Number.isFinite(Number(value))) throw new Error("invalid_weather_time");
  return new Date(Number(value) + 9 * 3600_000).toISOString().slice(0, 10);
}

// End is exclusive. All relative days are based on JST, not the server's zone.
export function weatherChatPeriod(question, now, defaultDays = 1) {
  const q = question.normalize("NFKC");
  const today = weatherChatDate(now);
  const midnight = Date.parse(`${today}T00:00:00+09:00`);
  let offset = /明後日|あさって|day after tomorrow/iu.test(q) ? 2 : /明日|tomorrow/iu.test(q) ? 1 : 0;
  let length = /週間|今週|week(?!end)/iu.test(q) ? 7 : /今日|本日|明日|明後日|あさって|today|tomorrow/iu.test(q) ? 1 : defaultDays;
  const sinceMonday = (new Date(midnight + 9 * 3600_000).getUTCDay() + 6) % 7;
  if (/来週|next week/iu.test(q)) {offset = 7 - sinceMonday; length = 7;}
  else if (/今週|this week/iu.test(q)) length = 7 - sinceMonday;
  const explicit = q.match(/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})(?:日)?/u);
  if (explicit) {
    const date = `${explicit[1] ?? today.slice(0, 4)}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
    const parsed = Date.parse(`${date}T00:00:00+09:00`);
    if (!Number.isFinite(parsed) || weatherChatDate(parsed) !== date) return null;
    offset = Math.round((parsed - midnight) / 86400_000); length = 1;
  } else if (/週末|weekend/iu.test(q)) {
    offset = (6 - new Date(midnight + 9 * 3600_000).getUTCDay() + 7) % 7; length = 2;
  } else {
    const weekday = q.match(/([日月火水木金土])曜/u);
    if (weekday) { offset = ("日月火水木金土".indexOf(weekday[1]) - new Date(midnight + 9 * 3600_000).getUTCDay() + 7) % 7; length = 1; }
  }
  return {start: weatherChatDate(midnight + offset * 86400_000), end: weatherChatDate(midnight + (offset + length) * 86400_000)};
}

export function weatherChatQuestionPeriod(input, now, defaultDays = 1) {
  let q = input.question;
  if (!/今日|本日|明日|明後日|あさって|週間|今週|来週|週末|曜|\d+[月/-]\d+|today|tomorrow|week/iu.test(q)
    && /^(?:では|じゃあ|それなら|and|what about)?[、,\s]*(?:気温|何度|降水確率|最高|最低|風|波|temperature)/iu.test(q)) {
    const previous = [...(input.history ?? [])].reverse().find(item => item.role === "user");
    if (previous && warningChatWeatherScope({question: previous.content}) === warningChatWeatherScope(input)) q += ` ${previous.content}`;
  }
  return weatherChatPeriod(q, now, defaultDays);
}
