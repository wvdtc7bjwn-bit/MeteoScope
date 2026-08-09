import { readJson, writeJson } from "../../_shared/d1Store.js";
import {
  createFeedbackRecord,
  isFeedbackEmail,
  isFeedbackId,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  publicFeedbackStatus
} from "../../_shared/feedbackSupport.js";

const FEEDBACK_KEY = "user-feedback";
const MAX_FEEDBACK_ITEMS = 250;
const MAX_STATUS_IDS = 8;

export async function onRequestPost({ request, env }) {
  try {
    if (!env.NOTIFICATIONS_DB) {
      return json({ ok: false, error: "Feedback storage is not configured." }, { status: 503 });
    }
    if (!isSameOriginRequest(request)) {
      return json({ ok: false, error: "Unsupported request origin." }, { status: 403 });
    }
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 8_192) {
      return json({ ok: false, error: "Request is too large." }, { status: 413 });
    }

    const payload = await request.json().catch(() => ({}));
    const message = String(payload.message || "").trim().slice(0, MAX_FEEDBACK_MESSAGE_LENGTH);
    if (message.length < 2) {
      return json({ ok: false, error: "Message is too short." }, { status: 400 });
    }
    if (!isFeedbackEmail(payload.email)) {
      return json({ ok: false, error: "Enter a valid reply email or leave it blank." }, { status: 400 });
    }

    const createdAt = new Date().toISOString();
    const feedback = createFeedbackRecord(
      { ...payload, message },
      { id: crypto.randomUUID(), now: createdAt }
    );

    const current = await readJson(env.NOTIFICATIONS_DB, FEEDBACK_KEY, []);
    const next = [feedback, ...(Array.isArray(current) ? current : [])].slice(0, MAX_FEEDBACK_ITEMS);
    await writeJson(env.NOTIFICATIONS_DB, FEEDBACK_KEY, next);

    return json({ ok: true, id: feedback.id, createdAt: feedback.createdAt, status: feedback.status });
  } catch (error) {
    console.error("[Feedback API]", error);
    return json({ ok: false, error: "Feedback could not be saved." }, { status: 500 });
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.NOTIFICATIONS_DB) {
      return json({ ok: false, error: "Feedback storage is not configured." }, { status: 503 });
    }
    const ids = [...new Set(new URL(request.url).searchParams.getAll("id"))]
      .filter(isFeedbackId)
      .slice(0, MAX_STATUS_IDS);
    if (!ids.length) return json({ ok: false, error: "A support ticket is required." }, { status: 400 });

    const feedback = await readJson(env.NOTIFICATIONS_DB, FEEDBACK_KEY, []);
    const items = Array.isArray(feedback) ? feedback : [];
    const byId = new Map(items.map((item) => [String(item?.id || ""), item]));
    return json({
      ok: true,
      feedback: ids.map((id) => byId.get(id)).filter(Boolean).map(publicFeedbackStatus)
    });
  } catch (error) {
    console.error("[Feedback API]", error);
    return json({ ok: false, error: "Feedback status could not be loaded." }, { status: 500 });
  }
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers || {})
    }
  });
}

function isSameOriginRequest(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
