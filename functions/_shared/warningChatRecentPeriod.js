// Request filters only; conversational text is never observation evidence.
// Keep JST day boundaries independent of the Worker/host timezone.
export function recentQuestionPeriod(input, now) {
  const reference = /^(?:その|それ|いつ|何時|どこ|震度|規模|深さ|何件|何回|一番|最も|when|where|how many|which|what)/iu.test(input.question);
  const previous = reference ? [...(input.history ?? [])].reverse().find(item => item.role === "user" && /今日|本日|昨日|today|yesterday/iu.test(item.content))?.content ?? "" : "";
  const question = /今日|本日|昨日|today|yesterday/iu.test(input.question) ? input.question : previous;
  const yesterday = /昨日|yesterday/iu.test(question);
  if (!yesterday && !/今日|本日|today/iu.test(question)) return null;
  const day = 86400_000;
  const todayStart = Math.floor((now + 9 * 3600_000) / day) * day - 9 * 3600_000;
  return {start: todayStart - (yesterday ? day : 0), end: todayStart + (yesterday ? 0 : day), yesterday};
}
