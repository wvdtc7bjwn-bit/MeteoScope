import Foundation

enum HypocenterDistributionLimits {
    static let dayCount = 30
    static let maximumDayOffset = dayCount - 1
}

enum EarthquakeDisplayMode: String, CaseIterable, Identifiable, Sendable {
    case recent
    case distribution

    var id: String { rawValue }
    var title: String { self == .recent ? "最近の地震" : "震央分布" }
}

enum HypocenterMapPresentation: String, CaseIterable, Identifiable, Sendable {
    case flat
    case spatial

    var id: String { rawValue }
    var title: String { self == .flat ? "平面" : "立体" }
}

struct HypocenterDistributionFilter: Equatable, Sendable {
    var dayOffset = 0
    var minMagnitude = "0"
    var maxDepth = "all"
}

struct HypocenterDistributionSnapshot: Decodable, Equatable, Sendable {
    let sourceLabel: String
    let sourceURL: URL?
    let provisional: Bool
    let latestSourceDate: String?
    let lastSuccessfulFetchAt: String?
    let failedDates: Int
    let truncated: Bool
    let availableDates: [String]
    let availableDayCount: Int
    let dailyCounts: [DailyHypocenterCount]?
    let selectedSourceDate: String?
    let dayOffset: Int
    let items: [DailyHypocenter]

    enum CodingKeys: String, CodingKey {
        case sourceLabel
        case sourceURL = "sourceUrl"
        case provisional
        case latestSourceDate
        case lastSuccessfulFetchAt
        case failedDates
        case truncated
        case availableDates
        case availableDayCount
        case dailyCounts
        case selectedSourceDate
        case dayOffset
        case items
    }

    static let preview = HypocenterDistributionSnapshot(
        sourceLabel: "気象庁 日々の震源リスト",
        sourceURL: URL(string: "https://www.data.jma.go.jp/eqev/data/daily_map/index.html"),
        provisional: true,
        latestSourceDate: "2026-07-17",
        lastSuccessfulFetchAt: "2026-07-18T01:17:00Z",
        failedDates: 0,
        truncated: false,
        availableDates: ["2026-07-17", "2026-07-16", "2026-07-15"],
        availableDayCount: 3,
        dailyCounts: [
            DailyHypocenterCount(sourceDate: "2026-07-17", count: 798),
            DailyHypocenterCount(sourceDate: "2026-07-16", count: 642),
            DailyHypocenterCount(sourceDate: "2026-07-15", count: 705)
        ],
        selectedSourceDate: "2026-07-17",
        dayOffset: 0,
        items: [
            DailyHypocenter(
                id: "preview-1",
                sourceDate: "2026-07-17",
                originTime: "2026-07-17T12:34:56+09:00",
                latitude: 35.5,
                longitude: 140.2,
                depthKm: 40,
                magnitude: 2.8,
                place: "千葉県東方沖"
            )
        ]
    )
}

struct DailyHypocenterCount: Decodable, Identifiable, Equatable, Sendable {
    let sourceDate: String
    let count: Int

    var id: String { sourceDate }
}

struct DailyHypocenter: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let sourceDate: String
    let originTime: String
    let latitude: Double
    let longitude: Double
    let depthKm: Int?
    let magnitude: Double?
    let place: String

    var coordinate: GeoCoordinate {
        GeoCoordinate(latitude: latitude, longitude: longitude)
    }

    var magnitudeText: String {
        magnitude.map { String(format: "M%.1f", $0) } ?? "M不明"
    }

    var depthText: String {
        depthKm.map { "\($0)km" } ?? "不明"
    }
}
