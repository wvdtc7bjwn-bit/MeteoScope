import { JMA_ENDPOINTS, JMA_WARNING_OFFICE_CODES } from "../config.js";
import { fetchXml } from "./jmaClient.js";

const WARNING_LINK_PATTERN = /_VPWW53_(\d{6})\.xml$/;

export async function fetchLatestWarningXmlDocuments() {
  const entries = await fetchXmlFeedEntries(JMA_ENDPOINTS.xmlFeedExtraLong);
  const latestByOffice = new Map();
  const officeCodes = new Set(JMA_WARNING_OFFICE_CODES);

  entries.forEach((entry) => {
    const match = entry.link.match(WARNING_LINK_PATTERN);
    const officeCode = match?.[1];
    if (!officeCode || !officeCodes.has(officeCode) || latestByOffice.has(officeCode)) return;
    latestByOffice.set(officeCode, entry);
  });

  const settled = await Promise.allSettled(
    [...latestByOffice.values()].map((entry) => fetchXml(entry.link))
  );
  return settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

export async function fetchLatestTyphoonXmlDocuments() {
  const entries = [
    ...await fetchXmlFeedEntries(JMA_ENDPOINTS.xmlFeedExtra),
    ...await fetchXmlFeedEntries(JMA_ENDPOINTS.xmlFeedRegular)
  ];
  const typhoonEntries = dedupeEntries(entries)
    .filter((entry) => /台風|熱帯低気圧/.test(entry.title))
    .slice(0, 20);

  const settled = await Promise.allSettled(
    typhoonEntries.map((entry) => fetchXml(entry.link))
  );
  return settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

export async function fetchXmlFeedEntries(feedUrl) {
  const document = await fetchXml(feedUrl);
  return childrenByName(document.documentElement, "entry").map((entry) => {
    const linkElement = firstChildByName(entry, "link");
    return {
      title: textOf(firstChildByName(entry, "title")),
      updated: textOf(firstChildByName(entry, "updated")),
      link: linkElement?.getAttribute("href") ?? textOf(linkElement)
    };
  }).filter((entry) => entry.link);
}

export function childrenByName(node, name) {
  return [...(node?.children ?? [])].filter((child) => child.localName === name);
}

export function descendantsByName(node, name) {
  const matches = [];
  const visit = (current) => {
    [...(current?.children ?? [])].forEach((child) => {
      if (child.localName === name) matches.push(child);
      visit(child);
    });
  };
  visit(node);
  return matches;
}

export function firstChildByName(node, name) {
  return childrenByName(node, name)[0] ?? null;
}

export function firstDescendantByName(node, name) {
  return descendantsByName(node, name)[0] ?? null;
}

export function textOf(node) {
  return node?.textContent?.trim() ?? "";
}

export function attrOf(node, name) {
  return node?.getAttribute(name) ?? "";
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.link)) return false;
    seen.add(entry.link);
    return true;
  });
}
