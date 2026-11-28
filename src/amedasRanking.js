import { temperatureObservationTime } from "./location/temperatureObservation.js";

const rankingClock = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tokyo"
});

export function formatAmedasRankingClock(value) {
  const text = String(value ?? "").trim();
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/u);
  if (clock && Number(clock[1]) <= 24 && Number(clock[2]) < 60 && (Number(clock[1]) < 24 || clock[2] === "00")) {
    return `${clock[1].padStart(2, "0")}:${clock[2]}`;
  }
  const time = temperatureObservationTime(text);
  return time ? rankingClock.format(new Date(time)) : "--:--";
}

export function assignAmedasCompetitionRanks(items = []) {
  let previousValue;
  let currentRank = 0;

  return items.map((item, index) => {
    const value = Number(item?.value);
    if (index === 0 || value !== previousValue) {
      currentRank = index + 1;
    }
    previousValue = value;
    return { ...item, rank: currentRank };
  });
}
