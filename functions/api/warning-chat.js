import { authenticateAccount } from "../_shared/accountAuth.js";
import { getAccountEarlyAccess } from "../_shared/accountEarlyAccess.js";
import { loadWarningChatContext } from "../_shared/warningChatContext.js";
import { buildWarningChatMessages, parseWarningChatAnswer } from "../_shared/warningChatAnswer.js";
import { reserveWarningChatQuota, recordWarningChatInferenceUsage, readWarningChatOperationalMetrics, warningChatDailyLimit, isWarningChatAllocationError, stopWarningChatForDay } from "../_shared/warningChatQuota.js";
import { normalizeWarningChatInput, normalizeWarningChatSelection, WARNING_CHAT_MODEL, WARNING_CHAT_LIMITS } from "../../src/ai/warningChatPolicy.js";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: HEADERS }); }

export async function onRequest(context) {
  const { request, env = {} } = context;
  const origin = request.headers.get("Origin");
  const hostOrigin = new URL(request.url).origin;
  const allowed = !origin || origin === hostOrigin || origin === "https://wvdtc7bjwn-bit.github.io";
  if (!allowed) return json({ error: "許可されていない接続元です。" }, 403);
  const response = request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: HEADERS })
    : await handleRequest(context);
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  return response;
}

async function handleRequest(context) {
  const { request, env = {} } = context;
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
  const db = env.NOTIFICATIONS_DB;
  if (!db) return json({ error: "AIチャットは未設定です。気象庁の情報をご確認ください。", configured: false }, 503);
  try {
    const access = await getAccountEarlyAccess(request, db);
    if (!access.active) return json({ error: access.error, configured: false }, access.authenticated ? 403 : 401);
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams;
      const areaCode = query.get("areaCode");
      if (areaCode) return json({ context: await loadWarningChatContext(areaCode, normalizeWarningChatSelection(Object.fromEntries(query))) });
      const metrics = await readWarningChatOperationalMetrics(env);
      return json({ configured: env.WARNING_CHAT_ENABLED === "true" && typeof env.AI?.run === "function" && metrics.accepting,
        message: !metrics.available ? "AIの利用状態を確認できません。" : !metrics.accepting ? "本日のAI利用枠に達したため受付を停止しています。日本時間9時に再開します。" : "",
        limits: { ...WARNING_CHAT_LIMITS, daily: warningChatDailyLimit(env.WARNING_CHAT_DAILY_LIMIT) } });
    }
    // No browser-supplied bypass, model, budget, source URL or AI credentials.
    if (env.WARNING_CHAT_ENABLED !== "true" || typeof env.AI?.run !== "function") return json({ error: "AI回答は準備中です。気象庁の情報は引き続き確認できます。" }, 503);
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSONで送信してください。" }, 415);
    const input = normalizeWarningChatInput(await readInput(request));
    const auth = await authenticateAccount(request, db);
    if (!auth) return json({ error: "再度ログインしてください。" }, 401);
    const reservation = await reserveWarningChatQuota(db, auth.account.id, { dailyLimit: env.WARNING_CHAT_DAILY_LIMIT });
    if (!reservation) return json({ error: "本日の個人上限またはAI利用枠に達しました。日本時間9時に再開します。気象庁の情報をご確認ください。" }, 429);
    const { reservationId: _reservationId, ...quota } = reservation;
    const selection = { ...normalizeWarningChatSelection(input), fresh: true };
    const official = await loadWarningChatContext(input.areaCode, selection);
    const messages = buildWarningChatMessages(input, official);
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("ai_timeout")), 35_000); });
    let result;
    try {
      // Exactly one inference per reservation; no automatic retries or refund.
      const inference = env.AI.run(WARNING_CHAT_MODEL, {
        messages, max_completion_tokens: WARNING_CHAT_LIMITS.outputTokens, n: 1, stream: false,
        // Short evidence-bound explanations must not spend the entire output
        // budget on hidden reasoning. Supported by this model's CF schema.
        chat_template_kwargs: { enable_thinking: false },
        temperature: 0.2, store: false, response_format: { type: "json_object" }
      }).then(async (value) => {
        try { await recordWarningChatInferenceUsage(db, reservation, value); }
        catch { console.warn("[warning-chat] usage recording unavailable"); }
        return value;
      }).catch(async (error) => {
        if (isWarningChatAllocationError(error)) await stopWarningChatForDay(db);
        throw error;
      });
      // A timeout is not a second inference. If the provider eventually returns,
      // allow its usage aggregate to finish even after the HTTP response ends.
      if (typeof context.waitUntil === "function") context.waitUntil(inference.then(() => {}, () => {}));
      result = await Promise.race([inference, timeout]);
    } finally { clearTimeout(timer); }
    const answer = parseWarningChatAnswer(result, official);
    // Keep "latest" unpinned if that was the request, so a new earthquake or
    // tsunami report arriving during generation invalidates the old answer.
    const latest = await loadWarningChatContext(input.areaCode, selection);
    const latestAccess = await getAccountEarlyAccess(request, db);
    if (!latestAccess.active) return json({ error: "アーリーアクセスの権限を再確認してください。" }, 403);
    if (latest.revision !== official.revision) return json({ error: "気象庁の情報が更新されました。古い回答は表示していません。最新情報を確認して質問し直してください。", context: latest, quota }, 409);
    return json({ ...answer, context: latest, quota, model: "Gemma 4", generatedAt: new Date().toISOString() });
  } catch (error) {
    if (isWarningChatAllocationError(error)) return json({ error: "本日のAI無料利用枠に達したため受付を停止しました。日本時間9時に再開します。気象庁の情報は引き続き確認できます。" }, 429);
    if (error instanceof TypeError || error instanceof RangeError) return json({ error: error.message }, 400);
    // No questions, bulletin payloads, session tokens or account IDs in logs.
    console.warn("[warning-chat] request failed", error?.name === "TimeoutError" ? "source_timeout" : "source_or_inference_unavailable");
    return json({ error: "最新情報の確認またはAI回答に失敗しました。自動再送は行いません。気象庁の元情報をご確認ください。" }, 503);
  }
}

async function readInput(request) {
  if (Number(request.headers.get("Content-Length")) > 8192) throw new RangeError("質問データが長すぎます。");
  if (!request.body) throw new TypeError("質問を入力してください。");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) throw new RangeError("質問データが長すぎます。");
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new TypeError("質問データを確認してください。"); }
}
