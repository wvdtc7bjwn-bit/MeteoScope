import { runWarningPushCheck } from "../functions/api/push/[[path]].js";
import { runQuizMaintenance } from "../functions/_shared/quizMaintenance.js";

const QUIZ_MAINTENANCE_UTC_HOUR = 15;
const QUIZ_MAINTENANCE_UTC_MINUTE = 0;

export default {
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller?.scheduledTime ?? Date.now());
    const tasks = [runWarningPushCheck(env)];
    if (shouldRunQuizMaintenance(scheduledAt)) {
      tasks.push(runQuizMaintenance(env, { now: scheduledAt }));
    }
    ctx.waitUntil(Promise.all(tasks));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/check") {
      return new Response("Not found", { status: 404 });
    }
    if (env.PUSH_CHECK_TOKEN) {
      const token = request.headers.get("X-Push-Check-Token") || url.searchParams.get("token");
      if (token !== env.PUSH_CHECK_TOKEN) return new Response("Forbidden", { status: 403 });
    }
    const result = await runWarningPushCheck(env);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
};

export function shouldRunQuizMaintenance(date) {
  return date.getUTCHours() === QUIZ_MAINTENANCE_UTC_HOUR
    && date.getUTCMinutes() === QUIZ_MAINTENANCE_UTC_MINUTE;
}
