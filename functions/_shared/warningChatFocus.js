// Select requested facts from the current question, never from an assistant's
// previous answer. A follow-up such as "depth?" must not inherit all old fields.
export function warningChatFocus(input, context = input) {
  const q = input.question.normalize("NFKC");
  const fields = new Set();
  const add = (field, pattern) => { if (pattern.test(q)) fields.add(field); };
  // General terminology/advisory periods do not describe an event's origin
  // time or magnitude, even when those words occur in the question.
  if (context.knowledgeOnly || context.advisories) return {fields: [], countOnly: false};
  if (context.topic === "earthquake") {
    add("location", /震源(?:地)?|どこ|場所|epicent(?:er|re)|where|location/iu);
    add("magnitude", /規模|マグニチュード|magnitude|\bM\s*[?？]|how (?:large|big)/iu);
    add("depth", /深さ|深度|depth|how deep/iu);
    add("eventTime", /発生(?:時刻|日時)|いつ|何時|when|occurrence|what time/iu);
    add("issuedAt", /発表(?:時刻|日時)|受信(?:時刻|日時)|issu(?:ed|e) (?:at|time)/iu);
    // "震源の深さ" asks for depth, not another location description.
    if (/震源(?:の)?(?:深さ|深度)/u.test(q) && !/どこ|場所|震源地/u.test(q)) fields.delete("location");
    if (fields.has("issuedAt") && !/発生|いつ|何時|when|occurrence/iu.test(q)) fields.delete("eventTime");
    const intensity = /震度|intensity|how strong/iu.test(q);
    const local = /ここ|当地|この地域|選択(?:した|中の)?地域|local|here|this (?:area|municipality)/iu.test(q)
      || context.areaName?.split(/[\s　]+/u).filter(Boolean).some(name => q.includes(name));
    if (intensity) fields.add(local ? "selectedMunicipalityIntensity" : "maxObservedIntensity");
    if (intensity && local && /全国|全体|nation|overall/iu.test(q)) fields.add("maxObservedIntensity");
    add("tsunamiComment", /津波|tsunami/iu);
  } else if (context.topic === "tsunami") {
    add("height", /高さ|何m|何メートル|height|how high/iu);
    add("arrival", /到達|到着|いつ|何時|arrival|arriv|when/iu);
    add("state", /有効|発表中|解除|現在|まだ|状態|status|in effect|still|valid|cancel/iu);
  } else {
    add("warnings", /警報|注意報|warning|advisor/iu);
    add("period", /いつまで|時間帯|何時|期間|until|how long|time band/iu);
    add("action", /避難|対処|気をつけ|行動|evacuat|what should|precaution/iu);
  }
  return {fields: [...fields], countOnly: /何件|何回|how many/iu.test(q) && !/一覧|列挙|それぞれ|各地震|list|each/iu.test(q)};
}

const warningKinds = [
  ["大雨", /大雨|heavy rain/iu], ["大雪", /大雪|heavy snow/iu], ["暴風雪", /暴風雪|snowstorm/iu],
  ["暴風", /暴風(?!雪)|storm warning/iu], ["強風", /強風|strong wind|gale/iu], ["風雪", /(?<!暴)風雪|snow and wind/iu],
  ["波浪", /波浪|high wave/iu], ["高潮", /高潮|storm surge/iu], ["洪水", /洪水|flood/iu],
  ["雷", /雷|thunder/iu], ["濃霧", /濃霧|dense fog/iu], ["乾燥", /乾燥|dry air/iu],
  ["低温", /低温|low temperature/iu], ["霜", /霜|frost/iu], ["融雪", /融雪|snow melt/iu],
  ["なだれ", /なだれ|avalanche/iu], ["着氷", /着氷|icing/iu], ["着雪", /着雪|snow accretion/iu]
];
export function warningChatRequestedWarningKinds(question) {
  const q = question.normalize("NFKC");
  return warningKinds.filter(([, pattern]) => pattern.test(q)).map(([kind]) => kind);
}

export function warningChatFocusInstruction(input, context) {
  const {fields, countOnly} = warningChatFocus(input, context);
  const kinds = context.topic === "weather" ? warningChatRequestedWarningKinds(input.question) : [];
  return `Answer only the CURRENT question. ${countOnly ? "Give the count and search scope, not an event list. " : ""}${fields.length ? `Requested aspects: ${fields.join(", ")}. ` : ""}${kinds.length ? `Requested warning types only: ${kinds.join(", ")}. ` : ""}Start with the direct answer. Do not append unrequested fields, glossary definitions, other hazards, or preparedness advice. Add only a brief caveat essential to interpreting this answer safely. For a follow-up, use history to identify the subject, not to repeat the previous answer. If the subject is ambiguous, ask one short clarification. An explicit explanation, comparison or multi-part request still needs each requested part.`;
}
