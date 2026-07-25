const payloads = new Map();

export function setSocialSharePayload(type, payload) {
  const key = String(type ?? "").trim();
  if (!key) return;
  if (payload) {
    payloads.set(key, structuredClone(payload));
  } else {
    payloads.delete(key);
  }
}

export function getSocialSharePayload(type) {
  const payload = payloads.get(String(type ?? "").trim());
  return payload ? structuredClone(payload) : null;
}
