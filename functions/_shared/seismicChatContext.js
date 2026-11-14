import { fetchWarningChatJson, getWarningChatArea, JMA_BOSAI, revisionOf, validIssueTime } from "./warningChatSources.js";

const INTENSITIES = new Set(["1", "2", "3", "4", "5", "5-", "5+", "6", "6-", "6+", "7"]);
const INTENSITY_ORDER = ["1", "2", "3", "4", "5-", "5", "5+", "6-", "6", "6+", "7"];
const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const intensity = (value) => INTENSITIES.has(text(value)) ? text(value) : null;
const time = (value, now) => validIssueTime(value, now) ? value : null;
const numeric = (value, min, max) => {
  if ((typeof value !== "number" && typeof value !== "string") || !String(value).trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

function coordinate(value) {
  const match = text(value).match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/$/u);
  if (!match) return { depthKm: null };
  if (numeric(match[1], -90, 90) === null || numeric(match[2], -180, 180) === null) return { depthKm: null };
  const metres = match[3] ? numeric(match[3], -750_000, 0) : null;
  return { depthKm: metres === null ? null : Math.abs(metres) / 1000 };
}

function reportOrder(a, b) {
  const serial = (entry) => /^\d+$/u.test(String(entry.ser ?? "")) ? Number(entry.ser) : 0;
  return Date.parse(b.rdt) - Date.parse(a.rdt) || serial(b) - serial(a)
    || Number(b.ift === "取消") - Number(a.ift === "取消") || b.json.localeCompare(a.json);
}

export function selectEntries(raw, topic, now) {
  if (!Array.isArray(raw)) throw new Error("invalid_seismic_list");
  const pattern = topic === "earthquake"
    ? /^\d{14}_\d{14}_VXSE5[123k]_[\w-]+\.json$/u
    : /^\d{14}_\d{14}_VTSE(?:41|51|52)_[\w-]+\.json$/u;
  const byEvent = new Map();
  const reports = [];
  for (const entry of raw) {
    if (!pattern.test(entry?.json ?? "")) continue;
    if (!/^\d{14}$/u.test(entry.eid ?? "") || !validIssueTime(entry.rdt, now)) throw new Error("invalid_seismic_list_time");
    reports.push(entry);
    const old = byEvent.get(entry.eid);
    if (!old || reportOrder(entry, old) < 0) byEvent.set(entry.eid, entry);
  }
  if (raw.length && !byEvent.size) throw new Error("unsupported_seismic_list");
  return { events: [...byEvent.values()].sort(reportOrder), reports: reports.sort(reportOrder) };
}

export function validateReport(raw, entry, now) {
  const head = raw?.Head;
  if (raw?.Control?.Status !== "通常" || !["発表", "訂正", "取消"].includes(head?.InfoType)
    || head.EventID !== entry.eid || !validIssueTime(head.ReportDateTime, now)
    || Date.parse(head.ReportDateTime) !== Date.parse(entry.rdt)) throw new Error("invalid_seismic_report");
  return head;
}

export function earthquakeSummary(raw, areaCode, now) {
  const body = raw?.Body ?? {};
  const quake = array(body.Earthquake)[0] ?? {};
  const observation = body.Intensity?.Observation ?? {};
  const areas = array(observation.Pref).flatMap((pref) => array(pref.Area));
  const city = areas.flatMap((area) => array(area.City)).find((item) => text(item.Code) === areaCode);
  const reportedAreas = areas.map((area) => ({ name: text(area.Name), intensity: intensity(area.MaxInt) }))
    .filter((area) => area.name && area.intensity)
    .sort((a, b) => INTENSITY_ORDER.indexOf(b.intensity) - INTENSITY_ORDER.indexOf(a.intensity));
  return {
    eventId: raw.Head.EventID, kind: text(raw.Head.Title), reportState: raw.Head.InfoType,
    eventTime: time(quake.OriginTime || quake.ArrivalTime, now),
    location: text(quake.Hypocenter?.Area?.Name) || null,
    magnitude: numeric(quake.Magnitude, -2, 10), ...coordinate(quake.Hypocenter?.Area?.Coordinate),
    maxObservedIntensity: intensity(observation.MaxInt),
    selectedMunicipalityIntensity: intensity(city?.MaxInt),
    selectedMunicipalityNote: city ? "この電文の選択市区町村の観測震度。" : "この電文では選択市区町村の観測震度を確認できません。震度0や揺れなしを意味しません。",
    intensityAreas: reportedAreas.slice(0, 8), omittedIntensityAreaCount: Math.max(0, reportedAreas.length - 8),
    intensityScope: "震度の大きい順の最大8区域と選択市区町村のみ。全観測点一覧ではありません。予想震度ではなく観測震度です。",
    tsunamiComment: text(body.Comments?.ForecastComment?.Text) || null,
    headline: text(raw.Head.Headline?.Text),
    timeScope: "過去に発生した地震の発表資料。EEWや現在進行中の揺れを示す情報ではありません。",
    isHistorical: now - Date.parse(raw.Head.ReportDateTime) > 86400_000
  };
}

function tsunamiAreas(raw) {
  return array(raw.Body?.Tsunami?.Forecast?.Item).map((item) => ({
    code: text(item.Area?.Code), name: text(item.Area?.Name),
    grade: text(item.Category?.Kind?.Name) || "種別調査中", gradeCode: text(item.Category?.Kind?.Code),
    arrivalTime: text(item.FirstHeight?.ArrivalTime) || null,
    arrivalCondition: text(item.FirstHeight?.Condition) || null,
    expectedHeight: text(item.MaxHeight?.TsunamiHeight) || null,
    heightCondition: text(item.MaxHeight?.Condition) || null
  })).filter((area) => /^\d{3}$/u.test(area.code) && area.name);
}

function tsunamiObservations(raw, offshore) {
  return array(raw.Body?.Tsunami?.Observation?.Item).flatMap((item) => array(item.Station).map((station) => ({
    areaCode: text(item.Area?.Code), areaName: text(item.Area?.Name), station: text(station.Name), offshore,
    arrivalTime: text(station.FirstHeight?.ArrivalTime) || null, arrivalCondition: text(station.FirstHeight?.Condition) || null,
    maxHeight: text(station.MaxHeight?.TsunamiHeight) || null,
    maxHeightTime: text(station.MaxHeight?.DateTime) || null, maxHeightCondition: text(station.MaxHeight?.Condition) || null
  }))).filter((station) => station.station);
}

export async function loadSeismicChatContext(areaCode, { topic, eventId = "", forecastAreaCode = "", fetcher = fetch, fresh = false, now = Date.now() } = {}) {
  const { areaName } = await getWarningChatArea(areaCode, { fetcher, fresh, now });
  const kind = topic === "earthquake" ? "quake" : "tsunami";
  const baseUrl = `${JMA_BOSAI}/${kind}/data/`;
  const index = selectEntries(await fetchWarningChatJson(`${baseUrl}list.json`, { fetcher, fresh }), topic, now);
  const entries = index.events;
  const chosen = eventId ? entries.find((item) => item.eid === eventId) : entries[0];
  const entry = topic === "tsunami" && chosen
    ? index.reports.find((item) => item.eid === chosen.eid && /_VTSE41_/u.test(item.json)) ?? chosen
    : chosen;
  if (eventId && !entry) throw new TypeError("選択した地震は気象庁の最新一覧から確認できません。対象を選び直してください。");
  const context = {
    topic, areaCode, areaName, fetchedAt: new Date(now).toISOString(), issuedAt: null,
    availability: entry ? "available" : "empty", earthquake: null, tsunami: null,
    selection: { eventId: entry?.eid ?? "", forecastAreaCode, events: entries.slice(0, 5).map((item) => ({
      id: item.eid, location: text(item.anm) || "震源調査中", eventTime: time(item.at, now), title: text(item.ttl)
    })), forecastAreas: [] },
    limitations: "最新に取得できた選択電文の資料のみ。全国の現在の津波警報の有無や選択市区町村と津波予報区の対応を推測しない。取得失敗、未掲載、欠測は安全や観測値0を意味しません。地震予知・独自の到達時刻計算・避難経路案内は行いません。",
    explanation: topic === "earthquake"
      ? "震度速報は観測震度の速報、震源に関する情報は震源や規模、震源・震度情報は各地の観測震度を含む情報です。未発表の規模や深さは調査中。地震情報中の津波コメントはその地震の発表時点のもので、独立した最新の津波警報と区別してください。今後の地震の発生や震度は予測できません。"
      : "津波は繰り返し襲い、後の波が高くなることがあります。警報・注意報が解除されるまで避難を続け、海や河口に近づかないでください。到達予想時刻は最も早い到達の見込みで、安全な猶予や解除時刻ではありません。観測高さと予想高さは異なり、観測情報が未取得なら観測値を作らないでください。",
    sources: [{ title: topic === "earthquake" ? "気象庁 地震情報" : "気象庁 津波警報・注意報・予報", url: `${JMA_BOSAI}/${kind === "quake" ? "quake/" : "tsunami/"}` },
      { title: "気象庁 情報の説明", url: `https://www.jma.go.jp/jma/kishou/know/jishin/joho/${topic === "earthquake" ? "seisinfo" : "tsunamiinfo"}.html` }]
  };
  if (entry) {
    const raw = await fetchWarningChatJson(baseUrl + entry.json, { fetcher, fresh });
    const head = validateReport(raw, entry, now);
    if (head.InfoType !== "取消" && (!raw.Body || (topic === "tsunami" && !raw.Body.Tsunami)
      || (topic === "earthquake" && !raw.Body.Earthquake && !raw.Body.Intensity))) throw new Error("missing_seismic_body");
    if (!context.selection.events.some((event) => event.id === entry.eid)) context.selection.events.push({ id: entry.eid, location: text(entry.anm) || "震源調査中", eventTime: time(entry.at, now), title: text(entry.ttl) });
    context.issuedAt = head.ReportDateTime;
    context.sources.push({ title: "回答根拠の気象庁電文（JSON）", url: baseUrl + entry.json });
    if (topic === "earthquake") context.earthquake = head.InfoType === "取消"
      ? { eventId: head.EventID, kind: text(head.Title), reportState: "取消", note: "取消済み。旧報の震源や震度を有効な情報として扱わないでください。" }
      : earthquakeSummary(raw, areaCode, now);
    else {
      const areas = tsunamiAreas(raw);
      const hasForecast = /_VTSE41_/u.test(entry.json);
      const selected = forecastAreaCode ? areas.filter((area) => area.code === forecastAreaCode) : areas;
      if (forecastAreaCode && !selected.length) throw new TypeError("選択した津波予報区はこの電文にありません。予報区を選び直してください。");
      const validUntil = head.ValidDateTime == null || head.ValidDateTime === "" ? null : String(head.ValidDateTime);
      if (validUntil && (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(validUntil) || !Number.isFinite(Date.parse(validUntil)))) throw new Error("invalid_tsunami_valid_time");
      const ended = head.InfoType === "取消" || (areas.length > 0 && areas.every((area) => /解除|津波なし/u.test(area.grade)));
      context.tsunami = {
        eventId: head.EventID, kind: text(head.Title), reportState: head.InfoType,
        forecastIssuedAt: hasForecast ? head.ReportDateTime : null,
        state: !hasForecast ? "forecast-unavailable" : ended ? "cancelled" : validUntil && Date.parse(validUntil) <= now ? "expired" : "reported",
        validUntil, headline: text(head.Headline?.Text), text: text(raw.Body?.Text),
        comment: text(raw.Body?.Comments?.WarningComment?.Text),
        areas: head.InfoType === "取消" ? [] : selected.slice(0, 8),
        omittedAreaCount: Math.max(0, selected.length - 8),
        scope: "選択した地震の津波電文。最大8予報区の概要。全国の全警報や他の地震の状況は網羅しません。市区町村の位置から津波予報区を推測しません。",
        observationStatus: "この地震の観測電文が一覧にありません。未観測・未到達・高さ0を意味しません。",
        observations: [], omittedObservationCount: 0,
        ageNotice: now - Date.parse(head.ReportDateTime) > 86400_000 ? "発表から時間が経った資料です。現在の継続・解除は公式画面でも確認してください。" : null
      };
      context.selection.forecastAreas = areas.map(({ code, name }) => ({ code, name }));
      const observationEntries = ["51", "52"].map((code) => index.reports.find((item) => item.eid === entry.eid && item.json.includes(`_VTSE${code}_`))).filter(Boolean);
      const observationResults = await Promise.all(observationEntries.map(async (item) => {
        try {
          const observation = item.json === entry.json ? raw : await fetchWarningChatJson(baseUrl + item.json, { fetcher, fresh });
          const observationHead = validateReport(observation, item, now);
          return { entry: item, values: observationHead.InfoType === "取消" ? [] : tsunamiObservations(observation, /_VTSE52_/u.test(item.json)), cancelled: observationHead.InfoType === "取消" };
        } catch { return null; }
      }));
      const stations = observationResults.filter(Boolean).flatMap((item) => item.values)
        .filter((station) => !forecastAreaCode || station.areaCode === forecastAreaCode);
      context.tsunami.observations = stations.slice(0, 8);
      context.tsunami.omittedObservationCount = Math.max(0, stations.length - 8);
      if (observationEntries.length) context.tsunami.observationStatus = observationResults.some((item) => !item)
        ? "観測電文の一部を取得できません。確認できた観測点のみ掲載。欠測は0や未到達を意味しません。"
        : "この地震の最新の沿岸・沖合観測電文に掲載された最大8観測点。取消済みの観測値は掲載しません。未掲載・欠測から高さ0や未到達を推測しないでください。";
      for (const result of observationResults.filter(Boolean)) {
        context.sources.push({ title: "気象庁 津波観測電文（JSON）", url: baseUrl + result.entry.json });
        if (Date.parse(result.entry.rdt) > Date.parse(context.issuedAt)) context.issuedAt = result.entry.rdt;
      }
    }
  }
  context.revision = await revisionOf({ ...context, fetchedAt: undefined });
  return context;
}
