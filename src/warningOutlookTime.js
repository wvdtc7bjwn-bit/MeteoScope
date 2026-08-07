const WARNING_OUTLOOK_TIME_ZONE = "Asia/Tokyo";

export function parseWarningOutlookDurationHours(value) {
  const match = String(value ?? "").trim().match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?)?$/i
  );
  if (!match) return 0;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const durationHours = days * 24 + hours + minutes / 60;
  return Number.isFinite(durationHours) ? durationHours : 0;
}

export function formatWarningOutlookTime(slot, { language = "ja" } = {}) {
  const display = getWarningOutlookTimeDisplay(slot, { language });
  return display.dateLabel
    ? `${display.dateLabel} ${display.timeLabel}`
    : display.timeLabel;
}

export function getWarningOutlookTimeDisplay(slot, { language = "ja" } = {}) {
  if (slot?.displayLabel) {
    return { dateLabel: "", timeLabel: String(slot.displayLabel) };
  }

  const start = new Date(slot?.time ?? "");
  if (Number.isNaN(start.getTime())) return { dateLabel: "", timeLabel: "--" };

  const startHour = formatOutlookHour(start, language);
  const durationHours = parseWarningOutlookDurationHours(slot?.duration);
  if (!(durationHours > 0)) return { dateLabel: "", timeLabel: startHour };

  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  if (Number.isNaN(end.getTime())) return { dateLabel: "", timeLabel: startHour };

  const endHour = formatOutlookHour(end, language);
  const startDateKey = getTokyoDateKey(start);
  const endDateKey = getTokyoDateKey(end);
  if (startDateKey === endDateKey) {
    return { dateLabel: "", timeLabel: `${startHour}–${endHour}` };
  }

  const startDate = formatOutlookDate(start, language);
  const endDate = formatOutlookDate(end, language);
  if (language !== "en" && getNextTokyoDateKey(start) === endDateKey) {
    return { dateLabel: startDate, timeLabel: `${startHour}–翌日${endHour}` };
  }
  return {
    dateLabel: `${startDate}–${endDate}`,
    timeLabel: `${startHour}–${endHour}`
  };
}

function formatOutlookHour(date, language) {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ja-JP", {
    hour: "2-digit",
    minute: language === "en" ? "2-digit" : undefined,
    hourCycle: "h23",
    timeZone: WARNING_OUTLOOK_TIME_ZONE
  }).format(date);
}

function formatOutlookDate(date, language) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: WARNING_OUTLOOK_TIME_ZONE
  }).format(date);
}

function getTokyoDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: WARNING_OUTLOOK_TIME_ZONE
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function getNextTokyoDateKey(date) {
  return getTokyoDateKey(new Date(date.getTime() + 24 * 60 * 60 * 1000));
}
