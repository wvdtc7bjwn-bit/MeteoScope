export const PREFECTURE_NAMES = {
  "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県", "06": "山形県",
  "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県", "11": "埼玉県", "12": "千葉県",
  "13": "東京都", "14": "神奈川県", "15": "新潟県", "16": "富山県", "17": "石川県", "18": "福井県",
  "19": "山梨県", "20": "長野県", "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県",
  "25": "滋賀県", "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
  "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県", "36": "徳島県",
  "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県", "41": "佐賀県", "42": "長崎県",
  "43": "熊本県", "44": "大分県", "45": "宮崎県", "46": "鹿児島県", "47": "沖縄県"
};

export const WARNING_LABELS = {
  "02": ["暴風雪警報", "warning"],
  "03": ["大雨警報", "warning"],
  "04": ["洪水警報", "warning"],
  "05": ["暴風警報", "warning"],
  "06": ["大雪警報", "warning"],
  "07": ["波浪警報", "warning"],
  "08": ["高潮警報", "warning"],
  "09": ["土砂災害警報", "warning"],
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
  "29": ["土砂災害注意報", "advisory"],
  "42": ["暴風雪危険警報", "danger"],
  "43": ["大雨危険警報", "danger"],
  "44": ["洪水危険警報", "danger"],
  "45": ["暴風危険警報", "danger"],
  "46": ["大雪危険警報", "danger"],
  "47": ["波浪危険警報", "danger"],
  "48": ["高潮危険警報", "danger"],
  "52": ["暴風雪危険警報", "danger"],
  "53": ["大雨危険警報", "danger"],
  "54": ["洪水危険警報", "danger"],
  "55": ["暴風危険警報", "danger"],
  "56": ["大雪危険警報", "danger"],
  "57": ["波浪危険警報", "danger"],
  "58": ["高潮危険警報", "danger"],
  "32": ["暴風雪特別警報", "emergency"],
  "33": ["大雨特別警報", "emergency"],
  "35": ["暴風特別警報", "emergency"],
  "36": ["大雪特別警報", "emergency"],
  "37": ["波浪特別警報", "emergency"],
  "38": ["高潮特別警報", "emergency"],
  "39": ["土砂災害特別警報", "emergency"],
  "49": ["土砂災害危険警報", "danger"]
};

export const WARNING_LEVEL_NUMBERS = {
  advisory: 2,
  warning: 3,
  danger: 4,
  emergency: 5
};

export const WARNING_LEVEL_TARGETS = ["河川氾濫", "洪水", "大雨", "土砂災害", "高潮"];

export function getPrefectureNameByCode(areaCode) {
  return PREFECTURE_NAMES[String(areaCode ?? "").slice(0, 2)] ?? "その他";
}

export function applyWarningKinds(currentWarnings, kinds = [], reportDatetime = "") {
  const warningsByCode = new Map(currentWarnings.map((warning) => [warning.code, warning]));

  kinds.forEach((kind) => {
    const code = String(kind?.code ?? "");
    const status = String(kind?.status ?? "");

    if (!code) return;

    if (isInactiveWarning(kind)) {
      warningsByCode.delete(code);
      return;
    }

    const [rawLabel, level] = WARNING_LABELS[code] ?? [`警報コード ${code}`, "advisory"];
    const levelNumber = shouldShowWarningLevel(rawLabel) ? WARNING_LEVEL_NUMBERS[level] ?? null : null;
    const label = levelNumber ? `レベル${levelNumber} ${rawLabel}` : rawLabel;
    const previous = warningsByCode.get(code);
    warningsByCode.set(code, {
      code,
      rawLabel,
      label,
      level,
      levelNumber,
      status,
      issuedAt: previous?.issuedAt ?? reportDatetime,
      updatedAt: reportDatetime
    });
  });

  return sortWarnings([...warningsByCode.values()]);
}

export function shouldShowWarningLevel(label) {
  return WARNING_LEVEL_TARGETS.some((target) => String(label).includes(target));
}

export function sortWarnings(warnings) {
  return warnings.sort((a, b) =>
    severityValue(b.level) - severityValue(a.level) ||
    Number(a.code) - Number(b.code)
  );
}

export function isInactiveWarning(warning) {
  const status = String(warning?.status ?? "");
  return !warning?.code || status.includes("解除") || status.includes("なし");
}

export function severityRank(warnings) {
  const ranks = { advisory: 1, warning: 2, danger: 3, emergency: 4 };
  return Math.max(0, ...warnings.map((warning) => ranks[warning.level] ?? 0));
}

export function highestSeverityLevel(warnings) {
  return warnings.reduce((current, warning) =>
    severityValue(warning.level) > severityValue(current) ? warning.level : current
  , "advisory");
}

export function severityValue(level) {
  const ranks = { advisory: 1, warning: 2, danger: 3, emergency: 4 };
  return ranks[level] ?? 0;
}

export function getWarningPhenomenon(warning) {
  return String(warning?.rawLabel ?? warning?.label ?? "")
    .replace(/^レベル\d+\s*/, "")
    .replace(/特別警報|危険警報|警報|注意報/g, "");
}
