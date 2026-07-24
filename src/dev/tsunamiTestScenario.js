import {
  attachTsunamiMapData,
  buildTsunamiAreaLookup,
  buildTsunamiStationLookup
} from "../jma/earthquakeXml.js";

const TEST_SCENARIOS = {
  none: {
    label: "警報なし",
    headline: "現在発表中の津波警報・注意報はありません。",
    areas: [],
    observations: [],
    offshoreObservations: []
  },
  advisory: {
    label: "津波注意報",
    headline: "津波注意報を発表しました。海岸や河口から離れてください。",
    areas: [
      ["300", "茨城県", "advisory", "津波注意報", "1m"],
      ["310", "千葉県九十九里・外房", "advisory", "津波注意報", "1m"],
      ["320", "伊豆諸島", "advisory", "津波注意報", "1m"]
    ],
    observations: [],
    offshoreObservations: []
  },
  warning: {
    label: "津波警報",
    headline: "津波警報を発表しました。沿岸部や川沿いから直ちに避難してください。",
    areas: [
      ["300", "茨城県", "warning", "津波警報", "3m"],
      ["310", "千葉県九十九里・外房", "warning", "津波警報", "3m"],
      ["330", "相模湾・三浦半島", "advisory", "津波注意報", "1m"],
      ["320", "伊豆諸島", "advisory", "津波注意報", "1m"]
    ],
    observations: [],
    offshoreObservations: []
  },
  "major-warning": {
    label: "大津波警報",
    headline: "大津波警報を発表しました。直ちに高台や避難ビルへ避難してください。",
    areas: [
      ["300", "茨城県", "major-warning", "大津波警報", "5m"],
      ["310", "千葉県九十九里・外房", "warning", "津波警報", "3m"],
      ["330", "相模湾・三浦半島", "warning", "津波警報", "3m"],
      ["320", "伊豆諸島", "advisory", "津波注意報", "1m"]
    ],
    observations: [],
    offshoreObservations: []
  },
  observation: {
    label: "津波観測あり",
    headline: "津波を観測しています。警報・注意報が解除されるまで安全な場所にいてください。",
    areas: [
      ["300", "茨城県", "warning", "津波警報", "3m"],
      ["310", "千葉県九十九里・外房", "advisory", "津波注意報", "1m"]
    ],
    observations: [
      ["30001", "300", "茨城県", "大洗", "0.8m"],
      ["31001", "310", "千葉県九十九里・外房", "銚子", "0.4m"]
    ],
    offshoreObservations: [
      ["30050", "300", "茨城県", "茨城沖90kmA", "観測中"]
    ]
  }
};

const TEST_SCENARIO_KEYS = new Set(Object.keys(TEST_SCENARIOS));

export function getLocalTsunamiTestScenario(search = "") {
  const key = new URLSearchParams(search).get("tsunamiTest") ?? "";
  return TEST_SCENARIO_KEYS.has(key) ? key : "";
}

export function createLocalTsunamiTestReport(
  scenarioKey,
  { now = new Date(), eventId = "local-tsunami-test" } = {}
) {
  const scenario = TEST_SCENARIOS[scenarioKey];
  if (!scenario) return null;

  const reportTime = formatJstDateTime(now);
  const reportTimeRaw = now.toISOString();
  const arrivalTime = formatJstTime(new Date(now.getTime() + 20 * 60 * 1000));
  const observationTime = formatJstTime(new Date(now.getTime() - 5 * 60 * 1000));
  const areas = scenario.areas.map(([code, name, level, grade, height]) => ({
    code,
    name,
    grade,
    gradeCode: getGradeCode(level),
    level,
    lastGrade: "",
    arrivalTime,
    arrivalCondition: "",
    height,
    heightCondition: ""
  }));
  const observations = scenario.observations.map((entry) => buildObservation(entry, {
    offshore: false,
    observationTime
  }));
  const offshoreObservations = scenario.offshoreObservations.map((entry) => buildObservation(entry, {
    offshore: true,
    observationTime
  }));
  const highestLevel = getHighestLevel(areas);

  return {
    id: eventId,
    eventId,
    title: `LOCAL TEST: ${scenario.label}`,
    headline: scenario.headline,
    reportTime,
    reportTimeRaw,
    targetDateTime: reportTime,
    validDateTime: "",
    areas,
    observations,
    offshoreObservations,
    highestLevel,
    isActive: ["major-warning", "warning", "advisory"].includes(highestLevel),
    sourceUrls: [],
    mapFeatures: [],
    isTestScenario: true,
    testScenarioKey: scenarioKey,
    testScenarioLabel: scenario.label
  };
}

