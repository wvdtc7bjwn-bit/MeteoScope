// Shared limits are enforced again on the server. UTC matches Workers AI's reset.
export const WARNING_CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const WARNING_CHAT_LIMITS = Object.freeze({ daily: null, perAccount: 10, promptBytes: 12288, outputTokens: 1024, reservedNeurons: 200, dailyNeurons: 10000 });
export const WARNING_CHAT_LANGUAGES = Object.freeze({ ja: "日本語", easy: "やさしい日本語", en: "English", zh: "中文", ko: "한국어", vi: "Tiếng Việt", pt: "Português", es: "Español" });
export const WARNING_CHAT_QUESTIONS = Object.freeze(["現在発表中の警報・注意報は？", "現在の発表では、いつまで警戒が必要？", "現在の発表で何に気をつければいい？"]);
export const WARNING_CHAT_TOPICS = Object.freeze({ weather: "気象", earthquake: "地震", tsunami: "津波" });
export const WARNING_CHAT_TOPIC_QUESTIONS = Object.freeze({
  weather: WARNING_CHAT_QUESTIONS,
  earthquake: ["最新の地震の震源と規模は？", "最新の地震で{areaName}の観測震度は？", "最新の地震の津波に関する発表は？"],
  tsunami: ["最新の津波情報の発表内容は？", "最新の津波情報の予想高さと到達時刻は？", "最新の津波情報は現在も有効？"]
});

export function warningChatQuestions({ topic = "weather", eventId = "", areaName = "選択した市区町村" } = {}) {
  return (WARNING_CHAT_TOPIC_QUESTIONS[topic] ?? WARNING_CHAT_QUESTIONS).map((question) => {
    const named = question.replace("{areaName}", areaName);
    if (!eventId) return named;
    return named.replaceAll("最新の地震", "選択した地震").replaceAll("最新の津波情報", "選択した津波情報");
  });
}

export function normalizeWarningChatSelection(input) {
  const topic = input?.topic ?? "weather";
  if (!Object.hasOwn(WARNING_CHAT_TOPICS, topic)) throw new TypeError("質問する情報を選択してください。");
  const eventId = input?.eventId ?? "";
  const forecastAreaCode = input?.forecastAreaCode ?? "";
  if (typeof eventId !== "string" || (eventId && !/^\d{14}$/u.test(eventId))) throw new TypeError("対象の地震を選択してください。");
  if (typeof forecastAreaCode !== "string" || (forecastAreaCode && !/^\d{3}$/u.test(forecastAreaCode))) throw new TypeError("津波予報区を選択してください。");
  return { topic, eventId: topic === "weather" ? "" : eventId, forecastAreaCode: topic === "tsunami" ? forecastAreaCode : "" };
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
