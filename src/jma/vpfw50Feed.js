const VPFW50_URL_PATTERN =
  /https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/[0-9_A-Z]+_VPFW50_\d{6}\.xml/gu;

export function extractVpFw50Urls(feed) {
  return [...String(feed ?? "").matchAll(VPFW50_URL_PATTERN)]
    .map((match) => match[0])
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

export function findLatestVpFw50DetailUrl(feed, officeCode) {
  const suffix = `_VPFW50_${String(officeCode ?? "")}.xml`;
  return extractVpFw50Urls(feed)
    .filter((url) => url.endsWith(suffix))
    .sort()
    .reverse()[0] ?? "";
}

export function isVpFw50Xml(value) {
  const xml = String(value ?? "").trim();
  const element = (localName) => new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s|>)`, "u");
  return element("Report").test(xml)
    && element("MeteorologicalInfos").test(xml)
    && element("WeatherCode").test(xml);
}
