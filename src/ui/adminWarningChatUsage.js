export function renderWarningChatUsage(root, metrics = {}) {
  if (!root) return;
  const number = (value, digits = 0) => typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "取得不可";
  const fields = [
    ["稼働設定", metrics.providerExhausted ? "停止（本日のAI無料枠に到達）" : metrics.enabled && metrics.aiBound ? metrics.available && metrics.accepting === false ? "停止（本日の受付予算を確保できません）" : "有効（EA限定）" : "停止・未設定"],
    ["今日の受付（失敗含む）", `${number(metrics.requestCount)}回`],
    ["公式資料の照会（AI未使用・失敗含む）", `${number(metrics.lookupRequests)}回`],
    ["全体の回数上限", metrics.available && metrics.dailyLimit === null ? "なし（AI使用量で自動停止）" : `${number(metrics.dailyLimit)}回/日`],
    ["1アカウントの上限", `${number(metrics.perAccountLimit)}回/日`],
    ["AI応答で確認できた使用量", `${number(metrics.reportedNeurons, 2)} Neurons（このチャットのみ）`],
    ["使用量が未確定の受付", `${number(metrics.unconfirmedRequests)}件`],
    ["使用量未確定分の予約", `${number(metrics.reservedNeurons)} Neurons`],
    ["チャットの使用量上限（予約含む）", `${number(metrics.budgetNeurons)} Neurons/日`],
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
