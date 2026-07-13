import Foundation

enum EarlyWarningLevel: Int, Comparable, Hashable, Sendable {
    case none = 0
    case middle = 1
    case high = 2

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    var label: String {
        switch self {
        case .none: "なし"
        case .middle: "中"
        case .high: "高"
        }
    }
}

struct EarlyWarningSnapshot: Sendable {
    let updatedAt: String
    let areas: [EarlyWarningAreaSummary]
}

struct EarlyWarningAreaSummary: Identifiable, Hashable, Sendable {
    let areaCode: String
    let areaName: String
    let items: [EarlyWarningItem]

    var id: String { areaCode }
    var highestLevel: EarlyWarningLevel { items.map(\.level).max() ?? .none }
}

struct EarlyWarningItem: Identifiable, Hashable, Sendable {
    let hazard: String
    let level: EarlyWarningLevel
    let validTime: String

    var id: String { "\(hazard)-\(validTime)" }
}

struct EarlyWarningReport: Decodable, Sendable {
    let reportDatetime: String
    let timeSeries: [EarlyWarningTimeSeries]
}

struct EarlyWarningTimeSeries: Decodable, Sendable {
    let timeDefines: [String]
    let areas: [EarlyWarningAreaRecord]
}

struct EarlyWarningAreaRecord: Decodable, Sendable {
    let code: String
    let properties: [EarlyWarningProperty]
}

struct EarlyWarningProperty: Decodable, Sendable {
    let type: String
    let probabilities: [String]
}

struct JMAAreaCatalog: Decodable, Sendable {
    let offices: [String: JMAAreaRecord]
    let class10s: [String: JMAAreaRecord]
    let class20s: [String: JMAAreaRecord]

    func name(for code: String) -> String {
        class20s[code]?.name ?? class10s[code]?.name ?? offices[code]?.name ?? "地域 \(code)"
    }
}

struct JMAAreaRecord: Decodable, Sendable {
    let name: String
}

enum EarlyWarningSnapshotBuilder {
    static func decodeReports(from data: Data) throws -> [EarlyWarningReport] {
        let decoder = JSONDecoder()
        if let nested = try? decoder.decode([[EarlyWarningReport]].self, from: data) {
            return nested.flatMap { $0 }
        }
        return try decoder.decode([EarlyWarningReport].self, from: data)
    }

    static func build(reports: [EarlyWarningReport], areaCatalog: JMAAreaCatalog) -> EarlyWarningSnapshot {
        var itemsByArea: [String: [String: EarlyWarningItem]] = [:]

        for report in reports {
            for series in report.timeSeries {
                for area in series.areas {
                    for property in area.properties {
                        let hazard = normalizeHazard(property.type)
                        guard !hazard.isEmpty else { continue }
                        for (index, probability) in property.probabilities.enumerated() {
                            let level = level(for: probability)
                            guard level != .none, series.timeDefines.indices.contains(index) else { continue }
                            let item = EarlyWarningItem(
                                hazard: hazard,
                                level: level,
                                validTime: series.timeDefines[index]
                            )
                            let key = item.id
                            let existing = itemsByArea[area.code]?[key]
                            if existing == nil || level > (existing?.level ?? .none) {
                                itemsByArea[area.code, default: [:]][key] = item
                            }
                        }
                    }
                }
            }
        }

        let areas = itemsByArea.map { code, values in
            EarlyWarningAreaSummary(
                areaCode: code,
                areaName: areaCatalog.name(for: code),
                items: values.values.sorted {
                    if $0.level == $1.level { return $0.validTime < $1.validTime }
                    return $0.level > $1.level
                }
            )
        }
        .sorted {
            if $0.highestLevel == $1.highestLevel { return $0.areaCode < $1.areaCode }
            return $0.highestLevel > $1.highestLevel
        }

        return EarlyWarningSnapshot(
            updatedAt: reports.map(\.reportDatetime).max() ?? "未取得",
            areas: areas
        )
    }

    private static func level(for value: String) -> EarlyWarningLevel {
        switch value.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "高": .high
        case "中": .middle
        default: .none
        }
    }

    private static func normalizeHazard(_ value: String) -> String {
        let text = value
            .replacingOccurrences(of: "の警報級の可能性", with: "")
            .replacingOccurrences(of: "警報級の可能性", with: "")
        if text.contains("土砂災害") { return "土砂災害" }
        if text.contains("大雨") || text.contains("雨") { return "大雨" }
        if text.contains("雪") { return "大雪" }
        if text.contains("風") { return "暴風（雪）" }
        if text.contains("波") { return "波浪" }
        if text.contains("潮") { return "高潮" }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension EarlyWarningSnapshot {
    static let preview = EarlyWarningSnapshot(
        updatedAt: "2026-07-13T17:00:00+09:00",
        areas: [
            EarlyWarningAreaSummary(
                areaCode: "290000",
                areaName: "奈良県",
                items: [
                    EarlyWarningItem(
                        hazard: "大雨",
                        level: .middle,
                        validTime: "2026-07-15T00:00:00+09:00"
                    )
                ]
            )
        ]
    )
}
