import Foundation

enum WarningSeverity: Int, Comparable, Hashable, Sendable {
    case advisory = 1
    case warning = 2
    case danger = 3
    case emergency = 4

    static func < (lhs: WarningSeverity, rhs: WarningSeverity) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var label: String {
        switch self {
        case .advisory: "注意報"
        case .warning: "警報"
        case .danger: "危険警報"
        case .emergency: "特別警報"
        }
    }
}

struct ActiveWarning: Identifiable, Hashable, Sendable {
    let code: String
    let label: String
    let severity: WarningSeverity
    let status: String

    var id: String { code }
}

struct WarningAreaSummary: Identifiable, Hashable, Sendable {
    let areaCode: String
    let prefectureName: String
    let warnings: [ActiveWarning]
    let updatedAt: String

    var id: String { areaCode }
    var highestSeverity: WarningSeverity { warnings.map(\.severity).max() ?? .advisory }
}

struct WarningPrefectureSummary: Identifiable, Hashable, Sendable {
    let code: String
    let name: String
    let areaCount: Int
    let warnings: [ActiveWarning]

    var id: String { code }
    var highestSeverity: WarningSeverity { warnings.map(\.severity).max() ?? .advisory }
}

struct WarningSnapshot: Sendable {
    let updatedAt: String
    let activeAreas: [WarningAreaSummary]

    var prefectures: [WarningPrefectureSummary] {
        Dictionary(grouping: activeAreas, by: { String($0.areaCode.prefix(2)) })
            .map { code, areas in
                let uniqueWarnings = Dictionary(
                    areas.flatMap(\.warnings).map { ($0.code, $0) },
                    uniquingKeysWith: { current, candidate in
                        candidate.severity > current.severity ? candidate : current
                    }
                )
                return WarningPrefectureSummary(
                    code: code,
                    name: WarningCatalog.prefectureName(for: code),
                    areaCount: areas.count,
                    warnings: uniqueWarnings.values.sorted(by: WarningCatalog.sortWarnings)
                )
            }
            .sorted {
                if $0.highestSeverity == $1.highestSeverity { return $0.code < $1.code }
                return $0.highestSeverity > $1.highestSeverity
            }
    }
}

struct WarningReport: Decodable, Sendable {
    let reportDatetime: String
    let warning: WarningReportBody?
}

struct WarningReportBody: Decodable, Sendable {
    let class20Items: [WarningReportArea]?
}

struct WarningReportArea: Decodable, Sendable {
    let areaCode: String
    let kinds: [WarningReportKind]?
}

struct WarningReportKind: Decodable, Sendable {
    let code: String?
    let status: String?
}

enum WarningSnapshotBuilder {
    static func build(from reports: [WarningReport]) -> WarningSnapshot {
        var warningsByArea: [String: [String: ActiveWarning]] = [:]
        var updatedByArea: [String: String] = [:]

        for report in reports.sorted(by: { $0.reportDatetime < $1.reportDatetime }) {
            for area in report.warning?.class20Items ?? [] {
                var current = warningsByArea[area.areaCode, default: [:]]
                for kind in area.kinds ?? [] {
                    guard let code = kind.code, !code.isEmpty else { continue }
                    let status = kind.status ?? ""
                    if status.contains("解除") || status.contains("なし") {
                        current.removeValue(forKey: code)
                    } else if let warning = WarningCatalog.warning(code: code, status: status) {
                        current[code] = warning
                    }
                }
                warningsByArea[area.areaCode] = current
                updatedByArea[area.areaCode] = report.reportDatetime
            }
        }

        let activeAreas = warningsByArea.compactMap { areaCode, warnings -> WarningAreaSummary? in
            guard !warnings.isEmpty else { return nil }
            return WarningAreaSummary(
                areaCode: areaCode,
                prefectureName: WarningCatalog.prefectureName(for: String(areaCode.prefix(2))),
                warnings: warnings.values.sorted(by: WarningCatalog.sortWarnings),
                updatedAt: updatedByArea[areaCode] ?? ""
            )
        }
        .sorted {
            if $0.highestSeverity == $1.highestSeverity { return $0.areaCode < $1.areaCode }
            return $0.highestSeverity > $1.highestSeverity
        }

        return WarningSnapshot(
            updatedAt: reports.map(\.reportDatetime).max() ?? "未取得",
            activeAreas: activeAreas
        )
    }
}

