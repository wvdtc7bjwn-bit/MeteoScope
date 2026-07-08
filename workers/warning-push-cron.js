import { runWarningPushCheck } from "../functions/api/push/[[path]].js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runWarningPushCheck(env));
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
