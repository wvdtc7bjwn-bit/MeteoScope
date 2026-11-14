// Shared limits are enforced again on the server. UTC matches Workers AI's reset.
export const WARNING_CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const WARNING_CHAT_LIMITS = Object.freeze({ daily: null, perAccount: 10, promptBytes: 12288, outputTokens: 1024, reservedNeurons: 200, dailyNeurons: 10000 });
export const WARNING_CHAT_LANGUAGES = Object.freeze({ ja: "日本語", easy: "やさしい日本語", en: "English", zh: "中文", ko: "한국어", vi: "Tiếng Việt", pt: "Português", es: "Español" });
export const WARNING_CHAT_QUESTIONS = Object.freeze(["現在発表中の警報・注意報は？", "現在の発表では、いつまで警戒が必要？", "現在の発表で何に気をつければいい？", "警報と注意報はどう違う？", "大雨のとき、避難はどう判断する？"]);
export const WARNING_CHAT_TOPICS = Object.freeze({ weather: "気象", earthquake: "地震", tsunami: "津波" });
export const WARNING_CHAT_TOPIC_QUESTIONS = Object.freeze({
  weather: WARNING_CHAT_QUESTIONS,
  earthquake: ["最新の地震の震源と規模は？", "最近の地震で{areaName}で震度を観測した地震は？", "最新の地震の津波に関する発表は？", "震度とマグニチュードはどう違う？", "地震のとき、どう身を守り避難する？", "南海トラフ臨時情報と後発地震注意情報の違いは？"],
  tsunami: ["最新の津波情報の発表内容は？", "最新の津波情報の予想高さと到達時刻は？", "最新の津波情報は現在も有効？", "津波の第一波と最大波はどう違う？", "津波から避難するときの行動は？"]
});

export function warningChatQuestions({ topic = "weather", eventId = "", areaName = "選択した市区町村" } = {}) {
  return (WARNING_CHAT_TOPIC_QUESTIONS[topic] ?? WARNING_CHAT_QUESTIONS).map((question) => {
    const named = question.replace("{areaName}", areaName);
    if (!eventId) return named;
    if (topic === "earthquake" && question.startsWith("最近の地震で")) return `選択した地震で${areaName}の観測震度は？`;
    return named.replaceAll("最新の地震", "選択した地震").replaceAll("最新の津波情報", "選択した津波情報");
  });
}

export function isWarningChatEvacuationQuestion(question) {
  return /避難|避难|撤离|撤離|逃げ|身を守|安全確保|警戒レベル|evacuat|evacuación|take cover|shelter|protect (?:myself|yourself)|대피|피난|sơ tán|trú ẩn|abrigo|refúgio|huir/iu.test(question);
}

export function normalizeWarningChatSelection(input) {
  const topic = input?.topic ?? "weather";
  if (!Object.hasOwn(WARNING_CHAT_TOPICS, topic)) throw new TypeError("質問する情報を選択してください。");
  const eventId = input?.eventId ?? "";
  const forecastAreaCode = input?.forecastAreaCode ?? "";
  const earthquakeScope = input?.earthquakeScope ?? "selected";
  if (!["selected", "recent-local"].includes(earthquakeScope)) throw new TypeError("地震の検索範囲を確認してください。");
  if (typeof eventId !== "string" || (eventId && !/^\d{14}$/u.test(eventId))) throw new TypeError("対象の地震を選択してください。");
  if (typeof forecastAreaCode !== "string" || (forecastAreaCode && !/^\d{3}$/u.test(forecastAreaCode))) throw new TypeError("津波予報区を選択してください。");
  return { topic, eventId: topic === "weather" ? "" : eventId, forecastAreaCode: topic === "tsunami" ? forecastAreaCode : "",
    ...(topic === "earthquake" && !eventId && earthquakeScope === "recent-local" ? {earthquakeScope} : {}) };
}

