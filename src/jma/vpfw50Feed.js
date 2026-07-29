const JMA_FORECAST_URL_PATTERN =
  /https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/[0-9_A-Z]+_([A-Z0-9]{6})_(\d{6})\.xml/gu;
const BULLETIN_CODE_PATTERN = /^[A-Z0-9]{6}$/u;

export function extractJmaForecastUrls(feed, bulletinCode) {
  const normalizedCode = String(bulletinCode ?? "").trim().toUpperCase();
  if (!BULLETIN_CODE_PATTERN.test(normalizedCode)) return [];
  return [...String(feed ?? "").matchAll(JMA_FORECAST_URL_PATTERN)]
    .filter((match) => match[1] === normalizedCode)
    .map((match) => match[0])
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

export function extractVpFw50Urls(feed) {
  return extractJmaForecastUrls(feed, "VPFW50");
}

export function findLatestJmaForecastDetailUrl(feed, officeCode, bulletinCode) {
  const normalizedCode = String(bulletinCode ?? "").trim().toUpperCase();
  const suffix = `_${normalizedCode}_${String(officeCode ?? "")}.xml`;
  return extractJmaForecastUrls(feed, normalizedCode)
    .filter((url) => url.endsWith(suffix))
    .sort()
    .reverse()[0] ?? "";
}

export function findLatestVpFw50DetailUrl(feed, officeCode) {
  return findLatestJmaForecastDetailUrl(feed, officeCode, "VPFW50");
}

export function isVpFw50Xml(value) {
  return isJmaForecastXml(value);
}

export function isJmaForecastXml(value) {
  const xml = String(value ?? "").trim();
  const element = (localName) => new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s|>)`, "u");
  return element("Report").test(xml)
    && element("MeteorologicalInfos").test(xml)
    && element("WeatherCode").test(xml);
}
