const communityReportTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const earthquakeDistributionTimeFormatters = Object.freeze({
  short: new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }),
  withYear: new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
});

const worldForecastTimeFormatters = Object.freeze({
  short: new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }),
  withYear: new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
});

export function formatCommunityReportTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時刻不明";
  return communityReportTimeFormatter.format(date);
}

export function formatDistributionOriginTime(value, includeYear = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value ?? "時刻不明");
  return earthquakeDistributionTimeFormatters[includeYear ? "withYear" : "short"].format(date);
}

export function formatWorldForecastMapTime(value, includeYear = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時刻未取得";
  return worldForecastTimeFormatters[includeYear ? "withYear" : "short"].format(date);
}
