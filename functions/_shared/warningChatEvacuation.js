import {isWarningChatEvacuationQuestion, resolveWarningChatQuestionSelection} from "../../src/ai/warningChatPolicy.js";
import {revisionOf} from "./warningChatSources.js";

// Reviewed paraphrases of the linked JMA guidance, 2026-11-14. These are
// general actions, never a feed of municipal orders or open shelters.
export const WARNING_CHAT_EVACUATION = Object.freeze({
  weather: {
    title: "気象災害時の避難行動", url: "https://www.jma.go.jp/jma/kishou/know/bosai/alertlevel.html",
    text: "大雨などでは、自治体の避難情報に加え、キキクルや河川の水位、ハザードマップも確認し、危険な場所から早めに避難します。警戒レベル3は危険な場所から高齢者など避難に時間がかかる人の避難、レベル4は危険な場所から全員避難が基本です。レベル5を待たず行動し、災害が切迫して屋外への移動がかえって危険な場合は、その場でできる最善の安全確保をします。気象情報の「相当する警戒レベル」と自治体の避難指示は別の情報です。",
    easy: "大雨のときは、市町村の避難情報、キキクル、川の水位を確認します。危険な場所から早めに逃げます。レベル3は逃げるのに時間がかかる人、レベル4は危険な場所の全員が逃げる段階です。レベル5まで待ちません。外への移動が危険なら、その場で命を守る行動をします。",
    en: "For heavy rain, check municipal notices, JMA risk maps, river levels and hazard maps; leave dangerous places early. At Alert Level 3, people who need more time should evacuate dangerous places; at Level 4, everyone in dangerous places should evacuate. Do not wait for Level 5. If disaster is imminent and going outside is more dangerous, take the best available protective action where you are. A weather bulletin's equivalent alert level is not a municipal evacuation order."
  },
  earthquake: {
    title: "地震時の身の守り方", url: "https://www.jma.go.jp/jma/kishou/know/jishin/jishin_bosai/index.html",
    text: "揺れを感じたり緊急地震速報を見聞きしたら、まず頭を守り、丈夫な机の下などで身の安全を確保します。あわてて外へ飛び出さず、無理に火を消そうとしません。屋外では塀の倒壊や看板・ガラスの落下に注意します。揺れが収まってから周囲の被害と公式情報を確認します。海の近くで強い揺れ、または弱くても長い揺れを感じた場合は津波に備え、身を守ったうえで直ちに海岸から離れ、より高い場所へ避難します。震度やMだけで建物や地域の安全は判断できません。",
    easy: "揺れたら、まず頭を守ります。丈夫な机の下などで身を守ります。あわてて外に飛び出しません。無理に火を消しません。外では塀や落ちてくる物に注意します。海の近くで強い揺れや長い揺れを感じたら、身を守ってから、すぐ海岸を離れて高い場所へ逃げます。震度だけで安全とは判断できません。",
    en: "When shaking starts or EEW sounds, protect your head and take cover under a sturdy table or in another protected space. Do not rush outside or force yourself to put out a fire. Outdoors, watch for collapsing walls and falling signs or glass. After shaking subsides, check damage and official information. Near the coast, strong or weak but prolonged shaking means protecting yourself and then immediately leaving the shore for higher ground. Intensity or magnitude alone cannot establish building or local safety."
  },
  tsunami: {
    title: "津波からの避難", url: "https://www.jma.go.jp/jma/kishou/know/jishin/joho/tsunamiinfo.html",
    text: "沿岸部や川沿いで大津波警報・津波警報が発表された場合は、直ちに高台や津波避難ビルなどへ避難します。海の近くで強い揺れ、または弱くても長い揺れを感じた場合は、警報を待たず避難します。津波注意報でも海から上がり、海岸から離れます。到達予想時刻まで待たず、海を見に行きません。津波は繰り返し襲います。最新の警報・注意報が解除されるまで避難を続け、自治体の避難指示にも従ってください。古い電文の解除や期限切れだけで帰ってよいとは判断できません。",
    easy: "津波警報が出たら、海や川の近くから、すぐ高い場所や津波避難ビルへ逃げます。海の近くで強い揺れや長い揺れを感じたら、警報を待ちません。注意報でも海から上がり、海岸を離れます。海を見に行きません。津波は何度も来ます。最新の警報や注意報と、市町村の情報を確認し、勝手に戻りません。",
    en: "If a major tsunami warning or tsunami warning applies, people on the coast or along rivers should immediately evacuate to higher ground or a designated tsunami evacuation building. Near the sea, strong or weak but prolonged shaking calls for evacuation without waiting for a warning. Under an advisory, get out of the sea and leave the shore. Do not wait until the predicted arrival time or go to watch the sea. Waves repeat: remain evacuated until current warnings/advisories are lifted and follow municipal orders. An old or expired bulletin is not permission to return."
  }
});

