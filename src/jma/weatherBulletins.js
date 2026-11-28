import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson, fetchText } from "./jmaClient.js";

const ATOM = "http://www.w3.org/2005/Atom";
const PRODUCTS = {
  VPZJ51: ["national", "weather-national", 2], VPZJ50: ["national", "weather-national", 1],
  VPCJ51: ["regional", "weather-regional", 2], VPCJ50: ["regional", "weather-regional", 1],
  VPFJ51: ["prefectural", "weather-prefectural", 2], VPFJ50: ["prefectural", "weather-prefectural", 1],
  VMCJ53: ["national", "tide-national", 2], VMCJ50: ["national", "tide-national", 1],
  VMCJ54: ["regional", "tide-regional", 2], VMCJ51: ["regional", "tide-regional", 1],
  VMCJ55: ["prefectural", "tide-prefectural", 2], VMCJ52: ["prefectural", "tide-prefectural", 1],
  VPBS50: ["flash", "weather-flash", 2], VP0A50: ["flash", "weather-flash", 1],
  VPBS51: ["flash", "tide-flash", 2],
  VPHW51: ["flash", "tornado", 2], VPHW50: ["flash", "tornado", 1]
};
const FEEDS = [
  [JMA_ENDPOINTS.riverFloodXmlFeed, 60_000],
  [JMA_ENDPOINTS.riverFloodXmlLongFeed, 15 * 60_000]
];
const REPORT_URL = /^https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/\d{14}_\d+_([A-Z0-9]{6})_(\d{6})\.xml$/u;
const FLASH_TITLE = /気象防災速報|記録的短時間大雨情報|顕著な大雨に関する|顕著な大雪に関する/u;
const RESULT_LIMIT = 8;
const CANDIDATE_LIMIT = 16;
const REPORT_BATCH = 4;
export const FLASH_DISPLAY_HOURS_WITHOUT_EXPIRY = 3;

function parseXml(source, name, namespace) {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root?.localName !== name || (namespace && root.namespaceURI !== namespace)) {
    throw new Error(`Invalid JMA ${name} XML`);
  }
  return root;
}

function child(node, name) {
  return Array.from(node?.children ?? []).find((item) => item.localName === name);
}

function value(node, name) {
  return (name ? child(node, name) : node)?.textContent?.trim() ?? "";
}

export function parseWeatherBulletinFeed(source) {
  const feed = parseXml(source, "feed", ATOM);
  return Array.from(feed.getElementsByTagNameNS(ATOM, "entry")).flatMap((entry) => {
    const url = child(entry, "link")?.getAttribute("href") ?? "";
    const match = REPORT_URL.exec(url);
    const product = PRODUCTS[match?.[1]];
    const updatedAt = value(entry, "updated");
    if (!product || !Number.isFinite(Date.parse(updatedAt))) return [];
    const [code, office] = match.slice(1);
    const [defaultScope, defaultFamily, priority] = product;
    const content = value(entry, "content");
    const title = value(entry, "title");
    const subject = /^【([^】]+)】/u.exec(content)?.[1] ?? "";
    const legacyFlash = (code === "VPFJ50" || code === "VMCJ52") && FLASH_TITLE.test(subject || title);
    return [{
      url, code, office, updatedAt, content, title, priority,
      scope: legacyFlash ? "flash" : defaultScope,
      family: legacyFlash ? (code === "VMCJ52" ? "tide-flash" : "weather-flash") : defaultFamily
    }];
  });
}

export function parseWeatherBulletinReport(source, entry) {
  const root = parseXml(source, "Report");
  const control = child(root, "Control");
  const head = child(root, "Head");
  if (value(control, "Status") !== "通常") return null;
  const title = value(head, "Title");
  const issuedAt = value(head, "ReportDateTime") || value(head, "TargetDateTime");
  const infoType = value(head, "InfoType");
  if (!title || !Number.isFinite(Date.parse(issuedAt)) || !["発表", "訂正", "取消"].includes(infoType)) {
    throw new Error("Incomplete JMA weather bulletin");
  }
  const headline = value(child(head, "Headline"), "Text");
  const body = child(root, "Body");
  const paragraphs = Array.from(body?.getElementsByTagNameNS("*", "Text") ?? [])
    .filter((node) => node.getAttribute("type") === "本文")
    .map((node) => ({
      title: node.parentNode?.localName === "Property" ? value(node.parentNode, "Type") : "",
      text: value(node)
    }))
    .filter((part) => part.text && part.text !== headline);
  const events = Array.from(body?.getElementsByTagNameNS("*", "Item") ?? []).flatMap((item) => {
    const areaName = value(child(item, "Area"), "Name");
    return Array.from(item.getElementsByTagNameNS("*", "Event")).flatMap((event) => {
      const name = value(event, "EventName");
      return name ? [{ name, areaName, time: value(event, "Time") }] : [];
    });
  });

  return {
    ...entry, title, issuedAt, infoType, headline, paragraphs, events,
    eventId: value(head, "EventID"),
    validUntil: value(head, "ValidDateTime"),
    publisher: value(control, "PublishingOffice")
  };
}

