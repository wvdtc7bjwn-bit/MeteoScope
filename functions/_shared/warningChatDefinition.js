import {revisionOf} from "./warningChatSources.js";

export async function buildWarningChatDefinitionContext(input, terms, now = Date.now()) {
  const sources = [...new Map(terms.map(term => [term.url, {title: `気象庁 ${term.title}`, url: term.url}])).values()];
  const content = {
    topic: terms[0].topic, knowledgeOnly: true, areaCode: input.areaCode,
    knowledge: terms.map(({id, title, enTitle, text, en}) => ({id, title, enTitle, text, en})),
    explanation: "一般的な用語の解説です。現在の発表状況・予測・地域の安全性を示すものではありません。",
    reviewedAt: "2026-11-14", sources
  };
  return {...content, areaName: "用語解説", issuedAt: null, fetchedAt: new Date(now).toISOString(),
    selection: {eventId: "", events: [], forecastAreas: []}, revision: await revisionOf(content)};
}

export function buildWarningChatDefinitionAnswer(input, context) {
  const english = input.language === "en";
  const lines = context.knowledge.map(term => `${english ? term.enTitle : term.title}\n${english ? term.en : term.text}`);
  lines.push(english ? "These are general definitions, not the current status of local warnings or earthquakes." : "一般的な用語の説明です。現在の地域の発表状況とは区別してください。");
  return {answer: lines.join("\n\n"), evidenceIds: ["knowledge"], answerKind: "official"};
}