export function buildLocalTsunamiTestData(
  data,
  scenarioKey,
  tsunamiAreaGeoJson,
  stationData,
  { now = new Date() } = {}
) {
  const selectedEarthquake = data?.earthquakes?.[0];
  const eventId = selectedEarthquake?.eventId || selectedEarthquake?.id || "local-tsunami-test";
  const report = createLocalTsunamiTestReport(scenarioKey, { now, eventId });
  if (!report) return data;

  const areaLookup = buildTsunamiAreaLookup(tsunamiAreaGeoJson);
  const stationLookup = buildTsunamiStationLookup(stationData);
  const tsunami = attachTsunamiMapData(report, areaLookup, stationLookup);

  return {
    ...data,
    tsunami,
    tsunamiStatus: "available",
    tsunamiTestScenario: scenarioKey
  };
}

export async function applyLocalTsunamiTestScenario(
  data,
  {
    search = globalThis.location?.search ?? "",
    fetchImpl = globalThis.fetch,
    now = new Date()
  } = {}
) {
  const scenarioKey = getLocalTsunamiTestScenario(search);
  if (!scenarioKey) return data;
  if (typeof fetchImpl !== "function") return data;

  const [areaResponse, stationResponse] = await Promise.all([
    fetchImpl("/data/jma-tsunami-forecast-areas.geojson"),
    fetchImpl("/data/jma-tsunami-observation-stations.json")
  ]);
  if (!areaResponse.ok || !stationResponse.ok) {
    throw new Error("Local tsunami test assets unavailable");
  }
  const [areaGeoJson, stationData] = await Promise.all([
    areaResponse.json(),
    stationResponse.json()
  ]);
  mountLocalTsunamiTestControl(scenarioKey);
  return buildLocalTsunamiTestData(data, scenarioKey, areaGeoJson, stationData, { now });
}

function buildObservation(
  [stationCode, areaCode, areaName, stationName, maxHeight],
  { offshore, observationTime }
) {
  return {
    id: stationCode,
    areaCode,
    areaName,
    stationCode,
    stationName,
    offshore,
    sensor: offshore ? "海底津波計" : "",
    arrivalTime: observationTime,
    arrivalCondition: "",
    maxHeightTime: observationTime,
    maxHeight,
    maxHeightCondition: ""
  };
}

function getHighestLevel(areas) {
  const rank = {
    "major-warning": 4,
    warning: 3,
    advisory: 2,
    forecast: 1,
    none: 0
  };
  return [...areas]
    .sort((left, right) => (rank[right.level] ?? -1) - (rank[left.level] ?? -1))[0]?.level
    ?? "none";
}

function getGradeCode(level) {
  if (level === "major-warning") return "53";
  if (level === "warning") return "52";
  if (level === "advisory") return "62";
  return "00";
}

function formatJstDateTime(date) {
  const parts = getJstParts(date);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatJstTime(date) {
  const parts = getJstParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function getJstParts(date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function mountLocalTsunamiTestControl(activeScenario) {
  if (typeof document === "undefined") return;
  document.getElementById("local-tsunami-test-control")?.remove();

  const control = document.createElement("aside");
  control.id = "local-tsunami-test-control";
  control.className = "local-tsunami-test-control";
  control.setAttribute("aria-label", "ローカル津波テスト");
  control.innerHTML = `
    <strong>LOCAL TEST</strong>
    <label>
      <span>津波</span>
      <select aria-label="津波テストシナリオ">
        <option value="">実データに戻す</option>
        <option value="none">警報なし</option>
        <option value="advisory">注意報</option>
        <option value="warning">警報</option>
        <option value="major-warning">大津波警報</option>
        <option value="observation">観測あり</option>
      </select>
    </label>
  `;
  const select = control.querySelector("select");
  select.value = activeScenario;
  select.addEventListener("change", () => {
    const url = new URL(globalThis.location.href);
    if (select.value) url.searchParams.set("tsunamiTest", select.value);
    else url.searchParams.delete("tsunamiTest");
    globalThis.location.assign(url);
  });
  document.body.append(control);
}