export function getWeatherBulletinOffice(area, areaCode) {
  let code = String(areaCode ?? "");
  for (const bucket of ["class20s", "class15s", "class10s"]) {
    code = area?.[bucket]?.[code]?.parent ?? code;
  }
  return area?.offices?.[code] ? code : "";
}

export function getWeatherFlashDisplayUntil(report) {
  const officialExpiry = Date.parse(report.validUntil);
  if (Number.isFinite(officialExpiry)) return officialExpiry;
  // Observation bulletins can omit an official expiry. Limit how long the app displays them.
  return Date.parse(report.issuedAt) + FLASH_DISPLAY_HOURS_WITHOUT_EXPIRY * 60 * 60_000;
}

function compareUpdates(a, b) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.priority - a.priority;
}

function selectEntries(entries, { scope, region, area }) {
  const coverage = scope === "local"
    ? { regional: area?.offices?.[region]?.parent, prefectural: area?.offices?.[region] ? region : "" }
    : { [scope]: region };
  const byUrl = new Map();
  for (const entry of entries) {
    if (!Object.hasOwn(coverage, entry.scope)) continue;
    const target = coverage[entry.scope];
    if (scope === "local" && !target) continue;
    const reportRegion = entry.scope === "regional" ? area?.offices?.[entry.office]?.parent : entry.office;
    if (target && reportRegion !== target) continue;
    byUrl.set(entry.url, entry);
  }
  const groups = new Map();
  for (const entry of [...byUrl.values()].sort(compareUpdates)) {
    // Parallel publications share the Atom timestamp and summary. Prefer the richer format.
    const key = entry.content
      ? JSON.stringify([entry.family, entry.office, entry.updatedAt, entry.content])
      : entry.url;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].slice(0, CANDIDATE_LIMIT);
}

function latestReports(reports) {
  const seenEvents = new Set();
  const seenIssues = new Set();
  return [...reports].sort(compareUpdates).filter((report) => {
    // Some reports (such as tornado alerts) have no EventID.
    const eventKey = JSON.stringify([report.family, report.office, report.eventId]);
    const issueKey = JSON.stringify([report.family, report.office, report.issuedAt, report.title]);
    const seen = (report.eventId && seenEvents.has(eventKey)) || seenIssues.has(issueKey);
    if (report.eventId) seenEvents.add(eventKey);
    seenIssues.add(issueKey);
    return !seen && report.infoType !== "取消";
  }).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
}

export function createWeatherBulletinReader({ text = fetchText, json = fetchJson, now = Date.now } = {}) {
  const parsedFeeds = new Map();

  async function fetchEntries(url, ttlMs, signal) {
    const source = await text(url, { ttlMs, cache: "no-store", staleIfError: false, signal });
    const cached = parsedFeeds.get(url);
    if (cached?.source === source) return cached.entries;
    const entries = parseWeatherBulletinFeed(source);
    parsedFeeds.set(url, { source, entries });
    return entries;
  }

  async function fetchReport(candidates, signal) {
    for (const entry of candidates) {
      try {
        return parseWeatherBulletinReport(await text(entry.url, { ttlMs: 60 * 60_000, retryCount: 0, signal }), entry);
      } catch (error) {
        if (signal?.aborted || entry === candidates.at(-1)) throw error;
      }
    }
  }

  return {
    loadAreas: () => json(JMA_ENDPOINTS.areaConst, { ttlMs: 24 * 60 * 60_000 }),
    async loadReports(filter, { signal } = {}) {
      const feeds = await Promise.allSettled(FEEDS.map(([url, ttl]) => fetchEntries(url, ttl, signal)));
      signal?.throwIfAborted();
      if (feeds.every((feed) => feed.status === "rejected")) throw feeds[0].reason;
      let partial = feeds.some((feed) => feed.status === "rejected");
      const entries = feeds.flatMap((feed) => feed.value ?? []);
      const groups = selectEntries(entries, filter);
      const received = [];
      for (let i = 0; i < groups.length; i += REPORT_BATCH) {
        const batch = await Promise.allSettled(groups.slice(i, i + REPORT_BATCH).map((group) => fetchReport(group, signal)));
        signal?.throwIfAborted();
        partial ||= batch.some((result) => result.status === "rejected");
        received.push(...batch.flatMap((result) => result.value ? [result.value] : []));
      }
      const asOf = now();
      const reports = latestReports(received)
        .filter((report) => report.scope !== "flash" || getWeatherFlashDisplayUntil(report) > asOf)
        .slice(0, RESULT_LIMIT);
      return { reports, partial };
    }
  };
}