enum WarningCatalog {
    static func warning(code: String, status: String) -> ActiveWarning? {
        guard let definition = definitions[code] else { return nil }
        return ActiveWarning(code: code, label: definition.0, severity: definition.1, status: status)
    }

    static func sortWarnings(_ lhs: ActiveWarning, _ rhs: ActiveWarning) -> Bool {
        if lhs.severity == rhs.severity { return lhs.code < rhs.code }
        return lhs.severity > rhs.severity
    }

    static func prefectureName(for code: String) -> String {
        prefectures[code] ?? "その他"
    }

    private static let definitions: [String: (String, WarningSeverity)] = [
        "02": ("暴風雪警報", .warning), "03": ("大雨警報", .warning),
        "04": ("洪水警報", .warning), "05": ("暴風警報", .warning),
        "06": ("大雪警報", .warning), "07": ("波浪警報", .warning),
        "08": ("高潮警報", .warning), "09": ("土砂災害警報", .warning),
        "10": ("大雨注意報", .advisory), "12": ("大雪注意報", .advisory),
        "13": ("風雪注意報", .advisory), "14": ("雷注意報", .advisory),
        "15": ("強風注意報", .advisory), "16": ("波浪注意報", .advisory),
        "17": ("融雪注意報", .advisory), "18": ("洪水注意報", .advisory),
        "19": ("高潮注意報", .advisory), "20": ("濃霧注意報", .advisory),
        "21": ("乾燥注意報", .advisory), "22": ("なだれ注意報", .advisory),
        "23": ("低温注意報", .advisory), "24": ("霜注意報", .advisory),
        "25": ("着氷注意報", .advisory), "26": ("着雪注意報", .advisory),
        "29": ("土砂災害注意報", .advisory),
        "42": ("暴風雪危険警報", .danger), "43": ("大雨危険警報", .danger),
        "44": ("洪水危険警報", .danger), "45": ("暴風危険警報", .danger),
        "46": ("大雪危険警報", .danger), "47": ("波浪危険警報", .danger),
        "48": ("高潮危険警報", .danger), "49": ("土砂災害危険警報", .danger),
        "52": ("暴風雪危険警報", .danger), "53": ("大雨危険警報", .danger),
        "54": ("洪水危険警報", .danger), "55": ("暴風危険警報", .danger),
        "56": ("大雪危険警報", .danger), "57": ("波浪危険警報", .danger),
        "58": ("高潮危険警報", .danger),
        "32": ("暴風雪特別警報", .emergency), "33": ("大雨特別警報", .emergency),
        "35": ("暴風特別警報", .emergency), "36": ("大雪特別警報", .emergency),
        "37": ("波浪特別警報", .emergency), "38": ("高潮特別警報", .emergency),
        "39": ("土砂災害特別警報", .emergency)
    ]

    private static let prefectures: [String: String] = [
        "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県",
        "06": "山形県", "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県",
        "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県", "15": "新潟県",
        "16": "富山県", "17": "石川県", "18": "福井県", "19": "山梨県", "20": "長野県",
        "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県", "25": "滋賀県",
        "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
        "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県",
        "36": "徳島県", "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県",
        "41": "佐賀県", "42": "長崎県", "43": "熊本県", "44": "大分県", "45": "宮崎県",
        "46": "鹿児島県", "47": "沖縄県"
    ]
}

extension WarningSnapshot {
    static let preview = WarningSnapshot(
        updatedAt: "2026-07-13T19:17:00+09:00",
        activeAreas: [
            WarningAreaSummary(
                areaCode: "2920100",
                prefectureName: "奈良県",
                warnings: [
                    ActiveWarning(code: "14", label: "雷注意報", severity: .advisory, status: "発表")
                ],
                updatedAt: "2026-07-13T19:17:00+09:00"
            )
        ]
    )
}