const WEATHER_MOVEMENT = {
  wind: {topic: "weather", title: "暴風時の移動と備え", url: "https://www.jma-net.go.jp/miyako/topix/typhoon_miyako.html",
    text: "台風などの暴風・強風の中では、飛来物や転倒などで屋外の活動が危険になります。不要な外出を控え、備えや必要な避難は風が強くなる前に行います。暴風の最中に一律に外へ出るよう勧めず、その場の危険と公式情報を確認します。",
    easy: "強い風の中では、物が飛んできたり、転んだりします。外出を控えます。準備や必要な避難は、風が強くなる前にします。強い風の中を無理に移動しません。",
    en: "Storm winds can cause dangerous flying debris and falls. Avoid unnecessary outdoor activity; prepare and make any necessary evacuation before winds strengthen. Do not give a blanket instruction to go outside during violent winds; assess immediate hazards and official information."},
  snow: {topic: "weather", title: "大雪時の外出と移動", url: "https://www.jma.go.jp/jma/kishou/know/snow/snow.html",
    text: "大雪では車の立ち往生など大規模な交通障害が起きるおそれがあります。不要不急の外出や大雪の地域へ向かうことを控え、最新の気象・交通情報を確認します。雨による洪水・土砂災害の警戒レベルだけを根拠に、雪の中を一律に避難させる案内はしません。",
    easy: "大雪では車が動けなくなることがあります。急ぎでない外出を控えます。大雪の地域へ向かいません。最新の天気と交通の情報を確認します。",
    en: "Heavy snow may cause vehicles to become stranded and major transport disruption. Avoid non-essential outings and travel into affected areas, and check current weather and transport information. Rain-related flood/landslide alert levels must not be used alone to send everyone out into snow."}
};

export function warningChatEvacuationGuidance(input, topic = input.topic ?? "weather", warnings = []) {
  // Only resolve a short follow-up from a preceding evacuation question.
  const followup = /^(?:それ|その|もっと|もう少し|具体的|持ち物|what about|tell me more|make it simpler)/iu.test(input.question);
  const previous = followup ? [...(input.history ?? [])].reverse().find(item => item.role === "user")?.content ?? "" : "";
  if (!isWarningChatEvacuationQuestion(`${input.question} ${previous}`)) return [];
  const topics = [topic];
  if (/津波|tsunami/iu.test(input.question) && topic !== "tsunami") topics.push("tsunami");
  if (/地震|earthquake/iu.test(input.question) && topic !== "earthquake") topics.push("earthquake");
  const guidance = topics.filter(key => WARNING_CHAT_EVACUATION[key]).map(key => ({topic: key, ...WARNING_CHAT_EVACUATION[key]}));
  if (topic === "weather") {
    const hazards = `${input.question} ${previous} ${warnings.map(item => item.label).join(" ")}`;
    const movement = [];
    if (/暴風|強風|台風|wind|storm|typhoon/iu.test(hazards)) movement.push(WEATHER_MOVEMENT.wind);
    if (/雪|snow|blizzard/iu.test(hazards)) movement.push(WEATHER_MOVEMENT.snow);
    if (movement.length && !/大雨|洪水|土砂|浸水|高潮|rain|flood|landslide|surge/iu.test(hazards)) guidance.shift();
    guidance.unshift(...movement);
  }
  return guidance.slice(0, 2);
}

export function warningChatEvacuationSources(guidance) {
  const references = [...guidance];
  // The earthquake advice includes the coastal shaking/tsunami precaution.
  if (guidance.some(item => item.topic === "earthquake")) references.push(WARNING_CHAT_EVACUATION.tsunami);
  return [...new Map(references.map(({title, url}) => [url, {title: `気象庁 ${title}`, url}])).values()];
}

export function generalWarningChatEvacuation(input) {
  if (!isWarningChatEvacuationQuestion(input.question)) return null;
  const q = input.question.normalize("NFKC");
  // Current/local/return/route questions must retain live bulletin context.
  if (/今|現在|最新|ここ|この|その|選択|発表中|発令|戻|帰|必要|すべき|どこ|いつ|何時|current|latest|here|this |that |should i|need to|return|back|where|when/iu.test(q)) return null;
  if (!/一般|基本|のとき|の時|するとき|general|basic|during an? (?:earthquake|tsunami|storm)|how (?:do|to) (?:evacuate|protect)/iu.test(q)) return null;
  return warningChatEvacuationGuidance(input, resolveWarningChatQuestionSelection(input).topic);
}

export async function buildWarningChatEvacuationContext(input, guidance, now = Date.now()) {
  const content = {topic: guidance[0].topic, knowledgeOnly: true, referenceKind: "evacuation", areaCode: input.areaCode,
    evacuationGuidance: guidance, reviewedAt: "2026-11-14",
    explanation: "一般的な避難行動です。現在の発表状況、自治体の避難指示、避難所の開設状況や経路を示すものではありません。",
    sources: warningChatEvacuationSources(guidance)};
  return {...content, areaName: "避難行動の基本", issuedAt: null, fetchedAt: new Date(now).toISOString(),
    selection: {eventId: "", events: [], forecastAreas: []}, revision: await revisionOf(content)};
}

export function buildWarningChatEvacuationAnswer(input, context) {
  const lines = context.evacuationGuidance.map(item => input.language === "en" ? item.en : input.language === "easy" ? item.easy : item.text);
  lines.push(input.language === "en"
    ? "These are general actions, not a current local evacuation order, shelter opening status or safe route. Check the latest official notices."
    : "一般的な避難行動です。現在の避難指示・避難所の開設状況・安全な経路を示すものではありません。最新の公式情報も確認してください。");
  return {answer: lines.join("\n\n"), evidenceIds: ["evacuation"], answerKind: "official"};
}