// Route an explicit multi-event/local observation question to the data it needs,
// even if the user has left the topic selector on weather. Never infer a place
// from free text: "here" remains the municipality selected in the UI.
export function resolveWarningChatQuestionSelection(input) {
  const selected = normalizeWarningChatSelection(input);
  const question = input.question ?? "";
  const recent = /最近|直近|過去|これまで|今日|本日|昨日|recent|previous|past|today|yesterday/iu.test(question);
  const local = /ここ|この地域|この辺|このあたり|当地|選択.*地域|震度|揺れ|here|this area|intensit|felt/iu.test(question);
  const quakes = /地震|earthquake/iu.test(question);
  // A coastal evacuation question needs tsunami evidence even if it also
  // mentions the earthquake. Do not route it to a recent-observation list.
  if (isWarningChatEvacuationQuestion(question)) {
    const actionTopic = /津波|tsunami/iu.test(question) ? "tsunami"
      : /地震|揺れ|earthquake|shaking/iu.test(question) ? "earthquake"
      : /大雨|洪水|土砂|暴風|台風|大雪|暴風雪|heavy rain|flood|landslide|storm|typhoon|snow|blizzard/iu.test(question) ? "weather" : selected.topic;
    return {topic: actionTopic, eventId: actionTopic === selected.topic ? selected.eventId : "",
      forecastAreaCode: actionTopic === "tsunami" && actionTopic === selected.topic ? selected.forecastAreaCode : ""};
  }
  if (selected.topic === "earthquake" && /最新の地震|the latest earthquake/iu.test(question) && !recent) return {topic: "earthquake", eventId: "", forecastAreaCode: ""};
  if (recent && local && quakes) return {topic: "earthquake", eventId: "", forecastAreaCode: "", earthquakeScope: "recent-local"};
  if (selected.topic !== "earthquake" && /地震|震度|震源|マグニチュード|earthquake|magnitude/iu.test(question)) return {topic: "earthquake", eventId: "", forecastAreaCode: ""};
  if (selected.topic !== "tsunami" && /津波|tsunami/iu.test(question) && !/地震.*(?:津波|心配)|earthquake.*tsunami/iu.test(question)) return {topic: "tsunami", eventId: "", forecastAreaCode: ""};
  if (selected.topic !== "weather" && /気象|警報|注意報|weather|advisory/iu.test(question) && !/津波|地震|tsunami|earthquake/iu.test(question)) return {topic: "weather", eventId: "", forecastAreaCode: ""};
  if (selected.earthquakeScope && /最新の地震の|最新の地震について|the latest earthquake/iu.test(question)) {
    const {earthquakeScope, ...single} = selected;
    return single;
  }
  return selected;
}

export function normalizeWarningChatInput(input) {
  if (!input || typeof input !== "object" || typeof input.areaCode !== "string" || !/^\d{7}$/u.test(input.areaCode)) throw new TypeError("市区町村を選択してください。");
  if (input.consent !== true) throw new TypeError("AIへの送信について確認してください。");
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question || [...question].length > 240) throw new TypeError("質問は240文字以内で入力してください。");
  if (!Object.hasOwn(WARNING_CHAT_LANGUAGES, input.language)) throw new TypeError("回答言語を選択してください。");
  // Do not forward URLs, contact details or commonly pasted secrets to inference.
  if (/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:sk-|AIza)[\w-]{15,}|\b\d{2,4}[-ー]\d{2,4}[-ー]\d{3,4}\b)/iu.test(question)) {
    throw new TypeError("URL・連絡先・秘密情報を含めずに質問してください。");
  }
  const history = Array.isArray(input.history) ? input.history.slice(-4).filter((item) =>
    ["user", "assistant"].includes(item?.role) && typeof item.content === "string"
  ).map((item) => ({ role: item.role, content: [...item.content].slice(0, 400).join("") })) : [];
  return { areaCode: input.areaCode, ...normalizeWarningChatSelection(input), question, language: input.language, history, revision: typeof input.revision === "string" ? input.revision.slice(0, 64) : "" };
}
