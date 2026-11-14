export const JMA_BOSAI = "https://www.jma.go.jp/bosai";
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const areaCatalogs = new WeakMap();

export async function fetchWarningChatText(url, { fetcher = fetch, fresh = false, accept = "text/html" } = {}) {
  // Workers does not implement redirect:"error". Reject 3xx via !ok without
  // following Location, preserving the fixed-source boundary on every runtime.
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: "manual", cf: { cacheTtl: fresh ? 0 : 20 }, headers: { Accept: accept } });
  if (!response.ok || !response.body) throw new Error("jma_unavailable");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) throw new Error("jma_response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function fetchWarningChatJson(url, options = {}) {
  return JSON.parse(await fetchWarningChatText(url, {...options, accept: "application/json"}));
}

export function validIssueTime(value, now) {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 60_000;
}

export async function revisionOf(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getWarningChatArea(areaCode, { fetcher = fetch, fresh = false, now = Date.now() } = {}) {
  if (!/^\d{7}$/u.test(areaCode)) throw new TypeError("市区町村を選択してください。");
  let cached = areaCatalogs.get(fetcher);
  if (!cached || cached.expiresAt <= now) {
    cached = { value: await fetchWarningChatJson(`${JMA_BOSAI}/common/const/area.json`, { fetcher, fresh }), expiresAt: now + 3600_000 };
    areaCatalogs.set(fetcher, cached);
  }
  const catalog = cached.value;
  const area = catalog.class20s?.[areaCode];
  const class10Code = catalog.class15s?.[area?.parent]?.parent;
  const officeCode = catalog.class10s?.[class10Code]?.parent;
  if (!area?.name || !/^\d{6}$/u.test(officeCode ?? "")) throw new TypeError("area_not_found");
  return { catalog, area, class10Code, officeCode, areaName: `${catalog.offices?.[officeCode]?.name ?? ""} ${area.name}`.trim() };
}
