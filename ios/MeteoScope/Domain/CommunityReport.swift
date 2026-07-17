import Foundation

struct CommunityReport: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let weather: String
    let comment: String?
    let sensation: String?
    let temperature: Double?
    let hazards: [String]
    let latitude: Double
    let longitude: Double
    let areaCode: String
    let areaName: String
    let createdAt: String
    let expiresAt: String
    let isOwn: Bool

    var coordinate: GeoCoordinate { GeoCoordinate(latitude: latitude, longitude: longitude) }
    var weatherLabel: String {
        ["sunny": "晴れ", "cloudy": "くもり", "light-rain": "弱い雨", "heavy-rain": "強い雨",
         "snow": "雪", "thunder": "雷", "fog": "霧"][weather] ?? "天気"
    }
    var sensationLabel: String {
        ["cold": "寒い", "cool": "涼しい", "comfortable": "快適", "hot": "暑い", "very-hot": "非常に暑い"][sensation ?? ""] ?? ""
    }
    var hazardLabels: [String] {
        let labels = ["flooded-road": "道路冠水", "strong-wind": "強風", "poor-visibility": "視界不良",
                      "thunder": "雷", "slippery": "路面凍結・滑りやすい"]
        return hazards.compactMap { labels[$0] }
    }
}

struct CommunityReportDraft: Encodable, Sendable {
    let weather: String
    let comment: String?
    let sensation: String?
    let temperature: Double?
    let hazards: [String]
    let latitude: Double
    let longitude: Double
    let areaCode: String
    let areaName: String
}
