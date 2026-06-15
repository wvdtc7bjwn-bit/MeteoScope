export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: options.cache ?? "no-store",
    headers: {
      "Accept": "application/json,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`JMA request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    cache: options.cache ?? "no-store",
    headers: {
      "Accept": "text/plain,application/xml,text/xml,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`JMA request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function fetchXml(url, options = {}) {
  const text = await fetchText(url, options);
  const document = new DOMParser().parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`JMA XML parse failed: ${parserError.textContent?.trim() ?? "invalid XML"}`);
  }
  return document;
}

export function parseJmaTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date);
}
