// Shared limits are enforced again on the server. UTC matches Workers AI's reset.
export const WARNING_CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const WARNING_CHAT_LIMITS = Object.freeze({ daily: 40, perAccount: 3, promptBytes: 12288, outputTokens: 1024, reservedNeurons: 200 });
export const WARNING_CHAT_LANGUAGES = Object.freeze({ ja: "日本語", easy: "やさしい日本語", en: "English", zh: "中文", ko: "한국어", vi: "Tiếng Việt", pt: "Português", es: "Español" });
export const WARNING_CHAT_QUESTIONS = Object.freeze(["いつまで警戒が必要？", "何に気をつければいい？", "この警報をわかりやすく説明して"]);

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
  return { areaCode: input.areaCode, question, language: input.language, history, revision: typeof input.revision === "string" ? input.revision.slice(0, 64) : "" };
}
