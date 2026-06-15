import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

const PREFECTURE_NAMES = {
  "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県", "06": "山形県",
  "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県", "11": "埼玉県", "12": "千葉県",
  "13": "東京都", "14": "神奈川県", "15": "新潟県", "16": "富山県", "17": "石川県", "18": "福井県",
  "19": "山梨県", "20": "長野県", "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県",
  "25": "滋賀県", "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
  "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県", "36": "徳島県",
  "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県", "41": "佐賀県", "42": "長崎県",
  "43": "熊本県", "44": "大分県", "45": "宮崎県", "46": "鹿児島県", "47": "沖縄県"
};

const WARNING_LABELS = {
  "02": ["暴風雪警報", "warning"],
  "03": ["大雨警報", "warning"],
  "04": ["洪水警報", "warning"],
  "05": ["暴風警報", "warning"],
  "06": ["大雪警報", "warning"],
  "07": ["波浪警報", "warning"],
  "08": ["高潮警報", "warning"],
  "10": ["大雨注意報", "advisory"],
  "12": ["大雪注意報", "advisory"],
  "13": ["風雪注意報", "advisory"],
  "14": ["雷注意報", "advisory"],
  "15": ["強風注意報", "advisory"],
  "16": ["波浪注意報", "advisory"],
  "17": ["融雪注意報", "advisory"],
  "18": ["洪水注意報", "advisory"],
  "19": ["高潮注意報", "advisory"],
  "20": ["濃霧注意報", "advisory"],
  "21": ["乾燥注意報", "advisory"],
  "22": ["なだれ注意報", "advisory"],
  "23": ["低温注意報", "advisory"],
  "24": ["霜注意報", "advisory"],
  "25": ["着氷注意報", "advisory"],
  "26": ["着雪注意報", "advisory"],
  "32": ["暴風雪特別警報", "emergency"],
  "33": ["大雨特別警報", "emergency"],
  "35": ["暴風特別警報", "emergency"],
  "36": ["大雪特別警報", "emergency"],
  "37": ["波浪特別警報", "emergency"],
  "38": ["高潮特別警報", "emergency"]
};

export async function fetchWarningMap() {
  const [warningMap, areaConst] = await Promise.all([
    fetchJson(JMA_ENDPOINTS.warnings),
    fetchJson(JMA_ENDPOINTS.areaConst)
  ]);
  const count = Array.isArray(warningMap) ? warningMap.length : Object.keys(warningMap ?? {}).length;
  const groups = buildWarningGroups(warningMap, areaConst);
  const activeAreas = buildActiveWarningAreas(warningMap);

  return {
    raw: warningMap,
    groups,
    activeAreas,
    summary: `警報・注意報データ ${count} 件`,
    updatedAt: "取得済み"
  };
}

function buildActiveWarningAreas(warningMap) {
  const reports = Array.isArray(warningMap) ? warningMap : [];
  const areasByCode = new Map();

  reports.forEach((report) => {
    const areas = report.areaTypes?.[1]?.areas ?? report.areaTypes?.[0]?.areas ?? [];
    areas.forEach((area) => {
      const activeWarnings = normalizeWarnings(area.warnings);
      if (activeWarnings.length === 0) return;

      const next = {
        areaCode: String(area.code),
        level: highestSeverityLevel(activeWarnings),
        warnings: activeWarnings
      };
      const current = areasByCode.get(next.areaCode);
      if (!current || severityValue(next.level) > severityValue(current.level)) {
        areasByCode.set(next.areaCode, next);
      }
    });
  });

  return [...areasByCode.values()];
}

function buildWarningGroups(warningMap, areaConst) {
  const reports = Array.isArray(warningMap) ? warningMap : [];
  const municipalities = areaConst?.class20s ?? {};
  const grouped = new Map();

  reports.forEach((report) => {
    const areas = report.areaTypes?.[1]?.areas ?? report.areaTypes?.[0]?.areas ?? [];
    areas.forEach((area) => {
      const activeWarnings = normalizeWarnings(area.warnings);
      if (activeWarnings.length === 0) return;

      const prefecture = PREFECTURE_NAMES[String(area.code).slice(0, 2)] ?? "その他";
      if (!grouped.has(prefecture)) grouped.set(prefecture, []);
      grouped.get(prefecture).push({
        areaCode: area.code,
        areaName: municipalities[area.code]?.name ?? `エリア ${area.code}`,
        updatedAt: report.reportDatetime,
        warnings: activeWarnings
      });
    });
  });

  return [...grouped.entries()]
    .map(([prefecture, areas]) => ({
      prefecture,
      areas: areas
        .sort((a, b) => severityRank(b.warnings) - severityRank(a.warnings))
        .slice(0, 8)
    }))
    .sort((a, b) => severityRank(b.areas.flatMap((area) => area.warnings)) - severityRank(a.areas.flatMap((area) => area.warnings)))
    .slice(0, 6);
}

function normalizeWarnings(warnings = []) {
  return warnings
    .filter((warning) => warning.code && warning.status !== "解除")
    .map((warning) => {
      const [label, level] = WARNING_LABELS[warning.code] ?? [`警報コード ${warning.code}`, "advisory"];
      return { code: warning.code, label, level, status: warning.status ?? "" };
    })
    .filter((warning) => !warning.status.includes("なし"));
}

function severityRank(warnings) {
  const ranks = { advisory: 1, warning: 2, emergency: 3 };
  return Math.max(0, ...warnings.map((warning) => ranks[warning.level] ?? 0));
}

function highestSeverityLevel(warnings) {
  return warnings.reduce((current, warning) =>
    severityValue(warning.level) > severityValue(current) ? warning.level : current
  , "advisory");
}

function severityValue(level) {
  const ranks = { advisory: 1, warning: 2, emergency: 3 };
  return ranks[level] ?? 0;
}
