import {warningChatEvacuationGuidance, warningChatEvacuationSources} from "./warningChatEvacuation.js";
import {findWarningChatTerms} from "./warningChatGlossary.js";
// Curated paraphrases, not model memory. Reviewed against JMA's linked pages
// on 2026-11-14. Keep definitions separate from current bulletin observations.
export function addWarningChatKnowledge(input, context) {
  const followup = /^(?:それ|その|どういう|もう少し|詳しく|what does (?:it|that)|tell me more|explain (?:it|that))/iu.test(input.question);
  const previous = followup ? [...(input.history ?? [])].reverse().find(item => item.role === "user")?.content ?? "" : "";
  const query = `${input.question} ${previous}`;
  const definitions = findWarningChatTerms(query).slice(0, 2);
  const evacuationGuidance = warningChatEvacuationGuidance(input, context.topic, context.warnings);
  if (!definitions.length && !evacuationGuidance.length) return context;
  const sources = [...context.sources, ...definitions.map(({title, url}) => ({title, url})), ...warningChatEvacuationSources(evacuationGuidance)];
  return {...context, ...(evacuationGuidance.length ? {evacuationGuidance} : {}), knowledge: definitions.map(({title, text}) => ({title, text})),
    sources: [...new Map(sources.map(item => [item.url, item])).values()]};
}
