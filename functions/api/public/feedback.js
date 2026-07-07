const FEEDBACK_KEY = "user-feedback";
const MAX_FEEDBACK_ITEMS = 100;
const MAX_MESSAGE_LENGTH = 1000;

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ADMIN_KV) {
      return json({ ok: false, error: "Feedback storage is not configured." }, { status: 503 });
    }

    const payload = await request.json().catch(() => ({}));
    const message = String(payload.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (message.length < 2) {
      return json({ ok: false, error: "Message is too short." }, { status: 400 });
    }

    const feedback = {
      id: crypto.randomUUID(),
      category: normalizeCategory(payload.category),
      message,
      page: String(payload.page || "").slice(0, 200),
      createdAt: new Date().toISOString()
    };

    const current = await readJson(env.ADMIN_KV, FEEDBACK_KEY, []);
    const next = [feedback, ...(Array.isArray(current) ? current : [])].slice(0, MAX_FEEDBACK_ITEMS);
    await env.ADMIN_KV.put(FEEDBACK_KEY, JSON.stringify(next));

    return json({ ok: true, id: feedback.id, createdAt: feedback.createdAt });
  } catch (error) {
    console.error("[Feedback API]", error);
    return json({ ok: false, error: "Feedback could not be saved." }, { status: 500 });
  }
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed." }, { status: 405 });
}

async function readJson(kv, key, fallback) {
  const value = await kv.get(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCategory(value) {
  return ["request", "bug", "design", "other"].includes(value) ? value : "other";
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}
