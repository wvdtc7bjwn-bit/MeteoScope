export function renderWarningChatUsage(root, metrics = {}) {
  if (!root) return;
  const number = (value, digits = 0) => typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "取得不可";
  const fields = [
    ["稼働設定", metrics.enabled && metrics.aiBound ? "有効（EA限定）" : "停止・未設定"],
    ["今日の受付（失敗含む）", `${number(metrics.requestCount)} / ${number(metrics.dailyLimit)}回`],
    ["残り受付", `${number(metrics.remainingRequests)}回`],
    ["1アカウントの上限", `${number(metrics.perAccountLimit)}回/日`],
    ["AI応答で確認できた使用量", `${number(metrics.reportedNeurons, 2)} Neurons（このチャットのみ）`],
    ["使用量が未確定の受付", `${number(metrics.unconfirmedRequests)}件`],
    ["受付分の保守的見積もり", `${number(metrics.reservedNeurons)} Neurons`],
    ["設定上限までの予算見積もり", `${number(metrics.budgetNeurons)} Neurons/日`],
    ["Cloudflare FreeのAI枠", `${number(metrics.freeDailyNeurons)} Neurons/日（アカウントで共有）`],
    ["アカウント全体のAI使用量", "この集計では取得できません。Cloudflare管理画面で確認してください。"],
    ["次の回数リセット", metrics.resetAt && Number.isFinite(Date.parse(metrics.resetAt))
      ? `${new Date(metrics.resetAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false })}（日本時間）` : "取得不可"]
  ];
  root.replaceChildren();
  for (const [label, value] of fields) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    root.append(row);
  }
}
